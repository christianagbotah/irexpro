import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUserDto } from './dto/auth-user.dto';
import { normalizePhone, isEmail } from './utils/phone.util';
import { User, UserStatus } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role, RoleName } from '../users/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private profileRepo: Repository<UserProfile>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Sprint 27: validate that at least one of email or phone is provided
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('At least one of email or phone is required');
    }

    // Normalize phone if provided (Sprint 27 amendment)
    const normalizedPhone = dto.phone
      ? normalizePhone(dto.phone, this.callingCodeForCountry(dto.countryCode))
      : null;

    // Check for duplicate email (if provided)
    if (dto.email) {
      const existingByEmail = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
      if (existingByEmail) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    // Check for duplicate phone (if provided, after normalization)
    if (normalizedPhone) {
      const existingByPhone = await this.userRepo.findOne({ where: { phone: normalizedPhone } });
      if (existingByPhone) {
        throw new ConflictException('An account with this phone number already exists');
      }
    }

    const passwordHash = await argon2.hash(dto.password, {
      memoryCost: this.configService.get('auth.argon2MemoryCost', 65536),
      timeCost: this.configService.get('auth.argon2TimeCost', 3),
      parallelism: this.configService.get('auth.argon2Parallelism', 1),
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        email: dto.email ? dto.email.toLowerCase() : null,
        phone: normalizedPhone,
        passwordHash,
        countryCode: dto.countryCode ?? null,
        // Hotfix: create users as ACTIVE because no email/phone verification
        // flow is implemented yet. PENDING_VERIFICATION was a permanent
        // dead-end (no code transitions users to ACTIVE), which caused
        // /auth/refresh to reject every newly registered user with 401.
        // When a verification flow is added in a future sprint, revert this
        // to PENDING_VERIFICATION and have the verification endpoint set
        // ACTIVE upon successful verification.
        status: UserStatus.ACTIVE,
      });
      await queryRunner.manager.save(user);

      const profile = queryRunner.manager.create(UserProfile, {
        userId: user.id,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
      });
      await queryRunner.manager.save(profile);

      const userRole = await this.roleRepo.findOne({ where: { name: RoleName.USER } });
      if (userRole) {
        const ur = queryRunner.manager.create(UserRole, {
          userId: user.id,
          roleId: userRole.id,
        });
        await queryRunner.manager.save(ur);
      }

      await queryRunner.commitTransaction();

      await this.auditService.log({
        actorUserId: user.id,
        action: AuditAction.USER_REGISTERED,
        resourceType: 'User',
        resourceId: user.id,
        ipAddress,
        metadata: { email: user.email, countryCode: user.countryCode },
      });

      const tokens = this.generateTokens(user, [RoleName.USER]);
      this.logger.log(`New user registered: ${user.email}`);
      return tokens;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async login(dto: LoginDto, ipAddress?: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Sprint 27: support email OR phone as identifier.
    const identifier = dto.identifier.trim();
    const emailLogin = isEmail(identifier);
    // For phone login, normalize: clean spaces/dashes, ensure starts with +
    const phoneLookup = emailLogin ? null : normalizePhone(identifier);

    const user = await this.userRepo.findOne({
      where: emailLogin
        ? { email: identifier.toLowerCase() }
        : { phone: phoneLookup ?? '' },
      relations: ['userRoles', 'userRoles.role'],
    });

    if (!user) {
      await this.auditService.log({
        action: AuditAction.USER_LOGIN_FAILED,
        ipAddress,
        metadata: { identifier: dto.identifier, reason: 'user_not_found' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.CLOSED) {
      await this.auditService.log({
        actorUserId: user.id,
        action: AuditAction.USER_LOGIN_FAILED,
        ipAddress,
        metadata: { reason: 'account_status', status: user.status },
      });
      throw new UnauthorizedException('Account is not active');
    }

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) {
      await this.auditService.log({
        actorUserId: user.id,
        action: AuditAction.USER_LOGIN_FAILED,
        ipAddress,
        metadata: { reason: 'invalid_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const roles = user.userRoles?.map((ur) => ur.role.name) ?? [RoleName.USER];

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_LOGIN_SUCCESS,
      ipAddress,
      metadata: { email: user.email },
    });

    return this.generateTokens(user, roles);
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      // Hotfix: do NOT pass { secret } explicitly. The JwtModule is already
      // configured with the secret in AuthModule.registerAsync, and
      // jwtService.verify(token) uses that secret automatically. Passing an
      // explicit secret is redundant and can mask config-loading issues.
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      // Token is malformed, tampered, or expired — reject cleanly with 401.
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['userRoles', 'userRoles.role'],
    });

    // Hotfix (ROOT CAUSE): block only SUSPENDED/CLOSED users — NOT
    // PENDING_VERIFICATION. This matches login() and JwtStrategy.validate(),
    // which both allow PENDING_VERIFICATION. The previous check
    // (`user.status !== ACTIVE`) rejected every newly registered user because
    // register() created them as PENDING_VERIFICATION and no activation flow
    // existed. If you can login, you should be able to refresh.
    if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.CLOSED) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const roles = user.userRoles?.map((ur) => ur.role.name) ?? [RoleName.USER];
    return this.generateTokens(user, roles);
  }

  private generateTokens(user: User, roles: string[]): { accessToken: string; refreshToken: string } {
    const payload: JwtPayload = { sub: user.id, email: user.email, roles };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('jwt.accessExpiry', '15m'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('jwt.refreshExpiry', '7d'),
    });
    return { accessToken, refreshToken };
  }

  async validateUser(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * Build a frontend-safe AuthUserDto for the /auth/me endpoint.
   *
   * Sprint 25: this replaces the previous approach of returning the raw User
   * entity minus passwordHash/mfaSecret. It:
   *   - Loads the user's profile (for firstName/lastName)
   *   - Uses the roles from the JWT payload (passed by the controller from
   *     request.user.roles — already set by JwtStrategy.validate)
   *   - Returns ONLY frontend-safe fields via AuthUserDto.fromUser
   *
   * Sensitive fields (passwordHash, mfaSecret, deletedAt, userRoles, profile
   * PII, provider/broker secrets) are NEVER included.
   */
  async getAuthUserDto(userId: string, roles: RoleName[]): Promise<AuthUserDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return AuthUserDto.fromUser(user, roles, user.profile);
  }

  /**
   * Hashes a password using argon2 with the configured cost parameters.
   * Uses the same ConfigService values as register() so that test environments
   * can inject low-cost values without weakening production security.
   *
   * Production defaults: memoryCost=65536, timeCost=3, parallelism=1
   * Test override:       memoryCost=256,   timeCost=1, parallelism=1
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: this.configService.get<number>('auth.argon2MemoryCost', 65536),
      timeCost: this.configService.get<number>('auth.argon2TimeCost', 3),
      parallelism: this.configService.get<number>('auth.argon2Parallelism', 1),
    });
  }

  /** Verifies a password against an argon2 hash. Exposed for testing. */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /**
   * Maps a 2-letter country code to its calling code for phone normalization.
   * Sprint 27 amendment: ensures the backend can normalize local phone numbers
   * even when the frontend only sends the country code (not the calling code).
   */
  private callingCodeForCountry(countryCode?: string): string | undefined {
    if (!countryCode) return undefined;
    const map: Record<string, string> = {
      GH: '+233', NG: '+234', GB: '+44', US: '+1', CA: '+1', ZA: '+27',
      KE: '+254', CI: '+225', TG: '+228', BJ: '+229', BF: '+226',
      SL: '+232', LR: '+231', AE: '+971', IN: '+91', CN: '+86',
    };
    return map[countryCode.toUpperCase()];
  }
}
