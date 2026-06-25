import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RiskRejectionCode } from '../interfaces/risk.interface';

/**
 * RiskViolation — Immutable record of every Risk Engine rejection.
 *
 * Used for monitoring, alerting, and pattern analysis.
 * High-frequency violations trigger admin alerts.
 *
 * IMMUTABLE: never updated after creation.
 *
 * See: docs/architecture/11-risk-engine-architecture.md §7
 */
@Entity({ name: 'risk_violations', schema: 'trading' })
export class RiskViolation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  /** UUID of the signal that was rejected. Nullable for system-level violations. */
  @Column({ name: 'signal_id', type: 'uuid', nullable: true })
  signalId: string | null;

  @Column({
    name: 'rejection_code',
    type: 'enum',
    enum: RiskRejectionCode,
  })
  rejectionCode: RiskRejectionCode;

  @Column({ name: 'rejection_reason', type: 'text' })
  rejectionReason: string;

  /**
   * JSON snapshot of the full risk context at the moment of rejection.
   * Includes: balance, equity, open trades count, proposed trade params, etc.
   * See RiskContextSnapshot interface.
   */
  @Column({ name: 'risk_context', type: 'jsonb' })
  riskContext: Record<string, unknown>;

  @CreateDateColumn({ name: 'evaluated_at', type: 'timestamptz' })
  @Index()
  evaluatedAt: Date;
}
