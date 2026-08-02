import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotfix — Reconcile broker.broker_connections schema with the entity.
 *
 * Root cause: the baseline migration (1750800000000) created broker_connections
 * with columns that don't match the current BrokerConnection entity. Specifically:
 *
 *   Entity column              Baseline column           Status
 *   ─────────────────────────  ────────────────────────  ─────────────
 *   last_sync_at               (missing)                 ❌ MISSING
 *   consecutive_failure_count  failure_count             ❌ NAME MISMATCH
 *   live_trading_enabled       (missing)                 ❌ MISSING
 *   account_currency           currency                  ❌ NAME MISMATCH
 *   account_leverage           (missing)                 ❌ MISSING
 *   health_check_status        health_check_status       (entity has no such field — leave in place)
 *
 * This caused: GET /api/v1/users/me/onboarding-status → 500
 *   QueryFailedError: column conn.last_sync_at does not exist
 *
 * The OnboardingService query selects lastSyncAt + liveTradingEnabled, which
 * mapped to last_sync_at + live_trading_enabled — neither existed in the DB.
 *
 * This migration is NON-DESTRUCTIVE:
 *   - Adds missing columns with ADD COLUMN IF NOT EXISTS.
 *   - For name-mismatched columns (failure_count → consecutive_failure_count,
 *     currency → account_currency), adds the entity-expected column and
 *     migrates data from the old column if it exists. Does NOT drop the old
 *     column (preserves data; old column is harmless if unused).
 *   - live_trading_enabled defaults to FALSE (never accidentally enables live trading).
 *   - All existing broker connection rows are preserved.
 *
 * Safe down() reverses the ADD COLUMNs (does NOT recreate the old columns).
 */
export class ReconcileBrokerConnectionSchema1752100000000 implements MigrationInterface {
  name = 'ReconcileBrokerConnectionSchema1752100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add last_sync_at (nullable — may not have synced yet)
    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
      ADD COLUMN IF NOT EXISTS last_sync_at timestamptz
    `);

    // 2. Add consecutive_failure_count (default 0 — conservative)
    //    Migrate data from the old failure_count column if it exists.
    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
      ADD COLUMN IF NOT EXISTS consecutive_failure_count integer NOT NULL DEFAULT 0
    `);
    // Copy data from the old failure_count column if it exists
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'broker'
            AND table_name = 'broker_connections'
            AND column_name = 'failure_count'
        ) THEN
          UPDATE broker.broker_connections
          SET consecutive_failure_count = failure_count
          WHERE consecutive_failure_count = 0 AND failure_count > 0;
        END IF;
      END $$;
    `);

    // 3. Add live_trading_enabled (default FALSE — never accidentally enable live trading)
    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
      ADD COLUMN IF NOT EXISTS live_trading_enabled boolean NOT NULL DEFAULT false
    `);

    // 4. Add account_currency (nullable — may not be known yet)
    //    Migrate data from the old currency column if it exists.
    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
      ADD COLUMN IF NOT EXISTS account_currency varchar(3)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'broker'
            AND table_name = 'broker_connections'
            AND column_name = 'currency'
        ) THEN
          UPDATE broker.broker_connections
          SET account_currency = currency
          WHERE account_currency IS NULL AND currency IS NOT NULL;
        END IF;
      END $$;
    `);

    // 5. Add account_leverage (nullable — may not be known yet)
    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
      ADD COLUMN IF NOT EXISTS account_leverage integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the ADD COLUMNs. Does NOT recreate the old failure_count/currency
    // columns — those are preserved by the up() migration (not dropped there).
    await queryRunner.query(`ALTER TABLE broker.broker_connections DROP COLUMN IF EXISTS account_leverage`);
    await queryRunner.query(`ALTER TABLE broker.broker_connections DROP COLUMN IF EXISTS account_currency`);
    await queryRunner.query(`ALTER TABLE broker.broker_connections DROP COLUMN IF EXISTS live_trading_enabled`);
    await queryRunner.query(`ALTER TABLE broker.broker_connections DROP COLUMN IF EXISTS consecutive_failure_count`);
    await queryRunner.query(`ALTER TABLE broker.broker_connections DROP COLUMN IF EXISTS last_sync_at`);
  }
}
