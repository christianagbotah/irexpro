import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  ASSESSED = 'ASSESSED',
  INVOICED = 'INVOICED',
  WAIVED = 'WAIVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

/**
 * PerformanceFeeAssessment
 *
 * Records one complete performance fee calculation for a user/period.
 * All monetary amounts are in minor currency units (bigint strings).
 *
 * Business rules enforced at service level:
 * - feeAmount > 0 only when realisedProfitForFee > 0 (i.e. profit above HWM).
 * - depositsExcluded: capital added during the period — NOT counted as profit.
 * - withdrawalsAdjusted: capital removed during the period — factored into net calc.
 * - realisedProfitForFee: net closed-trade P&L above the high-water mark.
 * - No invoice is created when feeAmount = 0.
 * - Duplicate assessments for the same user/broker/period are prevented unless DRAFT.
 */
@Entity({ name: 'performance_fee_assessments', schema: 'performance_fees' })
@Index(['userId'])
@Index(['userId', 'brokerConnectionId'])
@Index(['status'])
@Index(['periodStart', 'periodEnd'])
export class PerformanceFeeAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'broker_connection_id', type: 'uuid', nullable: true })
  @Index()
  brokerConnectionId: string | null;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  /** Populated after invoiceAssessment() is called */
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  @Index()
  invoiceId: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  @Index()
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  @Index()
  periodEnd: Date;

  /** HWM value at the start of this assessment period */
  @Column({ name: 'starting_high_water_mark', type: 'bigint' })
  startingHighWaterMark: string;

  /** Cumulative realised P&L at period end */
  @Column({ name: 'ending_realised_balance', type: 'bigint' })
  endingRealisedBalance: string;

  /** Total deposits during the period (excluded from fee basis) */
  @Column({ name: 'deposits_excluded', type: 'bigint', default: '0' })
  depositsExcluded: string;

  /** Total withdrawals during the period (accounted for in calculation) */
  @Column({ name: 'withdrawals_adjusted', type: 'bigint', default: '0' })
  withdrawalsAdjusted: string;

  /** Net realised P&L above the high-water mark; basis for fee. Zero if not above HWM. */
  @Column({ name: 'realised_profit_for_fee', type: 'bigint', default: '0' })
  realisedProfitForFee: string;

  /** Fee percentage applied (e.g. 20.0000 = 20%) */
  @Column({ name: 'fee_percent', type: 'numeric', precision: 7, scale: 4 })
  feePercent: string;

  /** Calculated fee amount in minor units. Zero when profit is not above HWM. */
  @Column({ name: 'fee_amount', type: 'bigint', default: '0' })
  feeAmount: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AssessmentStatus,
    default: AssessmentStatus.DRAFT,
  })
  @Index()
  status: AssessmentStatus;

  /** Full audit trail of inputs used in calculation; must not contain secrets */
  @Column({ name: 'calculation_metadata', type: 'jsonb', nullable: true })
  calculationMetadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
