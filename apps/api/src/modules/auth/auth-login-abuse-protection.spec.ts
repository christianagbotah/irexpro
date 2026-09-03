import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserStatus } from '../users/entities/user.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';

describe('Sprint 48 — login abuse protection', () => {
  const userId = '33333333-3333-4333-8333-333333333333';

  function setup() {
    const userRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const jwtService = {
      verify: jest.fn(),
      sign: jest.fn((payload: Record<string, unknown>) => `${String(payload.tokenType)}-token`),
    };
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'auth.argon2MemoryCost') return 1024;
        if (key === 'auth.argon2TimeCost') return 2;
        if (key === 'auth.argon2Parallelism') return 1;
        return defaultValue;
      }),
    };
    const auditService = { log: jest.fn() };
    const service = new AuthService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      jwtService as never,
      configService as never,
      auditService as never,
      { createQueryRunner: jest.fn() } as never,
    );

    return { service, userRepo, auditService };
  }

  it('blocks an active temporary lock before password verification and returns a generic 401', async () => {
    const { service, userRepo, auditService } = setup();
    userRepo.findOne.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash: 'not-used',
      status: UserStatus.ACTIVE,
      loginLockedUntil: new Date(Date.now() + 5 * 60_000),
      failedLoginAttempts: 10,
      userRoles: [],
    });

    await expect(
      service.login({ identifier: 'user@example.com', password: 'NotUsedP@ss1!' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(userRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        action: AuditAction.USER_LOGIN_FAILED,
        metadata: { reason: 'temporary_lockout', result: 'blocked' },
      }),
    );
  });

  it('records a bad password with an atomic increment and threshold-based lock expression', async () => {
    const { service, userRepo, auditService } = setup();
    const passwordHash = await service.hashPassword('CorrectP@ss1!');
    userRepo.findOne.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
      loginLockedUntil: null,
      failedLoginAttempts: 9,
      userRoles: [],
    });

    await expect(
      service.login({ identifier: 'user@example.com', password: 'WrongP@ss1!' }),
    ).rejects.toThrow(UnauthorizedException);

    const failureUpdate = userRepo.update.mock.calls[0][1];
    expect(failureUpdate.failedLoginAttempts()).toContain('failed_login_attempts');
    expect(failureUpdate.loginLockedUntil()).toContain('>= 10');
    expect(failureUpdate.loginLockedUntil()).toContain("INTERVAL '15 minutes'");

    const audit = auditService.log.mock.calls[0][0];
    expect(audit).toEqual(
      expect.objectContaining({
        actorUserId: userId,
        action: AuditAction.USER_LOGIN_FAILED,
        metadata: expect.objectContaining({ reason: 'invalid_password', result: 'failed' }),
      }),
    );
    expect(JSON.stringify(audit)).not.toContain('user@example.com');
    expect(JSON.stringify(audit)).not.toContain('WrongP@ss1!');
  }, 10_000);

  it('clears failed-attempt state after a successful login', async () => {
    const { service, userRepo, auditService } = setup();
    const passwordHash = await service.hashPassword('CorrectP@ss1!');
    userRepo.findOne.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
      sessionVersion: 2,
      loginLockedUntil: null,
      failedLoginAttempts: 4,
      userRoles: [],
    });

    const result = await service.login({
      identifier: 'user@example.com',
      password: 'CorrectP@ss1!',
    });

    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(userRepo.update).toHaveBeenCalledWith(userId, {
      lastLoginAt: expect.any(Date),
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_LOGIN_SUCCESS,
        metadata: { result: 'success' },
      }),
    );
  }, 10_000);

  it('self-clears an expired lock before evaluating the next password attempt', async () => {
    const { service, userRepo } = setup();
    const passwordHash = await service.hashPassword('CorrectP@ss1!');
    userRepo.findOne.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
      sessionVersion: 2,
      loginLockedUntil: new Date(Date.now() - 60_000),
      failedLoginAttempts: 10,
      userRoles: [],
    });

    await service.login({ identifier: 'user@example.com', password: 'CorrectP@ss1!' });

    expect(userRepo.update).toHaveBeenNthCalledWith(1, userId, {
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
    expect(userRepo.update).toHaveBeenNthCalledWith(2, userId, {
      lastLoginAt: expect.any(Date),
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    });
  }, 10_000);

  it('does not copy an unknown login identifier into audit metadata', async () => {
    const { service, userRepo, auditService } = setup();
    userRepo.findOne.mockResolvedValue(null);

    await expect(
      service.login({ identifier: 'unknown@example.com', password: 'AnyP@ss1!' }),
    ).rejects.toThrow(UnauthorizedException);

    const audit = auditService.log.mock.calls[0][0];
    expect(audit.metadata).toEqual({
      reason: 'user_not_found',
      result: 'failed',
      identifierType: 'email',
    });
    expect(JSON.stringify(audit)).not.toContain('unknown@example.com');
    expect(JSON.stringify(audit)).not.toContain('AnyP@ss1!');
  });
});
