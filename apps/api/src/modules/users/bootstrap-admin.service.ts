import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserStatus } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserRole } from './entities/user-role.entity';
import { Role, RoleName } from './entities/role.entity';
import { normalizePhone } from '../auth/utils/phone.util';

/**
 * BootstrapAdminService — secure one-time first-admin creation.
 *
 * Hotfix: there is no default admin account and no public admin registration.
 * This service is invoked ONLY by the CLI script `pnpm --filter @irexpro/api
 * seed:admin` (apps/api/scripts/bootstrap-admin.ts), which reads admin details
 * from environment variables. It is NEVER exposed as an HTTP endpoint.
 *
 * Idempotent:
 *   - Creates USER/ADMIN/SUPER_ADMIN roles if missing.
 *   - If a user matching the email OR phone already exists, promotes them to
 *     SUPER_ADMIN (does not duplicate the user, does not change their password
 *     unless --reset-password is explicitly passed — NOT done here).
 *   - If no matching user exists, creates a new SUPER_ADMIN user.
 *   - Running twice is safe: roles are find-or-create, user_roles are
 *     find-or-create (no duplicates).
 *
 * Security:
 *   - Password is hashed with argon2 (same as register()).
 *   - The raw password is NEVER logged.
 *   - The script exits with a non-zero code on any error.
 *   - Requires at least email OR phone, plus a strong password.
 *
 * NOT a public endpoint. NOT wired into any controller.
 */
@Injectable()
export class BootstrapAdminService {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private profileRepo: Repository<UserProfile>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    private dataSource: DataSource,
  ) {}

  /**
   * Bootstrap (create or promote) a SUPER_ADMIN user from env-provided input.
   *
   * @param input - validated admin details (from env vars in the CLI script)
   * @returns a safe summary object (no password, no hash)
   */
  async bootstrapSuperAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
    this.validateInput(input);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Ensure all roles exist (find-or-create each)
      const superAdminRole = await this.ensureRolesExist(queryRunner.manager);

      // 2. Normalize the identifier — find existing user by email or phone
      const normalizedEmail = input.email ? input.email.toLowerCase().trim() : null;
      const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;

      let user = await queryRunner.manager.findOne(User, {
        where: normalizedEmail
          ? { email: normalizedEmail }
          : { phone: normalizedPhone ?? '' },
      });

      let created = false;
      let promoted = false;

      if (user) {
        // Existing user — promote to SUPER_ADMIN if not already
        promoted = await this.promoteToSuperAdmin(queryRunner.manager, user, superAdminRole);
        // Do NOT change the password of an existing user automatically.
        // If the operator needs to reset the password, they should use the
        // forgot-password flow or a separate admin password-reset command.
      } else {
        // No existing user — create a new SUPER_ADMIN
        user = await this.createNewAdmin(queryRunner.manager, input, normalizedEmail, normalizedPhone, superAdminRole);
        created = true;
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Bootstrap complete: ${created ? 'created' : promoted ? 'promoted' : 'already configured'} ` +
        `SUPER_ADMIN user ${this.safeIdentifier(user)}`,
      );

      return {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        action: created ? 'created' : promoted ? 'promoted' : 'already_super_admin',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private validateInput(input: BootstrapAdminInput): void {
    if (!input.email && !input.phone) {
      throw new BadRequestException(
        'Bootstrap requires at least one of BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PHONE',
      );
    }
    if (!input.password || input.password.length < 12) {
      throw new BadRequestException(
        'Bootstrap requires BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters',
      );
    }
    // Strong password check: at least one letter and one number
    if (!/[a-zA-Z]/.test(input.password) || !/[0-9]/.test(input.password)) {
      throw new BadRequestException(
        'BOOTSTRAP_ADMIN_PASSWORD must contain at least one letter and one number',
      );
    }
  }

  private async ensureRolesExist(manager: EntityManager): Promise<Role> {
    let superAdminRole: Role | null = null;
    for (const name of Object.values(RoleName)) {
      let role = await manager.findOne(Role, { where: { name } });
      if (!role) {
        role = manager.create(Role, { name, description: `Default ${name} role` });
        await manager.save(role);
        this.logger.log(`Created missing role: ${name}`);
      }
      if (name === RoleName.SUPER_ADMIN) {
        superAdminRole = role;
      }
    }
    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role could not be ensured');
    }
    return superAdminRole;
  }

  private async promoteToSuperAdmin(
    manager: EntityManager,
    user: User,
    superAdminRole: Role,
  ): Promise<boolean> {
    // Check if the user already has SUPER_ADMIN
    const existing = await manager.findOne(UserRole, {
      where: { userId: user.id, roleId: superAdminRole.id },
    });
    if (existing) {
      // Already a super admin — nothing to do
      return false;
    }
    const ur = manager.create(UserRole, {
      userId: user.id,
      roleId: superAdminRole.id,
    });
    await manager.save(ur);
    return true;
  }

  private async createNewAdmin(
    manager: EntityManager,
    input: BootstrapAdminInput,
    normalizedEmail: string | null,
    normalizedPhone: string | null,
    superAdminRole: Role,
  ): Promise<User> {
    const passwordHash = await argon2.hash(input.password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const user = manager.create(User, {
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      countryCode: input.countryCode ?? null,
      // Hotfix: users are created as ACTIVE (no verification flow yet)
      status: UserStatus.ACTIVE,
    });
    await manager.save(user);

    const profile = manager.create(UserProfile, {
      userId: user.id,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
    });
    await manager.save(profile);

    const ur = manager.create(UserRole, {
      userId: user.id,
      roleId: superAdminRole.id,
    });
    await manager.save(ur);

    return user;
  }

  /** Returns a safe identifier for logging (email preferred, phone fallback). */
  private safeIdentifier(user: User): string {
    return user.email ?? user.phone ?? user.id;
  }
}

export interface BootstrapAdminInput {
  email?: string;
  phone?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
}

export interface BootstrapAdminResult {
  userId: string;
  email: string | null;
  phone: string | null;
  action: 'created' | 'promoted' | 'already_super_admin';
}
