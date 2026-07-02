"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePerformanceBillingSchema1751300000000 = void 0;
class CreatePerformanceBillingSchema1751300000000 {
    constructor() {
        this.name = 'CreatePerformanceBillingSchema1751300000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS performance_billing`);
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
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS performance_billing.performance_fee_billing_cycles CASCADE`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_billing.billing_cycle_status_enum`);
        await queryRunner.query(`DROP SCHEMA IF EXISTS performance_billing CASCADE`);
    }
}
exports.CreatePerformanceBillingSchema1751300000000 = CreatePerformanceBillingSchema1751300000000;
//# sourceMappingURL=1751300000000-CreatePerformanceBillingSchema.js.map