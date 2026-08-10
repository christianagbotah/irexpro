import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotfix — Baseline identity/auth + all missing platform schemas and tables.
 *
 * Root cause: the application has entities for identity, audit, trading, broker,
 * subscriptions, and platform schemas, but NO migration creates these baseline
 * tables. Only payments, performance_fees, performance_billing, and
 * broker_reconciliation schemas were created by existing migrations.
 *
 * The init.sql creates schemas but NOT tables — it was meant for Docker dev
 * only. Production runs migrations via TypeORM CLI, so the tables were never
 * created. This caused:
 *   POST /api/v1/auth/register → 500 (relation "identity.users" does not exist)
 *   POST /api/v1/auth/login → 500 (same)
 *
 * This migration creates ALL schemas and ALL tables required by the current
 * entity definitions, using `IF NOT EXISTS` so it is safe on databases where
 * some tables may already exist (e.g. dev databases where init.sql ran).
 *
 * UUID generation: uses gen_random_uuid() from the pgcrypto extension (NOT
 * uuid_generate_v4() from uuid-ossp). This avoids the staging failure where
 * public.uuid_generate_v4() already exists as a standalone function (from the
 * emergency fallback in the Sprint 21 runbook) and CREATE EXTENSION "uuid-ossp"
 * fails because it tries to create uuid_generate_v4() again.
 *
 * Migration order: timestamp 1750800000000 — runs BEFORE all existing
 * migrations (1750900000000+) so the baseline exists before payment/billing/
 * broker/reconciliation migrations add their indexes and constraints.
 *
 * Sprint 27 compatibility: email is created as nullable (the Sprint 27
 * migration 1751700000000 will ALTER it if it was created NOT NULL elsewhere,
 * but since this baseline creates it nullable, the ALTER is a no-op).
 *
 * Non-destructive: all CREATE statements use IF NOT EXISTS.
 */
export class CreateBaselineIdentityAndPlatformSchema1750800000000 implements MigrationInterface {
  name = 'CreateBaselineIdentityAndPlatformSchema1750800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensions ──────────────────────────────────────────────────────────
    // Use pgcrypto (gen_random_uuid) — NOT uuid-ossp. The staging DB already
    // has a standalone public.uuid_generate_v4() function (from the Sprint 21
    // emergency fallback), so CREATE EXTENSION "uuid-ossp" fails with
    // "function uuid_generate_v4 already exists with same argument types".
    // pgcrypto's gen_random_uuid() does not conflict and is the modern
    // PostgreSQL recommended UUID generator (since PG 13+).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ── Schemas ─────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS subscriptions`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS trading`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS broker`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS audit`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS platform`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS notifications`);

    // ── identity.users ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.users (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email                 varchar(255) UNIQUE,
        phone                 varchar(30),
        password_hash         varchar(255) NOT NULL,
        status                varchar(30) NOT NULL DEFAULT 'PENDING_VERIFICATION',
        email_verified_at     timestamptz,
        phone_verified_at     timestamptz,
        last_login_at         timestamptz,
        country_code          varchar(2),
        timezone              varchar(50),
        preferred_currency    varchar(3),
        mfa_enabled           boolean NOT NULL DEFAULT false,
        mfa_secret            varchar(255),
        created_at            timestamptz NOT NULL DEFAULT NOW(),
        updated_at            timestamptz NOT NULL DEFAULT NOW(),
        deleted_at            timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON identity.users (email)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON identity.users (phone)`);

    // ── identity.user_profiles ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.user_profiles (
        id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                       uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        first_name                    varchar(100),
        last_name                     varchar(100),
        display_name                  varchar(100),
        date_of_birth                 date,
        address_line1                 varchar(255),
        address_line2                 varchar(255),
        address_city                  varchar(100),
        address_state                 varchar(100),
        address_postal_code           varchar(20),
        address_country               varchar(2),
        kyc_status                    varchar(20) NOT NULL DEFAULT 'NONE',
        kyc_submitted_at              timestamptz,
        kyc_approved_at               timestamptz,
        risk_disclosure_accepted      boolean NOT NULL DEFAULT false,
        risk_disclosure_accepted_at   timestamptz,
        created_at                    timestamptz NOT NULL DEFAULT NOW(),
        updated_at                    timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_id ON identity.user_profiles (user_id)`,
    );

    // ── identity.roles ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.roles (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        varchar(50) NOT NULL UNIQUE,
        description text,
        created_at  timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    // ── identity.user_roles ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.user_roles (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        role_id     uuid NOT NULL REFERENCES identity.roles(id),
        assigned_at timestamptz NOT NULL DEFAULT NOW(),
        assigned_by uuid
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON identity.user_roles (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON identity.user_roles (role_id)`,
    );

    // ── audit.audit_logs ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.audit_logs (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id  uuid,
        actor_type     varchar(20) NOT NULL DEFAULT 'USER',
        action         varchar(100) NOT NULL,
        resource_type  varchar(100),
        resource_id    varchar(255),
        ip_address     varchar(45),
        user_agent     varchar(500),
        metadata       jsonb,
        severity       varchar(20) NOT NULL DEFAULT 'INFO',
        created_at     timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit.audit_logs (actor_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit.audit_logs (action)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit.audit_logs (created_at)`,
    );

    // ── trading.risk_profiles ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trading.risk_profiles (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 uuid NOT NULL UNIQUE,
        kill_switch_active      boolean NOT NULL DEFAULT false,
        kill_switch_reason      text,
        max_daily_loss_percent  numeric(5,2) NOT NULL DEFAULT '5.00',
        max_drawdown_percent    numeric(5,2) NOT NULL DEFAULT '10.00',
        max_open_trades         integer NOT NULL DEFAULT 3,
        max_daily_trades        integer NOT NULL DEFAULT 10,
        max_position_size_lot   numeric(8,4) NOT NULL DEFAULT '0.1000',
        min_stop_loss_pips      numeric(8,2) NOT NULL DEFAULT '5.00',
        allowed_instruments     jsonb,
        max_volatility_score    numeric(4,2) NOT NULL DEFAULT '0.85',
        reject_low_liquidity    boolean NOT NULL DEFAULT true,
        created_at              timestamptz NOT NULL DEFAULT NOW(),
        updated_at              timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_risk_profiles_user_id ON trading.risk_profiles (user_id)`,
    );

    // ── trading.risk_violations ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trading.risk_violations (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid NOT NULL,
        signal_id       uuid,
        rejection_code  varchar(50) NOT NULL,
        rejection_reason text NOT NULL,
        risk_context    jsonb NOT NULL,
        evaluated_at    timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_risk_violations_user_id ON trading.risk_violations (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_risk_violations_evaluated_at ON trading.risk_violations (evaluated_at)`,
    );

    // ── trading.trades ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trading.trades (
        id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                   uuid NOT NULL,
        broker_connection_id      uuid NOT NULL,
        signal_id                 uuid,
        idempotency_key           varchar(255) NOT NULL,
        instrument                varchar(50) NOT NULL,
        direction                 varchar(10) NOT NULL,
        lot_size                  numeric(8,4) NOT NULL,
        requested_entry_price     numeric(18,8),
        fill_price                numeric(18,8),
        stop_loss                 numeric(18,8),
        take_profit               numeric(18,8),
        trailing_stop_pips        numeric(8,2),
        status                    varchar(30) NOT NULL DEFAULT 'PENDING',
        external_order_id         varchar(255),
        broker_rejection_reason   text,
        realised_pnl              numeric(18,8),
        exit_price                numeric(18,8),
        close_reason              varchar(50),
        opened_at                 timestamptz,
        closed_at                 timestamptz,
        created_at                timestamptz NOT NULL DEFAULT NOW(),
        updated_at                timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trading.trades (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trades_status ON trading.trades (status)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_idempotency_key ON trading.trades (idempotency_key)`,
    );

    // ── trading.trading_sessions ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trading.trading_sessions (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 uuid NOT NULL,
        broker_connection_id    uuid NOT NULL,
        status                  varchar(30) NOT NULL DEFAULT 'ACTIVE',
        opening_balance         numeric(15,2),
        peak_equity             numeric(15,2),
        risk_profile_snapshot   jsonb,
        started_at              timestamptz NOT NULL DEFAULT NOW(),
        ended_at                timestamptz,
        created_at              timestamptz NOT NULL DEFAULT NOW(),
        updated_at              timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trading_sessions_user_id ON trading.trading_sessions (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trading_sessions_status ON trading.trading_sessions (status)`,
    );

    // ── broker.broker_connections ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker.broker_connections (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               uuid NOT NULL,
        broker_id             varchar(50) NOT NULL,
        broker_name           varchar(100) NOT NULL,
        display_name          varchar(100),
        account_id            varchar(100),
        account_type          varchar(10) NOT NULL DEFAULT 'DEMO',
        currency              varchar(3),
        status                varchar(30) NOT NULL DEFAULT 'DISCONNECTED',
        encrypted_credentials text,
        credential_iv         varchar(255),
        credential_tag        varchar(255),
        encryption_key_id     varchar(100),
        demo_validated        boolean NOT NULL DEFAULT false,
        last_health_check_at  timestamptz,
        health_check_status   varchar(30),
        failure_count         integer NOT NULL DEFAULT 0,
        last_error_message    text,
        created_at            timestamptz NOT NULL DEFAULT NOW(),
        updated_at            timestamptz NOT NULL DEFAULT NOW(),
        deleted_at            timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_broker_connections_user_id ON broker.broker_connections (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_broker_connections_status ON broker.broker_connections (status)`,
    );

    // ── broker.broker_accounts ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker.broker_accounts (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_connection_id    uuid NOT NULL UNIQUE,
        balance                 numeric(18,8) NOT NULL DEFAULT '0',
        equity                  numeric(18,8) NOT NULL DEFAULT '0',
        margin                  numeric(18,8) NOT NULL DEFAULT '0',
        free_margin             numeric(18,8) NOT NULL DEFAULT '0',
        margin_level            numeric(10,4) NOT NULL DEFAULT '0',
        currency                varchar(3),
        leverage                integer,
        open_positions_count    integer NOT NULL DEFAULT 0,
        synced_at               timestamptz,
        created_at              timestamptz NOT NULL DEFAULT NOW(),
        updated_at              timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_broker_accounts_connection_id ON broker.broker_accounts (broker_connection_id)`,
    );

    // ── subscriptions.subscription_plans ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions.subscription_plans (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name                    varchar(100) NOT NULL,
        code                    varchar(50) NOT NULL UNIQUE,
        description             text,
        billing_interval        varchar(20) NOT NULL DEFAULT 'MONTHLY',
        trial_days              integer NOT NULL DEFAULT 0,
        performance_fee_rate    numeric(5,4) NOT NULL DEFAULT '0.2000',
        max_concurrent_trades   integer NOT NULL DEFAULT 5,
        allows_ai_auto_trading  boolean NOT NULL DEFAULT false,
        features                jsonb,
        is_active               boolean NOT NULL DEFAULT true,
        created_at              timestamptz NOT NULL DEFAULT NOW(),
        updated_at              timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    // ── subscriptions.plan_pricing ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions.plan_pricing (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_plan_id    uuid NOT NULL REFERENCES subscriptions.subscription_plans(id) ON DELETE CASCADE,
        country_code            varchar(2),
        currency                varchar(3) NOT NULL,
        amount_cents            bigint NOT NULL,
        provider_plan_id        varchar(255),
        is_active               boolean NOT NULL DEFAULT true,
        created_at              timestamptz NOT NULL DEFAULT NOW(),
        updated_at              timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_plan_pricing_plan_id ON subscriptions.plan_pricing (subscription_plan_id)`,
    );

    // ── subscriptions.user_subscriptions ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions.user_subscriptions (
        id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                         uuid NOT NULL,
        subscription_plan_id            uuid NOT NULL,
        status                          varchar(20) NOT NULL DEFAULT 'TRIAL',
        current_period_start            timestamptz,
        current_period_end              timestamptz,
        trial_ends_at                   timestamptz,
        cancelled_at                    timestamptz,
        payment_provider                varchar(50),
        provider_subscription_reference varchar(255),
        metadata                        jsonb,
        created_at                      timestamptz NOT NULL DEFAULT NOW(),
        updated_at                      timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON subscriptions.user_subscriptions (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON subscriptions.user_subscriptions (subscription_plan_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON subscriptions.user_subscriptions (status)`,
    );

    // ── subscriptions.user_payment_profiles ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions.user_payment_profiles (
        id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                     uuid NOT NULL,
        provider                    varchar(50) NOT NULL,
        provider_customer_reference varchar(255) NOT NULL,
        country_code                varchar(2),
        currency                    varchar(3),
        metadata                    jsonb,
        is_default                  boolean NOT NULL DEFAULT false,
        is_active                   boolean NOT NULL DEFAULT true,
        created_at                  timestamptz NOT NULL DEFAULT NOW(),
        updated_at                  timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_payment_profiles_user_id ON subscriptions.user_payment_profiles (user_id)`,
    );

    // ── platform.country_configs ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform.country_configs (
        id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code                varchar(2) NOT NULL UNIQUE,
        country_name                varchar(100) NOT NULL,
        region                      varchar(100),
        default_currency            varchar(3) NOT NULL,
        supported_currencies        jsonb NOT NULL DEFAULT '[]',
        enabled_payment_providers   jsonb NOT NULL DEFAULT '[]',
        enabled_sms_providers       jsonb NOT NULL DEFAULT '[]',
        enabled_brokers             jsonb NOT NULL DEFAULT '[]',
        kyc_requirements            jsonb,
        subscription_plan_overrides jsonb,
        tax_rules_placeholder       jsonb,
        timezone                    varchar(50) NOT NULL DEFAULT 'UTC',
        locale                      varchar(10) NOT NULL DEFAULT 'en',
        is_active                   boolean NOT NULL DEFAULT true,
        is_blocked                  boolean NOT NULL DEFAULT false,
        forex_trading_allowed       boolean NOT NULL DEFAULT true,
        special_disclosure_required boolean NOT NULL DEFAULT false,
        special_disclosure_text     text,
        created_at                  timestamptz NOT NULL DEFAULT NOW(),
        updated_at                  timestamptz NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order — tables first, then schemas.
    // Only drop if they exist; do NOT drop schemas created by other migrations
    // (payments, performance_fees, performance_billing, broker_reconciliation).

    await queryRunner.query(`DROP TABLE IF EXISTS platform.country_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions.user_payment_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions.user_subscriptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions.plan_pricing`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions.subscription_plans`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS subscriptions`);

    await queryRunner.query(`DROP TABLE IF EXISTS broker.broker_accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS broker.broker_connections`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS broker`);

    await queryRunner.query(`DROP TABLE IF EXISTS trading.trading_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS trading.trades`);
    await queryRunner.query(`DROP TABLE IF EXISTS trading.risk_violations`);
    await queryRunner.query(`DROP TABLE IF EXISTS trading.risk_profiles`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS trading`);

    await queryRunner.query(`DROP TABLE IF EXISTS audit.audit_logs`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS audit`);

    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.users`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS identity`);

    await queryRunner.query(`DROP SCHEMA IF EXISTS platform`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS notifications`);
  }
}
