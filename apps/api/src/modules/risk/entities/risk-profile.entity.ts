import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * RiskProfile — Per-user risk management configuration.
 *
 * One record per user. Created automatically with safe defaults on first use.
 * Users can adjust limits within admin-set boundaries.
 *
 * KILL SWITCH:
 * - killSwitchActive = true → ALL signals rejected immediately (checked first)
 * - Users toggle via POST /risk/kill-switch
 * - Admins can force-activate via admin panel
 *
 * See: docs/architecture/11-risk-engine-architecture.md §5.7
 */
@Entity({ name: 'risk_profiles', schema: 'trading' })
export class RiskProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  @Index()
  userId: string;

  // ─── Kill switch ────────────────────────────────────────────────────────────

  /**
   * Per-user kill switch. When true, ALL signals for this user are immediately REJECTED.
   * Checked FIRST in every risk validation — before any other rule.
   */
  @Column({ name: 'kill_switch_active', type: 'boolean', default: false })
  killSwitchActive: boolean;

  /** Reason for kill switch activation (audit trail). */
  @Column({ name: 'kill_switch_reason', type: 'text', nullable: true })
  killSwitchReason: string | null;

  // ─── Account-level limits ──────────────────────────────────────────────────

  /**
   * Maximum daily loss as percentage of opening balance.
   * Default: 5% — breach suspends session until next trading day.
   */
  @Column({
    name: 'max_daily_loss_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: '5.00',
  })
  maxDailyLossPercent: string;

  /**
   * Maximum drawdown as percentage of peak equity.
   * Default: 10% — breach suspends session and requires manual review.
   */
  @Column({
    name: 'max_drawdown_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: '10.00',
  })
  maxDrawdownPercent: string;

  // ─── Position-level limits ─────────────────────────────────────────────────

  /** Maximum number of simultaneously open trades. Default: 3. */
  @Column({ name: 'max_open_trades', type: 'integer', default: 3 })
  maxOpenTrades: number;

  /** Maximum number of new trades per calendar day. Default: 10. */
  @Column({ name: 'max_daily_trades', type: 'integer', default: 10 })
  maxDailyTrades: number;

  /**
   * Maximum position size in lots per single trade.
   * Default: 0.1 lots — AI-suggested sizes larger than this are reduced, not rejected,
   * unless reduction would be below broker's minimum lot size.
   */
  @Column({
    name: 'max_position_size_lot',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: '0.1000',
  })
  maxPositionSizeLot: string;

  /**
   * Minimum stop-loss distance in pips from entry price.
   * Default: 5 pips. Orders with tighter SL are rejected.
   */
  @Column({
    name: 'min_stop_loss_pips',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: '5.00',
  })
  minStopLossPips: string;

  // ─── Instrument restrictions ───────────────────────────────────────────────

  /**
   * JSON array of allowed trading instrument symbols.
   * NULL = all instruments allowed (default).
   * Example: ["EURUSD", "GBPUSD", "USDJPY"]
   */
  @Column({ name: 'allowed_instruments', type: 'jsonb', nullable: true })
  allowedInstruments: string[] | null;

  // ─── Volatility / regime filters ──────────────────────────────────────────

  /**
   * Maximum volatility score threshold (0.0–1.0).
   * Default: 0.85 — signals with higher volatility scores are rejected.
   */
  @Column({
    name: 'max_volatility_score',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: '0.85',
  })
  maxVolatilityScore: string;

  /** Whether to reject trades during LOW_LIQUIDITY regime. Default: true. */
  @Column({ name: 'reject_low_liquidity', type: 'boolean', default: true })
  rejectLowLiquidity: boolean;

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
