import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import {
  AuthVerificationToken,
  VerificationChannel,
} from './entities/auth-verification-token.entity';
import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';
import { VerificationService } from './verification.service';

describe('VerificationService phone confirmation', () => {
  const pepper = 'phone-verification-pepper-32-bytes-minimum';
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    phone: '+233244000000',
    phoneVerifiedAt: null,
    status: UserStatus.ACTIVE,
  } as User;

  function makeService(token: AuthVerificationToken) {
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(token),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    const configService = {
      get: jest.fn((key: string) => (key === 'auth.verificationPepper' ? pepper : undefined)),
    } as unknown as ConfigService;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new VerificationService(
      {} as Repository<User>,
      {} as Repository<AuthVerificationToken>,
      {} as EmailVerificationDeliveryService,
      {} as PhoneVerificationDeliveryService,
      configService,
      auditService as unknown as AuditService,
      dataSource,
    );
    return { service, manager, queryRunner, auditService };
  }

  it('burns the challenge on the fifth invalid attempt without logging the submitted code', async () => {
    const token = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: user.id,
      tokenHash: createHmac('sha256', pepper)
        .update(`${user.id}:${user.phone}:654321`, 'utf8')
        .digest('hex'),
      channel: VerificationChannel.PHONE,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      attemptCount: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      requestedIp: null,
      userAgent: null,
    } as AuthVerificationToken;
    const { service, manager, auditService } = makeService(token);

    await expect(service.verifyPhone(user.id, '123456', '127.0.0.1')).rejects.toThrow(
      'Invalid or expired verification code',
    );

    expect(manager.update).toHaveBeenCalledWith(
      AuthVerificationToken,
      expect.objectContaining({ id: token.id, attemptCount: 4 }),
      expect.objectContaining({ attemptCount: 5, usedAt: expect.any(Date) }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_PHONE_VERIFICATION_FAILED,
        metadata: expect.objectContaining({
          reason: 'attempts_exhausted',
          attemptsRemaining: 0,
        }),
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('123456');
  });

  it('atomically consumes a valid challenge and marks the phone verified', async () => {
    const code = '123456';
    const token = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: user.id,
      tokenHash: createHmac('sha256', pepper)
        .update(`${user.id}:${user.phone}:${code}`, 'utf8')
        .digest('hex'),
      channel: VerificationChannel.PHONE,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      requestedIp: null,
      userAgent: null,
    } as AuthVerificationToken;
    const { service, manager, queryRunner, auditService } = makeService(token);

    await service.verifyPhone(user.id, code, '127.0.0.1');

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      AuthVerificationToken,
      expect.objectContaining({ id: token.id, attemptCount: 0 }),
      { usedAt: expect.any(Date) },
    );
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      User,
      user.id,
      expect.objectContaining({ phoneVerifiedAt: expect.any(Date) }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_PHONE_VERIFIED,
        metadata: { result: 'success', channel: 'phone' },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(code);
  });
});
