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
 * Stores ONLY a one-way digest of the reset token/code. The raw token/code is
 * NEVER persisted and is delivered only through the configured email/SMS path.
 *
 * Security properties:
 *   - EMAIL token_hash: SHA-256 of a high-entropy 32-byte random token, which
 *     supports lookup-by-hash without storing the raw secret.
 *   - PHONE token_hash: domain-separated HMAC-SHA-256 using the external
 *     AUTH_VERIFICATION_PEPPER because a six-digit code is low entropy and an
 *     unkeyed digest would be cheaply enumerable from a DB-only snapshot.
 *   - expires_at: 15 minutes for email link, 10 minutes for phone code.
 *   - used_at: non-null after the token has been consumed (single-use).
 *   - attempt_count: atomically incremented on failed phone-code verification;
 *     max 5 attempts before invalidation.
 *   - user_id: the user who requested the reset (FK to identity.users).
 *
 * Indexes: user_id (lookup + invalidation), token_hash (email verification
 * lookup and digest indexing), expires_at (cleanup of expired tokens).
 *
 * When a new token is issued, the service serializes issuance with a
 * transaction-scoped pessimistic lock on the user row, invalidates all prior
 * UNUSED tokens for that user, and then persists the replacement token. This
 * keeps only one service-issued active reset token per user at a time.
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

  /** Channel-specific one-way digest; raw token/code is never stored. */
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
