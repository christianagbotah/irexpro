import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 30 — Database Schema Hardening Phase 2A
 *
 * Adds stable closed-domain CHECK constraints to three varchar columns whose
 * allowed values are a fixed, small set that will never change:
 *
 *   1. trading.trades.direction — CHECK (direction IN ('BUY', 'SELL'))
 *   2. broker_reconciliation.broker_reconciled_trades.direction — same
 *   3. broker.broker_connections.account_type — CHECK (account_type IN ('DEMO', 'LIVE'))
 *
 * Strategy: direct ADD CONSTRAINT ... CHECK within the migration transaction.
 * These tables are startup-scale; the ACCESS EXCLUSIVE lock for ADD CONSTRAINT
 * is sub-second and does not rewrite data. The constraint validates existing
 * rows atomically within the transaction — if any invalid value exists, the
 * entire migration fails and rolls back (fail-closed).
 *
 * Preflight: before adding each constraint, the migration queries for invalid
 * non-null values. If any are found, it throws a clear diagnostic error with
 * the invalid value and count, rather than letting PostgreSQL's generic
 * "check constraint violation" message be the only feedback.
 *
 * No PostgreSQL native ENUM types are introduced. Existing varchar storage is
 * preserved. No data is rewritten.
 *
 * down() drops only the three named constraints. No CASCADE. Data unchanged.
 */
export class AddStableDomainCheckConstraints1752500000000 implements MigrationInterface {
  name = 'AddStableDomainCheckConstraints1752500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Preflight: detect invalid existing values ──────────────────────────

    // 1. trading.trades.direction
    const invalidDirections = await queryRunner.query(`
      SELECT direction, COUNT(*)::int AS cnt
      FROM trading.trades
      WHERE direction IS NOT NULL AND direction NOT IN ('BUY', 'SELL')
      GROUP BY direction
    `);
    if (invalidDirections && invalidDirections.length > 0) {
      const details = invalidDirections
        .map((r: { direction: string; cnt: number }) => `'${r.direction}' (${r.cnt} rows)`)
        .join(', ');
      throw new Error(
        `Cannot add chk_trades_direction: existing invalid values found in trading.trades.direction: ${details}. ` +
          'Resolve or remove invalid values before applying this migration.',
      );
    }

    // 2. broker_reconciliation.broker_reconciled_trades.direction
    const invalidReconciledDirections = await queryRunner.query(`
      SELECT direction, COUNT(*)::int AS cnt
      FROM broker_reconciliation.broker_reconciled_trades
      WHERE direction IS NOT NULL AND direction NOT IN ('BUY', 'SELL')
      GROUP BY direction
    `);
    if (invalidReconciledDirections && invalidReconciledDirections.length > 0) {
      const details = invalidReconciledDirections
        .map((r: { direction: string; cnt: number }) => `'${r.direction}' (${r.cnt} rows)`)
        .join(', ');
      throw new Error(
        `Cannot add chk_broker_reconciled_trades_direction: existing invalid values found: ${details}.`,
      );
    }

    // 3. broker.broker_connections.account_type
    const invalidAccountTypes = await queryRunner.query(`
      SELECT account_type, COUNT(*)::int AS cnt
      FROM broker.broker_connections
      WHERE account_type IS NOT NULL AND account_type NOT IN ('DEMO', 'LIVE')
      GROUP BY account_type
    `);
    if (invalidAccountTypes && invalidAccountTypes.length > 0) {
      const details = invalidAccountTypes
        .map((r: { account_type: string; cnt: number }) => `'${r.account_type}' (${r.cnt} rows)`)
        .join(', ');
      throw new Error(
        `Cannot add chk_broker_connections_account_type: existing invalid values found: ${details}.`,
      );
    }

    // ── Add CHECK constraints ──────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE trading.trades
        ADD CONSTRAINT chk_trades_direction
        CHECK (direction IN ('BUY', 'SELL'))
    `);

    await queryRunner.query(`
      ALTER TABLE broker_reconciliation.broker_reconciled_trades
        ADD CONSTRAINT chk_broker_reconciled_trades_direction
        CHECK (direction IN ('BUY', 'SELL'))
    `);

    await queryRunner.query(`
      ALTER TABLE broker.broker_connections
        ADD CONSTRAINT chk_broker_connections_account_type
        CHECK (account_type IN ('DEMO', 'LIVE'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE broker.broker_connections DROP CONSTRAINT IF EXISTS chk_broker_connections_account_type`,
    );
    await queryRunner.query(
      `ALTER TABLE broker_reconciliation.broker_reconciled_trades DROP CONSTRAINT IF EXISTS chk_broker_reconciled_trades_direction`,
    );
    await queryRunner.query(
      `ALTER TABLE trading.trades DROP CONSTRAINT IF EXISTS chk_trades_direction`,
    );
  }
}
