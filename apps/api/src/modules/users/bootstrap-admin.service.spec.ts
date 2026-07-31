import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BootstrapAdminService, BootstrapAdminInput } from './bootstrap-admin.service';
import { User, UserStatus } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserRole } from './entities/user-role.entity';
import { Role, RoleName } from './entities/role.entity';

/**
 * BootstrapAdminService tests — secure first-admin creation.
 *
 * These tests verify the hotfix requirements:
 *   - Creates roles if missing (find-or-create, idempotent)
 *   - Creates the first admin if no matching user exists
 *   - Promotes an existing user if email/phone matches
 *   - Idempotent: running twice does not duplicate roles or user_roles
 *   - Requires at least email or phone
 *   - Requires a strong password (≥12 chars, letters + numbers)
 *   - Never logs the raw password (verified by checking the returned result)
 *   - Existing user's password is NOT changed during promotion
 */
const mockUserRepo = {
  findOne: jest.fn(),
};
const mockProfileRepo = {
  findOne: jest.fn(),
};
const mockUserRoleRepo = {
  findOne: jest.fn(),
};
const mockRoleRepo = {
  findOne: jest.fn(),
};

const mockManager = {
  findOne: jest.fn(),
  create: jest.fn((_, data) => data), // return the created object
  save: jest.fn(async (entity) => entity),
};

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: mockManager,
};

const mockDataSource = {
  createQueryRunner: jest.fn(() => mockQueryRunner),
};

describe('BootstrapAdminService', () => {
  let module: TestingModule;
  let service: BootstrapAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mockManager.findOne default behavior
    mockManager.findOne.mockReset();
    mockManager.create.mockReset();
    mockManager.save.mockReset();
    mockManager.create.mockImplementation((_, data) => ({ ...data, id: 'new-id' }));
    mockManager.save.mockImplementation(async (entity) => entity);

    module = await Test.createTestingModule({
      providers: [
        BootstrapAdminService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(UserProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(UserRole), useValue: mockUserRoleRepo },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<BootstrapAdminService>(BootstrapAdminService);
  });

  afterEach(async () => {
    await module.close();
  });

  const validInput: BootstrapAdminInput = {
    email: 'admin@example.com',
    password: 'StrongAdminPass123!',
    firstName: 'Admin',
    lastName: 'User',
    countryCode: 'GH',
  };

  describe('input validation', () => {
    it('should throw BadRequestException if neither email nor phone is provided', async () => {
      await expect(
        service.bootstrapSuperAdmin({ password: 'StrongAdminPass123!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if password is too short (<12 chars)', async () => {
      await expect(
        service.bootstrapSuperAdmin({ email: 'a@b.com', password: 'Short1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if password has no letters', async () => {
      await expect(
        service.bootstrapSuperAdmin({ email: 'a@b.com', password: '123456789012' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if password has no numbers', async () => {
      await expect(
        service.bootstrapSuperAdmin({ email: 'a@b.com', password: 'NoNumbersHere!!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept phone-only input (no email)', async () => {
      // Set up: no existing user, roles exist (iterate order: SUPER_ADMIN, ADMIN, USER)
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null); // no existing user

      const result = await service.bootstrapSuperAdmin({
        phone: '+233241234567',
        password: 'StrongAdminPass123!',
      });

      expect(result.action).toBe('created');
      expect(result.phone).toBe('+233241234567');
      expect(result.email).toBeNull();
    });
  });

  describe('role creation (find-or-create)', () => {
    it('should create missing roles', async () => {
      // All roles missing (iterate order: SUPER_ADMIN, ADMIN, USER)
      mockManager.findOne
        .mockResolvedValueOnce(null) // SUPER_ADMIN missing
        .mockResolvedValueOnce(null) // ADMIN missing
        .mockResolvedValueOnce(null) // USER missing
        .mockResolvedValueOnce(null); // no existing user

      await service.bootstrapSuperAdmin(validInput);

      // create() called for 3 roles + user + profile + userRole = 6
      expect(mockManager.create).toHaveBeenCalledTimes(6);
      // save() called for 3 roles + user + profile + userRole = 6
      expect(mockManager.save).toHaveBeenCalledTimes(6);
    });

    it('should NOT create roles that already exist', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null); // no existing user

      await service.bootstrapSuperAdmin(validInput);

      // Only user + profile + userRole created (3), no roles
      expect(mockManager.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('first admin creation', () => {
    it('should create a new SUPER_ADMIN user if none exists', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null); // no existing user

      const result = await service.bootstrapSuperAdmin(validInput);

      expect(result.action).toBe('created');
      expect(result.userId).toBeDefined();
      expect(result.email).toBe('admin@example.com');
      // The user was created with ACTIVE status
      expect(mockManager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          email: 'admin@example.com',
          status: UserStatus.ACTIVE,
          passwordHash: expect.any(String),
        }),
      );
      // SUPER_ADMIN role was assigned
      expect(mockManager.create).toHaveBeenCalledWith(
        UserRole,
        expect.objectContaining({
          userId: expect.any(String),
          roleId: 'role-super',
        }),
      );
    });

    it('should hash the password with argon2 (not store plaintext)', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null);

      await service.bootstrapSuperAdmin(validInput);

      const userCreateCall = mockManager.create.mock.calls.find(
        (c) => c[0] === User,
      );
      expect(userCreateCall).toBeDefined();
      const createdUser = userCreateCall![1] as Record<string, unknown>;
      // argon2 hashes start with $argon2
      expect(createdUser.passwordHash).toMatch(/^\$argon2/);
      expect(createdUser.passwordHash).not.toBe(validInput.password);
    });
  });

  describe('existing user promotion', () => {
    it('should promote an existing user to SUPER_ADMIN by email', async () => {
      const existingUser = {
        id: 'existing-user-id',
        email: 'admin@example.com',
        phone: null,
        status: UserStatus.ACTIVE,
      };
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(existingUser) // existing user found by email
        .mockResolvedValueOnce(null); // no existing SUPER_ADMIN user_role

      const result = await service.bootstrapSuperAdmin(validInput);

      expect(result.action).toBe('promoted');
      expect(result.userId).toBe('existing-user-id');
      // Should NOT create a new User (only a UserRole)
      const userCreates = mockManager.create.mock.calls.filter((c) => c[0] === User);
      expect(userCreates).toHaveLength(0);
      // Should create a UserRole linking to SUPER_ADMIN
      expect(mockManager.create).toHaveBeenCalledWith(
        UserRole,
        expect.objectContaining({
          userId: 'existing-user-id',
          roleId: 'role-super',
        }),
      );
    });

    it('should NOT change the password of an existing user during promotion', async () => {
      const existingUser = {
        id: 'existing-user-id',
        email: 'admin@example.com',
        passwordHash: 'original_hash',
        status: UserStatus.ACTIVE,
      };
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);

      await service.bootstrapSuperAdmin(validInput);

      // No User entity should be saved (only a UserRole)
      const userSaves = mockManager.save.mock.calls.filter(
        (c) => c[0]?.constructor?.name === 'Object' && c[0]?.email !== undefined,
      );
      expect(userSaves).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('should return already_super_admin if user already has SUPER_ADMIN role', async () => {
      const existingUser = {
        id: 'existing-admin-id',
        email: 'admin@example.com',
        status: UserStatus.ACTIVE,
      };
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(existingUser) // existing user
        .mockResolvedValueOnce({ id: 'existing-ur-id' }); // existing user_role (already super admin)

      const result = await service.bootstrapSuperAdmin(validInput);

      expect(result.action).toBe('already_super_admin');
      // No creates, no saves (besides transaction)
      expect(mockManager.create).not.toHaveBeenCalled();
    });

    it('should be safe to run twice (roles find-or-create, no duplicates)', async () => {
      // First run: roles missing, create everything
      mockManager.findOne
        .mockResolvedValueOnce(null) // SUPER_ADMIN missing
        .mockResolvedValueOnce(null) // ADMIN missing
        .mockResolvedValueOnce(null) // USER missing
        .mockResolvedValueOnce(null); // no existing user

      await service.bootstrapSuperAdmin(validInput);
      const firstCreateCount = mockManager.create.mock.calls.length;

      jest.clearAllMocks();
      mockManager.create.mockImplementation((_, data) => ({ ...data, id: 'new-id' }));
      mockManager.save.mockImplementation(async (entity) => entity);

      // Second run: roles exist, user exists, user_role exists
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce({ id: 'user-id', email: 'admin@example.com' })
        .mockResolvedValueOnce({ id: 'ur-id' }); // already has SUPER_ADMIN

      const result2 = await service.bootstrapSuperAdmin(validInput);

      expect(result2.action).toBe('already_super_admin');
      // Second run should create NOTHING
      expect(mockManager.create).not.toHaveBeenCalled();
      expect(firstCreateCount).toBeGreaterThan(0);
    });
  });

  describe('safe output (no sensitive data)', () => {
    it('should NOT include password or passwordHash in the result', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null);

      const result = await service.bootstrapSuperAdmin(validInput);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('StrongAdminPass');
    });
  });

  describe('transaction handling', () => {
    it('should rollback on error', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 'role-super', name: RoleName.SUPER_ADMIN })
        .mockResolvedValueOnce({ id: 'role-admin', name: RoleName.ADMIN })
        .mockResolvedValueOnce({ id: 'role-user', name: RoleName.USER })
        .mockResolvedValueOnce(null);
      mockManager.save.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.bootstrapSuperAdmin(validInput)).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
