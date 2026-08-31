import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/** A submitted appeal is immutable apart from its review outcome. */
export enum AccountAppealStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

/** The only account outcomes a reviewer may apply to a valid appeal. */
export enum AccountAppealDecision {
  REACTIVATE = 'REACTIVATE',
  PERMANENTLY_LOCK = 'PERMANENTLY_LOCK',
  DELETE = 'DELETE',
}

/**
 * AccountAppeal stores a user-supplied, reasoned account-access request.
 *
 * The public endpoint resolves an identifier to a user server-side, but never
 * persists the raw identifier. This avoids creating a second PII store while
 * still providing administrators enough evidence to make an account decision.
 */
@Entity({ name: 'account_appeals', schema: 'identity' })
@Index('idx_account_appeals_user_status', ['userId', 'status'])
@Index('idx_account_appeals_created_at', ['createdAt'])
export class AccountAppeal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: AccountAppealStatus.PENDING,
  })
  status: AccountAppealStatus;

  @Column({ type: 'varchar', length: 30, nullable: true })
  decision: AccountAppealDecision | null;

  @Column({ name: 'reviewer_user_id', type: 'uuid', nullable: true })
  reviewerUserId: string | null;

  @Column({ name: 'reviewer_note', type: 'text', nullable: true })
  reviewerNote: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
