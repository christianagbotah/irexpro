import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 13 — Performance Fee Billing Cycle schema
 *
 * Creates:
 *   - Schema:  performance_billing
 *   - Enum:    billing_cycle_status_enum
 *   - Table:   performance_billing.performance_fee_billing_cycles
 *
 * Money columns (totalRealisedProfit, feeAmount) are stored as BIGINT minor
 * currency units. All UUID columns use uuid_generate_v4().
 *
 * Duplicate-prevention:
 *   - For cycles tied to a specific broker connection:
 *       (user_id, broker_connection_id, period_start, period_end)
 *   - For account-wide cycles (broker_connection_id IS NULL):
 *       (user_id, period_start, period_end) WHERE broker_connection_id IS NULL
 *
 * down() is a safe full reversal.
 */
export class CreatePerformanceBillingSchema1751300000000 implements MigrationInterface {
  name = 'CreatePerformanceBillingSchema1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Schema ────────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS performance_billing`);

    // ── Enum ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_billing.billing_cycle_status_enum AS ENUM (
          'DRAFT',
          'RECONCILING',
          'RECONCILED',
          'ASSESSING',
          'ASSESSED',
          'INVOICED',
          'NO_FEE_DUE',
          'FAILED',
          'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── Table ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_billing.performance_fee_billing_cycles (
        id                          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id                     UUID          NOT NULL,
        broker_connection_id        UUID          NULL,
        period_start                TIMESTAMPTZ   NOT NULL,
        period_end                  TIMESTAMPTZ   NOT NULL,
        currency                    VARCHAR(3)    NOT NULL,
        status                      performance_billing.billing_cycle_status_enum
                                                  NOT NULL DEFAULT 'DRAFT',
        reconciliation_run_id       UUID          NULL,
        assessment_id               UUID          NULL,
        invoice_id                  UUID          NULL,
        total_ledger_entries_created INTEGER      NOT NULL DEFAULT 0,
        total_realised_profit       BIGINT        NOT NULL DEFAULT 0,
        fee_amount                  BIGINT        NOT NULL DEFAULT 0,
        error_summary               TEXT          NULL,
        metadata                    JSONB         NULL,
        created_by_user_id          UUID          NULL,
        created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        completed_at                TIMESTAMPTZ   NULL
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfbc_user_id
        ON performance_billing.performance_fee_billing_cycles (user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfbc_user_broker
        ON performance_billing.performance_fee_billing_cycles (user_id, broker_connection_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfbc_status
        ON performance_billing.performance_fee_billing_cycles (status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfbc_period
        ON performance_billing.performance_fee_billing_cycles (period_start, period_end)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfbc_created_at
        ON performance_billing.performance_fee_billing_cycles (created_at)
    `);

    // ── Duplicate-prevention unique indexes (partial to handle NULL safely) ───
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfbc_unique_cycle_with_broker
        ON performance_billing.performance_fee_billing_cycles
          (user_id, broker_connection_id, period_start, period_end)
        WHERE broker_connection_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfbc_unique_cycle_no_broker
        ON performance_billing.performance_fee_billing_cycles
          (user_id, period_start, period_end)
        WHERE broker_connection_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS performance_billing.performance_fee_billing_cycles CASCADE`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS performance_billing.billing_cycle_status_enum`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS performance_billing CASCADE`);
  }
}
