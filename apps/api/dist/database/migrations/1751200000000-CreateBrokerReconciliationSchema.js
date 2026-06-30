"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBrokerReconciliationSchema1751200000000 = void 0;
class CreateBrokerReconciliationSchema1751200000000 {
    constructor() {
        this.name = 'CreateBrokerReconciliationSchema1751200000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS broker_reconciliation`);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE broker_reconciliation.reconciliation_run_status_enum AS ENUM (
          'PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE broker_reconciliation.trade_source_type_enum AS ENUM (
          'LIVE_BROKER', 'DEMO_BROKER', 'PAPER_BROKER', 'BACKTEST'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker_reconciliation.broker_trade_reconciliation_runs (
        id                         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id                    UUID        NOT NULL,
        broker_connection_id       UUID        NOT NULL,
        status                     broker_reconciliation.reconciliation_run_status_enum
                                               NOT NULL DEFAULT 'PENDING',
        started_at                 TIMESTAMPTZ,
        completed_at               TIMESTAMPTZ,
        from_time                  TIMESTAMPTZ NOT NULL,
        to_time                    TIMESTAMPTZ NOT NULL,
        total_broker_trades_seen   INTEGER     NOT NULL DEFAULT 0,
        new_ledger_entries_created INTEGER     NOT NULL DEFAULT 0,
        duplicate_trades_skipped   INTEGER     NOT NULL DEFAULT 0,
        failed_trades              INTEGER     NOT NULL DEFAULT 0,
        error_summary              TEXT,
        metadata                   JSONB,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_btrr_user_id
        ON broker_reconciliation.broker_trade_reconciliation_runs (user_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_btrr_user_broker
        ON broker_reconciliation.broker_trade_reconciliation_runs (user_id, broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_btrr_status
        ON broker_reconciliation.broker_trade_reconciliation_runs (status)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_btrr_created_at
        ON broker_reconciliation.broker_trade_reconciliation_runs (created_at)
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker_reconciliation.broker_reconciled_trades (
        id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id                UUID        NOT NULL,
        broker_connection_id   UUID        NOT NULL,
        broker_provider        VARCHAR(50) NOT NULL,
        broker_trade_id        VARCHAR(255) NOT NULL,
        broker_order_id        VARCHAR(255),
        instrument             VARCHAR(50) NOT NULL,
        direction              VARCHAR(4)  NOT NULL,
        volume                 VARCHAR(50) NOT NULL,
        opened_at              TIMESTAMPTZ,
        closed_at              TIMESTAMPTZ NOT NULL,
        entry_price            VARCHAR(50),
        exit_price             VARCHAR(50),
        realised_pnl           BIGINT      NOT NULL,
        commission             BIGINT      NOT NULL DEFAULT 0,
        swap                   BIGINT      NOT NULL DEFAULT 0,
        net_realised_pnl       BIGINT      NOT NULL,
        currency               VARCHAR(3)  NOT NULL,
        reconciliation_run_id  UUID,
        ledger_entry_id        UUID,
        source_type            broker_reconciliation.trade_source_type_enum
                                           NOT NULL DEFAULT 'LIVE_BROKER',
        is_fee_eligible        BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_brt_unique_trade
        ON broker_reconciliation.broker_reconciled_trades
          (user_id, broker_connection_id, broker_trade_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_user_id
        ON broker_reconciliation.broker_reconciled_trades (user_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_user_broker
        ON broker_reconciliation.broker_reconciled_trades (user_id, broker_connection_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_broker_trade_id
        ON broker_reconciliation.broker_reconciled_trades (broker_trade_id)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_closed_at
        ON broker_reconciliation.broker_reconciled_trades (closed_at)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_source_type
        ON broker_reconciliation.broker_reconciled_trades (source_type)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_is_fee_eligible
        ON broker_reconciliation.broker_reconciled_trades (is_fee_eligible)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_brt_reconciliation_run_id
        ON broker_reconciliation.broker_reconciled_trades (reconciliation_run_id)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS broker_reconciliation.broker_reconciled_trades`);
        await queryRunner.query(`DROP TABLE IF EXISTS broker_reconciliation.broker_trade_reconciliation_runs`);
        await queryRunner.query(`DROP TYPE IF EXISTS broker_reconciliation.trade_source_type_enum`);
        await queryRunner.query(`DROP TYPE IF EXISTS broker_reconciliation.reconciliation_run_status_enum`);
        await queryRunner.query(`DROP SCHEMA IF EXISTS broker_reconciliation CASCADE`);
    }
}
exports.CreateBrokerReconciliationSchema1751200000000 = CreateBrokerReconciliationSchema1751200000000;
//# sourceMappingURL=1751200000000-CreateBrokerReconciliationSchema.js.map