import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 29 — Database Schema Hardening Phase 1
 *
 * Adds the four core relational integrity foreign keys that are declared by
 * TypeORM entity @ManyToOne/@OneToOne decorators but are missing from the
 * database schema (baseline migration 1750800000000 omitted them).
 *
 * The four FKs:
 *   1. subscriptions.user_payment_profiles.user_id → identity.users(id) ON DELETE CASCADE
 *   2. subscriptions.user_subscriptions.user_id → identity.users(id) ON DELETE CASCADE
 *   3. subscriptions.user_subscriptions.subscription_plan_id → subscriptions.subscription_plans(id) [NO CASCADE]
 *   4. broker.broker_accounts.broker_connection_id → broker.broker_connections(id) ON DELETE CASCADE
 *
 * Cascade rationale (Phase 4 architect review):
 *   - FK 1 (payment_profiles.user_id): Entity declares onDelete:'CASCADE'.
 *     Payment profiles are user-owned auxiliary data; deleting a user should
 *     clean up their payment profiles. Application code does not retain
 *     payment profiles for audit purposes (audit_logs captures payment events
 *     separately). CASCADE is safe and matches entity intent.
 *
 *   - FK 2 (subscriptions.user_id): Entity declares onDelete:'CASCADE'.
 *     Subscriptions are user-owned; deleting a user should clean up their
 *     subscriptions. Financial history is preserved in payment_transactions
 *     and invoices (which have their own user_id columns, intentionally
 *     without FK to preserve audit trail). CASCADE is safe.
 *
 *   - FK 3 (subscriptions.subscription_plan_id): Entity omits onDelete
 *     (defaults to NO ACTION). Subscription plans should NOT be hard-deleted
 *     while subscriptions exist — doing so would orphan the subscription's
 *     plan reference. Using NO ACTION (PostgreSQL default) prevents plan
 *     deletion until all referencing subscriptions are removed. This is
 *     safer than CASCADE and matches the entity's implicit intent.
 *
 *   - FK 4 (broker_accounts.broker_connection_id): Entity declares
 *     onDelete:'CASCADE'. Broker accounts are 1:1 with connections (UNIQUE
 *     constraint on broker_connection_id). Deleting a connection should
 *     clean up the associated account. CASCADE is safe.
 *
 * Deployment strategy:
 *   Uses standard `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...`
 *   within the migration transaction. For tables with existing data, the
 *   FK constraint will fail if orphan rows exist (fail-closed). This is
 *   intentional — the migration should NOT silently fix data integrity
 *   issues. Operators must resolve orphans before applying.
 *
 *   TypeORM runs each migration in a transaction. The ADD CONSTRAINT
 *   acquires an ACCESS EXCLUSIVE lock on the child table for a brief
 *   moment (to update pg_constraint), but does NOT rewrite the table.
 *   For production deployment, consider using NOT VALID + VALIDATE
 *   CONSTRAINT for very large tables. For current table sizes (startup
 *   scale), standard ADD CONSTRAINT is acceptable.
 *
 * down() design: drops only the exact constraints created by this migration.
 * Never uses DROP ... CASCADE.
 */
export class AddCoreRelationalIntegrityConstraints1752400000000 implements MigrationInterface {
  name = 'AddCoreRelationalIntegrityConstraints1752400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // FK 1: subscriptions.user_payment_profiles.user_id → identity.users(id) ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE subscriptions.user_payment_profiles
        ADD CONSTRAINT fk_user_payment_profiles_user_id
        FOREIGN KEY (user_id) REFERENCES identity.users(id)
        ON DELETE CASCADE
    `);

    // FK 2: subscriptions.user_subscriptions.user_id → identity.users(id) ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE subscriptions.user_subscriptions
        ADD CONSTRAINT fk_user_subscriptions_user_id
        FOREIGN KEY (user_id) REFERENCES identity.users(id)
        ON DELETE CASCADE
    `);

    // FK 3: subscriptions.user_subscriptions.subscription_plan_id → subscriptions.subscription_plans(id)
    // NO CASCADE — plans must not be deleted while subscriptions reference them.
    await queryRunner.query(`
      ALTER TABLE subscriptions.user_subscriptions
        ADD CONSTRAINT fk_user_subscriptions_subscription_plan_id
        FOREIGN KEY (subscription_plan_id) REFERENCES subscriptions.subscription_plans(id)
    `);

    // FK 4: broker.broker_accounts.broker_connection_id → broker.broker_connections(id) ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE broker.broker_accounts
        ADD CONSTRAINT fk_broker_accounts_broker_connection_id
        FOREIGN KEY (broker_connection_id) REFERENCES broker.broker_connections(id)
        ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop only the exact constraints created by this migration.
    await queryRunner.query(
      `ALTER TABLE broker.broker_accounts DROP CONSTRAINT IF EXISTS fk_broker_accounts_broker_connection_id`,
    );
    await queryRunner.query(
      `ALTER TABLE subscriptions.user_subscriptions DROP CONSTRAINT IF EXISTS fk_user_subscriptions_subscription_plan_id`,
    );
    await queryRunner.query(
      `ALTER TABLE subscriptions.user_subscriptions DROP CONSTRAINT IF EXISTS fk_user_subscriptions_user_id`,
    );
    await queryRunner.query(
      `ALTER TABLE subscriptions.user_payment_profiles DROP CONSTRAINT IF EXISTS fk_user_payment_profiles_user_id`,
    );
  }
}
