import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TradingSessionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED_RISK_LIMIT = 'SUSPENDED_RISK_LIMIT',
  SUSPENDED_BROKER = 'SUSPENDED_BROKER',
  ENDED = 'ENDED',
}

/**
 * TradingSession — Tracks a user's active AI-trading session.
 *
 * A session starts when the user enables AI trading, and ends
 * when they disable it, the kill switch fires, or a risk limit is hit.
 *
 * Used by the Risk Engine to check session state and by the
 * reconciliation job to scope which trades to monitor.
 *
 * See: docs/architecture/11-risk-engine-architecture.md §5.1
 */
@Entity({ name: 'trading_sessions', schema: 'trading' })
export class TradingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'broker_connection_id', type: 'uuid' })
  brokerConnectionId: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TradingSessionStatus,
    default: TradingSessionStatus.ACTIVE,
  })
  @Index()
  status: TradingSessionStatus;

  /** Snapshot of opening account balance for daily loss % calculation. Decimal string. */
  @Column({
    name: 'opening_balance',
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  openingBalance: string | null;

  /** Peak equity seen during this session — used for drawdown calculation. Decimal string. */
  @Column({
    name: 'peak_equity',
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  peakEquity: string | null;

  /** Snapshot of the RiskProfile at session start for audit purposes. */
  @Column({ name: 'risk_profile_snapshot', type: 'jsonb', nullable: true })
  riskProfileSnapshot: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
