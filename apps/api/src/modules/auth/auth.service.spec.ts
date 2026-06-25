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
const mockConfigService = { get: jest.fn((key: string, def?: unknown) => def) };
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
    // bcrypt is CPU-intensive; allow generous time under parallel worker load
    const BCRYPT_TIMEOUT = 20_000;

    it('should hash and verify a password correctly', async () => {
      const password = 'TestP@ssw0rd!';
      const hash = await service.hashPassword(password);
      expect(hash).not.toBe(password);
      const isValid = await service.verifyPassword(hash, password);
      expect(isValid).toBe(true);
    }, BCRYPT_TIMEOUT);

    it('should reject a wrong password', async () => {
      const hash = await service.hashPassword('CorrectP@ss1!');
      const isValid = await service.verifyPassword(hash, 'WrongP@ss1!');
      expect(isValid).toBe(false);
    }, BCRYPT_TIMEOUT);
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
    });

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
