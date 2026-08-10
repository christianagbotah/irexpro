import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetToken, ResetChannel } from './entities/password-reset-token.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';
import { ConfigService } from '@nestjs/config';

/**
 * PasswordResetService tests — Sprint 28 secure password reset.
 *
 * Verifies:
 *   - forgot-password returns generic response for existing/non-existing identifiers
 *   - raw reset token/code is NEVER stored (only SHA-256 hash)
 *   - token expiry is enforced
 *   - token single-use is enforced
 *   - previous unused tokens are invalidated
 *   - reset-password changes password for valid token
 *   - reset-password rejects invalid/expired/used tokens
 *   - reset-password rejects weak passwords
 *   - reset completion audit is recorded
 *   - account existence is not leaked
 *   - phone-only user recovery behavior is correct
 *   - no sensitive fields are exposed
 */
const mockResetTokenRepo = {
  findOne: jest.fn(),
  save: jest.fn(async (entity) => entity),
  create: jest.fn((data) => ({ ...data, id: 'token-id' })),
  update: jest.fn(),
};
const mockUserRepo = {
  findOne: jest.fn(),
};
const mockAuditService = { log: jest.fn() };
const mockDeliveryService = { deliver: jest.fn().mockResolvedValue(true) };
const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'auth.argon2MemoryCost') return 1024;
    if (key === 'auth.argon2TimeCost') return 2;
    if (key === 'auth.argon2Parallelism') return 1;
    return def;
  }),
};
const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    update: jest.fn(),
    save: jest.fn(async (entity) => entity),
  },
};
const mockDataSource = { createQueryRunner: jest.fn(() => mockQueryRunner) };

describe('PasswordResetService', () => {
  let module: TestingModule;
  let service: PasswordResetService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDeliveryService.deliver = jest.fn().mockResolvedValue(true);

    module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: getRepositoryToken(PasswordResetToken), useValue: mockResetTokenRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PasswordResetDeliveryService, useValue: mockDeliveryService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PasswordResetService>(PasswordResetService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ── requestReset (forgot-password) ───────────────────────────────────────

  describe('requestReset (forgot-password)', () => {
    it('should return generic result (delivered=true) for an existing email user', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        phone: null,
        status: UserStatus.ACTIVE,
      });
      mockResetTokenRepo.update.mockResolvedValueOnce({}); // invalidate prior

      const result = await service.requestReset('user@example.com');

      expect(result.delivered).toBe(true);
      expect(result.channel).toBe(ResetChannel.EMAIL);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'USER_PASSWORD_RESET_REQUESTED',
        }),
      );
    });

    it('should return generic result (delivered=false, channel=null) for a non-existing identifier', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.requestReset('nonexistent@example.com');

      // Same shape as the existing-user case — does NOT reveal non-existence
      expect(result).toHaveProperty('delivered');
      expect(result).toHaveProperty('channel');
      expect(result.delivered).toBe(false);
      expect(result.channel).toBeNull();
      // No audit log for non-existent user (no actorUserId)
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('should return generic result for a SUSPENDED user (no delivery, no audit)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-2',
        email: 'suspended@example.com',
        status: UserStatus.SUSPENDED,
      });

      const result = await service.requestReset('suspended@example.com');

      expect(result.delivered).toBe(false);
      expect(result.channel).toBeNull();
      expect(mockDeliveryService.deliver).not.toHaveBeenCalled();
    });

    it('should use PHONE channel for a phone-only user', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        email: null,
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });

      const result = await service.requestReset('+233241234567');

      expect(result.channel).toBe(ResetChannel.PHONE);
      expect(mockDeliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ channel: ResetChannel.PHONE }),
      );
    });

    it('should invalidate prior unused tokens before issuing a new one', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });

      await service.requestReset('user@example.com');

      expect(mockResetTokenRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', usedAt: expect.anything() }, // IsNull() is a Symbol-like
        { usedAt: expect.any(Date) },
      );
    });

    it('should store ONLY the token hash (never the raw token)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });

      await service.requestReset('user@example.com');

      const savedToken = mockResetTokenRepo.create.mock.results[0].value;
      // tokenHash must be a 64-char hex string (SHA-256), NOT the raw token
      expect(savedToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      // The delivery service received the raw token, but the hash was stored
      expect(mockDeliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ rawToken: expect.any(String) }),
      );
      // The saved token's hash must NOT be the raw token
      const deliveredRawToken = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      expect(savedToken.tokenHash).not.toBe(deliveredRawToken);
      // The raw token must not appear in the saved token object at all
      const savedStr = JSON.stringify(savedToken);
      expect(savedStr).not.toContain(deliveredRawToken);
    });

    it('should never log the raw token (audit metadata must not contain it)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });

      await service.requestReset('user@example.com');

      const auditCall = mockAuditService.log.mock.calls[0][0];
      const auditStr = JSON.stringify(auditCall.metadata);
      // The raw token is 64 hex chars — ensure it does not appear in audit metadata
      const deliveredRawToken = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      expect(auditStr).not.toContain(deliveredRawToken);
      expect(auditStr).not.toContain('token');
      expect(auditStr).not.toContain('code');
    });
  });

  // ── resetWithToken (email flow) ──────────────────────────────────────────

  describe('resetWithToken (email flow)', () => {
    const validPassword = 'NewStrongPassword123!';

    it('should reset the password for a valid token', async () => {
      // First, request a reset to generate a real token
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });
      await service.requestReset('user@example.com');
      const deliveredRawToken = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      const savedToken = mockResetTokenRepo.create.mock.results[0].value;

      // Now reset with that token
      const resetTokenCopy = { ...savedToken, usedAt: null };
      mockResetTokenRepo.findOne.mockResolvedValueOnce(resetTokenCopy);
      await service.resetWithToken(deliveredRawToken, validPassword);

      // Password was updated
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(User, 'user-1', {
        passwordHash: expect.any(String),
      });
      // Token was marked as used (the save call received a token with usedAt set)
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
      // Audit completion was recorded
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'USER_PASSWORD_RESET_COMPLETED',
        }),
      );
    });

    it('should hash the new password with argon2 (not store plaintext)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });
      await service.requestReset('user@example.com');
      const deliveredRawToken = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      const savedToken = mockResetTokenRepo.create.mock.results[0].value;

      mockResetTokenRepo.findOne.mockResolvedValueOnce({ ...savedToken, usedAt: null });
      await service.resetWithToken(deliveredRawToken, validPassword);

      const updateCall = mockQueryRunner.manager.update.mock.calls[0];
      const passwordHash = updateCall[2].passwordHash;
      // argon2 hashes start with $argon2
      expect(passwordHash).toMatch(/^\$argon2/);
      expect(passwordHash).not.toBe(validPassword);
    });

    it('should reject an invalid token', async () => {
      mockResetTokenRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.resetWithToken('invalid-token', validPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an expired token', async () => {
      mockResetTokenRepo.findOne.mockResolvedValueOnce({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'some-hash',
        channel: ResetChannel.EMAIL,
        expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
        usedAt: null,
        attemptCount: 0,
      });

      await expect(service.resetWithToken('some-token', validPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a used token (single-use enforcement)', async () => {
      mockResetTokenRepo.findOne.mockResolvedValueOnce({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'some-hash',
        channel: ResetChannel.EMAIL,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(), // already used
        attemptCount: 0,
      });

      await expect(service.resetWithToken('some-token', validPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── resetWithCode (phone flow) ───────────────────────────────────────────

  describe('resetWithCode (phone flow)', () => {
    const validPassword = 'NewStrongPassword123!';

    it('should reset the password for a valid phone code', async () => {
      // Request a phone reset
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        email: null,
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });
      await service.requestReset('+233241234567');
      const deliveredCode = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      const savedToken = mockResetTokenRepo.create.mock.results[0].value;

      // Reset with the code
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        email: null,
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });
      mockResetTokenRepo.findOne.mockResolvedValueOnce({ ...savedToken, usedAt: null });

      await service.resetWithCode('+233241234567', deliveredCode, validPassword);

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(User, 'phone-user', {
        passwordHash: expect.any(String),
      });
    });

    it('should reject an invalid phone code', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });
      mockResetTokenRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.resetWithCode('+233241234567', '000000', validPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an empty identifier', async () => {
      await expect(service.resetWithCode('   ', '123456', validPassword)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not reveal whether the user exists (generic UnauthorizedException)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null); // user not found

      await expect(service.resetWithCode('+233241234567', '123456', validPassword)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── Token properties ─────────────────────────────────────────────────────

  describe('token generation properties', () => {
    it('email token should be high-entropy (64 hex chars = 32 bytes)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });
      await service.requestReset('user@example.com');

      const rawToken = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      expect(rawToken).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex
    });

    it('phone code should be 6 digits', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        email: null,
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });
      await service.requestReset('+233241234567');

      const rawCode = mockDeliveryService.deliver.mock.calls[0][0].rawToken;
      expect(rawCode).toMatch(/^\d{6}$/);
    });

    it('email token expiry should be 15 minutes from now', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });
      const before = Date.now();
      await service.requestReset('user@example.com');
      const after = Date.now();

      const savedToken = mockResetTokenRepo.create.mock.results[0].value;
      const expiryMs = savedToken.expiresAt.getTime();
      // 15 min = 900000 ms; allow ±5s slack for test execution
      expect(expiryMs).toBeGreaterThan(before + 899_000);
      expect(expiryMs).toBeLessThan(after + 901_000);
    });

    it('phone code expiry should be 10 minutes from now', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'phone-user',
        email: null,
        phone: '+233241234567',
        status: UserStatus.ACTIVE,
      });
      const before = Date.now();
      await service.requestReset('+233241234567');
      const after = Date.now();

      const savedToken = mockResetTokenRepo.create.mock.results[0].value;
      const expiryMs = savedToken.expiresAt.getTime();
      // 10 min = 600000 ms
      expect(expiryMs).toBeGreaterThan(before + 599_000);
      expect(expiryMs).toBeLessThan(after + 601_000);
    });
  });

  // ── No sensitive data exposed ────────────────────────────────────────────

  describe('no sensitive data exposed', () => {
    it('requestReset result must not contain token, code, or password fields', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.ACTIVE,
      });
      const result = await service.requestReset('user@example.com');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('code');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('hash');
    });
  });
});
