import {
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
    const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
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
        email: dto.email.toLowerCase(),
        passwordHash,
        countryCode: dto.countryCode ?? null,
        status: UserStatus.PENDING_VERIFICATION,
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
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['userRoles', 'userRoles.role'],
    });

    if (!user) {
      await this.auditService.log({
        action: AuditAction.USER_LOGIN_FAILED,
        ipAddress,
        metadata: { email: dto.email, reason: 'user_not_found' },
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
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
        relations: ['userRoles', 'userRoles.role'],
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const roles = user.userRoles?.map((ur) => ur.role.name) ?? [RoleName.USER];
      return this.generateTokens(user, roles);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
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
}
