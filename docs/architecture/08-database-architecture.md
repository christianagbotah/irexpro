# 08 — Database Architecture

## iRexPro — Database Design and Data Management Strategy

---

## 1. Purpose

This document defines the database architecture for iRexPro, including schema design strategy, table definitions, indexing approach, data lifecycle management, and future scaling considerations.

---

## 2. Database Technology

| Concern | Technology |
|---|---|
| Primary database | PostgreSQL 15+ |
| ORM | TypeORM (NestJS) |
| Migrations | TypeORM migration files (version controlled) |
| Session/cache | Redis 7+ |
| Job queue backing store | Redis (BullMQ) |
| Time-series data (future) | TimescaleDB extension or InfluxDB |

---

## 3. Schema Design Principles

1. **UUID primary keys** — all tables use UUID v4 for portability and privacy
2. **Decimal-safe monetary fields** — `DECIMAL(18,8)` for prices and P&L; `DECIMAL(5,4)` for rates and percentages
3. **Audit timestamps** — all tables include `created_at` and `updated_at`
4. **Soft deletes** — sensitive entities (User, Trade) use `deleted_at` rather than hard DELETE
5. **No hard-coded enum values in DB** — enums defined in application layer, stored as VARCHAR with CHECK constraints
6. **Immutable audit log** — audit_logs table has no UPDATE or DELETE access path
7. **Separate schema namespaces** per bounded context to support future microservices extraction
8. **All foreign keys indexed** — explicit FK indexes for join performance

---

## 4. Schema Namespaces

| Schema | Bounded Context |
|---|---|
| `identity` | Users, Auth, MFA, OTP records |
| `brokerage` | Broker connections, accounts |
| `subscriptions` | Plans, plan pricing, subscriptions, invoices, tax rules |
| `trading` | Sessions, trades, signals |
| `risk` | Risk profiles, violations |
| `performance` | Performance snapshots, history |
| `revenue` | Fee records, owner ledger |
| `audit` | Audit log (append-only) |
| `admin` | Admin configuration, kill switch |
| `platform` | Country configs, currency configs, provider routing |
| `notifications` | SMS deliveries, notification preferences |
| `wallet` | [Future — Model B] |

---

## 5. Core Table Definitions

### 5.1 identity.users

```sql
CREATE TABLE identity.users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       VARCHAR(255) NOT NULL UNIQUE,
  password_hash               VARCHAR(255) NOT NULL,
  status                      VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION'
                                CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','CLOSED')),
  role                        VARCHAR(20) NOT NULL DEFAULT 'USER'
                                CHECK (role IN ('USER','ADMIN','SUPER_ADMIN')),
  mfa_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_encrypted        TEXT,
  email_verified_at           TIMESTAMPTZ,
  risk_disclosure_accepted_at TIMESTAMPTZ,
  terms_accepted_at           TIMESTAMPTZ,
  ip_at_registration          INET,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON identity.users(email);
CREATE INDEX idx_users_status ON identity.users(status);
```

### 5.2 identity.user_profiles

```sql
CREATE TABLE identity.user_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id),
  first_name                VARCHAR(100),
  last_name                 VARCHAR(100),
  country                   CHAR(2),
  phone_number              VARCHAR(30),
  trading_experience        VARCHAR(20) CHECK (trading_experience IN ('NONE','BEGINNER','INTERMEDIATE','EXPERIENCED')),
  preferred_currency        CHAR(3),
  onboarding_completed_at   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_profiles_user_id ON identity.user_profiles(user_id);
```

### 5.3 brokerage.broker_connections

```sql
CREATE TABLE brokerage.broker_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES identity.users(id),
  broker_id               VARCHAR(50) NOT NULL,
  account_id              VARCHAR(100) NOT NULL,
  account_type            VARCHAR(10) NOT NULL CHECK (account_type IN ('DEMO','LIVE')),
  status                  VARCHAR(20) NOT NULL DEFAULT 'CONNECTED'
                            CHECK (status IN ('CONNECTED','DISCONNECTED','SUSPENDED','REVOKED')),
  encrypted_credentials   TEXT NOT NULL,
  credential_key_id       VARCHAR(255) NOT NULL,
  last_health_check_at    TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broker_connections_user_id ON brokerage.broker_connections(user_id);
CREATE INDEX idx_broker_connections_status ON brokerage.broker_connections(status);
```

### 5.4 brokerage.broker_accounts

```sql
CREATE TABLE brokerage.broker_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_connection_id  UUID NOT NULL REFERENCES brokerage.broker_connections(id),
  balance               DECIMAL(18,8) NOT NULL DEFAULT 0,
  equity                DECIMAL(18,8) NOT NULL DEFAULT 0,
  margin                DECIMAL(18,8) NOT NULL DEFAULT 0,
  free_margin           DECIMAL(18,8) NOT NULL DEFAULT 0,
  margin_level          DECIMAL(10,4),
  currency              CHAR(3) NOT NULL,
  leverage              INTEGER NOT NULL DEFAULT 1,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_broker_accounts_connection ON brokerage.broker_accounts(broker_connection_id);
```

### 5.5 subscriptions.subscription_plans

```sql
CREATE TABLE subscriptions.subscription_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(100) NOT NULL UNIQUE,
  description           TEXT,
  price_cents           INTEGER NOT NULL,
  currency              CHAR(3) NOT NULL,
  billing_cycle         VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('MONTHLY','QUARTERLY','ANNUAL')),
  trial_days            INTEGER NOT NULL DEFAULT 0,
  performance_fee_rate  DECIMAL(5,4) NOT NULL DEFAULT 0.20,
  max_concurrent_trades INTEGER NOT NULL DEFAULT 5,
  features              JSONB NOT NULL DEFAULT '{}',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.6 subscriptions.subscriptions

```sql
CREATE TABLE subscriptions.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id),
  plan_id                   UUID NOT NULL REFERENCES subscriptions.subscription_plans(id),
  status                    VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                              CHECK (status IN ('TRIAL','ACTIVE','EXPIRED','CANCELLED','SUSPENDED')),
  started_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                TIMESTAMPTZ NOT NULL,
  trial_ends_at             TIMESTAMPTZ,
  auto_renew                BOOLEAN NOT NULL DEFAULT TRUE,
  payment_provider          VARCHAR(30),
  external_subscription_id  VARCHAR(255),
  cancelled_at              TIMESTAMPTZ,
  cancellation_reason       TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions.subscriptions(status);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions.subscriptions(expires_at);
```

### 5.7 subscriptions.invoices

```sql
CREATE TABLE subscriptions.invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id       UUID NOT NULL REFERENCES subscriptions.subscriptions(id),
  user_id               UUID NOT NULL REFERENCES identity.users(id),
  plan_name             VARCHAR(100) NOT NULL,
  amount_cents          INTEGER NOT NULL,
  tax_amount_cents      INTEGER NOT NULL DEFAULT 0,
  tax_rate              DECIMAL(5,4) NOT NULL DEFAULT 0,
  tax_description       VARCHAR(50),
  total_amount_cents    INTEGER NOT NULL,
  currency              CHAR(3) NOT NULL,
  status                VARCHAR(15) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED','VOID')),
  payment_provider      VARCHAR(30),
  external_invoice_id   VARCHAR(255),
  external_payment_id   VARCHAR(255),
  billing_period_start  TIMESTAMPTZ,
  billing_period_end    TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  receipt_url           TEXT,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_user_id ON subscriptions.invoices(user_id);
CREATE INDEX idx_invoices_subscription_id ON subscriptions.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON subscriptions.invoices(status);
```

### 5.8 trading.trading_sessions

```sql
CREATE TABLE trading.trading_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id),
  broker_connection_id      UUID NOT NULL REFERENCES brokerage.broker_connections(id),
  subscription_id           UUID NOT NULL REFERENCES subscriptions.subscriptions(id),
  status                    VARCHAR(40) NOT NULL DEFAULT 'ACTIVE'
                              CHECK (status IN ('ACTIVE','PAUSED','STOPPED','SUSPENDED_BROKER_FAILURE',
                                                'SUSPENDED_KILL_SWITCH','SUSPENDED_RISK_LIMIT')),
  risk_profile_snapshot     JSONB NOT NULL,
  started_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at                TIMESTAMPTZ,
  paused_at                 TIMESTAMPTZ,
  stop_reason               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trading_sessions_user_id ON trading.trading_sessions(user_id);
CREATE INDEX idx_trading_sessions_status ON trading.trading_sessions(status);
```

### 5.8 trading.trades

```sql
CREATE TABLE trading.trades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_session_id    UUID NOT NULL REFERENCES trading.trading_sessions(id),
  user_id               UUID NOT NULL REFERENCES identity.users(id),
  broker_connection_id  UUID NOT NULL REFERENCES brokerage.broker_connections(id),
  external_order_id     VARCHAR(255),
  idempotency_key       VARCHAR(255) NOT NULL UNIQUE,
  instrument            VARCHAR(20) NOT NULL,
  direction             VARCHAR(4) NOT NULL CHECK (direction IN ('BUY','SELL')),
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','OPEN','CLOSED','CANCELLED','REJECTED')),
  lot_size              DECIMAL(10,4) NOT NULL,
  entry_price           DECIMAL(18,8),
  exit_price            DECIMAL(18,8),
  stop_loss             DECIMAL(18,8) NOT NULL,
  take_profit           DECIMAL(18,8) NOT NULL,
  trailing_stop_pips    DECIMAL(10,2),
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  realised_pnl          DECIMAL(18,8),
  commission            DECIMAL(18,8) NOT NULL DEFAULT 0,
  swap                  DECIMAL(18,8) NOT NULL DEFAULT 0,
  signal_id             UUID,
  signal_confidence     DECIMAL(5,4),
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_user_id ON trading.trades(user_id);
CREATE INDEX idx_trades_session_id ON trading.trades(trading_session_id);
CREATE INDEX idx_trades_status ON trading.trades(status);
CREATE INDEX idx_trades_opened_at ON trading.trades(opened_at);
CREATE INDEX idx_trades_instrument ON trading.trades(instrument);
CREATE UNIQUE INDEX idx_trades_idempotency ON trading.trades(idempotency_key);
```

### 5.9 trading.signals

```sql
CREATE TABLE trading.signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_version    VARCHAR(50) NOT NULL,
  instrument        VARCHAR(20) NOT NULL,
  timeframe         VARCHAR(10) NOT NULL,
  direction         VARCHAR(10) NOT NULL CHECK (direction IN ('BUY','SELL','HOLD','CLOSE','MODIFY')),
  confidence        DECIMAL(5,4) NOT NULL,
  entry_price       DECIMAL(18,8),
  suggested_sl      DECIMAL(18,8),
  suggested_tp      DECIMAL(18,8),
  volatility_score  DECIMAL(5,4),
  trend_score       DECIMAL(5,4),
  regime_detected   VARCHAR(50),
  indicators        JSONB,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_signals_instrument ON trading.signals(instrument);
CREATE INDEX idx_signals_generated_at ON trading.signals(generated_at);
```

### 5.10 risk.risk_profiles

```sql
CREATE TABLE risk.risk_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id) UNIQUE,
  max_daily_loss_percent    DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  max_drawdown_percent      DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  max_position_size_lots    DECIMAL(10,4) NOT NULL DEFAULT 0.10,
  max_concurrent_trades     INTEGER NOT NULL DEFAULT 3,
  max_daily_trades          INTEGER NOT NULL DEFAULT 10,
  risk_level                VARCHAR(15) NOT NULL DEFAULT 'MODERATE'
                              CHECK (risk_level IN ('CONSERVATIVE','MODERATE','AGGRESSIVE')),
  trading_hours_start       TIME,
  trading_hours_end         TIME,
  allowed_instruments       VARCHAR(20)[],
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_risk_profiles_user_id ON risk.risk_profiles(user_id);
```

### 5.11 performance.performance_accounts

```sql
CREATE TABLE performance.performance_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES identity.users(id) UNIQUE,
  total_realised_pnl  DECIMAL(18,8) NOT NULL DEFAULT 0,
  high_water_mark     DECIMAL(18,8) NOT NULL DEFAULT 0,
  last_settled_at     TIMESTAMPTZ,
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.12 revenue.fee_records

```sql
CREATE TABLE revenue.fee_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id),
  settlement_period_start   TIMESTAMPTZ NOT NULL,
  settlement_period_end     TIMESTAMPTZ NOT NULL,
  realised_pnl_in_period    DECIMAL(18,8) NOT NULL,
  pnl_above_hwm             DECIMAL(18,8) NOT NULL,
  fee_rate                  DECIMAL(5,4) NOT NULL,
  fee_amount                DECIMAL(18,8) NOT NULL,
  currency                  CHAR(3) NOT NULL,
  calculated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                    VARCHAR(15) NOT NULL DEFAULT 'CALCULATED'
                              CHECK (status IN ('CALCULATED','POSTED','DISPUTED'))
);

CREATE INDEX idx_fee_records_user_id ON revenue.fee_records(user_id);
CREATE INDEX idx_fee_records_calculated_at ON revenue.fee_records(calculated_at);
```

### 5.13 audit.audit_logs

```sql
CREATE TABLE audit.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  VARCHAR(100) NOT NULL,
  actor_id    UUID,
  actor_type  VARCHAR(20) NOT NULL CHECK (actor_type IN ('USER','ADMIN','SYSTEM')),
  entity_type VARCHAR(100),
  entity_id   UUID,
  payload     JSONB NOT NULL DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only enforced via row-level security + application permission
CREATE INDEX idx_audit_logs_event_type ON audit.audit_logs(event_type);
CREATE INDEX idx_audit_logs_actor_id ON audit.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity_id ON audit.audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit.audit_logs(created_at);

-- Revoke UPDATE and DELETE on audit_logs for application role
REVOKE UPDATE, DELETE ON audit.audit_logs FROM irexpro_app;
```

### 5.14 subscriptions.plan_pricing

Multi-currency pricing for subscription plans:

```sql
CREATE TABLE subscriptions.plan_pricing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES subscriptions.subscription_plans(id),
  currency          CHAR(3) NOT NULL,
  amount_cents      INTEGER NOT NULL,
  provider_plan_id  VARCHAR(255),   -- Provider-side plan/price ID for this currency
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, currency)
);
```

### 5.15 subscriptions.tax_rules

Country-specific tax/VAT configuration:

```sql
CREATE TABLE subscriptions.tax_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  CHAR(2) NOT NULL UNIQUE,
  tax_type      VARCHAR(10) NOT NULL CHECK (tax_type IN ('VAT','GST','SALES_TAX','NONE')),
  tax_rate      DECIMAL(5,4) NOT NULL DEFAULT 0,
  description   VARCHAR(50),          -- e.g., "VAT (UK 20%)"
  applies_to    VARCHAR(20) NOT NULL DEFAULT 'SUBSCRIPTION',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.16 subscriptions.user_payment_profiles

Stores provider-side customer references per user per provider:

```sql
CREATE TABLE subscriptions.user_payment_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES identity.users(id),
  payment_provider        VARCHAR(30) NOT NULL,
  external_customer_id    VARCHAR(255) NOT NULL,
  preferred_currency      CHAR(3),
  default_payment_method  VARCHAR(255),   -- Provider-side payment method token (never raw card data)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, payment_provider)
);

CREATE INDEX idx_user_payment_profiles_user ON subscriptions.user_payment_profiles(user_id);
```

### 5.17 platform.country_configs

Full schema defined in [23-country-and-regional-configuration.md](./23-country-and-regional-configuration.md). Summary:

```sql
CREATE TABLE platform.country_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code                CHAR(2) NOT NULL UNIQUE,
  country_name                VARCHAR(100) NOT NULL,
  region                      VARCHAR(50) NOT NULL,
  is_supported                BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked                  BOOLEAN NOT NULL DEFAULT FALSE,
  default_currency            CHAR(3) NOT NULL,
  supported_currencies        CHAR(3)[] NOT NULL DEFAULT '{}',
  preferred_payment_provider  VARCHAR(30),
  fallback_payment_providers  VARCHAR(30)[] DEFAULT '{}',
  supported_payment_methods   VARCHAR(30)[] DEFAULT '{}',
  preferred_sms_provider      VARCHAR(30),
  fallback_sms_providers      VARCHAR(30)[] DEFAULT '{}',
  supported_broker_ids        VARCHAR(50)[] DEFAULT '{}',
  kyc_required                BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_level                   VARCHAR(20) DEFAULT 'NONE',
  aml_screening_required      BOOLEAN NOT NULL DEFAULT FALSE,
  vat_applicable              BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate                    DECIMAL(5,4),
  vat_description             VARCHAR(50),
  primary_language            CHAR(5) NOT NULL DEFAULT 'en',
  supported_languages         CHAR(5)[] DEFAULT '{en}',
  default_timezone            VARCHAR(50) NOT NULL DEFAULT 'UTC',
  forex_trading_allowed       BOOLEAN NOT NULL DEFAULT TRUE,
  special_disclosure_required BOOLEAN NOT NULL DEFAULT FALSE,
  special_disclosure_text     TEXT,
  regulatory_notes            TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_country_configs_supported ON platform.country_configs(is_supported, is_blocked);
```

### 5.18 notifications.sms_deliveries

```sql
CREATE TABLE notifications.sms_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES identity.users(id),
  provider_id     VARCHAR(30) NOT NULL,
  message_type    VARCHAR(40) NOT NULL,
  phone_number    VARCHAR(20) NOT NULL,
  provider_msg_id VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  segment_count   INTEGER NOT NULL DEFAULT 1,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Message body intentionally not stored — PII minimisation
);

CREATE INDEX idx_sms_deliveries_user_id ON notifications.sms_deliveries(user_id);
CREATE INDEX idx_sms_deliveries_created_at ON notifications.sms_deliveries(created_at);
```

### 5.19 notifications.notification_preferences

```sql
CREATE TABLE notifications.notification_preferences (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES identity.users(id) UNIQUE,
  sms_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  sms_trade_alerts          BOOLEAN NOT NULL DEFAULT FALSE,  -- Off by default (cost control)
  sms_risk_alerts           BOOLEAN NOT NULL DEFAULT TRUE,
  sms_broker_alerts         BOOLEAN NOT NULL DEFAULT TRUE,
  sms_payment_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  sms_session_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  email_trade_summary       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.20 admin.global_kill_switch

```sql
CREATE TABLE admin.global_kill_switch (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  activated_by    UUID REFERENCES identity.users(id),
  activated_at    TIMESTAMPTZ,
  reason          TEXT,
  deactivated_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin.global_kill_switch (id, is_active) VALUES (1, FALSE);
```

---

## 6. Indexing Strategy

| Priority | Index Type | Columns |
|---|---|---|
| High | Unique | `users.email`, `trades.idempotency_key` |
| High | Covering | `trades(user_id, status, opened_at)` for dashboard queries |
| High | B-tree | All foreign key columns |
| Medium | B-tree | `audit_logs(created_at)`, `subscriptions(expires_at)` |
| Medium | GIN | `trades.instrument` for filtering |
| Future | BRIN | `audit_logs(created_at)` for time-series range scans on large tables |

---

## 7. Redis Usage

| Key Pattern | Purpose | TTL |
|---|---|---|
| `session:{userId}` | WebSocket session mapping | 24h |
| `signal:{instrument}:{timeframe}` | Latest signal cache | 5min |
| `broker:state:{connectionId}` | Latest broker account state | 60s |
| `ratelimit:{ip}:{endpoint}` | Rate limiting counters | 1min |
| `killswitch:active` | Kill switch state cache | 10s |
| `queue:fee-calculation` | BullMQ fee settlement jobs | Persistent |
| `queue:broker-reconcile` | BullMQ reconciliation jobs | Persistent |

---

## 8. Database Backup and Recovery

| Policy | Configuration |
|---|---|
| **Backup frequency** | Continuous WAL archiving + daily full backup |
| **Retention** | 30 days rolling + end-of-month archive for 7 years |
| **Recovery point objective** | < 1 minute (WAL streaming) |
| **Recovery time objective** | < 30 minutes for full restore |
| **Testing** | Monthly restore test in staging environment |
| **Encryption** | Backups encrypted at rest with KMS key |

---

## 9. Migration Strategy

- All schema changes managed via TypeORM migration files
- Migrations version-controlled in `src/database/migrations/`
- Naming: `{timestamp}-{description}.ts` e.g., `1719310000000-CreateUsersTable.ts`
- Migrations run as part of CI/CD deployment pipeline
- Destructive migrations (drop column, drop table) require explicit approval step in CI
- Zero-downtime migrations: additive changes first, backfill data, then remove old columns in next deployment
