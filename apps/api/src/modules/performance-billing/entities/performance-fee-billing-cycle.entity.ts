import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BillingCycleStatus {
  DRAFT = 'DRAFT',
  RECONCILING = 'RECONCILING',
  RECONCILED = 'RECONCILED',
  ASSESSING = 'ASSESSING',
  ASSESSED = 'ASSESSED',
  INVOICED = 'INVOICED',
  NO_FEE_DUE = 'NO_FEE_DUE',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Final states — a cycle in a final state must not be rerun. */
export const FINAL_BILLING_CYCLE_STATUSES = new Set([
  BillingCycleStatus.INVOICED,
  BillingCycleStatus.NO_FEE_DUE,
  BillingCycleStatus.CANCELLED,
]);

/**
 * PerformanceFeeBillingCycle
 *
 * Tracks a single end-to-end billing cycle for a user:
 *   reconciliation → assessment → invoice.
 *
 * MONEY VALUES — all bigint minor-unit strings:
 *   totalRealisedProfit, feeAmount
 *
 * STATE MACHINE:
 *   DRAFT → RECONCILING → RECONCILED → ASSESSING → ASSESSED → INVOICED
 *                                                            → NO_FEE_DUE
 *   any non-final → FAILED
 *   DRAFT         → CANCELLED
 *   FAILED        → RECONCILING (safe retry)
 *   FAILED        → CANCELLED
 *
 * INVARIANTS:
 * - INVOICED / NO_FEE_DUE / CANCELLED are final — no reruns.
 * - No auto-payment, no HWM update inside this entity; those happen via webhook.
 * - No broker credentials or secrets in any column.
 */
@Entity({ name: 'performance_fee_billing_cycles', schema: 'performance_billing' })
@Index(['userId'])
@Index(['userId', 'brokerConnectionId'])
@Index(['status'])
@Index(['periodStart', 'periodEnd'])
@Index(['createdAt'])
export class PerformanceFeeBillingCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  /** Null means cycle covers all broker connections for the user (account-wide). */
  @Column({ name: 'broker_connection_id', type: 'uuid', nullable: true })
  @Index()
  brokerConnectionId: string | null;

  @Column({ name: 'period_start', type: 'timestamptz' })
  @Index()
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  @Index()
  periodEnd: Date;

  /** Account currency (ISO 4217, e.g. 'USD', 'JPY') */
  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: BillingCycleStatus,
    default: BillingCycleStatus.DRAFT,
  })
  @Index()
  status: BillingCycleStatus;

  /** Populated after the reconciliation run completes. */
  @Column({ name: 'reconciliation_run_id', type: 'uuid', nullable: true })
  reconciliationRunId: string | null;

  /** Populated after calculateAssessment() completes. */
  @Column({ name: 'assessment_id', type: 'uuid', nullable: true })
  assessmentId: string | null;

  /** Populated after invoiceAssessment() completes. */
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  /** Number of new PerformanceFeeLedgerEntry rows created by the reconciliation run. */
  @Column({ name: 'total_ledger_entries_created', type: 'integer', default: 0 })
  totalLedgerEntriesCreated: number;

  /** Net realised profit for the period (minor units, bigint string). */
  @Column({ name: 'total_realised_profit', type: 'bigint', default: '0' })
  totalRealisedProfit: string;

  /** Calculated fee amount (minor units, bigint string). Zero if no fee due. */
  @Column({ name: 'fee_amount', type: 'bigint', default: '0' })
  feeAmount: string;

  /** Safe error summary — must NOT contain broker credentials or provider secrets. */
  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  /** Arbitrary JSON for admin notes, policy snapshot, etc. No secrets. */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Admin or system user who initiated this cycle. */
  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Set when the cycle reaches a final state (INVOICED / NO_FEE_DUE / CANCELLED / FAILED). */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
