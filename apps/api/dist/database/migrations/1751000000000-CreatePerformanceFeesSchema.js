"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePerformanceFeesSchema1751000000000 = void 0;
class CreatePerformanceFeesSchema1751000000000 {
    constructor() {
        this.name = 'CreatePerformanceFeesSchema1751000000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS performance_fees`);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_fees.billing_frequency_enum AS ENUM (
          'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ON_PROFIT_EVENT'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_fees.calculation_mode_enum AS ENUM (
          'HIGH_WATER_MARK'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_fees.applies_to_enum AS ENUM (
          'REALISED_PROFIT_ONLY'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_fees.assessment_status_enum AS ENUM (
          'DRAFT', 'ASSESSED', 'INVOICED', 'WAIVED', 'PAID', 'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE performance_fees.ledger_entry_type_enum AS ENUM (
          'DEPOSIT', 'WITHDRAWAL',
          'REALISED_TRADE_PROFIT', 'REALISED_TRADE_LOSS',
          'FEE_ASSESSED', 'FEE_PAID', 'ADJUSTMENT'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_fees.performance_fee_policies (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id         UUID,
        name            VARCHAR(200) NOT NULL,
        fee_percent     NUMERIC(7,4) NOT NULL,
        billing_frequency performance_fees.billing_frequency_enum NOT NULL,
        calculation_mode  performance_fees.calculation_mode_enum NOT NULL DEFAULT 'HIGH_WATER_MARK',
        applies_to        performance_fees.applies_to_enum NOT NULL DEFAULT 'REALISED_PROFIT_ONLY',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_perf_fee_policies_plan_id
        ON performance_fees.performance_fee_policies (plan_id)
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_fees.trading_account_performances (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                   UUID NOT NULL,
        broker_connection_id      UUID,
        account_reference         VARCHAR(255),
        currency                  VARCHAR(3) NOT NULL,
        current_high_water_mark   BIGINT NOT NULL DEFAULT 0,
        last_calculated_equity    BIGINT,
        last_realised_balance     BIGINT,
        total_deposits            BIGINT NOT NULL DEFAULT 0,
        total_withdrawals         BIGINT NOT NULL DEFAULT 0,
        total_realised_profit     BIGINT NOT NULL DEFAULT 0,
        total_fees_charged        BIGINT NOT NULL DEFAULT 0,
        last_calculation_at       TIMESTAMPTZ,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tap_user_id
        ON performance_fees.trading_account_performances (user_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tap_user_broker
        ON performance_fees.trading_account_performances (user_id, broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tap_broker_connection_id
        ON performance_fees.trading_account_performances (broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_fees.performance_fee_assessments (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 UUID NOT NULL,
        broker_connection_id    UUID,
        subscription_id         UUID,
        invoice_id              UUID,
        currency                VARCHAR(3) NOT NULL,
        period_start            TIMESTAMPTZ NOT NULL,
        period_end              TIMESTAMPTZ NOT NULL,
        starting_high_water_mark BIGINT NOT NULL,
        ending_realised_balance  BIGINT NOT NULL,
        deposits_excluded        BIGINT NOT NULL DEFAULT 0,
        withdrawals_adjusted     BIGINT NOT NULL DEFAULT 0,
        realised_profit_for_fee  BIGINT NOT NULL DEFAULT 0,
        fee_percent              NUMERIC(7,4) NOT NULL,
        fee_amount               BIGINT NOT NULL DEFAULT 0,
        status                   performance_fees.assessment_status_enum NOT NULL DEFAULT 'DRAFT',
        calculation_metadata     JSONB,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_user_id
        ON performance_fees.performance_fee_assessments (user_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_user_broker
        ON performance_fees.performance_fee_assessments (user_id, broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_broker_connection_id
        ON performance_fees.performance_fee_assessments (broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_status
        ON performance_fees.performance_fee_assessments (status)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_period
        ON performance_fees.performance_fee_assessments (period_start, period_end)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_invoice_id
        ON performance_fees.performance_fee_assessments (invoice_id)
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_fees.performance_fee_ledger_entries (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               UUID NOT NULL,
        assessment_id         UUID,
        broker_connection_id  UUID,
        entry_type            performance_fees.ledger_entry_type_enum NOT NULL,
        currency              VARCHAR(3) NOT NULL,
        amount                BIGINT NOT NULL,
        source_reference      VARCHAR(255),
        occurred_at           TIMESTAMPTZ NOT NULL,
        metadata              JSONB,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_user_id
        ON performance_fees.performance_fee_ledger_entries (user_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_user_broker
        ON performance_fees.performance_fee_ledger_entries (user_id, broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_broker_connection_id
        ON performance_fees.performance_fee_ledger_entries (broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_occurred_at
        ON performance_fees.performance_fee_ledger_entries (occurred_at)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_assessment_id
        ON performance_fees.performance_fee_ledger_entries (assessment_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfle_user_occurred
        ON performance_fees.performance_fee_ledger_entries (user_id, occurred_at)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS performance_fees.performance_fee_ledger_entries`);
        await queryRunner.query(`DROP TABLE IF EXISTS performance_fees.performance_fee_assessments`);
        await queryRunner.query(`DROP TABLE IF EXISTS performance_fees.trading_account_performances`);
        await queryRunner.query(`DROP TABLE IF EXISTS performance_fees.performance_fee_policies`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_fees.ledger_entry_type_enum`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_fees.assessment_status_enum`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_fees.applies_to_enum`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_fees.calculation_mode_enum`);
        await queryRunner.query(`DROP TYPE IF EXISTS performance_fees.billing_frequency_enum`);
        await queryRunner.query(`DROP SCHEMA IF EXISTS performance_fees RESTRICT`);
    }
}
exports.CreatePerformanceFeesSchema1751000000000 = CreatePerformanceFeesSchema1751000000000;
//# sourceMappingURL=1751000000000-CreatePerformanceFeesSchema.js.map