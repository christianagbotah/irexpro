import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { Trade } from '../modules/execution/entities/trade.entity';
import { BrokerConnection } from '../modules/broker/entities/broker-connection.entity';
import { BrokerAccount } from '../modules/broker/entities/broker-account.entity';
import { UserPaymentProfile } from '../modules/users/entities/user-payment-profile.entity';
import { UserSubscription } from '../modules/subscriptions/entities/user-subscription.entity';

/**
 * Sprint 29 — Database Schema Hardening Phase 1
 * ============================================
 * Schema-drift regression tests.
 *
 * This suite guards against the exact class of bug that prompted Sprint 29:
 * entity @Column/@ManyToOne metadata drifting out of alignment with the
 * physical database schema declared by migrations. When the two diverge,
 * TypeORM issues queries against columns/types that don't exist (or are
 * narrower than expected), causing runtime QueryFailedError in production.
 *
 * The suite has three layers:
 *
 *   1. Entity @Column contract (TypeScript-level metadata):
 *      Verifies the Trade and BrokerConnection entities declare the precise
 *      precision/scale/length that Sprint 29 aligned them to. This catches
 *      accidental rollback of entity metadata (e.g. someone re-narrows
 *      realised_pnl back to numeric(15,2)).
 *
 *   2. Entity relationship @ManyToOne/@OneToOne contract:
 *      Verifies the four core relational integrity FKs declared at the ORM
 *      layer carry the intended onDelete behaviour, matching the FK
 *      constraints added by migration 1752400000000.
 *
 *   3. Migration source inspection:
 *      Reads the two new migration files (1752300000000 and 1752400000000)
 *      as text and verifies they contain the expected ALTER TABLE ... TYPE
 *      and ADD CONSTRAINT ... FOREIGN KEY SQL. This catches accidental
 *      removal or weakening of the migrations themselves.
 *
 * These are source-level tests — they do NOT require a running database.
 * They run in the standard Jest suite via ts-jest.
 *
 * Branch: fix/db-schema-hardening-phase1
 * See:
 *   - docs/architecture/08-database-architecture.md
 *   - docs/architecture/12-execution-engine-architecture.md §5
 *   - apps/api/src/database/migrations/1752300000000-AlignTradingAndBrokerSchemaDefinitions.ts
 *   - apps/api/src/database/migrations/1752400000000-AddCoreRelationalIntegrityConstraints.ts
 */

// ─── TypeORM metadata-args shape helpers ───────────────────────────────────
// TypeORM's getMetadataArgsStorage() returns the raw decorator metadata
// captured at module load time. We cast to a minimal structural shape rather
// than depending on TypeORM's internal types (which are not part of the
// public API and can shift between minor versions).

interface ColumnOptionsShape {
  name?: string;
  type?: string;
  length?: number | string;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  unique?: boolean;
  [key: string]: unknown;
}

/**
 * Minimal constructor shape for entity classes. Avoids the banned `Function`
 * type while remaining assignable to TypeORM's `Function | string` target
 * parameter on `filterColumns` / `filterRelations`.
 */
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

interface RelationOptionsShape {
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'DEFAULT';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'DEFAULT';
  nullable?: boolean;
  cascade?: boolean | string[];
  eager?: boolean;
  persistence?: boolean;
  createForeignKeyConstraints?: boolean;
  [key: string]: unknown;
}

interface RelationMetadataArgsShape {
  target: EntityConstructor | string;
  propertyName: string;
  relationType: 'many-to-one' | 'one-to-one' | 'many-to-many' | 'one-to-many';
  isLazy: boolean;
  type: (() => unknown) | string;
  inverseSideProperty?: (() => unknown) | string | undefined;
  options: RelationOptionsShape;
}

/**
 * Look up the @Column metadata for a given entity property.
 * Throws a descriptive error if the decorator is missing so that test
 * failures point directly at the offending property.
 */
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

/**
 * Look up the @ManyToOne / @OneToOne metadata for a given entity property.
 * Throws a descriptive error if the decorator is missing.
 */
function getRelationMetadata(
  entity: EntityConstructor,
  propertyName: string,
): RelationMetadataArgsShape {
  const storage = getMetadataArgsStorage();
  const relations = storage.filterRelations(entity) as unknown as RelationMetadataArgsShape[];
  const relation = relations.find((r) => r.propertyName === propertyName);
  if (!relation) {
    throw new Error(
      `Expected @ManyToOne/@OneToOne decorator on ${entity.name}.${propertyName} but none was found. ` +
        `Did the relationship get removed from the entity?`,
    );
  }
  return relation;
}

// ─── Migration source helpers ──────────────────────────────────────────────

/**
 * Extract the body of the `up()` method from a migration source file.
 * Used to scope SQL assertions to the forward migration only (not down()).
 */
function extractUpMethodBody(source: string): string {
  const upStart = source.indexOf('public async up');
  const downStart = source.indexOf('public async down');
  if (upStart < 0) {
    throw new Error('Migration source has no `public async up` method');
  }
  const end = downStart > upStart ? downStart : source.length;
  return source.substring(upStart, end);
}

/**
 * Extract every `queryRunner.query(\`...\`)` template-literal block from a
 * migration source. Returns the inner SQL text of each block. Used to scope
 * per-constraint assertions so that a CASCADE on one FK isn't mistakenly
 * attributed to another.
 */
function extractQueryBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /queryRunner\.query\(\s*`([\s\S]*?)`\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Find the single query block that contains the given needle (e.g. an
 * `ADD CONSTRAINT <name>` clause). Throws if zero or multiple blocks match.
 */
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
// 1. Entity @Column contract — Trade & BrokerConnection
// ============================================================================

describe('Sprint 29 schema-hardening — entity @Column contract (drift guard)', () => {
  describe('Trade entity numeric precision/scale', () => {
    // Migration 1752300000000 widens trading.trades.lot_size from numeric(8,4)
    // to numeric(10,4). The entity must declare numeric(10,4) to match.
    it('lotSize is numeric(10,4) — widened from numeric(8,4) by migration 1752300000000', () => {
      const opts = getColumnOptions(Trade, 'lotSize');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(10);
      expect(opts.scale).toBe(4);
    });

    // Sprint 29 aligned entity price columns from numeric(15,5) up to
    // numeric(18,8) to match the existing DB schema. The DB was already
    // numeric(18,8); only the entity was wrong. These tests guard against
    // accidental re-narrowing of the entity.
    it('requestedEntryPrice is numeric(18,8) — aligned up from numeric(15,5)', () => {
      const opts = getColumnOptions(Trade, 'requestedEntryPrice');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });

    it('fillPrice is numeric(18,8) — aligned up from numeric(15,5)', () => {
      const opts = getColumnOptions(Trade, 'fillPrice');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });

    it('stopLoss is numeric(18,8) — aligned up from numeric(15,5)', () => {
      const opts = getColumnOptions(Trade, 'stopLoss');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });

    it('takeProfit is numeric(18,8) — aligned up from numeric(15,5)', () => {
      const opts = getColumnOptions(Trade, 'takeProfit');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });

    it('exitPrice is numeric(18,8) — aligned up from numeric(15,5)', () => {
      const opts = getColumnOptions(Trade, 'exitPrice');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });

    it('realisedPnl is numeric(18,8) — aligned up from numeric(15,2)', () => {
      const opts = getColumnOptions(Trade, 'realisedPnl');
      expect(opts.type).toBe('numeric');
      expect(opts.precision).toBe(18);
      expect(opts.scale).toBe(8);
    });
  });

  describe('Trade entity varchar lengths', () => {
    it('idempotencyKey is varchar(255) — aligned up from varchar(64)', () => {
      const opts = getColumnOptions(Trade, 'idempotencyKey');
      expect(opts.type).toBe('varchar');
      expect(opts.length).toBe(255);
    });

    it('instrument is varchar(50) — aligned up from varchar(20)', () => {
      const opts = getColumnOptions(Trade, 'instrument');
      expect(opts.type).toBe('varchar');
      expect(opts.length).toBe(50);
    });

    it('externalOrderId is varchar(255) — aligned up from varchar(100)', () => {
      const opts = getColumnOptions(Trade, 'externalOrderId');
      expect(opts.type).toBe('varchar');
      expect(opts.length).toBe(255);
    });
  });

  describe('BrokerConnection entity varchar length', () => {
    // Migration 1752300000000 widens broker.broker_connections.encryption_key_id
    // from varchar(100) to varchar(255). Entity must declare varchar(255).
    it('encryptionKeyId is varchar(255) — widened from varchar(100) by migration 1752300000000', () => {
      const opts = getColumnOptions(BrokerConnection, 'encryptionKeyId');
      expect(opts.type).toBe('varchar');
      expect(opts.length).toBe(255);
    });
  });
});

// ============================================================================
// 2. Entity relationship @ManyToOne / @OneToOne contract
// ============================================================================

describe('Sprint 29 schema-hardening — core relational integrity @Relation decorators', () => {
  // These four relationships correspond 1:1 to the four FK constraints added
  // by migration 1752400000000. The entity onDelete setting MUST match the
  // migration's ON DELETE clause, otherwise TypeORM's schema sync and the
  // physical DB will diverge.

  it('UserPaymentProfile.user is @ManyToOne with onDelete: CASCADE (matches fk_user_payment_profiles_user_id)', () => {
    const rel = getRelationMetadata(UserPaymentProfile, 'user');
    expect(rel.relationType).toBe('many-to-one');
    expect(rel.options.onDelete).toBe('CASCADE');
  });

  it('UserSubscription.user is @ManyToOne with onDelete: CASCADE (matches fk_user_subscriptions_user_id)', () => {
    const rel = getRelationMetadata(UserSubscription, 'user');
    expect(rel.relationType).toBe('many-to-one');
    expect(rel.options.onDelete).toBe('CASCADE');
  });

  it('UserSubscription.plan is @ManyToOne with NO onDelete (RESTRICT/NO ACTION — matches fk_user_subscriptions_subscription_plan_id)', () => {
    const rel = getRelationMetadata(UserSubscription, 'plan');
    expect(rel.relationType).toBe('many-to-one');
    // The entity intentionally omits onDelete so that the DB constraint
    // defaults to NO ACTION (PostgreSQL) / RESTRICT. This prevents
    // hard-deleting a subscription plan while subscriptions reference it.
    expect(rel.options.onDelete).toBeUndefined();
  });

  it('BrokerAccount.connection is @OneToOne with onDelete: CASCADE (matches fk_broker_accounts_broker_connection_id)', () => {
    const rel = getRelationMetadata(BrokerAccount, 'connection');
    expect(rel.relationType).toBe('one-to-one');
    expect(rel.options.onDelete).toBe('CASCADE');
  });
});

// ============================================================================
// 3. Migration source inspection
// ============================================================================

describe('Sprint 29 schema-hardening — migration source inspection', () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const alignMigrationPath = path.join(
    migrationsDir,
    '1752300000000-AlignTradingAndBrokerSchemaDefinitions.ts',
  );
  const fkMigrationPath = path.join(
    migrationsDir,
    '1752400000000-AddCoreRelationalIntegrityConstraints.ts',
  );

  let alignSource: string;
  let fkSource: string;
  let alignUpBody: string;
  let fkUpBody: string;
  let fkUpBlocks: string[];

  beforeAll(() => {
    alignSource = fs.readFileSync(alignMigrationPath, 'utf-8');
    fkSource = fs.readFileSync(fkMigrationPath, 'utf-8');
    alignUpBody = extractUpMethodBody(alignSource);
    fkUpBody = extractUpMethodBody(fkSource);
    fkUpBlocks = extractQueryBlocks(fkUpBody);
  });

  // ── Migration files exist ───────────────────────────────────────────────

  it('migration 1752300000000-AlignTradingAndBrokerSchemaDefinitions.ts exists', () => {
    expect(fs.existsSync(alignMigrationPath)).toBe(true);
  });

  it('migration 1752400000000-AddCoreRelationalIntegrityConstraints.ts exists', () => {
    expect(fs.existsSync(fkMigrationPath)).toBe(true);
  });

  it('migration 1752300000000 implements MigrationInterface with an up() method', () => {
    expect(alignSource).toMatch(/implements\s+MigrationInterface/);
    expect(alignUpBody).toContain('ALTER TABLE');
  });

  it('migration 1752400000000 implements MigrationInterface with an up() method', () => {
    expect(fkSource).toMatch(/implements\s+MigrationInterface/);
    expect(fkUpBody).toContain('ADD CONSTRAINT');
  });

  // ── Migration 1: column type widening (non-destructive ALTER ... TYPE) ──

  describe('migration 1752300000000 — column widening (ALTER ... TYPE)', () => {
    it('widens trading.trades.lot_size to numeric(10,4) in up()', () => {
      expect(alignUpBody).toMatch(
        /ALTER\s+TABLE\s+trading\.trades\s+ALTER\s+COLUMN\s+lot_size\s+TYPE\s+numeric\(10,4\)/i,
      );
    });

    it('widens broker.broker_connections.encryption_key_id to varchar(255) in up()', () => {
      expect(alignUpBody).toMatch(
        /ALTER\s+TABLE\s+broker\.broker_connections\s+ALTER\s+COLUMN\s+encryption_key_id\s+TYPE\s+varchar\(255\)/i,
      );
    });

    it('does NOT narrow any column in up() (widening-only)', () => {
      // The up() method must not contain the old (narrower) types —
      // narrowing financial precision is forbidden by architect Rule 2.
      expect(alignUpBody).not.toMatch(/lot_size\s+TYPE\s+numeric\(8,4\)/i);
      expect(alignUpBody).not.toMatch(/encryption_key_id\s+TYPE\s+varchar\(100\)/i);
    });

    it('uses USING cast for safe type conversion', () => {
      expect(alignUpBody).toMatch(/USING\s+lot_size::numeric\(10,4\)/i);
      expect(alignUpBody).toMatch(/USING\s+encryption_key_id::varchar\(255\)/i);
    });
  });

  // ── Migration 2: foreign key constraints (ADD CONSTRAINT ... FOREIGN KEY)

  describe('migration 1752400000000 — FK constraint 1: fk_user_payment_profiles_user_id (CASCADE)', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(
        fkUpBlocks,
        'ADD CONSTRAINT fk_user_payment_profiles_user_id',
      );
    });

    it('targets subscriptions.user_payment_profiles', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+subscriptions\.user_payment_profiles/i);
    });

    it('declares FOREIGN KEY (user_id) REFERENCES identity.users(id)', () => {
      expect(block).toMatch(
        /FOREIGN\s+KEY\s+\(\s*user_id\s*\)\s+REFERENCES\s+identity\.users\s*\(\s*id\s*\)/i,
      );
    });

    it('specifies ON DELETE CASCADE', () => {
      expect(block).toMatch(/ON\s+DELETE\s+CASCADE/i);
    });
  });

  describe('migration 1752400000000 — FK constraint 2: fk_user_subscriptions_user_id (CASCADE)', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(fkUpBlocks, 'ADD CONSTRAINT fk_user_subscriptions_user_id');
    });

    it('targets subscriptions.user_subscriptions', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+subscriptions\.user_subscriptions/i);
    });

    it('declares FOREIGN KEY (user_id) REFERENCES identity.users(id)', () => {
      expect(block).toMatch(
        /FOREIGN\s+KEY\s+\(\s*user_id\s*\)\s+REFERENCES\s+identity\.users\s*\(\s*id\s*\)/i,
      );
    });

    it('specifies ON DELETE CASCADE', () => {
      expect(block).toMatch(/ON\s+DELETE\s+CASCADE/i);
    });
  });

  describe('migration 1752400000000 — FK constraint 3: fk_user_subscriptions_subscription_plan_id (NO CASCADE)', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(
        fkUpBlocks,
        'ADD CONSTRAINT fk_user_subscriptions_subscription_plan_id',
      );
    });

    it('targets subscriptions.user_subscriptions', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+subscriptions\.user_subscriptions/i);
    });

    it('declares FOREIGN KEY (subscription_plan_id) REFERENCES subscriptions.subscription_plans(id)', () => {
      expect(block).toMatch(
        /FOREIGN\s+KEY\s+\(\s*subscription_plan_id\s*\)\s+REFERENCES\s+subscriptions\.subscription_plans\s*\(\s*id\s*\)/i,
      );
    });

    it('does NOT specify ON DELETE (defaults to NO ACTION / RESTRICT)', () => {
      // Plans must not be hard-deleted while subscriptions reference them.
      expect(block).not.toMatch(/ON\s+DELETE/i);
    });
  });

  describe('migration 1752400000000 — FK constraint 4: fk_broker_accounts_broker_connection_id (CASCADE)', () => {
    let block: string;
    beforeAll(() => {
      block = findQueryBlockContaining(
        fkUpBlocks,
        'ADD CONSTRAINT fk_broker_accounts_broker_connection_id',
      );
    });

    it('targets broker.broker_accounts', () => {
      expect(block).toMatch(/ALTER\s+TABLE\s+broker\.broker_accounts/i);
    });

    it('declares FOREIGN KEY (broker_connection_id) REFERENCES broker.broker_connections(id)', () => {
      expect(block).toMatch(
        /FOREIGN\s+KEY\s+\(\s*broker_connection_id\s*\)\s+REFERENCES\s+broker\.broker_connections\s*\(\s*id\s*\)/i,
      );
    });

    it('specifies ON DELETE CASCADE', () => {
      expect(block).toMatch(/ON\s+DELETE\s+CASCADE/i);
    });
  });

  // ── Cross-cutting: down() must be reversible without DROP ... CASCADE ──

  describe('migration 1752400000000 — down() reversibility', () => {
    it('down() drops all four constraints by exact name', () => {
      const downStart = fkSource.indexOf('public async down');
      const downBody = downStart >= 0 ? fkSource.substring(downStart) : '';
      expect(downBody).toContain(
        'DROP CONSTRAINT IF EXISTS fk_broker_accounts_broker_connection_id',
      );
      expect(downBody).toContain(
        'DROP CONSTRAINT IF EXISTS fk_user_subscriptions_subscription_plan_id',
      );
      expect(downBody).toContain('DROP CONSTRAINT IF EXISTS fk_user_subscriptions_user_id');
      expect(downBody).toContain('DROP CONSTRAINT IF EXISTS fk_user_payment_profiles_user_id');
    });

    it('down() never uses DROP ... CASCADE (could silently drop dependent objects)', () => {
      const downStart = fkSource.indexOf('public async down');
      const downBody = downStart >= 0 ? fkSource.substring(downStart) : '';
      expect(downBody).not.toMatch(/DROP\s+CONSTRAINT.*CASCADE/i);
    });
  });
});
