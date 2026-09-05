import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import {
  AuthVerificationToken,
  VerificationChannel,
} from './entities/auth-verification-token.entity';
import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';
import { VerificationService } from './verification.service';

type RequestChannel = 'email' | 'phone';

interface HarnessOptions {
  saveError?: Error;
  missingLockedUser?: boolean;
  missingEmailBaseUrl?: boolean;
  missingPhonePepper?: boolean;
}

describe('VerificationService issuance serialization', () => {
  const verificationPepper = 'phone-verification-pepper-32-bytes-minimum';

  function createHarness(channel: RequestChannel, options: HarnessOptions = {}) {
    const operations: string[] = [];
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
    const txTokenRepo = {
      update: jest.fn().mockImplementation(async () => {
        operations.push('invalidate');
        return { affected: 1 };
      }),
      save: jest.fn().mockImplementation(async (value: AuthVerificationToken) => {
        operations.push('save');
        if (options.saveError) throw options.saveError;
        return value;
      }),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockImplementation(async () => {
        operations.push('commit');
      }),
      rollbackTransaction: jest.fn().mockImplementation(async () => {
        operations.push('rollback');
      }),
      release: jest.fn(),
      isTransactionActive: true,
      manager: {
        findOne: jest.fn().mockImplementation(async () => {
          operations.push('lock');
          return options.missingLockedUser ? null : { id: user.id };
        }),
        getRepository: jest.fn().mockReturnValue(txTokenRepo),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    const emailDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockImplementation(async () => {
        operations.push('deliver');
        return true;
      }),
    };
    const phoneDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendVerificationCode: jest.fn().mockImplementation(async () => {
        operations.push('deliver');
        return true;
      }),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'app.webBaseUrl') {
          return options.missingEmailBaseUrl ? undefined : 'https://app.example.test';
        }
        if (key === 'email.fromAddress') return 'no-reply@example.test';
        if (key === 'auth.verificationPepper') {
          return options.missingPhonePepper ? undefined : verificationPepper;
        }
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
      dataSource,
    );

    return {
      service,
      user,
      operations,
      tokenRepo,
      txTokenRepo,
      queryRunner,
      dataSource,
      emailDelivery,
      phoneDelivery,
      auditService,
    };
  }

  async function request(channel: RequestChannel, harness: ReturnType<typeof createHarness>) {
    if (channel === 'email') {
      await harness.service.requestEmailVerification(harness.user.id, {});
      return;
    }
    await harness.service.requestPhoneVerification(harness.user.id, {});
  }

  it.each<RequestChannel>(['email', 'phone'])(
    'serializes %s issuance and commits before external delivery',
    async (channel) => {
      const harness = createHarness(channel);

      await request(channel, harness);

      expect(harness.operations).toEqual(['lock', 'invalidate', 'save', 'commit', 'deliver']);
      expect(harness.queryRunner.manager.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(harness.txTokenRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: harness.user.id,
          channel: channel === 'email' ? VerificationChannel.EMAIL : VerificationChannel.PHONE,
        }),
        { usedAt: expect.any(Date) },
      );
      expect(harness.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(harness.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    },
  );

  it.each<RequestChannel>(['email', 'phone'])(
    'rolls back %s issuance persistence failure and never delivers an uncommitted challenge',
    async (channel) => {
      const harness = createHarness(channel, { saveError: new Error('persistence failed') });

      await expect(request(channel, harness)).rejects.toThrow('persistence failed');

      expect(harness.operations).toEqual(['lock', 'invalidate', 'save', 'rollback']);
      expect(harness.queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(harness.emailDelivery.send).not.toHaveBeenCalled();
      expect(harness.phoneDelivery.sendVerificationCode).not.toHaveBeenCalled();
      expect(harness.auditService.log).not.toHaveBeenCalled();
    },
  );

  it('fails email configuration before opening an issuance transaction', async () => {
    const harness = createHarness('email', { missingEmailBaseUrl: true });

    await expect(request('email', harness)).rejects.toThrow(
      'Email verification is temporarily unavailable',
    );

    expect(harness.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(harness.txTokenRepo.update).not.toHaveBeenCalled();
    expect(harness.txTokenRepo.save).not.toHaveBeenCalled();
  });

  it('fails phone pepper configuration before opening an issuance transaction', async () => {
    const harness = createHarness('phone', { missingPhonePepper: true });

    await expect(request('phone', harness)).rejects.toThrow(
      'Phone verification is temporarily unavailable',
    );

    expect(harness.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(harness.txTokenRepo.update).not.toHaveBeenCalled();
    expect(harness.txTokenRepo.save).not.toHaveBeenCalled();
  });

  it.each<RequestChannel>(['email', 'phone'])(
    'fails closed when the %s issuance lock can no longer resolve the user',
    async (channel) => {
      const harness = createHarness(channel, { missingLockedUser: true });

      await expect(request(channel, harness)).rejects.toThrow('User session is no longer valid');

      expect(harness.operations).toEqual(['lock', 'rollback']);
      expect(harness.txTokenRepo.update).not.toHaveBeenCalled();
      expect(harness.txTokenRepo.save).not.toHaveBeenCalled();
      expect(harness.emailDelivery.send).not.toHaveBeenCalled();
      expect(harness.phoneDelivery.sendVerificationCode).not.toHaveBeenCalled();
    },
  );
});
