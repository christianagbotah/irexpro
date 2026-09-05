import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { MfaService } from './mfa.service';
import { generateTotp } from './utils/totp.util';

describe('MfaService', () => {
  const fixedNow = 1_700_000_000_000;
  let user: User;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'update'>>;
  let auditService: { log: jest.Mock };
  let service: MfaService;
  let passwordVerifySpy: jest.SpiedFunction<typeof argon2.verify>;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    passwordVerifySpy = jest.spyOn(argon2, 'verify').mockResolvedValue(true);
    user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      phone: null,
      passwordHash: 'stored-password-hash',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: null,
      lastLoginAt: null,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      countryCode: 'GH',
      timezone: null,
      preferredCurrency: null,
      mfaEnabled: false,
      mfaSecret: null,
      sessionVersion: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      profile: undefined as never,
      userRoles: [],
    };

    userRepo = {
      findOne: jest.fn().mockImplementation(async () => user),
      update: jest.fn().mockImplementation(async (_criteria, update) => {
        if (
          typeof update === 'object' &&
          'mfaSecret' in update &&
          typeof update.mfaSecret === 'string'
        ) {
          user.mfaSecret = update.mfaSecret;
        }
        return { affected: 1 } as never;
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'auth.mfaEncryptionKey' ? '0123456789abcdef0123456789abcdef' : undefined,
      ),
    } as unknown as ConfigService;

    service = new MfaService(
      userRepo as unknown as Repository<User>,
      configService,
      auditService as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-authenticates with the current password before storing the setup seed', async () => {
    await service.beginSetup(user.id, 'current-password', '127.0.0.1');

    expect(passwordVerifySpy).toHaveBeenCalledWith('stored-password-hash', 'current-password');
    expect(passwordVerifySpy.mock.invocationCallOrder[0]).toBeLessThan(
      userRepo.update.mock.invocationCallOrder[0],
    );
  });

  it('rejects an invalid current password before generating or persisting an MFA secret', async () => {
    passwordVerifySpy.mockResolvedValueOnce(false);

    await expect(
      service.beginSetup(user.id, 'wrong-password', '127.0.0.1'),
    ).rejects.toThrow('MFA verification failed');

    expect(user.mfaSecret).toBeNull();
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: user.id,
        action: AuditAction.USER_MFA_CHALLENGE_FAILED,
        metadata: { result: 'failed', operation: 'setup', method: 'totp' },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('wrong-password');
  });

  it('stores only an authenticated-encryption envelope while returning the setup seed once', async () => {
    const setup = await service.beginSetup(user.id, 'current-password', '127.0.0.1');

    expect(setup.secret).toMatch(/^[A-Z2-7]+$/u);
    expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
    expect(user.mfaSecret).toMatch(/^v1\./u);
    expect(user.mfaSecret).not.toContain(setup.secret);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: user.id,
        action: AuditAction.USER_MFA_SETUP_STARTED,
        metadata: { result: 'pending_verification', method: 'totp' },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(setup.secret);
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('current-password');
  });

  it('enables MFA only after a valid TOTP and revokes pre-MFA sessions', async () => {
    const setup = await service.beginSetup(user.id, 'current-password');
    const code = generateTotp(setup.secret, fixedNow);
    userRepo.update.mockClear();
    auditService.log.mockClear();

    await service.enable(user.id, code, '127.0.0.1');

    expect(userRepo.update).toHaveBeenCalledWith(user.id, {
      mfaEnabled: true,
      sessionVersion: expect.any(Function),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_MFA_ENABLED,
        metadata: expect.objectContaining({
          result: 'success',
          revokedExistingSessions: true,
        }),
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(code);
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(setup.secret);
  });

  it('rejects an invalid TOTP without enabling MFA or persisting the challenge', async () => {
    const setup = await service.beginSetup(user.id, 'current-password');
    const validCode = generateTotp(setup.secret, fixedNow);
    const invalidCode = validCode === '000000' ? '000001' : '000000';
    userRepo.update.mockClear();
    auditService.log.mockClear();

    await expect(service.enable(user.id, invalidCode, '127.0.0.1')).rejects.toThrow(
      'MFA verification failed',
    );

    expect(userRepo.update).not.toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ mfaEnabled: true }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.USER_MFA_CHALLENGE_FAILED }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(invalidCode);
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(setup.secret);
  });
});
