import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PasswordResetToken — secure password reset token storage.
 *
 * Sprint 28: stores ONLY the hash of the reset token/code. The raw token is
 * NEVER persisted. The raw token is returned to the user only via the
 * forgot-password response (email link) or SMS (phone code) — never in the
 * API JSON response.
 *
 * Security properties:
 *   - token_hash: SHA-256 hash of the raw token (argon2 is not needed here
 *     because the token is high-entropy random — SHA-256 is sufficient and
 *     faster than argon2 for lookup-by-hash queries).
 *   - expires_at: 15 minutes for email link, 10 minutes for phone code.
 *   - used_at: non-null after the token has been consumed (single-use).
 *   - attempt_count: incremented on each failed verification attempt
 *     (phone code abuse guard; max 5 attempts before invalidation).
 *   - user_id: the user who requested the reset (FK to identity.users).
 *
 * Indexes: user_id (lookup + invalidation), token_hash (verification lookup),
 * expires_at (cleanup of expired tokens).
 *
 * When a new token is issued, all previous UNUSED tokens for the same user
 * are invalidated (used_at set to now()) — only one active reset token per
 * user at a time.
 */
export enum ResetChannel {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

@Entity({ name: 'password_reset_tokens', schema: 'identity' })
@Index('idx_prt_user_id', ['userId'])
@Index('idx_prt_token_hash', ['tokenHash'])
@Index('idx_prt_expires_at', ['expiresAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** SHA-256 hash of the raw token (email link) or numeric code (phone). */
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'channel', type: 'varchar', length: 10 })
  channel: ResetChannel;

  /**
   * Optional hash of the destination (email or phone) — used to verify the
   * user is using the correct reset channel without storing the raw value.
   * Null if not needed (e.g. email link flow where the token itself is the
   * proof).
   */
  @Column({ name: 'destination_hash', type: 'varchar', length: 255, nullable: true })
  destinationHash: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt: Date;

  @Column({ name: 'requested_ip', type: 'varchar', length: 45, nullable: true })
  requestedIp: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
