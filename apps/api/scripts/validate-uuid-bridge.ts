/**
 * Migration-focused validation for the UUID compatibility bridge.
 *
 * This script proves that migration 1751150000000-EnsureLegacyUuidV4Compatibility
 * creates a wrapper function with the correct PostgreSQL catalog metadata when
 * run on a fresh database (no pre-existing uuid_generate_v4).
 *
 * Catalog metadata verified:
 *   - schema = public
 *   - name = uuid_generate_v4
 *   - pronargs = 0
 *   - return type = uuid
 *   - provolatile = 'v' (VOLATILE — matches pg_catalog.gen_random_uuid())
 *   - proparallel = 's' (PARALLEL SAFE — matches pg_catalog.gen_random_uuid())
 *   - prosecdef = false (SECURITY INVOKER, the default — NOT SECURITY DEFINER)
 *   - bridge marker comment = exact BRIDGE_MARKER string
 *
 * Functional proof:
 *   - multiple calls produce independently generated UUID values (not cached)
 *   - multi-row INSERT with DEFAULT generates distinct UUIDs per row
 *
 * Existing-function behavior:
 *   - when a standalone uuid_generate_v4() already exists, the bridge NO-OPs
 *   - the pre-existing function's volatility, source, comment, and OID are
 *     unchanged
 *
 * Usage (requires @electric-sql/pglite, which is NOT a workspace dependency —
 * install it temporarily in a temp dir to run this script):
 *
 *   cd /tmp && mkdir -p pglite-runner && cd pglite-runner
 *   npm init -y && npm install @electric-sql/pglite ts-node typescript
 *   npx ts-node /home/z/work/irexpro/apps/api/scripts/validate-uuid-bridge.ts
 *
 * This script does NOT touch staging, production, or any existing iRexPro
 * database. It uses an in-memory PGLite instance (real PostgreSQL 16.4 WASM).
 */
import { PGlite } from '@electric-sql/pglite';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');

// Must match the constant in the migration file.
const BRIDGE_MARKER =
  'iRexPro::EnsureLegacyUuidV4Compatibility1751150000000::bridge-owned';

interface PgProcRow {
  nspname: string;
  proname: string;
  pronargs: number;
  provolatile: string;
  proparallel: string;
  prosecdef: boolean;
  prosrc: string;
  rettype: string;
  comment: string | null;
}

async function getFunctionMetadata(
  db: PGlite,
  schema = 'public',
  name = 'uuid_generate_v4',
): Promise<PgProcRow | null> {
  const result = await db.query(
    `SELECT
       n.nspname,
       p.proname,
       p.pronargs,
       p.provolatile,
       p.proparallel,
       p.prosecdef,
       p.prosrc,
       format_type(p.prorettype, NULL) AS rettype,
       obj_description(p.oid, 'pg_proc') AS comment
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.proname = $2 AND p.pronargs = 0`,
    [schema, name],
  );
  const rows = (result as unknown as { rows: PgProcRow[] }).rows;
  return rows.length > 0 ? rows[0] : null;
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

async function runMigrationUp(db: PGlite, instance: any): Promise<void> {
  // Build a minimal QueryRunner that delegates to PGLite.
  const queryRunner = {
    async query(query: string, params?: unknown[]) {
      // PGLite does not support CREATE EXTENSION for pgcrypto/uuid-ossp.
      // Intercept and no-op (gen_random_uuid is native in PGLite/PG16).
      if (/CREATE\s+EXTENSION/i.test(query)) return [];
      const result = await db.query(query, params as never);
      const rows = (result as unknown as { rows: unknown[] }).rows;
      return rows;
    },
  };
  await instance.up(queryRunner);
}

async function runMigrationDown(db: PGlite, instance: any): Promise<void> {
  const queryRunner = {
    async query(query: string, params?: unknown[]) {
      if (/CREATE\s+EXTENSION/i.test(query)) return [];
      const result = await db.query(query, params as never);
      return (result as unknown as { rows: unknown[] }).rows;
    },
  };
  await instance.down(queryRunner);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function scenarioFreshDbBridgeCreatesCorrectWrapper(): Promise<void> {
  console.log('\n=== Scenario 1: Fresh DB — bridge creates wrapper with correct metadata ===');
  const db = new PGlite();
  await db.waitReady;

  // Load and run the bridge migration only.
  const bridge = await loadMigrationInstance(
    '1751150000000-EnsureLegacyUuidV4Compatibility.ts',
  );
  await runMigrationUp(db, bridge);

  const meta = await getFunctionMetadata(db);
  assert(meta !== null, 'public.uuid_generate_v4() exists after bridge up()');
  if (!meta) throw new Error('function not found');

  assert(meta.nspname === 'public', `schema = public (got ${meta.nspname})`);
  assert(meta.proname === 'uuid_generate_v4', `name = uuid_generate_v4 (got ${meta.proname})`);
  assert(meta.pronargs === 0, `pronargs = 0 (got ${meta.pronargs})`);
  assert(meta.rettype === 'uuid', `return type = uuid (got ${meta.rettype})`);
  assert(meta.provolatile === 'v', `provolatile = 'v' VOLATILE (got '${meta.provolatile}')`);
  assert(meta.proparallel === 's', `proparallel = 's' PARALLEL SAFE (got '${meta.proparallel}')`);
  assert(meta.prosecdef === false, `prosecdef = false SECURITY INVOKER (got ${meta.prosecdef})`);
  assert(
    meta.comment === BRIDGE_MARKER,
    `comment = exact BRIDGE_MARKER (got ${JSON.stringify(meta.comment)})`,
  );

  // Functional proof: multiple calls produce distinct UUIDs.
  const callResult = await db.query('SELECT uuid_generate_v4() AS a, uuid_generate_v4() AS b');
  const row = (callResult as unknown as { rows: { a: string; b: string }[] }).rows[0];
  assert(row.a !== row.b, 'two calls produce distinct UUIDs');
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.a),
    `first call returns a valid UUIDv4 (got ${row.a})`,
  );

  // Multi-row default-generation test: create a temp table with the default,
  // insert 10 rows without IDs, verify all 10 get distinct UUIDs.
  await db.query(`
    CREATE TEMP TABLE uuid_default_test (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      label TEXT
    )
  `);
  await db.query(`
    INSERT INTO uuid_default_test (label)
    VALUES ('r1'),('r2'),('r3'),('r4'),('r5'),('r6'),('r7'),('r8'),('r9'),('r10')
  `);
  const rowsResult = await db.query('SELECT id FROM uuid_default_test ORDER BY label');
  const ids = (rowsResult as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  const unique = new Set(ids);
  assert(ids.length === 10, `10 rows inserted (got ${ids.length})`);
  assert(unique.size === 10, `all 10 generated UUIDs are distinct (got ${unique.size} unique)`);
  for (const id of ids) {
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      `generated UUID ${id} is valid UUIDv4`,
    );
  }

  await db.close();
}

async function scenarioStandaloneFallbackBridgeNoOps(): Promise<void> {
  console.log('\n=== Scenario 2: Standalone fallback present — bridge NO-OPs, metadata unchanged ===');
  const db = new PGlite();
  await db.waitReady;

  // Pre-create a standalone uuid_generate_v4() (STABLE, distinct from bridge's VOLATILE).
  await db.query(`
    CREATE FUNCTION public.uuid_generate_v4()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$ SELECT gen_random_uuid() $$
  `);
  await db.query(`COMMENT ON FUNCTION public.uuid_generate_v4() IS 'pre-existing standalone fallback'`);

  const before = await getFunctionMetadata(db);
  assert(before !== null, 'pre-existing function exists before bridge');
  if (!before) throw new Error('pre-existing function not found');
  const beforeOidResult = await db.query(
    `SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='uuid_generate_v4' AND p.pronargs=0`,
  );
  const beforeOid = (beforeOidResult as unknown as { rows: { oid: number }[] }).rows[0].oid;

  // Run the bridge up().
  const bridge = await loadMigrationInstance(
    '1751150000000-EnsureLegacyUuidV4Compatibility.ts',
  );
  await runMigrationUp(db, bridge);

  const after = await getFunctionMetadata(db);
  assert(after !== null, 'function still exists after bridge up()');
  if (!after) throw new Error('function missing after bridge');

  const afterOidResult = await db.query(
    `SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='uuid_generate_v4' AND p.pronargs=0`,
  );
  const afterOid = (afterOidResult as unknown as { rows: { oid: number }[] }).rows[0].oid;

  assert(after.provolatile === before.provolatile, `volatility unchanged (${before.provolatile} → ${after.provolatile})`);
  assert(after.prosrc === before.prosrc, `source unchanged`);
  assert(after.comment === before.comment, `comment unchanged (not replaced with bridge marker)`);
  assert(afterOid === beforeOid, `OID unchanged (${beforeOid} → ${afterOid})`);
  assert(after.comment !== BRIDGE_MARKER, `bridge marker was NOT applied to pre-existing function`);

  await db.close();
}

async function scenarioExactMarkerRollback(): Promise<void> {
  console.log('\n=== Scenario 3: Exact-marker rollback — down() drops only bridge-created function ===');
  const db = new PGlite();
  await db.waitReady;

  // 3a: bridge creates the function on a fresh DB.
  const bridge = await loadMigrationInstance(
    '1751150000000-EnsureLegacyUuidV4Compatibility.ts',
  );
  await runMigrationUp(db, bridge);
  const afterUp = await getFunctionMetadata(db);
  assert(afterUp !== null, 'function exists after bridge up()');
  assert(afterUp?.comment === BRIDGE_MARKER, 'comment is the exact bridge marker');

  // 3b: bridge down() should drop it (exact marker matches).
  await runMigrationDown(db, bridge);
  const afterDown = await getFunctionMetadata(db);
  assert(afterDown === null, 'function dropped after bridge down() (exact marker matched)');

  // 3c: pre-existing function with a DIFFERENT comment — down() must NOT drop it.
  await db.query(`
    CREATE FUNCTION public.uuid_generate_v4()
    RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT gen_random_uuid() $$
  `);
  // Set a comment that CONTAINS the migration identifier but is NOT the exact marker
  // (substring-match would incorrectly trigger a drop; exact-match correctly skips).
  await db.query(
    `COMMENT ON FUNCTION public.uuid_generate_v4() IS 'EnsureLegacyUuidV4Compatibility1751150000000 appears here as substring only'`,
  );
  await runMigrationDown(db, bridge);
  const afterSecondDown = await getFunctionMetadata(db);
  assert(afterSecondDown !== null, 'pre-existing function with non-matching comment NOT dropped by down()');
  assert(
    afterSecondDown?.comment !== BRIDGE_MARKER,
    'comment is NOT the bridge marker (down() did not treat substring as ownership)',
  );

  await db.close();
}

async function main(): Promise<void> {
  console.log('=== UUID Bridge Migration Validation ===');
  console.log(`migrations dir: ${MIGRATIONS_DIR}`);
  console.log(`bridge marker:  ${BRIDGE_MARKER}`);

  // Verify the bridge migration file exists.
  const bridgeFile = path.join(MIGRATIONS_DIR, '1751150000000-EnsureLegacyUuidV4Compatibility.ts');
  assert(fs.existsSync(bridgeFile), 'bridge migration file exists');

  await scenarioFreshDbBridgeCreatesCorrectWrapper();
  await scenarioStandaloneFallbackBridgeNoOps();
  await scenarioExactMarkerRollback();

  console.log('\n=== ALL VALIDATION SCENARIOS PASSED ===');
}

main().catch((err) => {
  console.error('\n=== VALIDATION FAILED ===');
  console.error(err);
  process.exit(1);
});
