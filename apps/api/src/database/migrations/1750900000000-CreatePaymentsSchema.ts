import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreatePaymentsSchema
 *
 * Creates the `payments` schema and three tables:
 *   - payment_transactions
 *   - invoices
 *   - payment_webhook_events
 *
 * Rules:
 * - All monetary amounts stored as bigint (smallest currency unit) — never float.
 * - UUID primary keys throughout.
 * - Indexes on provider references, userId, status, and createdAt.
 */
export class CreatePaymentsSchema1750900000000 implements MigrationInterface {
  name = 'CreatePaymentsSchema1750900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS payments`);

    await queryRunner.query(`
      CREATE TYPE payments.payment_purpose_enum AS ENUM (
        'SUBSCRIPTION_INITIAL',
        'SUBSCRIPTION_RENEWAL',
        'PERFORMANCE_FEE',
        'MANUAL_ADJUSTMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE payments.payment_transaction_status_enum AS ENUM (
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'REFUNDED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE payments.invoice_status_enum AS ENUM (
        'DRAFT',
        'ISSUED',
        'PAID',
        'VOID',
        'OVERDUE',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments.payment_transactions (
        id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                      UUID NOT NULL,
        subscription_id              UUID,
        invoice_id                   UUID,
        provider                     VARCHAR(50) NOT NULL,
        provider_transaction_reference VARCHAR(255),
        provider_customer_reference  VARCHAR(255),
        payment_purpose              payments.payment_purpose_enum NOT NULL DEFAULT 'SUBSCRIPTION_INITIAL',
        status                       payments.payment_transaction_status_enum NOT NULL DEFAULT 'PENDING',
        currency                     VARCHAR(3) NOT NULL,
        amount_minor                 BIGINT NOT NULL,
        country_code                 VARCHAR(2),
        provider_payload_summary     JSONB,
        failure_code                 VARCHAR(100),
        failure_message              TEXT,
        created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_pt_user_id ON payments.payment_transactions (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_pt_provider ON payments.payment_transactions (provider)`);
    await queryRunner.query(`CREATE INDEX idx_pt_status ON payments.payment_transactions (status)`);
    await queryRunner.query(`CREATE INDEX idx_pt_created_at ON payments.payment_transactions (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_pt_user_created ON payments.payment_transactions (user_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_pt_provider_ref ON payments.payment_transactions (provider, provider_transaction_reference)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments.invoices (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL,
        subscription_id  UUID,
        invoice_number   VARCHAR(50) NOT NULL UNIQUE,
        status           payments.invoice_status_enum NOT NULL DEFAULT 'DRAFT',
        currency         VARCHAR(3) NOT NULL,
        subtotal_amount  BIGINT NOT NULL DEFAULT 0,
        tax_amount       BIGINT NOT NULL DEFAULT 0,
        total_amount     BIGINT NOT NULL DEFAULT 0,
        due_date         TIMESTAMPTZ,
        paid_at          TIMESTAMPTZ,
        metadata         JSONB,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_inv_user_id ON payments.invoices (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_inv_status ON payments.invoices (status)`);
    await queryRunner.query(`CREATE INDEX idx_inv_created_at ON payments.invoices (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_inv_user_created ON payments.invoices (user_id, created_at)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_inv_invoice_number ON payments.invoices (invoice_number)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments.payment_webhook_events (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider          VARCHAR(50) NOT NULL,
        provider_event_id VARCHAR(255) NOT NULL,
        event_type        VARCHAR(100) NOT NULL,
        signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
        processed         BOOLEAN NOT NULL DEFAULT FALSE,
        processing_error  TEXT,
        payload_summary   JSONB,
        received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at      TIMESTAMPTZ,
        CONSTRAINT uq_webhook_provider_event UNIQUE (provider, provider_event_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_whe_provider ON payments.payment_webhook_events (provider)`);
    await queryRunner.query(`CREATE INDEX idx_whe_processed ON payments.payment_webhook_events (processed)`);
    await queryRunner.query(`CREATE INDEX idx_whe_received_at ON payments.payment_webhook_events (received_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments.payment_webhook_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments.invoices`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments.payment_transactions`);
    await queryRunner.query(`DROP TYPE IF EXISTS payments.invoice_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS payments.payment_transaction_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS payments.payment_purpose_enum`);
  }
}
