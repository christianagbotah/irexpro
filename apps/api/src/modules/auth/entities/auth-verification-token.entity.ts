import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VerificationChannel {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

@Entity({ name: 'auth_verification_tokens', schema: 'identity' })
@Index('idx_avt_user_channel', ['userId', 'channel'])
@Index('idx_avt_token_hash', ['tokenHash'])
@Index('idx_avt_expires_at', ['expiresAt'])
export class AuthVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /**
   * Email: SHA-256 of the high-entropy raw token.
   * Phone: HMAC-SHA-256 of the six-digit code using the auth verification pepper.
   * Raw verification material is never persisted.
   */
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'channel', type: 'varchar', length: 10 })
  channel: VerificationChannel;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

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
