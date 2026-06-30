import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReconciliationRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_WARNINGS = 'COMPLETED_WITH_WARNINGS',
  FAILED = 'FAILED',
}

/**
 * BrokerTradeReconciliationRun
 *
 * Audit record for each broker trade reconciliation run.
 * Tracks how many trades were seen, reconciled, skipped, or failed.
 *
 * RULES:
 * - One run per request; never auto-started.
 * - Metadata must not contain credentials, secrets, or raw broker payloads.
 * - Admin/internal trigger only.
 */
@Entity({ name: 'broker_trade_reconciliation_runs', schema: 'broker_reconciliation' })
@Index(['userId'])
@Index(['userId', 'brokerConnectionId'])
@Index(['status'])
@Index(['createdAt'])
export class BrokerTradeReconciliationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'broker_connection_id', type: 'uuid' })
  @Index()
  brokerConnectionId: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReconciliationRunStatus,
    default: ReconciliationRunStatus.PENDING,
  })
  @Index()
  status: ReconciliationRunStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'from_time', type: 'timestamptz' })
  fromTime: Date;

  @Column({ name: 'to_time', type: 'timestamptz' })
  toTime: Date;

  @Column({ name: 'total_broker_trades_seen', type: 'integer', default: 0 })
  totalBrokerTradesSeen: number;

  @Column({ name: 'new_ledger_entries_created', type: 'integer', default: 0 })
  newLedgerEntriesCreated: number;

  @Column({ name: 'duplicate_trades_skipped', type: 'integer', default: 0 })
  duplicateTradesSkipped: number;

  @Column({ name: 'failed_trades', type: 'integer', default: 0 })
  failedTrades: number;

  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  /** Safe metadata only — must not contain secrets or raw broker payloads */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
