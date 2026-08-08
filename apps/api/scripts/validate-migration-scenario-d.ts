/**
 * CI Scenario D — REAL PostgreSQL 16 + actual uuid-ossp extension.
 *
 * This script is the Scenario D merge gate for PR #30. It runs against a REAL
 * PostgreSQL 16 service container (NOT PGLite) with the actual `uuid-ossp`
 * extension installed, proving that:
 *
 *   1. uuid-ossp is genuinely available and installed.
 *   2. public.uuid_generate_v4() is extension-owned (via pg_depend).
 *   3. The iRexPro migration chain (all 16 migrations) succeeds against real PG.
 *   4. The bridge migration (1751150000000) NO-OPs against the extension-owned
 *      function (does NOT replace, drop, or mark it).
 *   5. Migrations #6 and #7 (which use uuid_generate_v4() in DEFAULT) succeed.
 *   6. The normalization migration (1752200000000) sets gen_random_uuid() on
 *      the 3 affected columns.
 *   7. UUID generation works (INSERT without explicit IDs → distinct UUIDs).
 *   8. uuid-ossp remains installed after all migrations.
 *   9. The bridge down() does NOT drop the extension-owned function.
 *
 * Usage (inside the db-migration-compat GitHub Actions workflow):
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=irexpro_migration_test \
 *   DB_USER=postgres DB_PASSWORD=ci_disposable \
 *   npx ts-node apps/api/scripts/validate-migration-scenario-d.ts
 *
 * Exits non-zero on any assertion failure.
 */
import { Client } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

// Must match the constant in the bridge migration.
const BRIDGE_MARKER =
  'iRexPro::EnsureLegacyUuidV4Compatibility1751150000000::bridge-owned';

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');

interface FunctionMetadata {
  oid: number;
  nspname: string;
  proname: string;
  pronargs: number;
  provolatile: string;
  proparallel: string;
  prosecdef: boolean;
  prosrc: string;
  rettype: string;
  comment: string | null;
  owning_extension: string | null;
  dependency_type: string | null;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function getFunctionMetadata(
  client: Client,
  schema = 'public',
  name = 'uuid_generate_v4',
): Promise<FunctionMetadata | null> {
  const result = await client.query<FunctionMetadata>(
    `SELECT
       p.oid,
       n.nspname,
       p.proname,
       p.pronargs,
       p.provolatile,
       p.proparallel,
       p.prosecdef,
       p.prosrc,
       format_type(p.prorettype, NULL) AS rettype,
       obj_description(p.oid, 'pg_proc') AS comment,
       e.extname AS owning_extension,
       d.deptype AS dependency_type
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass
     LEFT JOIN pg_extension e ON e.oid = d.refobjid
     WHERE n.nspname = $1 AND p.proname = $2 AND p.pronargs = 0`,
    [schema, name],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function loadMigrationInstance(filename: string): Promise<any> {
  const full = path.join(MIGRATIONS_DIR, filename);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(full);
  const className = Object.keys(mod).find(
    (k) => k !== 'default' && /Migration|Schema|Compatibility|Defaults|Guard|Tokens|Fields/i.test(k),
  );
  if (!className) throw new Error(`No migration class found in ${filename}`);
  return new mod[className]();
}

/**
 * Build a minimal QueryRunner that delegates to the real pg Client.
 * This faithfully reproduces the TypeORM QueryRunner.query() interface that
 * the migration up()/down() methods use.
 */
function buildQueryRunner(client: Client) {
  return {
    async query(query: string, params?: unknown[]) {
      const result = await client.query(query, params as never[]);
      return result.rows;
    },
  };
}

async function getColumnDefault(
  client: Client,
  schema: string,
  table: string,
  column: string,
): Promise<string> {
  const result = await client.query(
    `SELECT pg_get_expr(adbin, adrelid) AS default_expr
     FROM pg_attrdef
     WHERE adrelid = $1::regclass
       AND adnum = (SELECT attnum FROM pg_attribute WHERE attrelid = $1::regclass AND attname = $2)`,
    [`${schema}.${table}`, column],
  );
  return result.rows.length > 0 ? result.rows[0].default_expr : '';
}

async function main(): Promise<void> {
  console.log('=== CI Scenario D — REAL PostgreSQL 16 + uuid-ossp ===');

  const host = process.env.DB_HOST ?? 'localhost';
  const port = parseInt(process.env.DB_PORT ?? '5432', 10);
  const database = process.env.DB_NAME ?? 'irexpro_migration_test';
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';

  console.log(`connecting to postgresql://${user}@${host}:${port}/${database}`);
  const client = new Client({ host, port, database, user, password });
  await client.connect();

  try {
    // ─── 1. Prove uuid-ossp is genuinely available ─────────────────────────
    console.log('\n=== 1. Prove uuid-ossp is available in the image ===');
    const avail = await client.query(
      `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'uuid-ossp'`,
    );
    assert(avail.rows.length === 1, `uuid-ossp is available (rows=${avail.rows.length})`);
    assert(!!avail.rows[0].default_version, `uuid-ossp has a default_version (${avail.rows[0].default_version})`);

    // ─── 2. Install uuid-ossp ──────────────────────────────────────────────
    console.log('\n=== 2. Install uuid-ossp ===');
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    const installed = await client.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'uuid-ossp'`,
    );
    assert(installed.rows.length === 1, `uuid-ossp installed (exactly 1 row)`);
    assert(installed.rows[0].extname === 'uuid-ossp', `extname = uuid-ossp`);
    console.log(`     extversion = ${installed.rows[0].extversion}`);

    // ─── 3. Prove extension ownership BEFORE migrations ────────────────────
    console.log('\n=== 3. Prove uuid_generate_v4() is extension-owned BEFORE migrations ===');
    const before = await getFunctionMetadata(client);
    assert(before !== null, 'public.uuid_generate_v4() exists before migrations');
    if (!before) throw new Error('function not found before migrations');
    console.log('     metadata:', JSON.stringify(before, null, 2));
    assert(before.nspname === 'public', `namespace = public (got ${before.nspname})`);
    assert(before.proname === 'uuid_generate_v4', `name = uuid_generate_v4`);
    assert(before.pronargs === 0, `pronargs = 0`);
    assert(before.owning_extension === 'uuid-ossp', `owning extension = uuid-ossp (got ${before.owning_extension})`);
    assert(before.dependency_type === 'e', `dependency type = 'e' extension-owned (got ${before.dependency_type})`);

    // ─── 4. Run all 16 migrations via real TypeORM ─────────────────────────
    console.log('\n=== 4. Run all 16 iRexPro migrations ===');
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.ts'))
      .sort();
    console.log(`     ${migrationFiles.length} migration files found`);
    assert(migrationFiles.length === 16, `expected 16 migrations, found ${migrationFiles.length}`);

    // Create a migrations_table for TypeORM-style tracking (the real
    // migration:run command does this automatically, but since we're invoking
    // migration classes directly we create it manually to mirror the real
    // execution context faithfully).
    await client.query(`CREATE SCHEMA IF NOT EXISTS public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_table (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL
      )
    `);

    const queryRunner = buildQueryRunner(client);
    for (const file of migrationFiles) {
      const instance = await loadMigrationInstance(file);
      const timestamp = parseInt(file.split('-')[0], 10);
      console.log(`  → running ${file} (timestamp ${timestamp})`);
      try {
        await instance.up(queryRunner);
        await client.query(
          `INSERT INTO migrations_table (timestamp, name) VALUES ($1, $2)`,
          [timestamp, instance.name],
        );
        console.log(`     ✓ ${instance.name}`);
      } catch (err) {
        console.error(`     ✗ ${instance.name} FAILED: ${(err as Error).message}`);
        throw err;
      }
    }
    console.log(`     all 16 migrations applied`);

    // ─── 5. Bridge NO-OP proof ─────────────────────────────────────────────
    console.log('\n=== 5. Bridge NO-OP proof — function metadata unchanged ===');
    const after = await getFunctionMetadata(client);
    assert(after !== null, 'public.uuid_generate_v4() still exists after migrations');
    if (!after) throw new Error('function not found after migrations');
    console.log('     metadata after:', JSON.stringify(after, null, 2));
    assert(after.oid === before.oid, `OID unchanged (${before.oid} → ${after.oid})`);
    assert(after.owning_extension === before.owning_extension, `owning extension unchanged (${before.owning_extension})`);
    assert(after.dependency_type === before.dependency_type, `dependency type unchanged (${before.dependency_type})`);
    assert(after.provolatile === before.provolatile, `provolatile unchanged (${before.provolatile})`);
    assert(after.proparallel === before.proparallel, `proparallel unchanged (${before.proparallel})`);
    assert(after.prosrc === before.prosrc, `prosrc unchanged`);
    assert(after.prosecdef === before.prosecdef, `prosecdef unchanged (${before.prosecdef})`);
    assert(after.comment === before.comment, `comment unchanged (not replaced with bridge marker)`);
    assert(after.comment !== BRIDGE_MARKER, `bridge marker was NOT applied to extension function`);

    // ─── 6. Migration #6 and #7 passed (implicit in step 4) ────────────────
    console.log('\n=== 6. Migrations #6 and #7 (broker_reconciliation, performance_billing) ===');
    const brrExists = await client.query(`SELECT to_regclass('broker_reconciliation.broker_trade_reconciliation_runs') IS NOT NULL AS exists`);
    assert(brrExists.rows[0].exists === true, 'broker_reconciliation.broker_trade_reconciliation_runs exists');
    const brtExists = await client.query(`SELECT to_regclass('broker_reconciliation.broker_reconciled_trades') IS NOT NULL AS exists`);
    assert(brtExists.rows[0].exists === true, 'broker_reconciliation.broker_reconciled_trades exists');
    const pfbcExists = await client.query(`SELECT to_regclass('performance_billing.performance_fee_billing_cycles') IS NOT NULL AS exists`);
    assert(pfbcExists.rows[0].exists === true, 'performance_billing.performance_fee_billing_cycles exists');

    // ─── 7. Normalization proof — 3 column defaults = gen_random_uuid() ───
    console.log('\n=== 7. Normalization proof — 3 column defaults = gen_random_uuid() ===');
    const targets = [
      { schema: 'broker_reconciliation', table: 'broker_trade_reconciliation_runs', column: 'id' },
      { schema: 'broker_reconciliation', table: 'broker_reconciled_trades', column: 'id' },
      { schema: 'performance_billing', table: 'performance_fee_billing_cycles', column: 'id' },
    ];
    for (const t of targets) {
      const def = await getColumnDefault(client, t.schema, t.table, t.column);
      assert(def === 'gen_random_uuid()', `${t.schema}.${t.table}.${t.column} default = gen_random_uuid() (got ${def})`);
    }

    // ─── 8. UUID generation proof ──────────────────────────────────────────
    console.log('\n=== 8. UUID generation proof (INSERT without explicit IDs) ===');
    // Insert test rows — the `id` columns use DEFAULT (gen_random_uuid()).
    const userIdResult = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('scenario-d@test.local', '+10000000001', 'hash', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const userId = userIdResult.rows[0].id;
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId), `user id is valid UUIDv4 (${userId})`);

    const runResult = await client.query(`
      INSERT INTO broker_reconciliation.broker_trade_reconciliation_runs
        (user_id, broker_connection_id, from_time, to_time)
      VALUES ($1, '00000000-0000-0000-0000-000000000002', NOW(), NOW())
      RETURNING id
    `, [userId]);
    const runId = runResult.rows[0].id;
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId), `reconciliation run id is valid UUIDv4 (${runId})`);

    const tradeResult = await client.query(`
      INSERT INTO broker_reconciliation.broker_reconciled_trades
        (user_id, broker_connection_id, broker_provider, broker_trade_id, instrument, direction, volume, closed_at, realised_pnl, net_realised_pnl, currency)
      VALUES ($1, '00000000-0000-0000-0000-000000000002', 'TEST', 'trade-d-001', 'EUR/USD', 'BUY', '0.10', NOW(), 100, 100, 'USD')
      RETURNING id
    `, [userId]);
    const tradeId = tradeResult.rows[0].id;
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tradeId), `reconciled trade id is valid UUIDv4 (${tradeId})`);

    const cycleResult = await client.query(`
      INSERT INTO performance_billing.performance_fee_billing_cycles
        (user_id, period_start, period_end, currency)
      VALUES ($1, NOW(), NOW(), 'USD')
      RETURNING id
    `, [userId]);
    const cycleId = cycleResult.rows[0].id;
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cycleId), `billing cycle id is valid UUIDv4 (${cycleId})`);

    // Prove distinctness
    const ids = [userId, runId, tradeId, cycleId];
    const unique = new Set(ids);
    assert(unique.size === 4, `all 4 generated UUIDs are distinct (got ${unique.size} unique)`);

    // ─── 9. uuid-ossp survival proof ───────────────────────────────────────
    console.log('\n=== 9. uuid-ossp survival proof ===');
    const stillInstalled = await client.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'uuid-ossp'`);
    assert(stillInstalled.rows.length === 1, 'uuid-ossp still installed after all migrations');
    const callResult = await client.query(`SELECT uuid_generate_v4() AS uuid`);
    assert(!!callResult.rows[0].uuid, `SELECT uuid_generate_v4() still succeeds (returned ${callResult.rows[0].uuid})`);
    const stillExtOwned = await getFunctionMetadata(client);
    assert(stillExtOwned?.owning_extension === 'uuid-ossp', 'function remains extension-owned after migrations');

    // ─── 10. Rollback-safety proof (separate DB) ───────────────────────────
    console.log('\n=== 10. Bridge down() rollback-safety proof (separate DB) ===');
    // Create a second disposable database for the rollback test.
    await client.query(`CREATE DATABASE irexpro_rollback_test`);
    const rollbackClient = new Client({ host, port, database: 'irexpro_rollback_test', user, password });
    await rollbackClient.connect();
    try {
      // Install uuid-ossp in the rollback DB.
      await rollbackClient.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      const rbInstalled = await rollbackClient.query(`SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`);
      assert(rbInstalled.rows.length === 1, 'uuid-ossp installed in rollback DB');

      // Capture metadata before bridge up().
      const rbBefore = await getFunctionMetadata(rollbackClient);
      assert(rbBefore !== null, 'extension function exists in rollback DB before bridge');
      assert(rbBefore!.owning_extension === 'uuid-ossp', 'function is extension-owned in rollback DB');
      const rbBeforeOid = rbBefore!.oid;
      const rbBeforeComment = rbBefore!.comment;
      console.log(`     before bridge: oid=${rbBeforeOid}, comment=${JSON.stringify(rbBeforeComment)}`);

      // Invoke the bridge up() faithfully.
      const bridge = await loadMigrationInstance('1751150000000-EnsureLegacyUuidV4Compatibility.ts');
      const rbQueryRunner = buildQueryRunner(rollbackClient);
      await bridge.up(rbQueryRunner);
      console.log('     bridge up() completed (expected NO-OP)');

      // Verify NO-OP.
      const rbAfterUp = await getFunctionMetadata(rollbackClient);
      assert(rbAfterUp !== null, 'function still exists after bridge up()');
      assert(rbAfterUp!.oid === rbBeforeOid, `OID unchanged after up() (${rbBeforeOid} → ${rbAfterUp!.oid})`);
      assert(rbAfterUp!.owning_extension === 'uuid-ossp', 'owning extension unchanged after up()');
      assert(rbAfterUp!.comment === rbBeforeComment, 'comment unchanged after up()');
      assert(rbAfterUp!.comment !== BRIDGE_MARKER, 'bridge marker NOT applied after up()');

      // Invoke the bridge down() faithfully.
      await bridge.down(rbQueryRunner);
      console.log('     bridge down() completed (expected NO-OP)');

      // Verify down() did NOT drop the extension function.
      const rbAfterDown = await getFunctionMetadata(rollbackClient);
      assert(rbAfterDown !== null, 'extension function STILL EXISTS after bridge down() (not dropped)');
      assert(rbAfterDown!.oid === rbBeforeOid, `OID unchanged after down() (${rbBeforeOid} → ${rbAfterDown!.oid})`);
      assert(rbAfterDown!.owning_extension === 'uuid-ossp', 'owning extension unchanged after down()');
      assert(rbAfterDown!.dependency_type === 'e', 'dependency type still extension-owned after down()');
      assert(rbAfterDown!.comment === rbBeforeComment, 'comment unchanged after down()');
      assert(rbAfterDown!.comment !== BRIDGE_MARKER, 'bridge marker absent after down()');

      // Verify uuid-ossp still installed and callable.
      const rbStillInstalled = await rollbackClient.query(`SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'`);
      assert(rbStillInstalled.rows.length === 1, 'uuid-ossp still installed in rollback DB after down()');
      const rbCall = await rollbackClient.query(`SELECT uuid_generate_v4() AS uuid`);
      assert(!!rbCall.rows[0].uuid, `uuid_generate_v4() still callable after down() (returned ${rbCall.rows[0].uuid})`);
    } finally {
      await rollbackClient.end();
    }

    console.log('\n=== ALL SCENARIO D ASSERTIONS PASSED ===');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n=== SCENARIO D FAILED ===');
  console.error(err);
  process.exit(1);
});
