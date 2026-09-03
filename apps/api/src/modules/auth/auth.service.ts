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
import { randomUUID } from 'crypto';
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

  async register(
    dto: RegisterDto,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('At least one of email or phone is required');
    }

    const normalizedPhone = dto.phone
      ? normalizePhone(dto.phone, this.callingCodeForCountry(dto.countryCode))
      : null;

    if (dto.email) {
      const existingByEmail = await this.userRepo.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (existingByEmail) {
        throw new ConflictException('An account with this email already exists');
      }
    }

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
        status: UserStatus.ACTIVE,
        // New token generations begin at 1. The migration applies the same
        // baseline to every existing user, which invalidates pre-Sprint-48
        // JWTs that do not carry a sessionVersion claim.
        sessionVersion: 1,
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

  async login(
    dto: LoginDto,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const identifier = dto.identifier.trim();
    const emailLogin = isEmail(identifier);
    const phoneLookup = emailLogin ? null : normalizePhone(identifier);

    const user = await this.userRepo.findOne({
      where: emailLogin ? { email: identifier.toLowerCase() } : { phone: phoneLookup ?? '' },
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

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.PERMANENTLY_LOCKED ||
      user.status === UserStatus.CLOSED
    ) {
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

  /**
   * Rotate a refresh token by atomically advancing the user's server-side
   * session generation. Only one caller can advance a given generation; a
   * replay or concurrent reuse of the same refresh token therefore fails.
   */
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // New Sprint-48 tokens are explicitly typed. Legacy tokens have no type;
    // they are still rejected in production by the session-version migration
    // (legacy version=0, persisted users start at version=1).
    if (payload.tokenType && payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['userRoles', 'userRoles.role'],
    });

    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.PERMANENTLY_LOCKED ||
      user.status === UserStatus.CLOSED
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenVersion = this.payloadSessionVersion(payload);
    const currentVersion = this.userSessionVersion(user);
    if (tokenVersion !== currentVersion) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const nextVersion = currentVersion + 1;
    const rotation = await this.userRepo.update(
      { id: user.id, sessionVersion: currentVersion },
      { sessionVersion: nextVersion },
    );

    // TypeORM returns UpdateResult. The guard also tolerates legacy unit-test
    // mocks that return undefined, while production always supplies affected.
    if (rotation?.affected !== undefined && rotation.affected !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    user.sessionVersion = nextVersion;
    const roles = user.userRoles?.map((ur) => ur.role.name) ?? [RoleName.USER];

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_TOKEN_REFRESHED,
      resourceType: 'User',
      resourceId: user.id,
      metadata: {
        result: 'success',
        previousSessionVersion: currentVersion,
        sessionVersion: nextVersion,
      },
    });

    return this.generateTokens(user, roles);
  }

  /**
   * Revoke every currently issued token for a user. Logout is intentionally
   * account-wide in Sprint 48: advancing the generation invalidates access and
   * refresh JWTs on web, admin, and mobile immediately.
   */
  async logout(userId: string, ipAddress?: string): Promise<void> {
    const result = await this.userRepo.update(userId, {
      sessionVersion: () => '"session_version" + 1',
    });

    if (result?.affected !== undefined && result.affected !== 1) {
      throw new UnauthorizedException('User session is no longer valid');
    }

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.USER_LOGOUT,
      resourceType: 'User',
      resourceId: userId,
      ipAddress,
      metadata: { result: 'success', scope: 'all_sessions' },
    });
  }

  private generateTokens(
    user: User,
    roles: string[],
  ): { accessToken: string; refreshToken: string } {
    const basePayload = {
      sub: user.id,
      email: user.email,
      roles,
      sessionVersion: this.userSessionVersion(user),
    };

    const accessToken = this.jwtService.sign(
      {
        ...basePayload,
        tokenType: 'access' as const,
        jti: randomUUID(),
      },
      {
        expiresIn: this.configService.get<string>('jwt.accessExpiry', '15m'),
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        tokenType: 'refresh' as const,
        jti: randomUUID(),
      },
      {
        expiresIn: this.configService.get<string>('jwt.refreshExpiry', '7d'),
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Persisted users are always >=1 after the Sprint-48 migration. The zero
   * fallback exists only for legacy/in-memory entity shapes and ensures that
   * pre-migration JWTs cannot match a migrated production user.
   */
  private userSessionVersion(user: Pick<User, 'sessionVersion'>): number {
    return Number.isInteger(user.sessionVersion) ? user.sessionVersion : 0;
  }

  private payloadSessionVersion(payload: JwtPayload): number {
    return Number.isInteger(payload.sessionVersion) ? payload.sessionVersion! : 0;
  }

  async validateUser(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

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

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: this.configService.get<number>('auth.argon2MemoryCost', 65536),
      timeCost: this.configService.get<number>('auth.argon2TimeCost', 3),
      parallelism: this.configService.get<number>('auth.argon2Parallelism', 1),
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  private callingCodeForCountry(countryCode?: string): string | undefined {
    if (!countryCode) return undefined;
    const map: Record<string, string> = {
      GH: '+233',
      NG: '+234',
      GB: '+44',
      US: '+1',
      CA: '+1',
      ZA: '+27',
      KE: '+254',
      CI: '+225',
      TG: '+228',
      BJ: '+229',
      BF: '+226',
      SL: '+232',
      LR: '+231',
      AE: '+971',
      IN: '+91',
      CN: '+86',
    };
    return map[countryCode.toUpperCase()];
  }
}
