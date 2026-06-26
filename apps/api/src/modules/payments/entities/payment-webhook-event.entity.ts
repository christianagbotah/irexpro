import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payment_webhook_events', schema: 'payments' })
@Index(['provider', 'providerEventId'], { unique: true })
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider', type: 'varchar', length: 50 })
  @Index()
  provider: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 255 })
  providerEventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'signature_verified', type: 'boolean', default: false })
  signatureVerified: boolean;

  @Column({ name: 'processed', type: 'boolean', default: false })
  @Index()
  processed: boolean;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  /** Safe summary only — never store raw payload if it could contain secrets or card data */
  @Column({ name: 'payload_summary', type: 'jsonb', nullable: true })
  payloadSummary: Record<string, unknown> | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  @Index()
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
