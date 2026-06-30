import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TradeSourceType {
  /** Live broker account — the ONLY type eligible for performance fees */
  LIVE_BROKER = 'LIVE_BROKER',
  /** Demo/paper broker account — NEVER fee-eligible */
  DEMO_BROKER = 'DEMO_BROKER',
  /** Paper trading simulation — NEVER fee-eligible */
  PAPER_BROKER = 'PAPER_BROKER',
  /** Backtest engine — NEVER fee-eligible */
  BACKTEST = 'BACKTEST',
}

/**
 * BrokerReconciledTrade
 *
 * Immutable record of a closed broker trade that has been reconciled.
 * Each trade is uniquely identified by (userId, brokerConnectionId, brokerTradeId).
 *
 * RULES:
 * - Deduplication is enforced by the unique index on (user_id, broker_connection_id, broker_trade_id).
 * - Only LIVE_BROKER trades with isFeeEligible=true generate PerformanceFeeLedgerEntry records.
 * - Amounts are stored in minor currency units (bigint strings, 2 decimal places = ×100).
 * - Losses are stored as negative amounts.
 * - No secrets, credentials, or raw broker payloads in any field.
 */
@Entity({ name: 'broker_reconciled_trades', schema: 'broker_reconciliation' })
@Index(['userId'])
@Index(['userId', 'brokerConnectionId'])
@Index(['brokerTradeId'])
@Index(['closedAt'])
@Index(['sourceType'])
@Index(['isFeeEligible'])
@Index(['userId', 'brokerConnectionId', 'brokerTradeId'], { unique: true })
export class BrokerReconciledTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'broker_connection_id', type: 'uuid' })
  @Index()
  brokerConnectionId: string;

  @Column({ name: 'broker_provider', type: 'varchar', length: 50 })
  brokerProvider: string;

  /** Broker-side unique trade/deal identifier. Used for deduplication. */
  @Column({ name: 'broker_trade_id', type: 'varchar', length: 255 })
  @Index()
  brokerTradeId: string;

  /** Optional broker order ID (parent order) — may differ from trade/deal ID */
  @Column({ name: 'broker_order_id', type: 'varchar', length: 255, nullable: true })
  brokerOrderId: string | null;

  @Column({ name: 'instrument', type: 'varchar', length: 50 })
  instrument: string;

  @Column({ name: 'direction', type: 'varchar', length: 4 })
  direction: 'BUY' | 'SELL';

  /** Lot size / volume as a decimal string */
  @Column({ name: 'volume', type: 'varchar', length: 50 })
  volume: string;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz' })
  @Index()
  closedAt: Date;

  @Column({ name: 'entry_price', type: 'varchar', length: 50, nullable: true })
  entryPrice: string | null;

  @Column({ name: 'exit_price', type: 'varchar', length: 50, nullable: true })
  exitPrice: string | null;

  /** Gross realised P&L before commission/swap, in minor currency units */
  @Column({ name: 'realised_pnl', type: 'bigint' })
  realisedPnl: string;

  /** Commission in minor units (typically negative = cost) */
  @Column({ name: 'commission', type: 'bigint', default: '0' })
  commission: string;

  /** Swap / rollover in minor units */
  @Column({ name: 'swap', type: 'bigint', default: '0' })
  swap: string;

  /**
   * Net realised P&L = grossRealisedPnl + commission + swap (in minor units).
   * This is the authoritative value for fee calculation.
   * Positive = profit, Negative = loss.
   */
  @Column({ name: 'net_realised_pnl', type: 'bigint' })
  netRealisedPnl: string;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  @Column({ name: 'reconciliation_run_id', type: 'uuid', nullable: true })
  @Index()
  reconciliationRunId: string | null;

  /** Linked ledger entry ID — null if trade is not fee-eligible or netRealisedPnl = 0 */
  @Column({ name: 'ledger_entry_id', type: 'uuid', nullable: true })
  ledgerEntryId: string | null;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: TradeSourceType,
    default: TradeSourceType.LIVE_BROKER,
  })
  @Index()
  sourceType: TradeSourceType;

  /**
   * Whether this trade contributes to performance fee calculation.
   * Only true for LIVE_BROKER trades with valid netRealisedPnl.
   * Never true for DEMO, PAPER, BACKTEST trades.
   */
  @Column({ name: 'is_fee_eligible', type: 'boolean', default: false })
  @Index()
  isFeeEligible: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
