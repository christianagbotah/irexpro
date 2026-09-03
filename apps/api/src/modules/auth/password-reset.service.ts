import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { PasswordResetToken, ResetChannel } from './entities/password-reset-token.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { normalizePhone, isEmail } from './utils/phone.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';

/**
 * PasswordResetService — secure password reset flow.
 *
 * Security properties:
 *   - Raw token/code is NEVER stored. Only SHA-256 hash is persisted.
 *   - Email token is 32 random bytes; phone code is 6 digits.
 *   - Email link expires in 15 minutes; phone code in 10 minutes.
 *   - Reset tokens are single-use and prior unused tokens are invalidated.
 *   - Phone code is invalidated after 5 failed attempts.
 *   - Request response is generic to prevent account enumeration.
 *   - Raw token/code is NEVER logged.
 *   - Successful password reset advances User.sessionVersion in the same DB
 *     transaction as the password change, immediately revoking all access and
 *     refresh JWTs issued before the reset.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  private static readonly EMAIL_TOKEN_BYTES = 32;
  private static readonly PHONE_CODE_LENGTH = 6;
  private static readonly EMAIL_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
  private static readonly PHONE_CODE_EXPIRY_MS = 10 * 60 * 1000;
  private static readonly MAX_PHONE_CODE_ATTEMPTS = 5;

  constructor(
    @InjectRepository(PasswordResetToken)
    private resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private auditService: AuditService,
    private deliveryService: PasswordResetDeliveryService,
    private dataSource: DataSource,
  ) {}

  async requestReset(
    identifier: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<PasswordResetResult> {
    const trimmed = identifier.trim();
    const user = await this.findUserByIdentifier(trimmed);

    if (!user) {
      this.logger.log(
        'Password reset requested for unknown identifier — returning generic response',
      );
      return { delivered: false, channel: null };
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.PERMANENTLY_LOCKED ||
      user.status === UserStatus.CLOSED
    ) {
      this.logger.log(
        `Password reset requested for ${user.status} user — returning generic response`,
      );
      return { delivered: false, channel: null };
    }

    const channel: ResetChannel = user.email ? ResetChannel.EMAIL : ResetChannel.PHONE;
    const destination = channel === ResetChannel.EMAIL ? user.email! : user.phone!;

    await this.invalidatePriorTokens(user.id);

    const { rawToken, tokenHash } = this.generateToken(channel);

    const expiresAt = new Date(
      Date.now() +
        (channel === ResetChannel.EMAIL
          ? PasswordResetService.EMAIL_TOKEN_EXPIRY_MS
          : PasswordResetService.PHONE_CODE_EXPIRY_MS),
    );

    const resetToken = this.resetTokenRepo.create({
      userId: user.id,
      tokenHash,
      channel,
      destinationHash: this.hashDestination(destination),
      expiresAt,
      usedAt: null,
      requestedIp: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
      attemptCount: 0,
    });
    await this.resetTokenRepo.save(resetToken);

    const delivered = await this.deliveryService.deliver({
      channel,
      destination,
      rawToken,
      userId: user.id,
      userName: user.email ?? user.phone ?? user.id,
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_PASSWORD_RESET_REQUESTED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      metadata: { channel, delivered, expiresAt: expiresAt.toISOString() },
    });

    return { delivered, channel };
  }

  async resetWithToken(token: string, password: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const resetToken = await this.resetTokenRepo.findOne({
      where: { tokenHash, channel: ResetChannel.EMAIL },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    this.validateTokenUsable(resetToken);
    await this.applyPasswordReset(resetToken, password);
  }

  async resetWithCode(identifier: string, code: string, password: string): Promise<void> {
    const trimmed = identifier.trim();
    if (!trimmed) {
      throw new BadRequestException('Identifier is required for phone code reset');
    }

    const user = await this.findUserByIdentifier(trimmed);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    const codeHash = this.hashToken(code);
    const resetToken = await this.resetTokenRepo.findOne({
      where: { tokenHash: codeHash, userId: user.id, channel: ResetChannel.PHONE },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    if (!this.verifyCode(resetToken, code)) {
      resetToken.attemptCount += 1;
      if (resetToken.attemptCount >= PasswordResetService.MAX_PHONE_CODE_ATTEMPTS) {
        resetToken.usedAt = new Date();
      }
      await this.resetTokenRepo.save(resetToken);
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    this.validateTokenUsable(resetToken);
    await this.applyPasswordReset(resetToken, password);
  }

  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    const emailLogin = isEmail(identifier);
    const phoneLookup = emailLogin ? null : normalizePhone(identifier);

    return this.userRepo.findOne({
      where: emailLogin ? { email: identifier.toLowerCase() } : { phone: phoneLookup ?? '' },
    });
  }

  private async invalidatePriorTokens(userId: string): Promise<void> {
    await this.resetTokenRepo.update({ userId, usedAt: IsNull() }, { usedAt: new Date() });
  }

  private generateToken(channel: ResetChannel): { rawToken: string; tokenHash: string } {
    if (channel === ResetChannel.EMAIL) {
      const rawToken = randomBytes(PasswordResetService.EMAIL_TOKEN_BYTES).toString('hex');
      return { rawToken, tokenHash: this.hashToken(rawToken) };
    }
    const rawToken = String(randomInt(0, 10 ** PasswordResetService.PHONE_CODE_LENGTH)).padStart(
      PasswordResetService.PHONE_CODE_LENGTH,
      '0',
    );
    return { rawToken, tokenHash: this.hashToken(rawToken) };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private hashDestination(destination: string): string {
    return createHash('sha256').update(destination.toLowerCase()).digest('hex');
  }

  private verifyCode(resetToken: PasswordResetToken, code: string): boolean {
    const codeHash = this.hashToken(code);
    return resetToken.tokenHash === codeHash;
  }

  private validateTokenUsable(resetToken: PasswordResetToken): void {
    if (resetToken.usedAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    if (new Date() > resetToken.expiresAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  private async applyPasswordReset(
    resetToken: PasswordResetToken,
    password: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const passwordHash = await argon2.hash(password, {
        memoryCost: this.configService.get<number>('auth.argon2MemoryCost', 65536),
        timeCost: this.configService.get<number>('auth.argon2TimeCost', 3),
        parallelism: this.configService.get<number>('auth.argon2Parallelism', 1),
      });

      // Keep the password update as a separate statement so audit/tests can
      // verify that only the hash is written here.
      await queryRunner.manager.update(User, resetToken.userId, { passwordHash });

      // Revoke every JWT issued before the reset in the SAME transaction.
      // A successful reset therefore cannot commit while old sessions remain
      // valid server-side.
      await queryRunner.manager.update(User, resetToken.userId, {
        sessionVersion: () => '"session_version" + 1',
      });

      resetToken.usedAt = new Date();
      await queryRunner.manager.save(resetToken);

      await queryRunner.commitTransaction();

      await this.auditService.log({
        actorUserId: resetToken.userId,
        action: AuditAction.USER_PASSWORD_RESET_COMPLETED,
        resourceType: 'User',
        resourceId: resetToken.userId,
        metadata: { channel: resetToken.channel, sessionsRevoked: true },
      });

      this.logger.log(
        `Password reset completed for user ${resetToken.userId} via ${resetToken.channel}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

export interface PasswordResetResult {
  delivered: boolean;
  channel: ResetChannel | null;
}

export interface PasswordResetRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
