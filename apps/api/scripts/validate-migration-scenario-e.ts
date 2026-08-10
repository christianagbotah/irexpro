/**
 * CI Scenario E — Existing pre-Sprint-29 DB upgrade + FK enforcement.
 *
 * This script proves that Sprint 29 Phase 1 migrations (1752300000000 and
 * 1752400000000) can upgrade an EXISTING database that is already at the
 * 16-migration baseline, preserving all data and adding the 4 FKs correctly.
 *
 * It also proves:
 *   - FK enforcement (negative tests with nonexistent UUIDs)
 *   - FK delete-action behavior (CASCADE for 3 FKs, NO ACTION for 1)
 *   - Orphan-data fail-closed (migration 18 fails if orphan rows exist)
 *   - Precision preservation (numeric(18,8) values unchanged after upgrade)
 *   - Catalog verification (column types, FK constraint metadata)
 *
 * Usage (inside the db-migration-compat GitHub Actions workflow):
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=irexpro_scenario_e \
 *   DB_USER=postgres DB_PASSWORD=ci_disposable \
 *   npx ts-node apps/api/scripts/validate-migration-scenario-e.ts
 *
 * Exits non-zero on any assertion failure.
 */
import { Client } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');

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

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function buildQueryRunner(client: Client) {
  return {
    async query(query: string, params?: unknown[]) {
      const result = await client.query(query, params as never[]);
      return result.rows;
    },
  };
}

async function loadMigrationInstance(filename: string): Promise<any> {
  const full = path.join(MIGRATIONS_DIR, filename);
  const mod = require(full);
  const className = Object.keys(mod).find((k) => {
    if (k === 'default') return false;
    return typeof mod[k] === 'function' && /^([A-Z])/.test(k);
  });
  if (!className) throw new Error(`No migration class found in ${filename}`);
  return new mod[className]();
}

/** Get all migration files sorted chronologically (excluding .spec.ts). */
function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && /^\d/.test(f))
    .sort();
}

/** Run a single migration's up() against the DB and record it. */
async function runMigrationUp(client: Client, filename: string): Promise<void> {
  const instance = await loadMigrationInstance(filename);
  const timestamp = parseInt(filename.split('-')[0], 10);
  const queryRunner = buildQueryRunner(client);
  console.log(`  → running ${filename}`);
  await instance.up(queryRunner);
  await client.query(
    `INSERT INTO migrations_table (timestamp, name) VALUES ($1, $2)`,
    [timestamp, instance.name],
  );
  console.log(`     ✓ ${instance.name}`);
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
  // confdeltype: 'a' = NO ACTION, 'c' = CASCADE, 'r' = RESTRICT, 'n' = SET NULL, 'd' = SET DEFAULT
  const deleteRuleMap: Record<string, string> = { a: 'NO ACTION', c: 'CASCADE', r: 'RESTRICT', n: 'SET NULL', d: 'SET DEFAULT' };
  return { ...r, delete_rule: deleteRuleMap[r.delete_rule] || r.delete_rule };
}

async function main(): Promise<void> {
  console.log('=== CI Scenario E — Existing DB Upgrade + FK Enforcement ===');

  const host = process.env.DB_HOST ?? 'localhost';
  const port = parseInt(process.env.DB_PORT ?? '5432', 10);
  const database = process.env.DB_NAME ?? 'irexpro_scenario_e';
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';

  console.log(`connecting to postgresql://${user}@${host}:${port}/${database}`);
  const client = new Client({ host, port, database, user, password });
  await client.connect();

  try {
    // ─── 1. Create migrations_table and apply original 16 migrations ──────
    console.log('\n=== 1. Apply original 16 migrations (pre-Sprint-29 baseline) ===');
    await client.query(`CREATE SCHEMA IF NOT EXISTS public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_table (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL
      )
    `);

    const allFiles = getMigrationFiles();
    const originalFiles = allFiles.filter((f) => parseInt(f.split('-')[0], 10) <= 1752200000000);
    console.log(`  ${originalFiles.length} original migration files`);
    assert(originalFiles.length === 16, `expected 16 original migrations, found ${originalFiles.length}`);

    for (const file of originalFiles) {
      await runMigrationUp(client, file);
    }

    const migrationCount = await client.query(`SELECT COUNT(*) AS count FROM migrations_table`);
    assert(parseInt(migrationCount.rows[0].count, 10) === 16, `migrations_table has 16 entries (got ${migrationCount.rows[0].count})`);

    // ─── 2. Seed representative existing data ──────────────────────────────
    console.log('\n=== 2. Seed representative existing data ===');

    // User
    const userResult = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('scenario-e@upgrade.test', '+20000000001', 'hash_e', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const userId = userResult.rows[0].id;
    console.log(`  user id: ${userId}`);

    // Subscription plan
    const planResult = await client.query(`
      INSERT INTO subscriptions.subscription_plans (name, billing_interval, status)
      VALUES ('Pro Trader', 'MONTHLY', 'ACTIVE')
      RETURNING id
    `);
    const planId = planResult.rows[0].id;
    console.log(`  plan id: ${planId}`);

    // Payment profile
    const ppResult = await client.query(`
      INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
      VALUES ($1, 'stripe', 'cus_test_e001', 'US')
      RETURNING id
    `, [userId]);
    const ppId = ppResult.rows[0].id;
    console.log(`  payment profile id: ${ppId}`);

    // Subscription
    const subResult = await client.query(`
      INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
      VALUES ($1, $2, 'ACTIVE')
      RETURNING id
    `, [userId, planId]);
    const subId = subResult.rows[0].id;
    console.log(`  subscription id: ${subId}`);

    // Broker connection
    const bcResult = await client.query(`
      INSERT INTO broker.broker_connections (user_id, broker_id, broker_name, account_type, status, display_name, account_id, demo_validated, live_trading_enabled, encryption_key_id)
      VALUES ($1, 'paper-broker', 'Paper Broker', 'DEMO', 'CONNECTED', 'Demo E', 'acc-e-001', true, false, 'env-key-v1-aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh-iiii-jjjj-kkkk-llll-mmmm-nnnn-oooo-pppp-qqqq-rrrr-ssss-tttt-u')
      RETURNING id
    `, [userId]);
    const bcId = bcResult.rows[0].id;
    console.log(`  broker connection id: ${bcId}`);

    // Broker account
    const baResult = await client.query(`
      INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin)
      VALUES ($1, 10000.12345678, 10000.12345678, 0)
      RETURNING id
    `, [bcId]);
    const baId = baResult.rows[0].id;
    console.log(`  broker account id: ${baId}`);

    // Trade with precision-sensitive values
    // Use values with 8 decimal places for numeric(18,8) fields
    // and a lot_size > 9999.9999 (old max) but < 999999.9999 (new max)
    const tradeResult = await client.query(`
      INSERT INTO trading.trades (
        user_id, broker_connection_id, idempotency_key, instrument, direction,
        lot_size, requested_entry_price, fill_price, stop_loss, take_profit,
        status, realised_pnl, exit_price
      ) VALUES (
        $1, $2, 'trade-e-precision-001', 'EUR/USD', 'BUY',
        '15000.0000', '1.12345678', '1.12345679', '1.11000000', '1.14000000',
        'CLOSED', '12345.67891234', '1.12345680'
      )
      RETURNING id, lot_size::text, requested_entry_price::text, fill_price::text,
                stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text
    `, [userId, bcId]);
    const tradeRow = tradeResult.rows[0];
    const tradeId = tradeRow.id;
    console.log(`  trade id: ${tradeId}`);
    console.log(`  lot_size: ${tradeRow.lot_size}`);
    console.log(`  requested_entry_price: ${tradeRow.requested_entry_price}`);
    console.log(`  realised_pnl: ${tradeRow.realised_pnl}`);

    // ─── 3. Capture pre-upgrade state ─────────────────────────────────────
    console.log('\n=== 3. Capture pre-upgrade state ===');

    // Capture catalog definitions before upgrade
    const lotSizeBefore = await getColumnMeta(client, 'trading', 'trades', 'lot_size');
    const realisedPnlBefore = await getColumnMeta(client, 'trading', 'trades', 'realised_pnl');
    const entryPriceBefore = await getColumnMeta(client, 'trading', 'trades', 'requested_entry_price');
    const encryptionKeyIdBefore = await getColumnMeta(client, 'broker', 'broker_connections', 'encryption_key_id');

    console.log(`  lot_size before: precision=${lotSizeBefore?.numeric_precision}, scale=${lotSizeBefore?.numeric_scale}`);
    console.log(`  realised_pnl before: precision=${realisedPnlBefore?.numeric_precision}, scale=${realisedPnlBefore?.numeric_scale}`);
    console.log(`  requested_entry_price before: precision=${entryPriceBefore?.numeric_precision}, scale=${entryPriceBefore?.numeric_scale}`);
    console.log(`  encryption_key_id before: max_length=${encryptionKeyIdBefore?.character_maximum_length}`);

    // Capture exact financial values as strings
    const tradeValuesBefore = await client.query(`
      SELECT lot_size::text, requested_entry_price::text, fill_price::text,
             stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text,
             encryption_key_id
      FROM trading.trades t, broker.broker_connections bc
      WHERE t.broker_connection_id = bc.id
      LIMIT 1
    `);

    // Capture row counts
    const rowCountBefore = await client.query(`
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

    // Verify no FKs exist yet
    const fksBefore = await client.query(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE c.contype = 'f'
        AND ns.nspname IN ('subscriptions', 'broker')
        AND conname LIKE 'fk_%'
    `);
    assert(fksBefore.rows.length === 0, `no Phase-1 FKs exist before upgrade (found ${fksBefore.rows.length})`);

    // ─── 4. Apply Sprint 29 migrations (17 and 18) ────────────────────────
    console.log('\n=== 4. Apply Sprint 29 migrations (1752300000000, 1752400000000) ===');
    const newFiles = allFiles.filter((f) => {
      const ts = parseInt(f.split('-')[0], 10);
      return ts > 1752200000000;
    });
    console.log(`  ${newFiles.length} new migration files`);
    assert(newFiles.length === 2, `expected 2 new migrations, found ${newFiles.length}`);

    for (const file of newFiles) {
      await runMigrationUp(client, file);
    }

    const migrationCountAfter = await client.query(`SELECT COUNT(*) AS count FROM migrations_table`);
    assert(parseInt(migrationCountAfter.rows[0].count, 10) === 18, `migrations_table has 18 entries (got ${migrationCountAfter.rows[0].count})`);

    // ─── 5. Verify data preservation ──────────────────────────────────────
    console.log('\n=== 5. Verify data preservation ===');

    // Row counts unchanged
    const rowCountAfter = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM identity.users) AS users,
        (SELECT COUNT(*) FROM subscriptions.subscription_plans) AS plans,
        (SELECT COUNT(*) FROM subscriptions.user_payment_profiles) AS payment_profiles,
        (SELECT COUNT(*) FROM subscriptions.user_subscriptions) AS subscriptions,
        (SELECT COUNT(*) FROM broker.broker_connections) AS broker_connections,
        (SELECT COUNT(*) FROM broker.broker_accounts) AS broker_accounts,
        (SELECT COUNT(*) FROM trading.trades) AS trades
    `);
    assert(rowCountAfter.rows[0].users === rowCountBefore.rows[0].users, 'user count unchanged');
    assert(rowCountAfter.rows[0].plans === rowCountBefore.rows[0].plans, 'plan count unchanged');
    assert(rowCountAfter.rows[0].payment_profiles === rowCountBefore.rows[0].payment_profiles, 'payment profile count unchanged');
    assert(rowCountAfter.rows[0].subscriptions === rowCountBefore.rows[0].subscriptions, 'subscription count unchanged');
    assert(rowCountAfter.rows[0].broker_connections === rowCountBefore.rows[0].broker_connections, 'broker connection count unchanged');
    assert(rowCountAfter.rows[0].broker_accounts === rowCountBefore.rows[0].broker_accounts, 'broker account count unchanged');
    assert(rowCountAfter.rows[0].trades === rowCountBefore.rows[0].trades, 'trade count unchanged');

    // IDs unchanged
    const idsAfter = await client.query(`
      SELECT
        (SELECT id FROM identity.users WHERE email = 'scenario-e@upgrade.test') AS user_id,
        (SELECT id FROM subscriptions.subscription_plans WHERE name = 'Pro Trader') AS plan_id,
        (SELECT id FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_test_e001') AS pp_id,
        (SELECT id FROM subscriptions.user_subscriptions WHERE user_id = (SELECT id FROM identity.users WHERE email = 'scenario-e@upgrade.test') LIMIT 1) AS sub_id,
        (SELECT id FROM broker.broker_connections WHERE display_name = 'Demo E') AS bc_id,
        (SELECT id FROM broker.broker_accounts WHERE broker_connection_id = (SELECT id FROM broker.broker_connections WHERE display_name = 'Demo E')) AS ba_id
    `);
    assert(idsAfter.rows[0].user_id === userId, `user ID unchanged (${userId})`);
    assert(idsAfter.rows[0].plan_id === planId, `plan ID unchanged (${planId})`);
    assert(idsAfter.rows[0].pp_id === ppId, `payment profile ID unchanged (${ppId})`);
    assert(idsAfter.rows[0].sub_id === subId, `subscription ID unchanged (${subId})`);
    assert(idsAfter.rows[0].bc_id === bcId, `broker connection ID unchanged (${bcId})`);
    assert(idsAfter.rows[0].ba_id === baId, `broker account ID unchanged (${baId})`);

    // Exact financial values unchanged (string comparison)
    const tradeValuesAfter = await client.query(`
      SELECT lot_size::text, requested_entry_price::text, fill_price::text,
             stop_loss::text, take_profit::text, realised_pnl::text, exit_price::text,
             encryption_key_id
      FROM trading.trades t, broker.broker_connections bc
      WHERE t.broker_connection_id = bc.id AND t.idempotency_key = 'trade-e-precision-001'
    `);

    assert(tradeValuesAfter.rows[0].lot_size === tradeValuesBefore.rows[0].lot_size, `lot_size unchanged (${tradeValuesBefore.rows[0].lot_size} → ${tradeValuesAfter.rows[0].lot_size})`);
    assert(tradeValuesAfter.rows[0].requested_entry_price === tradeValuesBefore.rows[0].requested_entry_price, `requested_entry_price unchanged (${tradeValuesBefore.rows[0].requested_entry_price} → ${tradeValuesAfter.rows[0].requested_entry_price})`);
    assert(tradeValuesAfter.rows[0].fill_price === tradeValuesBefore.rows[0].fill_price, `fill_price unchanged`);
    assert(tradeValuesAfter.rows[0].stop_loss === tradeValuesBefore.rows[0].stop_loss, `stop_loss unchanged`);
    assert(tradeValuesAfter.rows[0].take_profit === tradeValuesBefore.rows[0].take_profit, `take_profit unchanged`);
    assert(tradeValuesAfter.rows[0].realised_pnl === tradeValuesBefore.rows[0].realised_pnl, `realised_pnl unchanged (${tradeValuesBefore.rows[0].realised_pnl} → ${tradeValuesAfter.rows[0].realised_pnl})`);
    assert(tradeValuesAfter.rows[0].exit_price === tradeValuesBefore.rows[0].exit_price, `exit_price unchanged`);
    assert(tradeValuesAfter.rows[0].encryption_key_id === tradeValuesBefore.rows[0].encryption_key_id, `encryption_key_id unchanged`);

    // ─── 6. Catalog schema assertions ─────────────────────────────────────
    console.log('\n=== 6. Catalog schema assertions ===');

    const lotSizeAfter = await getColumnMeta(client, 'trading', 'trades', 'lot_size');
    assert(lotSizeAfter?.numeric_precision === 10 && lotSizeAfter?.numeric_scale === 4, `lot_size = numeric(10,4) (got precision=${lotSizeAfter?.numeric_precision}, scale=${lotSizeAfter?.numeric_scale})`);

    const realisedPnlAfter = await getColumnMeta(client, 'trading', 'trades', 'realised_pnl');
    assert(realisedPnlAfter?.numeric_precision === 18 && realisedPnlAfter?.numeric_scale === 8, `realised_pnl = numeric(18,8) (got precision=${realisedPnlAfter?.numeric_precision}, scale=${realisedPnlAfter?.numeric_scale})`);

    const entryPriceAfter = await getColumnMeta(client, 'trading', 'trades', 'requested_entry_price');
    assert(entryPriceAfter?.numeric_precision === 18 && entryPriceAfter?.numeric_scale === 8, `requested_entry_price = numeric(18,8)`);

    const fillPriceAfter = await getColumnMeta(client, 'trading', 'trades', 'fill_price');
    assert(fillPriceAfter?.numeric_precision === 18 && fillPriceAfter?.numeric_scale === 8, `fill_price = numeric(18,8)`);

    const stopLossAfter = await getColumnMeta(client, 'trading', 'trades', 'stop_loss');
    assert(stopLossAfter?.numeric_precision === 18 && stopLossAfter?.numeric_scale === 8, `stop_loss = numeric(18,8)`);

    const takeProfitAfter = await getColumnMeta(client, 'trading', 'trades', 'take_profit');
    assert(takeProfitAfter?.numeric_precision === 18 && takeProfitAfter?.numeric_scale === 8, `take_profit = numeric(18,8)`);

    const exitPriceAfter = await getColumnMeta(client, 'trading', 'trades', 'exit_price');
    assert(exitPriceAfter?.numeric_precision === 18 && exitPriceAfter?.numeric_scale === 8, `exit_price = numeric(18,8)`);

    const encryptionKeyIdAfter = await getColumnMeta(client, 'broker', 'broker_connections', 'encryption_key_id');
    assert(encryptionKeyIdAfter?.character_maximum_length === 255, `encryption_key_id = varchar(255) (got ${encryptionKeyIdAfter?.character_maximum_length})`);

    // ─── 7. FK catalog assertions ─────────────────────────────────────────
    console.log('\n=== 7. FK catalog assertions ===');

    const fk1 = await getFkMeta(client, 'fk_user_payment_profiles_user_id');
    assert(fk1 !== null, 'FK fk_user_payment_profiles_user_id exists');
    if (fk1) {
      assert(fk1.child_schema === 'subscriptions' && fk1.child_table === 'user_payment_profiles' && fk1.child_column === 'user_id', `FK1 child: ${fk1.child_schema}.${fk1.child_table}.${fk1.child_column}`);
      assert(fk1.parent_schema === 'identity' && fk1.parent_table === 'users' && fk1.parent_column === 'id', `FK1 parent: ${fk1.parent_schema}.${fk1.parent_table}.${fk1.parent_column}`);
      assert(fk1.delete_rule === 'CASCADE', `FK1 delete rule: CASCADE (got ${fk1.delete_rule})`);
      assert(fk1.validated === true || fk1.validated === 't' || fk1.validated === 'true', `FK1 validated: true`);
    }

    const fk2 = await getFkMeta(client, 'fk_user_subscriptions_user_id');
    assert(fk2 !== null, 'FK fk_user_subscriptions_user_id exists');
    if (fk2) {
      assert(fk2.child_column === 'user_id' && fk2.parent_table === 'users', `FK2 child/parent correct`);
      assert(fk2.delete_rule === 'CASCADE', `FK2 delete rule: CASCADE (got ${fk2.delete_rule})`);
      assert(fk2.validated === true || fk2.validated === 't' || fk2.validated === 'true', `FK2 validated: true`);
    }

    const fk3 = await getFkMeta(client, 'fk_user_subscriptions_subscription_plan_id');
    assert(fk3 !== null, 'FK fk_user_subscriptions_subscription_plan_id exists');
    if (fk3) {
      assert(fk3.child_column === 'subscription_plan_id' && fk3.parent_table === 'subscription_plans', `FK3 child/parent correct`);
      assert(fk3.delete_rule === 'NO ACTION', `FK3 delete rule: NO ACTION (got ${fk3.delete_rule})`);
      assert(fk3.validated === true || fk3.validated === 't' || fk3.validated === 'true', `FK3 validated: true`);
    }

    const fk4 = await getFkMeta(client, 'fk_broker_accounts_broker_connection_id');
    assert(fk4 !== null, 'FK fk_broker_accounts_broker_connection_id exists');
    if (fk4) {
      assert(fk4.child_column === 'broker_connection_id' && fk4.parent_table === 'broker_connections', `FK4 child/parent correct`);
      assert(fk4.delete_rule === 'CASCADE', `FK4 delete rule: CASCADE (got ${fk4.delete_rule})`);
      assert(fk4.validated === true || fk4.validated === 't' || fk4.validated === 'true', `FK4 validated: true`);
    }

    // ─── 8. FK negative enforcement tests ─────────────────────────────────
    console.log('\n=== 8. FK negative enforcement tests ===');

    // FK1: invalid user_payment_profiles.user_id
    try {
      await client.query(`
        INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
        VALUES ('00000000-0000-0000-0000-999999999999', 'stripe', 'cus_invalid_1', 'US')
      `);
      throw new Error('FK1 negative test: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK1 rejects invalid user_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_payment_profiles_user_id', `FK1 constraint name correct (got ${err.constraint})`);
    }

    // FK2: invalid user_subscriptions.user_id
    try {
      await client.query(`
        INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
        VALUES ('00000000-0000-0000-0000-999999999999', $1, 'ACTIVE')
      `, [planId]);
      throw new Error('FK2 negative test: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK2 rejects invalid user_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_user_id', `FK2 constraint name correct (got ${err.constraint})`);
    }

    // FK3: invalid subscription_plan_id
    try {
      await client.query(`
        INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
        VALUES ($1, '00000000-0000-0000-0000-999999999999', 'ACTIVE')
      `, [userId]);
      throw new Error('FK3 negative test: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK3 rejects invalid plan_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_subscription_plan_id', `FK3 constraint name correct (got ${err.constraint})`);
    }

    // FK4: invalid broker_accounts.broker_connection_id
    try {
      await client.query(`
        INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin)
        VALUES ('00000000-0000-0000-0000-999999999999', 0, 0, 0)
      `);
      throw new Error('FK4 negative test: INSERT should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK4 rejects invalid connection_id with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_broker_accounts_broker_connection_id', `FK4 constraint name correct (got ${err.constraint})`);
    }

    // ─── 9. FK delete-action tests ────────────────────────────────────────
    console.log('\n=== 9. FK delete-action tests ===');

    // Create disposable test data for delete tests
    const delUser = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('delete-test@e.test', '+20000000099', 'hash', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const delUserId = delUser.rows[0].id;

    const delPlan = await client.query(`
      INSERT INTO subscriptions.subscription_plans (name, billing_interval, status)
      VALUES ('Delete Test Plan', 'MONTHLY', 'ACTIVE')
      RETURNING id
    `);
    const delPlanId = delPlan.rows[0].id;

    // FK1 CASCADE: delete user → payment profile cascade-deleted
    await client.query(`
      INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
      VALUES ($1, 'stripe', 'cus_del_pp', 'US')
    `, [delUserId]);
    await client.query(`DELETE FROM identity.users WHERE id = $1`, [delUserId]);
    const orphanPP = await client.query(`SELECT COUNT(*) AS count FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_del_pp'`);
    assert(parseInt(orphanPP.rows[0].count, 10) === 0, 'FK1 CASCADE: payment profile deleted when user deleted');

    // FK2 CASCADE: delete user → subscription cascade-deleted
    const delUser2 = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('delete-test2@e.test', '+20000000098', 'hash', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const delUserId2 = delUser2.rows[0].id;
    await client.query(`
      INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
      VALUES ($1, $2, 'ACTIVE')
    `, [delUserId2, delPlanId]);
    await client.query(`DELETE FROM identity.users WHERE id = $1`, [delUserId2]);
    const orphanSub = await client.query(`SELECT COUNT(*) AS count FROM subscriptions.user_subscriptions WHERE user_id = $1`, [delUserId2]);
    assert(parseInt(orphanSub.rows[0].count, 10) === 0, 'FK2 CASCADE: subscription deleted when user deleted');

    // FK3 NO ACTION: cannot delete plan while subscription references it
    const delUser3 = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('delete-test3@e.test', '+20000000097', 'hash', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const delUserId3 = delUser3.rows[0].id;
    await client.query(`
      INSERT INTO subscriptions.user_subscriptions (user_id, subscription_plan_id, status)
      VALUES ($1, $2, 'ACTIVE')
    `, [delUserId3, delPlanId]);
    try {
      await client.query(`DELETE FROM subscriptions.subscription_plans WHERE id = $1`, [delPlanId]);
      throw new Error('FK3 delete-action test: DELETE should have failed');
    } catch (err: any) {
      assert(err.code === '23503', `FK3 NO ACTION: plan deletion rejected with SQLSTATE 23503 (got ${err.code})`);
      assert(err.constraint === 'fk_user_subscriptions_subscription_plan_id', `FK3 constraint name correct (got ${err.constraint})`);
    }
    // Clean up: delete subscription first, then plan
    await client.query(`DELETE FROM identity.users WHERE id = $1`, [delUserId3]);
    await client.query(`DELETE FROM subscriptions.subscription_plans WHERE id = $1`, [delPlanId]);

    // FK4 CASCADE: delete broker connection → broker account cascade-deleted
    const delUser4 = await client.query(`
      INSERT INTO identity.users (email, phone, password_hash, status, country_code, timezone, preferred_currency)
      VALUES ('delete-test4@e.test', '+20000000096', 'hash', 'ACTIVE', 'US', 'UTC', 'USD')
      RETURNING id
    `);
    const delUserId4 = delUser4.rows[0].id;
    const delBc = await client.query(`
      INSERT INTO broker.broker_connections (user_id, broker_id, broker_name, account_type, status, display_name, account_id, demo_validated, live_trading_enabled)
      VALUES ($1, 'paper-broker', 'Paper Broker', 'DEMO', 'CONNECTED', 'Delete Bc', 'acc-del-001', true, false)
      RETURNING id
    `, [delUserId4]);
    const delBcId = delBc.rows[0].id;
    await client.query(`
      INSERT INTO broker.broker_accounts (broker_connection_id, balance, equity, margin)
      VALUES ($1, 0, 0, 0)
    `, [delBcId]);
    await client.query(`DELETE FROM broker.broker_connections WHERE id = $1`, [delBcId]);
    const orphanBa = await client.query(`SELECT COUNT(*) AS count FROM broker.broker_accounts WHERE broker_connection_id = $1`, [delBcId]);
    assert(parseInt(orphanBa.rows[0].count, 10) === 0, 'FK4 CASCADE: broker account deleted when connection deleted');
    // Clean up
    await client.query(`DELETE FROM identity.users WHERE id = $1`, [delUserId4]);

    // ─── 10. Orphan-data fail-closed test ─────────────────────────────────
    console.log('\n=== 10. Orphan-data fail-closed test ===');
    // This test uses a SEPARATE database to avoid corrupting the main test DB.
    await client.query(`CREATE DATABASE irexpro_scenario_e_orphan`);
    const orphanClient = new Client({ host, port, database: 'irexpro_scenario_e_orphan', user, password });
    await orphanClient.connect();

    try {
      // Apply original 16 migrations
      await orphanClient.query(`CREATE SCHEMA IF NOT EXISTS public`);
      await orphanClient.query(`CREATE TABLE IF NOT EXISTS migrations_table (id SERIAL PRIMARY KEY, timestamp BIGINT NOT NULL, name VARCHAR(255) NOT NULL)`);
      for (const file of originalFiles) {
        const instance = await loadMigrationInstance(file);
        const ts = parseInt(file.split('-')[0], 10);
        const qr = { async query(q: string, p?: unknown[]) { const r = await orphanClient.query(q, p as never[]); return r.rows; } };
        await instance.up(qr);
        await orphanClient.query(`INSERT INTO migrations_table (timestamp, name) VALUES ($1, $2)`, [ts, instance.name]);
      }

      // Insert an orphan payment profile (user_id references nonexistent user)
      await orphanClient.query(`
        INSERT INTO subscriptions.user_payment_profiles (user_id, provider, provider_customer_reference, country_code)
        VALUES ('00000000-0000-0000-0000-999999999999', 'stripe', 'cus_orphan_001', 'US')
      `);
      console.log('  inserted orphan payment profile with nonexistent user_id');

      // Attempt migration 18 (AddCoreRelationalIntegrityConstraints) — should FAIL
      const fkMigration = await loadMigrationInstance('1752400000000-AddCoreRelationalIntegrityConstraints.ts');
      const orphanQr = { async query(q: string, p?: unknown[]) { const r = await orphanClient.query(q, p as never[]); return r.rows; } };
      try {
        await fkMigration.up(orphanQr);
        throw new Error('Orphan test: migration should have FAILED');
      } catch (err: any) {
        assert(err.code === '23503' || err.message.includes('foreign key') || err.message.includes('violates'),
          `Migration 18 fails with FK violation on orphan data (got code=${err.code}, message=${err.message.substring(0, 100)})`);
        console.log(`  ✓ migration 18 correctly rejected orphan data (SQLSTATE ${err.code})`);
      }

      // Verify orphan row still exists (not silently deleted/modified)
      const orphanCheck = await orphanClient.query(`SELECT COUNT(*) AS count FROM subscriptions.user_payment_profiles WHERE provider_customer_reference = 'cus_orphan_001'`);
      assert(parseInt(orphanCheck.rows[0].count, 10) === 1, 'orphan row still exists after failed migration (not silently deleted)');
    } finally {
      await orphanClient.end();
    }

    // ─── 11. Lock/deployment strategy report ──────────────────────────────
    console.log('\n=== 11. Lock/deployment strategy ===');
    console.log('  Strategy: direct ADD CONSTRAINT within migration transaction');
    console.log('  Rationale: Tables are startup-scale (not millions of rows).');
    console.log('  ADD CONSTRAINT acquires ACCESS EXCLUSIVE lock briefly to update');
    console.log('  pg_constraint metadata; does NOT rewrite table data.');
    console.log('  For very large tables, NOT VALID + VALIDATE CONSTRAINT would be');
    console.log('  preferable (validates without full table scan under lock).');
    console.log('  Current approach is acceptable for Phase 1 deployment scale.');

    console.log('\n=== ALL SCENARIO E ASSERTIONS PASSED ===');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n=== SCENARIO E FAILED ===');
  console.error(err);
  process.exit(1);
});
