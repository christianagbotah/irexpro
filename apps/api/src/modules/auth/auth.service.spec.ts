import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role, RoleName } from '../users/entities/role.entity';
import { AuditService } from '../audit/audit.service';

const mockUserRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};
const mockProfileRepo = { create: jest.fn(), save: jest.fn() };
const mockUserRoleRepo = { create: jest.fn(), save: jest.fn() };
const mockRoleRepo = { findOne: jest.fn() };
const mockJwtService = { sign: jest.fn(() => 'mock_token'), verify: jest.fn() };
/**
 * Use minimal argon2 cost parameters in tests to avoid CPU/memory timeouts.
 * Production values (memoryCost=65536, timeCost=3) are not changed.
 * These are injected via ConfigService — the same path register() and hashPassword() use.
 */
// argon2 enforces: memoryCost >= 1024, timeCost >= 2, parallelism >= 1.
// These values sit at (or near) the library minimums — ~64× cheaper than
// production defaults (65536 / 3 / 1) while still exercising the real hash path.
const TEST_ARGON2_COSTS: Record<string, unknown> = {
  'auth.argon2MemoryCost': 1024,
  'auth.argon2TimeCost': 2,
  'auth.argon2Parallelism': 1,
};
const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => TEST_ARGON2_COSTS[key] ?? def),
};
const mockAuditService = { log: jest.fn() };
const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    create: jest.fn(),
    save: jest.fn(),
  },
};
const mockDataSource = { createQueryRunner: jest.fn(() => mockQueryRunner) };

describe('AuthService', () => {
  let module: TestingModule;
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(UserProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(UserRole), useValue: mockUserRoleRepo },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword / verifyPassword', () => {
    // Argon2 with test-injected low cost (memoryCost=256, timeCost=1) is fast.
    // Timeout is generous to stay safe under parallel worker load on Windows.
    const ARGON2_TEST_TIMEOUT = 10_000;

    it('should hash and verify a password correctly', async () => {
      const password = 'TestP@ssw0rd!';
      const hash = await service.hashPassword(password);
      expect(hash).not.toBe(password);
      const isValid = await service.verifyPassword(hash, password);
      expect(isValid).toBe(true);
    }, ARGON2_TEST_TIMEOUT);

    it('should reject a wrong password', async () => {
      const hash = await service.hashPassword('CorrectP@ss1!');
      const isValid = await service.verifyPassword(hash, 'WrongP@ss1!');
      expect(isValid).toBe(false);
    }, ARGON2_TEST_TIMEOUT);
  });

  describe('register', () => {
    it('should throw ConflictException if email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'existing-user', email: 'test@example.com' });
      await expect(
        service.register({ email: 'test@example.com', password: 'Pass@1234!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should register a new user and return tokens', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);
      mockRoleRepo.findOne.mockResolvedValueOnce({ id: 'role-id', name: RoleName.USER });
      mockQueryRunner.manager.create.mockReturnValue({ id: 'new-user-id', email: 'new@example.com' });
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'new-user-id' });

      const result = await service.register({ email: 'new@example.com', password: 'SecureP@ssw0rd!' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockAuditService.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for unknown email', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'unknown@example.com', password: 'Pass@1234!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      // hashPassword() now uses test-injected low argon2 cost (memoryCost=256, timeCost=1)
      // so this completes well within the timeout even on Windows under parallel load.
      const hash = await service.hashPassword('CorrectP@ss1!');
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: hash,
        status: UserStatus.ACTIVE,
        userRoles: [],
      });
      await expect(
        service.login({ email: 'test@example.com', password: 'WrongP@ss1!' }),
      ).rejects.toThrow(UnauthorizedException);
    }, 10_000);

    it('should throw UnauthorizedException for suspended account', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: 'some-hash',
        status: UserStatus.SUSPENDED,
        userRoles: [],
      });
      await expect(
        service.login({ email: 'test@example.com', password: 'Pass@1234!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
