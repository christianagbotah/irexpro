import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fresh-DB UUID bootstrap — compatibility bridge for legacy `uuid_generate_v4()`.
 *
 * Context
 * -------
 * The baseline migration (1750800000000) intentionally standardizes on
 * `gen_random_uuid()` (from pgcrypto / core PG 13+) and explicitly does NOT use
 * `uuid_generate_v4()` (from uuid-ossp). However, two later migrations still
 * use `uuid_generate_v4()` in their `DEFAULT` clauses:
 *
 *   - 1751200000000-CreateBrokerReconciliationSchema
 *       broker_reconciliation.broker_trade_reconciliation_runs.id
 *       broker_reconciliation.broker_reconciled_trades.id
 *   - 1751300000000-CreatePerformanceBillingSchema
 *       performance_billing.performance_fee_billing_cycles.id
 *
 * PostgreSQL validates the function OID in a `DEFAULT` expression at
 * `CREATE TABLE` time. On a completely fresh database where `uuid-ossp` is not
 * installed (and no manual fallback exists), `CREATE TABLE ... DEFAULT
 * uuid_generate_v4()` fails with `function uuid_generate_v4() does not exist`,
 * aborting the migration chain at migration #6.
 *
 * The production runbook (§2.2) works around this with a manual operator
 * pre-step that installs `uuid-ossp` (or a standalone fallback function)
 * before running migrations. But that pre-step is NOT part of the migration
 * chain, so `pnpm migration:run` alone cannot provision a fresh database.
 *
 * Purpose of this bridge
 * ----------------------
 * Ensure that the zero-argument function `public.uuid_generate_v4()` EXISTS
 * by the time migrations #6 and #7 execute, WITHOUT requiring the `uuid-ossp`
 * extension and WITHOUT overwriting any pre-existing function.
 *
 * Strategy (safe in all three known environment states):
 *
 *   1. Verify `gen_random_uuid()` is available (it is core in PG 13+, and the
 *      baseline migration installs pgcrypto which also provides it). If it is
 *      somehow missing, this migration aborts rather than silently proceeding.
 *
 *   2. Check whether `public.uuid_generate_v4()` already exists. If it does
 *      (either from uuid-ossp, or from the historical Sprint-21 standalone
 *      emergency fallback), this migration is a NO-OP — it does NOT replace or
 *      drop the existing function.
 *
 *   3. If `public.uuid_generate_v4()` does NOT exist, create a thin wrapper
 *      function that simply returns `gen_random_uuid()`. This satisfies the
 *      `DEFAULT uuid_generate_v4()` clauses in migrations #6 and #7 without
 *      requiring uuid-ossp.
 *
 * Idempotency
 * -----------
 * The entire `up()` is idempotent: re-running it on a database where the
 * function already exists (from any source) is a safe no-op.
 *
 * Reversibility
 * -------------
 * The `down()` only drops the function IF this migration created it (tracked
 * via the `irexpro_uuid_v4_compat` mark in `pg_proc.proacl`). It will NEVER
 * drop a pre-existing function (uuid-ossp-owned or a standalone fallback).
 * If the function existed before this migration, `down()` is a no-op. This
 * prioritizes safety over a "clean" destructive rollback.
 *
 * Ordering
 * --------
 * Timestamp 1751150000000 — runs AFTER 1751100000000 and BEFORE 1751200000000,
 * so the compatibility function exists before migrations #6 and #7 create
 * their tables. On a fresh DB this is straightforward. On an existing DB where
 * migrations #6/#7 already ran, TypeORM will still detect this migration as
 * pending (it has no prior record in `migrations_table`) and execute it; the
 * `up()` no-ops safely because the function already exists.
 */
export class EnsureLegacyUuidV4Compatibility1751150000000 implements MigrationInterface {
  name = 'EnsureLegacyUuidV4Compatibility1751150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Verify gen_random_uuid() is available. On PG 13+ it is core; the
    //    baseline migration (1750800000000) also installs pgcrypto which
    //    provides it. If it is missing, abort rather than create a broken
    //    wrapper.
    const genRandomCheck = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'pg_catalog' AND p.proname = 'gen_random_uuid'
      ) AS exists
    `);
    const genRandomExists = genRandomCheck?.[0]?.exists === true || genRandomCheck?.[0]?.exists === 't';
    if (!genRandomExists) {
      throw new Error(
        'EnsureLegacyUuidV4Compatibility: gen_random_uuid() is not available. ' +
          'This migration requires PostgreSQL 13+ (core) or the pgcrypto extension. ' +
          'Aborting to avoid creating a broken compatibility wrapper.',
      );
    }

    // 2. Check whether public.uuid_generate_v4() already exists (from any
    //    source: uuid-ossp extension, standalone fallback, or a prior run of
    //    this migration). If it exists, this migration is a NO-OP.
    const existingFunc = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'uuid_generate_v4'
          AND p.pronargs = 0
      ) AS exists
    `);
    const funcExists = existingFunc?.[0]?.exists === true || existingFunc?.[0]?.exists === 't';
    if (funcExists) {
      // Function already exists (uuid-ossp or standalone fallback). Do NOT
      // replace or drop it. Safe no-op.
      return;
    }

    // 3. Create a thin compatibility wrapper that returns gen_random_uuid().
    //    Use SECURITY INVOKER and LANGUAGE sql for determinism. The function
    //    is marked via a comment so down() can identify it as ours.
    await queryRunner.query(`
      CREATE FUNCTION public.uuid_generate_v4()
      RETURNS uuid
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      AS $$ SELECT gen_random_uuid() $$
    `);

    // Mark this function as created by this migration so down() can
    // distinguish it from a uuid-ossp-owned or standalone-fallback function.
    // pg_proc does not have a native "owner migration" field, so we use an
    // ACL annotation via COMMENT as a lightweight, introspectable mark.
    await queryRunner.query(`
      COMMENT ON FUNCTION public.uuid_generate_v4() IS
        'iRexPro compatibility bridge (migration EnsureLegacyUuidV4Compatibility1751150000000). Wraps gen_random_uuid(). Safe to drop after NormalizeLegacyUuidDefaults runs.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only drop the function if this migration created it. Detect via the
    // comment mark we set in up(). If the comment does not match (function is
    // uuid-ossp-owned or a standalone fallback), this is a NO-OP.
    const markCheck = await queryRunner.query(`
      SELECT pg_description.description
      FROM pg_description
      JOIN pg_proc p ON p.oid = pg_description.objoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'uuid_generate_v4'
        AND p.pronargs = 0
    `);
    const mark = markCheck?.[0]?.description ?? '';
    if (!mark || !mark.includes('EnsureLegacyUuidV4Compatibility1751150000000')) {
      // Function was not created by this migration. Do NOT drop it.
      return;
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS public.uuid_generate_v4()`);
  }
}
