import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import { AuthVerificationToken } from './entities/auth-verification-token.entity';
import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';
import { VerificationService } from './verification.service';

type VerificationRequestChannel = 'email' | 'phone';

describe('VerificationService request metadata bounds', () => {
  const verificationPepper = 'phone-verification-pepper-32-bytes-minimum';

  async function exerciseRequest(channel: VerificationRequestChannel, userAgent?: string) {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: channel === 'email' ? 'user@example.com' : null,
      phone: channel === 'phone' ? '+233244000000' : null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: UserStatus.ACTIVE,
    } as User;

    const userRepo = { findOne: jest.fn().mockResolvedValue(user) };
    const tokenRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value: Partial<AuthVerificationToken>) => value),
      save: jest.fn(async (value: Partial<AuthVerificationToken>) => value),
    };
    const emailDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(true),
    };
    const phoneDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendVerificationCode: jest.fn().mockResolvedValue(true),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'app.webBaseUrl') return 'https://app.example.test';
        if (key === 'email.fromAddress') return 'no-reply@example.test';
        if (key === 'auth.verificationPepper') return verificationPepper;
        return fallback;
      }),
    } as unknown as ConfigService;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new VerificationService(
      userRepo as unknown as Repository<User>,
      tokenRepo as unknown as Repository<AuthVerificationToken>,
      emailDelivery as unknown as EmailVerificationDeliveryService,
      phoneDelivery as unknown as PhoneVerificationDeliveryService,
      configService,
      auditService as unknown as AuditService,
      {} as DataSource,
    );

    const context = {
      ipAddress: '203.0.113.10',
      ...(userAgent === undefined ? {} : { userAgent }),
    };

    if (channel === 'email') {
      await service.requestEmailVerification(user.id, context);
    } else {
      await service.requestPhoneVerification(user.id, context);
    }

    const createdToken = tokenRepo.create.mock.calls[0][0] as Partial<AuthVerificationToken>;
    const auditEvent = auditService.log.mock.calls[0][0] as {
      ipAddress?: string;
      userAgent?: string;
    };

    return { createdToken, auditEvent };
  }

  it.each<VerificationRequestChannel>(['email', 'phone'])(
    'bounds oversized User-Agent consistently for %s token persistence and audit logging',
    async (channel) => {
      const { createdToken, auditEvent } = await exerciseRequest(channel, 'a'.repeat(800));

      expect(createdToken.userAgent).toBe('a'.repeat(500));
      expect(createdToken.userAgent).toHaveLength(500);
      expect(auditEvent.userAgent).toBe(createdToken.userAgent);
      expect(createdToken.requestedIp).toBe('203.0.113.10');
      expect(auditEvent.ipAddress).toBe('203.0.113.10');
    },
  );

  it.each<VerificationRequestChannel>(['email', 'phone'])(
    'preserves missing User-Agent semantics for %s verification requests',
    async (channel) => {
      const { createdToken, auditEvent } = await exerciseRequest(channel);

      expect(createdToken.userAgent).toBeNull();
      expect(auditEvent.userAgent).toBeUndefined();
      expect(createdToken.requestedIp).toBe('203.0.113.10');
      expect(auditEvent.ipAddress).toBe('203.0.113.10');
    },
  );

  it.each<VerificationRequestChannel>(['email', 'phone'])(
    'leaves an exactly 500-character User-Agent unchanged for %s verification requests',
    async (channel) => {
      const userAgent = 'b'.repeat(500);
      const { createdToken, auditEvent } = await exerciseRequest(channel, userAgent);

      expect(createdToken.userAgent).toBe(userAgent);
      expect(auditEvent.userAgent).toBe(userAgent);
    },
  );
});
