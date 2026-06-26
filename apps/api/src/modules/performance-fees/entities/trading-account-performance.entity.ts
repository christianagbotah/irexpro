import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TradingAccountPerformance
 *
 * Tracks the running performance state for a user's trading account.
 * All monetary values are stored in minor units (smallest currency unit)
 * as bigint strings to avoid floating-point precision errors.
 *
 * IMPORTANT:
 * - currentHighWaterMark tracks the highest cumulative realised profit achieved.
 * - It is ONLY updated after a valid, paid performance fee assessment.
 * - Deposits, withdrawals, and unrealised P&L do NOT affect the HWM.
 * - Demo, paper, and backtest results are NEVER included.
 */
@Entity({ name: 'trading_account_performances', schema: 'performance_fees' })
@Index(['userId'])
@Index(['userId', 'brokerConnectionId'])
export class TradingAccountPerformance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'broker_connection_id', type: 'uuid', nullable: true })
  @Index()
  brokerConnectionId: string | null;

  /** External broker account identifier (e.g. MT4/MT5 login) */
  @Column({ name: 'account_reference', type: 'varchar', length: 255, nullable: true })
  accountReference: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** Highest cumulative realised profit achieved; fee applies only above this value. */
  @Column({ name: 'current_high_water_mark', type: 'bigint', default: '0' })
  currentHighWaterMark: string;

  /** Most recent equity snapshot (informational only — NOT used for fee calculation). */
  @Column({ name: 'last_calculated_equity', type: 'bigint', nullable: true })
  lastCalculatedEquity: string | null;

  /** Cumulative realised trade balance as of last calculation. */
  @Column({ name: 'last_realised_balance', type: 'bigint', nullable: true })
  lastRealisedBalance: string | null;

  /** Sum of all DEPOSIT ledger entries (excluded from fee calculation). */
  @Column({ name: 'total_deposits', type: 'bigint', default: '0' })
  totalDeposits: string;

  /** Sum of all WITHDRAWAL ledger entries (accounted for in HWM logic). */
  @Column({ name: 'total_withdrawals', type: 'bigint', default: '0' })
  totalWithdrawals: string;

  /** Cumulative net realised P&L from closed trades only. */
  @Column({ name: 'total_realised_profit', type: 'bigint', default: '0' })
  totalRealisedProfit: string;

  /** Total performance fees charged (sum of FEE_PAID ledger entries). */
  @Column({ name: 'total_fees_charged', type: 'bigint', default: '0' })
  totalFeesCharged: string;

  @Column({ name: 'last_calculation_at', type: 'timestamptz', nullable: true })
  lastCalculationAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
