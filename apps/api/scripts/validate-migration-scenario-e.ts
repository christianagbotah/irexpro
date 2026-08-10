/**
 * CI Scenario E — Existing pre-Sprint-29 DB upgrade + FK enforcement.
 *
 * Uses REAL TypeORM migration machinery (dataSource.runMigrations()) — not
 * manual migration.up() invocation. This exercises the exact same migration
 * path the application uses in production.
 *
 * Architecture:
 *   Stage 1: Create a DataSource with ONLY the original 16 migration classes.
 *            Run dataSource.runMigrations() to create the pre-Sprint-29 schema.
 *   Stage 2: Seed valid pre-upgrade data (values that fit the old schema).
 *   Stage 3: Create a NEW DataSource with ALL 18 migration classes.
 *            Run dataSource.runMigrations() — TypeORM detects 16 as applied,
 *            executes only migrations 17/18.
 *   Stage 4: Verify data preservation, catalog schema, FK enforcement,
 *            delete-action, orphan fail-closed, expanded capacity.
 *
 * The script uses separate disposable databases for the orphan fail-closed test.
 *
 * Usage (inside the db-migration-compat GitHub Actions workflow):
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=irexpro_scenario_e \
 *   DB_USER=postgres DB_PASSWORD=ci_disposable \
 *   npx ts-node apps/api/scripts/validate-migration-scenario-e.ts
 *
 * Exits non-zero on any assertion failure.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');

// ── Types ────────────────────────────────────────────────────────────────────

interface ColumnMeta {
  column_name: string;
  data_type: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  character_maximum_length: number | null;
  is_nullable: string;
}

interface FkMeta {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_schema: string;
  parent_table: string;
  parent_column: string;
  delete_rule: string;
  validated: boolean | string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

/** Load a migration class constructor from a file. */
function loadMigrationClass(filename: string): any {
  const full = path.join(MIGRATIONS_DIR, filename);
  const mod = require(full);
  const className = Object.keys(mod).find((k) => {
    if (k === 'default') return false;
    return typeof mod[k] === 'function' && /^([A-Z])/.test(k);
  });
  if (!className) throw new Error(`No migration class found in ${filename}`);
  return mod[className];
}

/** Get all migration files sorted chronologically (excluding .spec.ts). */
function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && /^\d/.test(f))
    .sort();
}

/** Create a TypeORM DataSource with a specific subset of migration classes. */
function createDataSource(
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  migrationClasses: any[],
): DataSource {
  return new DataSource({
    type: 'postgres',
    host,
    port,
    database,
    username: user,
    password,
    synchronize: false,
    entities: [],
    migrations: migrationClasses,
    logging: false,
  });
}

/** Get column metadata from information_schema. */
async function getColumnMeta(
  client: Client,
  schema: string,
  table: string,
  column: string,
): Promise<ColumnMeta | null> {
  const result = await client.query<ColumnMeta>(
    `SELECT column_name, data_type, numeric_precision, numeric_scale,
            character_maximum_length, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/** Get FK metadata from pg_constraint. */
async function getFkMeta(
  client: Client,
  constraintName: string,
): Promise<FkMeta | null> {
  const result = await client.query<FkMeta>(
    `SELECT
       c.conname AS constraint_name,
       ns_child.nspname AS child_schema,
       cl_child.relname AS child_table,
       a_child.attname AS child_column,
       ns_parent.nspname AS parent_schema,
       cl_parent.relname AS parent_table,
       a_parent.attname AS parent_column,
       c.confdeltype AS delete_rule,
       c.convalidated AS validated
     FROM pg_constraint c
     JOIN pg_class cl_child ON cl_child.oid = c.conrelid
     JOIN pg_namespace ns_child ON ns_child.oid = cl_child.relnamespace
     JOIN pg_class cl_parent ON cl_parent.oid = c.confrelid
     JOIN pg_namespace ns_parent ON ns_parent.oid = cl_parent.relnamespace
     JOIN pg_attribute a_child ON a_child.attrelid = c.conrelid AND a_child.attnum = ANY(c.conkey)
     JOIN pg_attribute a_parent ON a_parent.attrelid = c.confrelid AND a_parent.attnum = ANY(c.confkey)
     WHERE c.contype = 'f' AND c.conname = $1`,
    [constraintName],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  const deleteRuleMap: Record<string, string> = { a: 'NO ACTION', c: 'CASCADE', r: 'RESTRICT', n: 'SET NULL', d: 'SET DEFAULT' };
  return { ...r, delete_rule: deleteRuleMap[r.delete_rule as string] || r.delete_rule };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== CI Scenario E — Existing DB Upgrade + FK Enforcement ===');

  const host = process.env.DB_HOST ?? 'localhost';
  const port = parseInt(process.env.DB_PORT ?? '5432', 10);
  const database = process.env.DB_NAME ?? 'irexpro_scenario_e';
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';

  // Load all migration class constructors
  const allFiles = getMigrationFiles();
  const allMigrationClasses = allFiles.map(loadMigrationClass);
  const originalFiles = allFiles.filter((f) => parseInt(f.split('-')[0], 10) <= 1752200000000);
  const originalMigrationClasses = originalFiles.map(loadMigrationClass);
  const newFiles = allFiles.filter((f) => parseInt(f.split('-')[0], 10) > 1752200000000);

  console.log(`  ${allFiles.length} total migration files (${originalFiles.length} original + ${newFiles.length} new)`);
  assert(originalFiles.length === 16, `expected 16 original migrations, found ${originalFiles.length}`);
  assert(newFiles.length === 2, `expected 2 new migrations, found ${newFiles.length}`);

  // ─── Stage 1: Apply original 16 migrations via real TypeORM ────────────
  console.log('\n=== Stage 1: Apply original 16 migrations via TypeORM runMigrations() ===');

  const ds1 = createDataSource(host, port, database, user, password, originalMigrationClasses);
  await ds1.initialize();
  await ds1.runMigrations();
  console.log('  TypeORM runMigrations() completed for original 16 migrations');

  // Verify TypeORM recorded exactly 16 migrations in its migrations table
  const rawClient1 = new Client({ host, port, database, user, password });
  await rawClient1.connect();
  try {
    const migrationCount = await rawClient1.query(`SELECT COUNT(*) AS count FROM migrations`);
    assert(parseInt(migrationCount.rows[0].count, 10) === 16, `TypeORM migrations table has 16 entries (got ${migrationCount.rows[0].count})`);
  } finally {
    await rawClient1.end();
  }
  await ds1.destroy();

  // ─── Stage 2: Seed valid pre-upgrade data ──────────────────────────────
  console.log('\n=== Stage 2: Seed valid pre-upgrade data ===');

  const seedClient = new Client({ host, port, database, user, password });
  await seedClient.connect();
  try {
    // User
    const userResult = await seedClient.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('scenario-e@upgrade.test', '+20000000001', 'hash_e', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const userId = userResult.rows[0].id;
    console.log(`  user id: ${userId}`);

    // Subscription plan — NO 'status' column exists on subscription_plans in the
    // 16-migration schema. The table has 'is_active' (boolean, default true) and
    // 'code' (varchar(50) NOT NULL UNIQUE — must be provided).
    const planResult = await seedClient.query(`
      INSERT INTO subscriptions.subscription_plans (name, code, billing_interval)
      VALUES ('Pro Trader', 'PRO-TRADER-E', 'MONTHLY')
      RETURNING id
    `);
    const planId = planResult.rows[0].id;
    console.log(`  plan id: ${planId}`);

    // Payment profile
    const ppResult = await seedClient.query(`
      INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
      VALUES ($1, 'stripe', 'cus_test_e001', 'US')
      RETURNING id
    `, [userId]);
    const ppId = ppResult.rows[0].id;
    console.log(`  payment profile id: ${ppId}`);

    // Subscription
    const subResult = await seedClient.query(`
      INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
      VALUES ($1, $2, 'ACTIVE')
      RETURNING id
    `, [userId, planId]);
    const subId = subResult.rows[0].id;
    console.log(`  subscription id: ${subId}`);

    // Broker connection — encryption_key_id EXACTLY 100 chars (old schema max: varchar(100))
    // 'env-key-v1-' is 11 chars, so 89 x's = 100 total.
    const oldKeyIdExact = 'env-key-v1-' + 'x'.repeat(89);
    assert(oldKeyIdExact.length === 100, `old encryption_key_id is exactly 100 chars (got ${oldKeyIdExact.length})`);
    const bcResult = await seedClient.query(`
      INSERT INTO broker.broker_connections (user_id, broker_id, broker_name, account_type, status, display_name, account_id, demo_validated, live_trading_enabled, encryption_key_id)
      VALUES ($1, 'paper-broker', 'Paper Broker', 'DEMO', 'CONNECTED', 'Demo E', 'acc-e-001', true, false, $2)
      RETURNING id
    `, [userId, oldKeyIdExact]);
    const bcId = bcResult.rows[0].id;
    console.log(`  broker connection id: ${bcId} (encryption_key_id: 100 chars)`);

    // Broker account
    const baResult = await seedClient.query(`
      INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin)
      VALUES ($1, 10000.12345678, 10000.12345678, 0)
      RETURNING id
    `, [bcId]);
    const baId = baResult.rows[0].id;
    console.log(`  broker account id: ${baId}`);

    // Trade with precision-sensitive values that ARE VALID in the old schema
    // lot_size: 9876.5432 (fits numeric(8,4) max of 9999.9999)
    // All prices/pnl: 8 decimal places (valid in numeric(18,8))
    const tradeResult = await seedClient.query(`
      INSERT INTO trading.trades (
        user_id, broker_connection_id, idempotency_key, instrument, direction,
        lot_size, requested_entry_price, fill_price, stop_loss, take_profit,
        status, realised_pnl, exit_price
      ) VALUES (
        $1, $2, 'trade-e-preserve-001', 'EUR/USD', 'BUY',
        '9876.5432', '1.12345678', '1.12345679', '1.11000000', '1.14000000',
        'CLOSED', '12345.67891234', '1.12345680'
      )
      RETURNING id, lot_size::text, requested_entry_price::text, fill_price::text,
                stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text
    `, [userId, bcId]);
    const tradeRow = tradeResult.rows[0];
    const tradeId = tradeRow.id;
    console.log(`  trade id: ${tradeId}`);
    console.log(`  lot_size: ${tradeRow.lot_size} (valid old-schema value <= 9999.9999)`);
    console.log(`  requested_entry_price: ${tradeRow.requested_entry_price} (8 decimal places)`);
    console.log(`  realised_pnl: ${tradeRow.realised_pnl} (8 decimal places)`);
  } finally {
    await seedClient.end();
  }

  // ─── Stage 3: Capture pre-upgrade state ────────────────────────────────
  console.log('\n=== Stage 3: Capture pre-upgrade state ===');

  let tradeValuesBefore: { rows: any[] } = { rows: [] };
  let rowCountBefore: { rows: any[] } = { rows: [] };

  const captureClient = new Client({ host, port, database, user, password });
  await captureClient.connect();
  try {
    // Catalog before
    const lotSizeBefore = await getColumnMeta(captureClient, 'trading', 'trades', 'lot_size');
    console.log(`  lot_size before: precision=${lotSizeBefore?.numeric_precision}, scale=${lotSizeBefore?.numeric_scale}`);
    assert(lotSizeBefore?.numeric_precision === 8 && lotSizeBefore?.numeric_scale === 4, `lot_size is numeric(8,4) before upgrade`);

    const encryptionKeyIdBefore = await getColumnMeta(captureClient, 'broker', 'broker_connections', 'encryption_key_id');
    console.log(`  encryption_key_id before: max_length=${encryptionKeyIdBefore?.character_maximum_length}`);
    assert(encryptionKeyIdBefore?.character_maximum_length === 100, `encryption_key_id is varchar(100) before upgrade`);

    // Capture exact financial values as strings
    tradeValuesBefore = await captureClient.query(`
      SELECT lot_size::text, requested_entry_price::text, fill_price::text,
             stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text,
             encryption_key_id
      FROM trading.trades t, broker.broker_connections bc
      WHERE t.broker_connection_id = bc.id AND t.idempotency_key = 'trade-e-preserve-001'
    `);
    console.log(`  captured trade values: ${JSON.stringify(tradeValuesBefore.rows[0])}`);

    // Capture row counts
    rowCountBefore = await captureClient.query(`
      SELECT
        (SELECT COUNT(*) FROM identity.users) AS users,
        (SELECT COUNT(*) FROM subscriptions.subscription_plans) AS plans,
        (SELECT COUNT(*) FROM subscriptions.user_payment_profiles) AS payment_profiles,
        (SELECT COUNT(*) FROM subscriptions.user_subscriptions) AS subscriptions,
        (SELECT COUNT(*) FROM broker.broker_connections) AS broker_connections,
        (SELECT COUNT(*) FROM broker.broker_accounts) AS broker_accounts,
        (SELECT COUNT(*) FROM trading.trades) AS trades
    `);
    console.log(`  row counts before: ${JSON.stringify(rowCountBefore.rows[0])}`);

    // Verify no Phase-1 FKs exist yet
    const fksBefore = await captureClient.query(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE c.contype = 'f' AND conname LIKE 'fk_%'
        AND ns.nspname IN ('subscriptions', 'broker')
    `);
    assert(fksBefore.rows.length === 0, `no Phase-1 FKs exist before upgrade (found ${fksBefore.rows.length})`);
  } finally {
    await captureClient.end();
  }

  // ─── Stage 4: Apply Sprint 29 migrations via real TypeORM ─────────────
  console.log('\n=== Stage 4: Apply Sprint 29 migrations via TypeORM runMigrations() ===');

  // Create a NEW DataSource with ALL 18 migration classes.
  // TypeORM should detect the original 16 as already applied and execute only 17/18.
  const ds2 = createDataSource(host, port, database, user, password, allMigrationClasses);
  await ds2.initialize();

  // showMigrations returns true if there are pending migrations
  const hasPending = await ds2.showMigrations();
  assert(hasPending === true, 'TypeORM detects 2 pending migrations (17/18)');

  await ds2.runMigrations();
  console.log('  TypeORM runMigrations() completed for all 18 migrations');

  // Verify TypeORM recorded exactly 18 migrations
  const verifyClient = new Client({ host, port, database, user, password });
  await verifyClient.connect();
  try {
    const migrationCountAfter = await verifyClient.query(`SELECT COUNT(*) AS count FROM migrations`);
    assert(parseInt(migrationCountAfter.rows[0].count, 10) === 18, `TypeORM migrations table has 18 entries (got ${migrationCountAfter.rows[0].count})`);
  } finally {
    await verifyClient.end();
  }
  await ds2.destroy();

  // ─── Stage 5: Verify data preservation ─────────────────────────────────
  console.log('\n=== Stage 5: Verify data preservation ===');

  const verifyClient2 = new Client({ host, port, database, user, password });
  await verifyClient2.connect();
  try {
    // Row counts unchanged
    const rowCountAfter = await verifyClient2.query(`
      SELECT
        (SELECT COUNT(*) FROM identity.users) AS users,
        (SELECT COUNT(*) FROM subscriptions.subscription_plans) AS plans,
        (SELECT COUNT(*) FROM subscriptions.user_payment_profiles) AS payment_profiles,
        (SELECT COUNT(*) FROM subscriptions.user_subscriptions) AS subscriptions,
        (SELECT COUNT(*) FROM broker.broker_connections) AS broker_connections,
        (SELECT COUNT(*) FROM broker.broker_accounts) AS broker_accounts,
        (SELECT COUNT(*) FROM trading.trades) AS trades
    `);
    const before = rowCountBefore.rows[0];
    const after = rowCountAfter.rows[0];
    assert(parseInt(after.users) === parseInt(before.users), 'user count unchanged');
    assert(parseInt(after.plans) === parseInt(before.plans), 'plan count unchanged');
    assert(parseInt(after.payment_profiles) === parseInt(before.payment_profiles), 'payment profile count unchanged');
    assert(parseInt(after.subscriptions) === parseInt(before.subscriptions), 'subscription count unchanged');
    assert(parseInt(after.broker_connections) === parseInt(before.broker_connections), 'broker connection count unchanged');
    assert(parseInt(after.broker_accounts) === parseInt(before.broker_accounts), 'broker account count unchanged');
    assert(parseInt(after.trades) === parseInt(before.trades), 'trade count unchanged');

    // Exact financial values unchanged (string comparison — no JS number conversion)
    const tradeValuesAfter = await verifyClient2.query(`
      SELECT lot_size::text, requested_entry_price::text, fill_price::text,
             stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text,
             encryption_key_id
      FROM trading.trades t, broker.broker_connections bc
      WHERE t.broker_connection_id = bc.id AND t.idempotency_key = 'trade-e-preserve-001'
    `);

    const beforeVals = tradeValuesBefore.rows[0];
    const afterVals = tradeValuesAfter.rows[0];
    assert(afterVals.lot_size === beforeVals.lot_size, `lot_size unchanged (${beforeVals.lot_size} → ${afterVals.lot_size})`);
    assert(afterVals.requested_entry_price === beforeVals.requested_entry_price, `requested_entry_price unchanged (${beforeVals.requested_entry_price} → ${afterVals.requested_entry_price})`);
    assert(afterVals.fill_price === beforeVals.fill_price, `fill_price unchanged`);
    assert(afterVals.stop_loss === beforeVals.stop_loss, `stop_loss unchanged`);
    assert(afterVals.take_profit === beforeVals.take_profit, `take_profit unchanged`);
    assert(afterVals.realised_pnl === beforeVals.realised_pnl, `realised_pnl unchanged (${beforeVals.realised_pnl} → ${afterVals.realised_pnl})`);
    assert(afterVals.exit_price === beforeVals.exit_price, `exit_price unchanged`);
    assert(afterVals.encryption_key_id === beforeVals.encryption_key_id, `encryption_key_id unchanged (100 chars preserved)`);

    // ─── Stage 6: Expanded capacity after upgrade ────────────────────────
    console.log('\n=== Stage 6: Expanded capacity after upgrade ===');

    // Insert a new trade with lot_size > 9999.9999 (only valid after widening to numeric(10,4))
    const expandedTrade = await verifyClient2.query(`
      INSERT INTO trading.trades (
        user_id, broker_connection_id, idempotency_key, instrument, direction,
        lot_size, requested_entry_price, fill_price, stop_loss, take_profit,
        status
      ) VALUES (
        (SELECT id FROM identity.users WHERE email = 'scenario-e@upgrade.test'),
        (SELECT id FROM broker.broker_connections WHERE display_name = 'Demo E'),
        'trade-e-expanded-001', 'EUR/USD', 'BUY',
        '15000.0000', '1.12345678', '1.12345679', '1.11000000', '1.14000000',
        'PENDING'
      )
      RETURNING lot_size::text
    `);
    assert(expandedTrade.rows[0].lot_size === '15000.0000', `expanded lot_size 15000.0000 accepted and stored exactly (got ${expandedTrade.rows[0].lot_size})`);

    // Insert a new broker connection with encryption_key_id > 100 chars (only valid after widening to varchar(255))
    const newKeyId = 'env-key-v2-' + 'y'.repeat(190); // 11 + 190 = 201 chars
    assert(newKeyId.length === 201, `new encryption_key_id is 201 chars`);
    const expandedBc = await verifyClient2.query(`
      INSERT INTO broker.broker_connections (user_id, broker_id, broker_name, account_type, status, display_name, account_id, demo_validated, live_trading_enabled, encryption_key_id)
      VALUES (
        (SELECT id FROM identity.users WHERE email = 'scenario-e@upgrade.test'),
        'paper-broker', 'Paper Broker', 'DEMO', 'CONNECTED', 'Expanded Key', 'acc-e-002', true, false, $1
      )
      RETURNING encryption_key_id
    `, [newKeyId]);
    assert(expandedBc.rows[0].encryption_key_id === newKeyId, `expanded encryption_key_id (201 chars) accepted and stored exactly without truncation`);

    // ─── Stage 7: Catalog schema assertions ──────────────────────────────
    console.log('\n=== Stage 7: Catalog schema assertions ===');

    const lotSizeAfter = await getColumnMeta(verifyClient2, 'trading', 'trades', 'lot_size');
    assert(lotSizeAfter?.numeric_precision === 10 && lotSizeAfter?.numeric_scale === 4, `lot_size = numeric(10,4) (got precision=${lotSizeAfter?.numeric_precision}, scale=${lotSizeAfter?.numeric_scale})`);

    const realisedPnlAfter = await getColumnMeta(verifyClient2, 'trading', 'trades', 'realised_pnl');
    assert(realisedPnlAfter?.numeric_precision === 18 && realisedPnlAfter?.numeric_scale === 8, `realised_pnl = numeric(18,8) (got precision=${realisedPnlAfter?.numeric_precision}, scale=${realisedPnlAfter?.numeric_scale})`);

    for (const col of ['requested_entry_price', 'fill_price', 'stop_loss', 'take_profit', 'exit_price']) {
      const meta = await getColumnMeta(verifyClient2, 'trading', 'trades', col);
      assert(meta?.numeric_precision === 18 && meta?.numeric_scale === 8, `${col} = numeric(18,8)`);
    }

    const encryptionKeyIdAfter = await getColumnMeta(verifyClient2, 'broker', 'broker_connections', 'encryption_key_id');
    assert(encryptionKeyIdAfter?.character_maximum_length === 255, `encryption_key_id = varchar(255) (got ${encryptionKeyIdAfter?.character_maximum_length})`);

    // ─── Stage 8: FK catalog assertions ──────────────────────────────────
    console.log('\n=== Stage 8: FK catalog assertions ===');

    const fk1 = await getFkMeta(verifyClient2, 'fk_user_payment_profiles_user_id');
    assert(fk1 !== null, 'FK fk_user_payment_profiles_user_id exists');
    if (fk1) {
      assert(fk1.child_schema === 'subscriptions' && fk1.child_table === 'user_payment_profiles' && fk1.child_column === 'user_id', `FK1 child correct`);
      assert(fk1.parent_schema === 'identity' && fk1.parent_table === 'users' && fk1.parent_column === 'id', `FK1 parent correct`);
      assert(fk1.delete_rule === 'CASCADE', `FK1 delete rule: CASCADE (got ${fk1.delete_rule})`);
      assert(fk1.validated === true || fk1.validated === 't' || fk1.validated === 'true', `FK1 validated: true`);
    }

    const fk2 = await getFkMeta(verifyClient2, 'fk_user_subscriptions_user_id');
    assert(fk2 !== null, 'FK fk_user_subscriptions_user_id exists');
    if (fk2) {
      assert(fk2.delete_rule === 'CASCADE', `FK2 delete rule: CASCADE (got ${fk2.delete_rule})`);
      assert(fk2.validated === true || fk2.validated === 't' || fk2.validated === 'true', `FK2 validated: true`);
    }

    const fk3 = await getFkMeta(verifyClient2, 'fk_user_subscriptions_subscription_plan_id');
    assert(fk3 !== null, 'FK fk_user_subscriptions_subscription_plan_id exists');
    if (fk3) {
      assert(fk3.delete_rule === 'NO ACTION', `FK3 delete rule: NO ACTION (got ${fk3.delete_rule})`);
      assert(fk3.validated === true || fk3.validated === 't' || fk3.validated === 'true', `FK3 validated: true`);
    }

    const fk4 = await getFkMeta(verifyClient2, 'fk_broker_accounts_broker_connection_id');
    assert(fk4 !== null, 'FK fk_broker_accounts_broker_connection_id exists');
    if (fk4) {
      assert(fk4.delete_rule === 'CASCADE', `FK4 delete rule: CASCADE (got ${fk4.delete_rule})`);
      assert(fk4.validated === true || fk4.validated === 't' || fk4.validated === 'true', `FK4 validated: true`);
    }

    // ─── Stage 9: FK negative enforcement tests ──────────────────────────
    console.log('\n=== Stage 9: FK negative enforcement tests ===');

    // FK1: invalid user_payment_profiles.user_id
    try {
      await verifyClient2.query(`INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code) VALUES ('00000000-0000-0000-0000-999999999999', 'stripe', 'cus_invalid_1', 'US')`);
      throw new Error('FK1: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK1 rejects invalid user_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_payment_profiles_user_id', `FK1 constraint name correct`);
    }

    // FK2: invalid user_subscriptions.user_id
    try {
      const planId = (await verifyClient2.query(`SELECT id FROM subscriptions.subscription_plans WHERE name = 'Pro Trader'`)).rows[0].id;
      await verifyClient2.query(`INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status) VALUES ('00000000-0000-0000-0000-999999999999', $1, 'ACTIVE')`, [planId]);
      throw new Error('FK2: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK2 rejects invalid user_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_user_id', `FK2 constraint name correct`);
    }

    // FK3: invalid subscription_plan_id
    try {
      const userId = (await verifyClient2.query(`SELECT id FROM identity.users WHERE email = 'scenario-e@upgrade.test'`)).rows[0].id;
      await verifyClient2.query(`INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status) VALUES ($1, '00000000-0000-0000-0000-999999999999', 'ACTIVE')`, [userId]);
      throw new Error('FK3: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK3 rejects invalid plan_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_subscription_plan_id', `FK3 constraint name correct`);
    }

    // FK4: invalid broker_accounts.broker_connection_id
    try {
      await verifyClient2.query(`INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin) VALUES ('00000000-0000-0000-0000-999999999999', 0, 0, 0)`);
      throw new Error('FK4: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK4 rejects invalid connection_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_broker_accounts_broker_connection_id', `FK4 constraint name correct`);
    }

    // ─── Stage 10: FK delete-action tests ────────────────────────────────
    console.log('\n=== Stage 10: FK delete-action tests ===');

    // FK1 CASCADE: delete user → payment profile cascade-deleted
    const delUser1 = await verifyClient2.query(`INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency) VALUES ('del1@e.test', '+20000000099', 'h', 'ACTIVE', 'US', 'UTC', 'USD') RETURNING id`);
    await verifyClient2.query(`INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code) VALUES ($1, 'stripe', 'cus_del_pp', 'US')`, [delUser1.rows[0].id]);
    await verifyClient2.query(`DELETE FROM identity.users WHERE id = $1`, [delUser1.rows[0].id]);
    const orphanPP = await verifyClient2.query(`SELECT COUNT(*) AS count FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_del_pp'`);
    assert(parseInt(orphanPP.rows[0].count, 10) === 0, 'FK1 CASCADE: payment profile deleted when user deleted');

    // FK2 CASCADE: delete user → subscription cascade-deleted
    const delUser2 = await verifyClient2.query(`INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency) VALUES ('del2@e.test', '+20000000098', 'h', 'ACTIVE', 'US', 'UTC', 'USD') RETURNING id`);
    const planId = (await verifyClient2.query(`SELECT id FROM subscriptions.subscription_plans WHERE name = 'Pro Trader'`)).rows[0].id;
    await verifyClient2.query(`INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status) VALUES ($1, $2, 'ACTIVE')`, [delUser2.rows[0].id, planId]);
    await verifyClient2.query(`DELETE FROM identity.users WHERE id = $1`, [delUser2.rows[0].id]);
    const orphanSub = await verifyClient2.query(`SELECT COUNT(*) AS count FROM subscriptions.user_subscriptions WHERE user_id = $1`, [delUser2.rows[0].id]);
    assert(parseInt(orphanSub.rows[0].count, 10) === 0, 'FK2 CASCADE: subscription deleted when user deleted');

    // FK3 NO ACTION: cannot delete plan while subscription references it
    const delUser3 = await verifyClient2.query(`INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency) VALUES ('del3@e.test', '+20000000097', 'h', 'ACTIVE', 'US', 'UTC', 'USD') RETURNING id`);
    await verifyClient2.query(`INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status) VALUES ($1, $2, 'ACTIVE')`, [delUser3.rows[0].id, planId]);
    try {
      await verifyClient2.query(`DELETE FROM subscriptions.subscription_plans WHERE id = $1`, [planId]);
      throw new Error('FK3: DELETE should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK3 NO ACTION: plan deletion rejected with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_subscription_plan_id', `FK3 constraint name correct`);
    }
    // Clean up: delete subscription first, then plan
    await verifyClient2.query(`DELETE FROM identity.users WHERE id = $1`, [delUser3.rows[0].id]);

    // FK4 CASCADE: delete broker connection → broker account cascade-deleted
    const delUser4 = await verifyClient2.query(`INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency) VALUES ('del4@e.test', '+20000000096', 'h', 'ACTIVE', 'US', 'UTC', 'USD') RETURNING id`);
    const delBc = await verifyClient2.query(`INSERT INTO broker.broker_connections (user_id, broker_id, broker_name, account_type, status, display_name, account_id, demo_validated, live_trading_enabled) VALUES ($1, 'paper-broker', 'Paper Broker', 'DEMO', 'CONNECTED', 'Del Bc', 'acc-del-001', true, false) RETURNING id`, [delUser4.rows[0].id]);
    await verifyClient2.query(`INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin) VALUES ($1, 0, 0, 0)`, [delBc.rows[0].id]);
    await verifyClient2.query(`DELETE FROM broker.broker_connections WHERE id = $1`, [delBc.rows[0].id]);
    const orphanBa = await verifyClient2.query(`SELECT COUNT(*) AS count FROM broker.broker_accounts WHERE broker_connection_id = $1`, [delBc.rows[0].id]);
    assert(parseInt(orphanBa.rows[0].count, 10) === 0, 'FK4 CASCADE: broker account deleted when connection deleted');
    await verifyClient2.query(`DELETE FROM identity.users WHERE id = $1`, [delUser4.rows[0].id]);
  } finally {
    await verifyClient2.end();
  }

  // ─── Stage 11: Orphan-data fail-closed test ────────────────────────────
  console.log('\n=== Stage 11: Orphan-data fail-closed test (separate DB) ===');

  // Create a separate disposable database for the orphan test
  const adminClient = new Client({ host, port, database, user, password });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE irexpro_scenario_e_orphan`);
  await adminClient.end();

  // Apply original 16 migrations via TypeORM
  const orphanDs = createDataSource(host, port, 'irexpro_scenario_e_orphan', user, password, originalMigrationClasses);
  await orphanDs.initialize();
  await orphanDs.runMigrations();
  await orphanDs.destroy();

  // Insert an orphan payment profile (user_id references nonexistent user)
  const orphanSeedClient = new Client({ host, port, database: 'irexpro_scenario_e_orphan', user, password });
  await orphanSeedClient.connect();
  try {
    await orphanSeedClient.query(`
      INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
      VALUES ('00000000-0000-0000-0000-999999999999', 'stripe', 'cus_orphan_001', 'US')
    `);
    console.log('  inserted orphan payment profile with nonexistent user_id');

    // Attempt to run ALL 18 migrations via TypeORM — should fail at migration 18
    const orphanDs2 = createDataSource(host, port, 'irexpro_scenario_e_orphan', user, password, allMigrationClasses);
    await orphanDs2.initialize();

    try {
      await orphanDs2.runMigrations();
      throw new Error('Orphan test: runMigrations should have FAILED');
    } catch (err: any) {
      // TypeORM wraps the PostgreSQL error; check for FK violation
      const isFkViolation = err.code === '23503' ||
        err.message.includes('foreign key') ||
        err.message.includes('violates') ||
        (err.message.includes('migration') && err.message.includes('fail'));
      assert(isFkViolation, `Migration fails with FK violation on orphan data (code=${err.code}, message=${err.message.substring(0, 150)})`);
      console.log(`  ✓ migration correctly rejected orphan data`);
    }

    await orphanDs2.destroy();

    // Verify orphan row still exists (not silently deleted/modified)
    const orphanCount = await orphanSeedClient.query(`SELECT COUNT(*)::int AS count FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_orphan_001'`);
    assert(orphanCount.rows[0].count === 1, 'orphan row still exists after failed migration (not silently deleted)');
    const orphanRow = await orphanSeedClient.query(`SELECT user_id::text FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_orphan_001'`);
    assert(orphanRow.rows[0].user_id === '00000000-0000-0000-0000-999999999999', 'orphan user_id unchanged (not nulled or modified)');
  } finally {
    await orphanSeedClient.end();
  }

  // ─── Lock/deployment strategy report ──────────────────────────────────
  console.log('\n=== Lock/deployment strategy ===');
  console.log('  Strategy: direct ADD CONSTRAINT within TypeORM migration transaction');
  console.log('  Rationale: Tables are startup-scale. ADD CONSTRAINT acquires');
  console.log('  ACCESS EXCLUSIVE lock briefly; does NOT rewrite table data.');
  console.log('  For very large tables, NOT VALID + VALIDATE CONSTRAINT');
  console.log('  would be preferable. Current approach is acceptable for Phase 1.');

  console.log('\n=== ALL SCENARIO E ASSERTIONS PASSED ===');
}

main().catch((err) => {
  console.error('\n=== SCENARIO E FAILED ===');
  console.error(err);
  process.exit(1);
});
