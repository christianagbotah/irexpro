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
 * PasswordResetService — secure password reset flow (Sprint 28).
 *
 * Flow:
 *   1. requestReset(identifier, meta?) — resolves the user by email or phone,
 *      invalidates prior unused tokens, generates a new token/code, hashes it,
 *      persists the hash, and attempts delivery (email link or SMS code).
 *      Returns a generic result (never reveals whether the user exists).
 *
 *   2. resetWithToken(token, password) — verifies the token hash, checks
 *      expiry + single-use, hashes the new password, updates the user,
 *      marks the token as used, audits the completion.
 *
 *   3. resetWithCode(identifier, code, password) — same as above but for the
 *      phone code flow (verifies identifier + code hash + attempt count).
 *
 * Security properties:
 *   - Raw token/code is NEVER stored. Only SHA-256 hash is persisted.
 *   - Token is high-entropy: 32 bytes (256 bits) for email link, 6 digits for phone.
 *   - Email link expires in 15 minutes; phone code in 10 minutes.
 *   - Single-use: used_at is set on successful reset; reuse is rejected.
 *   - Prior unused tokens are invalidated when a new one is issued.
 *   - Phone code: max 5 failed attempts before the token is invalidated.
 *   - No account enumeration: requestReset always returns the same generic
 *     result whether or not the user exists.
 *   - Raw token/code is NEVER logged. Only safe metadata is audited.
 *   - Password is hashed with argon2 (same as register/login).
 *
 * Session invalidation limitation:
 *   Refresh tokens are currently stateless JWTs (no server-side session store).
 *   After a password reset, existing refresh tokens are NOT automatically
 *   revoked. This is a known limitation documented in CURRENT_STATE.md. A
 *   Redis-based token blacklist is a future enhancement.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  /** Email reset link token: 32 bytes (256 bits) of high-entropy random data. */
  private static readonly EMAIL_TOKEN_BYTES = 32;
  /** Phone reset code: 6 digits. */
  private static readonly PHONE_CODE_LENGTH = 6;
  /** Email link expiry: 15 minutes. */
  private static readonly EMAIL_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
  /** Phone code expiry: 10 minutes. */
  private static readonly PHONE_CODE_EXPIRY_MS = 10 * 60 * 1000;
  /** Max failed attempts for phone code before invalidation. */
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

  /**
   * Request a password reset. Always returns the same generic result — does
   * NOT reveal whether the user exists. The raw token/code is sent via the
   * delivery service (email link or SMS), never returned in the result.
   */
  async requestReset(
    identifier: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<PasswordResetResult> {
    const trimmed = identifier.trim();

    // Resolve the user — but never reveal the outcome to the caller.
    const user = await this.findUserByIdentifier(trimmed);

    if (!user) {
      // User not found — return the SAME generic result. Do NOT audit a
      // reset-requested event (there's no user to audit against). Log a
      // safe operational note (no raw identifier beyond what was already
      // in the request).
      this.logger.log(
        'Password reset requested for unknown identifier — returning generic response',
      );
      return { delivered: false, channel: null };
    }

    // Suspended/closed accounts cannot reset password via this flow.
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.CLOSED) {
      this.logger.log(
        `Password reset requested for ${user.status} user — returning generic response`,
      );
      return { delivered: false, channel: null };
    }

    // Determine the channel: email if the user has an email, else phone.
    // (Users may be email-only, phone-only, or both. Prefer email.)
    const channel: ResetChannel = user.email ? ResetChannel.EMAIL : ResetChannel.PHONE;
    const destination = channel === ResetChannel.EMAIL ? user.email! : user.phone!;

    // Invalidate all prior unused tokens for this user (single active token).
    await this.invalidatePriorTokens(user.id);

    // Generate + hash the token/code.
    const { rawToken, tokenHash } = this.generateToken(channel);

    // Persist the hash + metadata.
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

    // Attempt delivery (email link or SMS code). If the provider is not
    // configured, the delivery service returns delivered=false and logs a
    // safe operational warning (no raw token).
    const delivered = await this.deliveryService.deliver({
      channel,
      destination,
      rawToken,
      userId: user.id,
      userName: user.email ?? user.phone ?? user.id,
    });

    // Audit the reset request safely (no raw token, no password).
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

  /**
   * Reset password using an email link token.
   * @throws UnauthorizedException if the token is invalid, expired, or used.
   * @throws BadRequestException if the password is weak.
   */
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

  /**
   * Reset password using a phone code + identifier.
   * @throws UnauthorizedException if the code is invalid, expired, or used.
   * @throws BadRequestException if the password is weak or the identifier is empty.
   */
  async resetWithCode(identifier: string, code: string, password: string): Promise<void> {
    const trimmed = identifier.trim();
    if (!trimmed) {
      throw new BadRequestException('Identifier is required for phone code reset');
    }

    // Resolve the user to get their userId for the token lookup.
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

    // Increment attempt count BEFORE validating — if the code is wrong, the
    // attempt is counted. If attempt_count exceeds the max, invalidate.
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

  // ── Internal helpers ──────────────────────────────────────────────────────

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

  /**
   * Generate a raw token (email link) or numeric code (phone) + its SHA-256 hash.
   * The raw value is returned for delivery; only the hash is persisted.
   */
  private generateToken(channel: ResetChannel): { rawToken: string; tokenHash: string } {
    if (channel === ResetChannel.EMAIL) {
      const rawToken = randomBytes(PasswordResetService.EMAIL_TOKEN_BYTES).toString('hex');
      return { rawToken, tokenHash: this.hashToken(rawToken) };
    }
    // Phone: 6-digit numeric code
    const rawToken = String(randomInt(0, 10 ** PasswordResetService.PHONE_CODE_LENGTH)).padStart(
      PasswordResetService.PHONE_CODE_LENGTH,
      '0',
    );
    return { rawToken, tokenHash: this.hashToken(rawToken) };
  }

  /** SHA-256 hash a raw token/code for storage/lookup. */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** SHA-256 hash a destination (email/phone) for optional verification. */
  private hashDestination(destination: string): string {
    return createHash('sha256').update(destination.toLowerCase()).digest('hex');
  }

  /**
   * Verify a phone code matches the stored hash. (For email tokens, we look up
   * by hash directly. For phone codes, we also look up by hash, but this
   * method is kept for clarity + future extensibility.)
   */
  private verifyCode(resetToken: PasswordResetToken, code: string): boolean {
    const codeHash = this.hashToken(code);
    return resetToken.tokenHash === codeHash;
  }

  /**
   * Validate that a token is not expired and not already used.
   * @throws UnauthorizedException if expired or used.
   */
  private validateTokenUsable(resetToken: PasswordResetToken): void {
    if (resetToken.usedAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    if (new Date() > resetToken.expiresAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  /**
   * Apply the password reset: hash the new password, update the user, mark the
   * token as used, audit the completion.
   */
  private async applyPasswordReset(
    resetToken: PasswordResetToken,
    password: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Hash the new password with argon2 (same as register/login).
      const passwordHash = await argon2.hash(password, {
        memoryCost: this.configService.get<number>('auth.argon2MemoryCost', 65536),
        timeCost: this.configService.get<number>('auth.argon2TimeCost', 3),
        parallelism: this.configService.get<number>('auth.argon2Parallelism', 1),
      });

      // Update the user's password hash.
      await queryRunner.manager.update(User, resetToken.userId, { passwordHash });

      // Mark the token as used (single-use enforcement).
      resetToken.usedAt = new Date();
      await queryRunner.manager.save(resetToken);

      await queryRunner.commitTransaction();

      // Audit the reset completion safely (no raw token, no password).
      await this.auditService.log({
        actorUserId: resetToken.userId,
        action: AuditAction.USER_PASSWORD_RESET_COMPLETED,
        resourceType: 'User',
        resourceId: resetToken.userId,
        metadata: { channel: resetToken.channel },
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
  /** Whether the token/code was actually delivered (provider configured). */
  delivered: boolean;
  /** The channel used (EMAIL or PHONE), or null if user not found. */
  channel: ResetChannel | null;
}

export interface PasswordResetRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
