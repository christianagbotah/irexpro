import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { Trade, TradeDirection } from '../modules/execution/entities/trade.entity';
import { BrokerConnection } from '../modules/broker/entities/broker-connection.entity';
import { BrokerMode } from '../modules/broker/interfaces/broker-adapter.interface';

/**
 * Sprint 30 — Database Schema Hardening Phase 2A
 * ==============================================
 * Stable closed-domain CHECK constraint regression tests.
 *
 * Sprint 30 Phase 2A introduces one new migration
 * (1752500000000-AddStableDomainCheckConstraints.ts) that adds three CHECK
 * constraints to three varchar columns whose allowed values are a small,
 * fixed, never-changing set:
 *
 *   1. trading.trades.direction                              — BUY/SELL
 *   2. broker_reconciliation.broker_reconciled_trades.direction — BUY/SELL
 *   3. broker.broker_connections.account_type                 — DEMO/LIVE
 *
 * Strategy decision: use PostgreSQL CHECK constraints over varchar columns
 * rather than native PostgreSQL ENUM types. Native ENUMs require ALTER TYPE
 * ADD VALUE (which cannot run inside a transaction in PG <12, and even in
 * PG≥12 has restrictive semantics) and are painful to evolve. A CHECK on a
 * varchar column gives the same closed-domain guarantee while remaining
 * trivially reversible (DROP CONSTRAINT) and trivially evolvable (DROP+ADD
 * in a single migration).
 *
 * The matching entity change converts the two affected @Column decorators
 * from `type: 'enum'` (which would make TypeORM emit a native enum) to
 * `type: 'varchar', length: 10`. The `enum:` option is preserved so that
 * TypeORM validation + the TypeScript type still constrains the in-process
 * values to the closed domain.
 *
 * This suite has three layers:
 *
 *   1. Entity @Column contract:
 *      Verifies the Trade.direction and BrokerConnection.accountType
 *      decorators declare `type: 'varchar'` with `length: 10` (NOT 'enum')
 *      and that the TypeScript enum members are unchanged (BUY/SELL,
 *      DEMO/LIVE). Guards against accidental rollback to `type: 'enum'`
 *      which would re-introduce the native-ENUM fragility Phase 2A removed.
 *
 *   2. Migration source inspection:
 *      Reads 1752500000000-AddStableDomainCheckConstraints.ts as text and
 *      verifies the three ADD CONSTRAINT ... CHECK clauses, the preflight
 *      SELECT ... NOT IN diagnostic queries, the absence of CREATE TYPE /
 *      ALTER COLUMN ... TYPE, and the reversibility of down() (DROP
 *      CONSTRAINT IF EXISTS, no CASCADE).
 *
 *   3. Historical migration immutability:
 *      Verifies that none of the 18 pre-existing migration files
 *      (1750800000000 through 1752400000000) were retroactively modified to
 *      contain the three new constraint names. Phase 2A must be additive —
 *      it must not rewrite history.
 *
 * These are source-level tests — they do NOT require a running database.
 * They run in the standard Jest suite via ts-jest.
 *
 * Branch: fix/db-domain-checks-phase2a
 * See:
 *   - apps/api/src/database/migrations/1752500000000-AddStableDomainCheckConstraints.ts
 *   - apps/api/src/modules/execution/entities/trade.entity.ts
 *   - apps/api/src/modules/broker/entities/broker-connection.entity.ts
 */

// ─── TypeORM metadata-args shape helpers ───────────────────────────────────
// Copied structurally from schema-hardening-phase1.spec.ts so the two suites
// stay self-contained and don't share fragile cross-file types. TypeORM's
// getMetadataArgsStorage() returns the raw decorator metadata captured at
// module load time. We cast to a minimal structural shape rather than
// depending on TypeORM's internal types (which are not part of the public
// API and can shift between minor versions).

interface ColumnOptionsShape {
  name?: string;
  type?: string;
  length?: number | string;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  unique?: boolean;
  enum?: unknown;
  default?: unknown;
  [key: string]: unknown;
}

type EntityConstructor = new (...args: unknown[]) => unknown;

interface ColumnMetadataArgsShape {
  target: EntityConstructor | string;
  propertyName: string;
  mode:
    | 'regular'
    | 'create'
    | 'update'
    | 'create_date'
    | 'update_date'
    | 'delete_date'
    | 'virtual'
    | 'primary';
  options: ColumnOptionsShape;
}

function getColumnOptions(entity: EntityConstructor, propertyName: string): ColumnOptionsShape {
  const storage = getMetadataArgsStorage();
  const columns = storage.filterColumns(entity) as unknown as ColumnMetadataArgsShape[];
  const column = columns.find((c) => c.propertyName === propertyName);
  if (!column) {
    throw new Error(
      `Expected @Column decorator on ${entity.name}.${propertyName} but none was found in TypeORM metadata. ` +
        `Did the entity get refactored and the decorator removed?`,
    );
  }
  return column.options;
}

// ─── Migration source helpers ──────────────────────────────────────────────

function extractUpMethodBody(source: string): string {
  const upStart = source.indexOf('public async up');
  const downStart = source.indexOf('public async down');
  if (upStart < 0) {
    throw new Error('Migration source has no `public async up` method');
  }
  const end = downStart > upStart ? downStart : source.length;
  return source.substring(upStart, end);
}

function extractDownMethodBody(source: string): string {
  const downStart = source.indexOf('public async down');
  if (downStart < 0) {
    throw new Error('Migration source has no `public async down` method');
  }
  return source.substring(downStart);
}

function extractQueryBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /queryRunner\.query\(\s*`([\s\S]*?)`\s*(?:,\s*[^)]*)?\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

function findQueryBlockContaining(blocks: string[], needle: string): string {
  const matches = blocks.filter((b) => b.includes(needle));
  if (matches.length === 0) {
    throw new Error(`No queryRunner.query block contains "${needle}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one queryRunner.query block to contain "${needle}" but found ${matches.length}. ` +
        `Constraint names must be unique within a migration.`,
    );
  }
  return matches[0];
}

// ============================================================================
// 1. Entity @Column contract — Trade.direction & BrokerConnection.accountType
// ============================================================================

describe('Sprint 30 Phase 2A — entity @Column contract (varchar-with-enum drift guard)', () => {
  describe('Trade.direction', () => {
    it('declares type: "varchar" (NOT "enum") — Phase 2A removed native enum', () => {
      const opts = getColumnOptions(Trade, 'direction');
      expect(opts.type).toBe('varchar');
      // Explicit guard: must not regress to 'enum'.
      expect(opts.type).not.toBe('enum');
    });

    it('declares length: 10 (matches DB varchar(10) and CHECK constraint scope)', () => {
      const opts = getColumnOptions(Trade, 'direction');
      expect(opts.length).toBe(10);
    });

    it('still carries enum: TradeDirection for in-process validation', () => {
      const opts = getColumnOptions(Trade, 'direction');
      expect(opts.enum).toBe(TradeDirection);
    });

    it('TradeDirection enum still exposes BUY and SELL members with correct string values', () => {
      // TypeScript-level type identity is preserved (the property is still
      // typed `TradeDirection`). We verify the runtime enum object still
      // has the expected closed-domain members. This catches accidental
      // widening (e.g. someone adds HOLD) or accidental narrowing (removes
      // SELL) that would diverge from the DB CHECK constraint.
      expect(TradeDirection.BUY).toBe('BUY');
      expect(TradeDirection.SELL).toBe('SELL');
      const values = Object.values(TradeDirection);
      expect(values).toEqual(expect.arrayContaining(['BUY', 'SELL']));
      expect(values).toHaveLength(2);
    });
  });

  describe('BrokerConnection.accountType', () => {
    it('declares type: "varchar" (NOT "enum") — Phase 2A removed native enum', () => {
      const opts = getColumnOptions(BrokerConnection, 'accountType');
      expect(opts.type).toBe('varchar');
      expect(opts.type).not.toBe('enum');
    });

    it('declares length: 10 (matches DB varchar(10) and CHECK constraint scope)', () => {
      const opts = getColumnOptions(BrokerConnection, 'accountType');
      expect(opts.length).toBe(10);
    });

    it('still carries enum: BrokerMode for in-process validation', () => {
      const opts = getColumnOptions(BrokerConnection, 'accountType');
      expect(opts.enum).toBe(BrokerMode);
    });

    it('still carries default: BrokerMode.DEMO', () => {
      const opts = getColumnOptions(BrokerConnection, 'accountType');
      expect(opts.default).toBe(BrokerMode.DEMO);
    });

    it('BrokerMode enum still exposes DEMO and LIVE members with correct string values', () => {
      expect(BrokerMode.DEMO).toBe('DEMO');
      expect(BrokerMode.LIVE).toBe('LIVE');
      const values = Object.values(BrokerMode);
      expect(values).toEqual(expect.arrayContaining(['DEMO', 'LIVE']));
      expect(values).toHaveLength(2);
    });
  });
});

// ============================================================================
// 2. Migration source inspection — 1752500000000-AddStableDomainCheckConstraints
// ============================================================================

describe('Sprint 30 Phase 2A — migration source inspection', () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const checkMigrationPath = path.join(
    migrationsDir,
    '1752500000000-AddStableDomainCheckConstraints.ts',
  );

  let source: string;
  let upBody: string;
  let downBody: string;
  let upBlocks: string[];

  beforeAll(() => {
    source = fs.readFileSync(checkMigrationPath, 'utf-8');
    upBody = extractUpMethodBody(source);
    downBody = extractDownMethodBody(source);
    upBlocks = extractQueryBlocks(upBody);
  });

  // ── Migration file exists & shape ──────────────────────────────────────

  it('migration 1752500000000-AddStableDomainCheckConstraints.ts exists', () => {
    expect(fs.existsSync(checkMigrationPath)).toBe(true);
  });

  it('implements MigrationInterface', () => {
    expect(source).toMatch(/implements\s+MigrationInterface/);
  });

  // ── CHECK constraint 1: chk_trades_direction ───────────────────────────

  describe('CHECK constraint 1: chk_trades_direction on trading.trades.direction', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(upBlocks, 'ADD CONSTRAINT chk_trades_direction');
    });

    it('targets trading.trades', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+trading\.trades/i);
    });

    it('adds the named constraint', () => {
      expect(block).toMatch(/ADD\s+CONSTRAINT\s+chk_trades_direction/i);
    });

    it('uses a CHECK (direction IN (...)) clause with BUY and SELL', () => {
      expect(block).toMatch(/CHECK\s*\(\s*direction\s+IN\s*\(\s*'BUY'\s*,\s*'SELL'\s*\)\s*\)/i);
    });
  });

  // ── CHECK constraint 2: chk_broker_reconciled_trades_direction ─────────

  describe('CHECK constraint 2: chk_broker_reconciled_trades_direction', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(
        upBlocks,
        'ADD CONSTRAINT chk_broker_reconciled_trades_direction',
      );
    });

    it('targets broker_reconciliation.broker_reconciled_trades', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+broker_reconciliation\.broker_reconciled_trades/i);
    });

    it('adds the named constraint', () => {
      expect(block).toMatch(/ADD\s+CONSTRAINT\s+chk_broker_reconciled_trades_direction/i);
    });

    it('uses a CHECK (direction IN (...)) clause with BUY and SELL', () => {
      expect(block).toMatch(/CHECK\s*\(\s*direction\s+IN\s*\(\s*'BUY'\s*,\s*'SELL'\s*\)\s*\)/i);
    });
  });

  // ── CHECK constraint 3: chk_broker_connections_account_type ────────────

  describe('CHECK constraint 3: chk_broker_connections_account_type', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(
        upBlocks,
        'ADD CONSTRAINT chk_broker_connections_account_type',
      );
    });

    it('targets broker.broker_connections', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+broker\.broker_connections/i);
    });

    it('adds the named constraint', () => {
      expect(block).toMatch(/ADD\s+CONSTRAINT\s+chk_broker_connections_account_type/i);
    });

    it('uses a CHECK (account_type IN (...)) clause with DEMO and LIVE', () => {
      expect(block).toMatch(/CHECK\s*\(\s*account_type\s+IN\s*\(\s*'DEMO'\s*,\s*'LIVE'\s*\)\s*\)/i);
    });
  });

  // ── Preflight diagnostic queries ───────────────────────────────────────

  describe('preflight diagnostic queries (fail-closed before ADD CONSTRAINT)', () => {
    it('preflights trading.trades.direction for values NOT IN (BUY, SELL)', () => {
      expect(upBody).toMatch(
        /FROM\s+trading\.trades[\s\S]*?direction\s+NOT\s+IN\s*\(\s*'BUY'\s*,\s*'SELL'\s*\)/i,
      );
    });

    it('preflights broker_reconciliation.broker_reconciled_trades.direction', () => {
      expect(upBody).toMatch(
        /FROM\s+broker_reconciliation\.broker_reconciled_trades[\s\S]*?direction\s+NOT\s+IN\s*\(\s*'BUY'\s*,\s*'SELL'\s*\)/i,
      );
    });

    it('preflights broker.broker_connections.account_type for values NOT IN (DEMO, LIVE)', () => {
      expect(upBody).toMatch(
        /FROM\s+broker\.broker_connections[\s\S]*?account_type\s+NOT\s+IN\s*\(\s*'DEMO'\s*,\s*'LIVE'\s*\)/i,
      );
    });

    it('throws a clear diagnostic error when invalid values are found (each constraint)', () => {
      // The migration must surface a human-readable diagnostic rather than
      // relying on PostgreSQL's generic "new row violates check constraint"
      // message. We require a throw with the constraint name in the message.
      expect(upBody).toMatch(/throw\s+new\s+Error\([\s\S]*?chk_trades_direction/);
      expect(upBody).toMatch(/throw\s+new\s+Error\([\s\S]*?chk_broker_reconciled_trades_direction/);
      expect(upBody).toMatch(/throw\s+new\s+Error\([\s\S]*?chk_broker_connections_account_type/);
    });
  });

  // ── No native ENUM, no type conversion ─────────────────────────────────

  describe('no native ENUM and no destructive type conversion', () => {
    it('up() does NOT issue CREATE TYPE (no native PostgreSQL enum introduced)', () => {
      expect(upBody).not.toMatch(/CREATE\s+TYPE/i);
    });

    it('up() does NOT issue ALTER COLUMN ... TYPE (no type conversion)', () => {
      expect(upBody).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+TYPE/i);
    });

    it('up() does NOT issue DROP TYPE (no enum cleanup)', () => {
      expect(upBody).not.toMatch(/DROP\s+TYPE/i);
    });

    it('up() does NOT issue ALTER TABLE ... ALTER COLUMN at all (column definitions untouched)', () => {
      expect(upBody).not.toMatch(/ALTER\s+TABLE[\s\S]*?ALTER\s+COLUMN/i);
    });

    it('up() contains only ADD CONSTRAINT ... CHECK statements (no data rewrite)', () => {
      // Every queryRunner.query block in up() must be an ALTER TABLE ADD
      // CONSTRAINT ... CHECK (preflight SELECTs are also allowed). There
      // must be at least 3 ADD CONSTRAINT blocks.
      const addBlocks = upBlocks.filter((b) => /ADD\s+CONSTRAINT/i.test(b));
      expect(addBlocks.length).toBeGreaterThanOrEqual(3);
      for (const b of addBlocks) {
        expect(b).toMatch(/CHECK\s*\(/i);
      }
    });
  });

  // ── down() reversibility ───────────────────────────────────────────────

  describe('down() reversibility', () => {
    it('down() drops all three constraints by exact name with IF EXISTS', () => {
      expect(downBody).toContain('DROP CONSTRAINT IF EXISTS chk_trades_direction');
      expect(downBody).toContain(
        'DROP CONSTRAINT IF EXISTS chk_broker_reconciled_trades_direction',
      );
      expect(downBody).toContain('DROP CONSTRAINT IF EXISTS chk_broker_connections_account_type');
    });

    it('down() never uses DROP ... CASCADE (could silently drop dependent objects)', () => {
      expect(downBody).not.toMatch(/DROP\s+CONSTRAINT.*CASCADE/i);
      expect(downBody).not.toMatch(/DROP\s+.*\s+CASCADE/i);
    });

    it('down() does NOT drop or recreate any column or type', () => {
      expect(downBody).not.toMatch(/ALTER\s+COLUMN/i);
      expect(downBody).not.toMatch(/DROP\s+COLUMN/i);
      expect(downBody).not.toMatch(/ADD\s+COLUMN/i);
      expect(downBody).not.toMatch(/DROP\s+TYPE/i);
      expect(downBody).not.toMatch(/CREATE\s+TYPE/i);
    });
  });
});

// ============================================================================
// 3. Historical migration immutability — the 18 prior migrations are untouched
// ============================================================================

describe('Sprint 30 Phase 2A — historical migration immutability (additive-only)', () => {
  const migrationsDir = path.join(__dirname, 'migrations');

  // The 18 pre-Phase-2A migrations span timestamps 1750800000000 through
  // 1752400000000. Phase 2A is additive-only: the new migration
  // (1752500000000) must be the ONLY file that references the three new
  // constraint names. Retro-editing an old migration would silently change
  // the applied schema of existing production databases and break the
  // migration ordering invariant.
  const phase2aConstraintNames = [
    'chk_trades_direction',
    'chk_broker_reconciled_trades_direction',
    'chk_broker_connections_account_type',
  ];

  // NOTE: describe.each receives its array synchronously at test-collection
  // time (before beforeAll runs), so we compute the historical file list at
  // module load time rather than inside a beforeAll hook.
  const allMigrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && /^\d/.test(f))
    .sort();
  const historicalFiles = allMigrationFiles.filter(
    (f) => parseInt(f.split('-')[0], 10) <= 1752400000000,
  );

  it('found exactly 18 historical migration files (1750800000000 .. 1752400000000)', () => {
    expect(historicalFiles.length).toBe(18);
  });

  it('the new Phase 2A migration (1752500000000) is present alongside later additive migrations', () => {
    // Later releases may append migrations, but must never rewrite the 18
    // historical files or remove the Phase 2A migration.
    expect(allMigrationFiles.length).toBeGreaterThanOrEqual(19);
    expect(allMigrationFiles).toContain('1752500000000-AddStableDomainCheckConstraints.ts');
  });

  describe.each(historicalFiles)('%s does not reference any Phase 2A constraint name', (file) => {
    it('file content is free of chk_trades_direction / chk_broker_reconciled_trades_direction / chk_broker_connections_account_type', () => {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      for (const name of phase2aConstraintNames) {
        // Use indexOf for an exact substring check that won't be confused
        // by regex metacharacters in constraint names (there are none here,
        // but it keeps the test robust to future names).
        expect(content).not.toContain(name);
      }
    });
  });
});
