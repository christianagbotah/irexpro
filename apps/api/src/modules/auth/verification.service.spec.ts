import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import { AuthVerificationToken } from './entities/auth-verification-token.entity';
import { VerificationService } from './verification.service';

describe('VerificationService request flow', () => {
  it('persists only a SHA-256 token hash and never places the raw token in audit evidence', async () => {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      emailVerifiedAt: null,
      status: UserStatus.ACTIVE,
    } as User;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
    };
    const saved: Partial<AuthVerificationToken>[] = [];
    const tokenRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((value: Partial<AuthVerificationToken>) => value),
      save: jest.fn(async (value: Partial<AuthVerificationToken>) => {
        saved.push(value);
        return value;
      }),
    };
    const emailDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(true),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'app.webBaseUrl') return 'https://app.example.test';
        if (key === 'email.fromAddress') return 'no-reply@example.test';
        return fallback;
      }),
    } as unknown as ConfigService;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new VerificationService(
      userRepo as unknown as Repository<User>,
      tokenRepo as unknown as Repository<AuthVerificationToken>,
      emailDelivery as unknown as EmailVerificationDeliveryService,
      configService,
      auditService as unknown as AuditService,
      {} as DataSource,
    );

    await service.requestEmailVerification(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'verification-test-agent',
    });

    expect(saved).toHaveLength(1);
    expect(emailDelivery.send).toHaveBeenCalledTimes(1);

    const verificationLink = emailDelivery.send.mock.calls[0][0].verificationLink as string;
    const rawToken = new URL(verificationLink).searchParams.get('token');
    expect(rawToken).toBeTruthy();
    expect(rawToken).toHaveLength(43);

    const expectedHash = createHash('sha256').update(rawToken!, 'utf8').digest('hex');
    expect(saved[0].tokenHash).toBe(expectedHash);
    expect(saved[0].tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(saved[0])).not.toContain(rawToken!);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: user.id,
        action: AuditAction.USER_EMAIL_VERIFICATION_REQUESTED,
        metadata: { result: 'sent', channel: 'email' },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(rawToken!);
  });
});
