import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentPurpose {
  SUBSCRIPTION_INITIAL = 'SUBSCRIPTION_INITIAL',
  SUBSCRIPTION_RENEWAL = 'SUBSCRIPTION_RENEWAL',
  PERFORMANCE_FEE = 'PERFORMANCE_FEE',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

export enum PaymentTransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * Sprint 18 — a partial UNIQUE index `ux_payment_transactions_provider_reference`
 * on (provider, provider_transaction_reference) is enforced at the database level
 * by migration `AddPaymentTransactionReferenceUniqueGuard1751500000000` (WHERE
 * provider_transaction_reference IS NOT NULL AND <> ''). Not expressed as a
 * TypeORM `@Index` decorator because `synchronize` is disabled and this is a
 * partial (WHERE-scoped) index — see the migration file for the full guard and
 * its rationale. The plain @Index below remains for non-unique lookup speed.
 */
@Entity({ name: 'payment_transactions', schema: 'payments' })
@Index(['userId', 'createdAt'])
@Index(['provider', 'providerTransactionReference'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 50 })
  @Index()
  provider: string;

  @Column({ name: 'provider_transaction_reference', type: 'varchar', length: 255, nullable: true })
  providerTransactionReference: string | null;

  @Column({ name: 'provider_customer_reference', type: 'varchar', length: 255, nullable: true })
  providerCustomerReference: string | null;

  @Column({
    name: 'payment_purpose',
    type: 'enum',
    enum: PaymentPurpose,
    default: PaymentPurpose.SUBSCRIPTION_INITIAL,
  })
  paymentPurpose: PaymentPurpose;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.PENDING,
  })
  @Index()
  status: PaymentTransactionStatus;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** Amount in smallest currency unit (e.g. cents, pesewas). Integer stored as string to avoid float precision. */
  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode: string | null;

  /** Safe summary of provider payload — never store raw card data or secrets */
  @Column({ name: 'provider_payload_summary', type: 'jsonb', nullable: true })
  providerPayloadSummary: Record<string, unknown> | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 100, nullable: true })
  failureCode: string | null;

  /** User-facing failure message only — must not contain internal provider details or secrets */
  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
