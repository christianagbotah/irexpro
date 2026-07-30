# Runbook — Production Deployment (VPS / Webuzo)

This runbook describes how to deploy iRexPro to a single VPS (Virtual Private
Server) managed via Webuzo or an equivalent Linux VPS control panel. It is the
**first production target** for iRexPro and intentionally simpler than the
Kubernetes/AWS target described in
`docs/architecture/15-devops-and-deployment.md` (which remains the Phase 2
long-term target).

> **Sprint 21 update:** This runbook has been hardened with findings from a real
> Webuzo VPS staging dry-run on **AlmaLinux 9.8** (PostgreSQL 18, PM2, Nginx +
> Cloudflare). The verified staging endpoints used during that dry-run were:
> - VPS app path: `/home/lightworld/webapps/irexpro-staging`
> - Public staging API: `https://irexpro.lightworldtech.com/api/v1`
> - NestJS API (local): `http://127.0.0.1:3010/api/v1`
> - AI engine (local only): `http://127.0.0.1:8011/api/v1`
>
> Where the staging dry-run contradicted the original Sprint 19 assumptions
> (port numbers, health-endpoint paths, DB env-var names, the AI engine
> uvicorn entrypoint, Nginx structure, uuid-ossp on PG 18), the runbook now
> reflects the **verified** staging behaviour. A "Verified Staging Dry-Run
> Checklist" (§16) records exactly what passed on the real VPS.

Sprint 19 / Sprint 21 are **documentation and deployment-foundation sprints
only**. They do NOT change any production logic, payment-state transitions,
webhook processing, broker credential handling, risk engine rules, execution
engine rules, or the AI-to-trade flow. All of those invariants remain exactly
as they were after Sprint 18 (and the Sprint 20 runtime DI fix).

---

## 0. Non-negotiable safety rules (read first)

These rules apply to every deployment described in this runbook. Violating any
of them is a critical incident.

1. **Checkout never marks anything paid.** Only a verified provider webhook
   confirms payment. (Sprint 10–18 invariant.)
2. **Risk approval is mandatory and non-bypassable.** No trade may execute
   without the Risk Engine emitting `APPROVED`.
3. **AI must never execute broker orders directly.** The Python AI engine
   produces signals only; NestJS runs the full
   `Signal → Strategy → Subscription Gate → Broker Gate → Risk → Execution → Broker Adapter` pipeline.
4. **Broker credentials must remain encrypted at rest** (AES-256-GCM via
   `BROKER_ENCRYPTION_KEY`) and must NEVER appear in responses, logs, audit
   metadata, WebSocket events, or errors.
5. **No raw card data, mobile-money PINs, payment secrets, broker secrets,
   JWT secrets, or API tokens may be stored.**
6. **All persisted/API money values remain integer minor-unit strings** — no
   floating-point money at financial boundaries.
7. **Production failures fail closed.** Do NOT introduce demo-data fallback,
   SQLite, or database-failure demo fallback into payment, broker, risk,
   execution, subscription, or reconciliation flows.
8. **No Fovi-style Next.js API routes, localStorage auth, or floating money
   fields.** iRexPro is a NestJS + Python FastAPI backend. The Next.js app is a
   frontend consumer only.
9. **Never commit real secrets to git.** See
   `docs/runbooks/secrets-never-committed.md` for the full list.

---

## 1. System requirements

### 1.1 VPS specifications (minimum for a single-node production deploy)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS **or AlmaLinux 9.x** | Ubuntu 24.04 LTS / AlmaLinux 9.8+ |
| Swap | 2 GB | 4 GB |

> **Verified:** the staging dry-run used **AlmaLinux 9.8** with Webuzo. All
> commands in this runbook that are Ubuntu-specific (`apt`) have an AlmaLinux
> equivalent (`dnf`) noted where it matters.

### 1.2 Required software stack

| Component | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS (≥ 20.0.0) | NestJS API runtime |
| pnpm | 9.x (≥ 9.0.0) | Package manager (workspace) |
| Python | 3.11 (≥ 3.11.0) | AI engine runtime |
| PostgreSQL | 15+ (staging verified on **18**) | Primary database |
| Redis | 7 (≥ 7.0.0) | BullMQ queues + AI OHLCV cache |
| Nginx | ≥ 1.18 | Reverse proxy + TLS termination |
| PM2 | ≥ 5.3 | Process manager (recommended) OR systemd |
| Certbot | latest | Let's Encrypt TLS certificates |

> **Webuzo note:** Webuzo already provides PostgreSQL, Redis, Nginx, and
> Certbot as installable apps. You may use the Webuzo-managed versions OR
> install them directly on the OS — but pick **one** management path per
> service and do not run two instances on the same port.

### 1.3 Network / firewall

Open only these inbound ports:

| Port | Service | Exposed to |
|---|---|---|
| 22 | SSH | Your IP / bastion only |
| 80 | Nginx HTTP (redirect to 443) | Public |
| 443 | Nginx HTTPS | Public |

**Do NOT expose** the API port, the AI engine port, PostgreSQL, or Redis to the
public internet. Bind them to `127.0.0.1` or a private network interface only.
Nginx proxies public 443 → the internal API port.

### 1.4 Port assignments (verified on staging)

Use distinct ports for each service. **Do not reuse frontend ports for the API**
and do not publicly expose the AI engine.

| Service | Env var(s) | Staging port | Public? |
|---|---|---|---|
| NestJS API | `APP_PORT` (the app also reads `PORT` for tooling compatibility, but `APP_PORT` is the source of truth in `configuration.ts`) | `3010` | Yes — via Nginx `^~ /api/v1/` |
| AI engine | `AI_ENGINE_PORT` | `8011` | **No** — local only (`127.0.0.1`) |
| Frontend (Next.js) | (frontend-managed) | `3005` or `3006` | Yes — via Nginx `location /` |
| PostgreSQL | `DB_PORT` | `5432` | No — local only |
| Redis | `REDIS_PORT` | `6379` | No — local only |

> **Verified:** staging ran the API on `3010`, the AI engine on `8011`, and the
> frontend on `3005`. The original Sprint 19 runbook used `3000`/`8001` as
> examples — those still work, but the staging-verified ports are `3010`/`8011`.
> Whichever ports you choose, set them consistently in `apps/api/.env`
> (`APP_PORT`) and `services/ai-engine/.env` (`AI_ENGINE_PORT`), and mirror them
> in the Nginx upstream blocks (§8) and the PM2 ecosystem (§7).

---

## 2. PostgreSQL setup

### 2.1 Install (Ubuntu, non-Webuzo path)

```bash
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib
sudo systemctl enable --now postgresql
```

AlmaLinux / RHEL equivalent (verified on AlmaLinux 9.8):

```bash
sudo dnf install -y postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

> **Webuzo note:** Webuzo installs PostgreSQL as a managed app (verified on PG
> 18). Use the Webuzo panel to start/stop it; the OS-level commands above are
> only for a non-Webuzo install.

### 2.2 Create the database + role

Run as the `postgres` OS user:

```bash
sudo -u postgres psql <<'SQL'
-- Role + database for iRexPro. Use a strong generated password, NOT this placeholder.
CREATE ROLE irexpro WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE irexpro_prod OWNER irexpro;

-- Schemas + extensions (mirrors infrastructure/docker/postgres/init.sql).
\c irexpro_prod
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS subscriptions;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS performance;
CREATE SCHEMA IF NOT EXISTS revenue;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS broker;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL
```

> If you used the Webuzo PostgreSQL app, create the database and user through
> the Webuzo panel instead, then run only the `CREATE SCHEMA` / `CREATE
> EXTENSION` block above against the created database.

### 2.3 uuid-ossp on PostgreSQL 18 / AlmaLinux (verified staging finding)

The iRexPro migrations call `uuid_generate_v4()` and run
`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`. On **Webuzo PostgreSQL 18 /
AlmaLinux 9.8**, the `uuid-ossp` extension can fail with:

```
ERROR: could not access file "MODULE_PATHNAME": No such file or directory
-- or --
ERROR: could not load library "/usr/pgsql-18/lib/uuid-ossp.so":
       libossp-uuid.so.16: cannot open shared object file: No such file or directory
```

This means the OS package that provides `libossp-uuid.so.16` is missing.

**Fix — install the package that provides `libossp-uuid.so.16`, then refresh
the dynamic linker and retry the extension:**

```bash
# AlmaLinux / RHEL 9 — the package is 'uuid' (provides libossp-uuid.so.16)
sudo dnf install -y uuid
sudo ldconfig

# Ubuntu / Debian — the package is 'uuid-dev' / 'libossp-uuid16' (or 'ossp-uuid')
sudo apt install -y uuid-dev libossp-uuid16
sudo ldconfig
```

After installing the package, retry the extension and verify it works:

```bash
# Create the extension (run as the postgres superuser against the iRexPro DB)
sudo -u postgres psql -d irexpro_prod -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# Verify uuid_generate_v4() actually returns a UUID (not an error)
sudo -u postgres psql -d irexpro_prod -c 'SELECT uuid_generate_v4();'
# Expected: a single row with a UUID like a1b2c3d4-...
```

If `SELECT uuid_generate_v4();` returns a UUID, migrations will succeed. If it
errors, the shared library is still missing — re-check `ldconfig -p | grep ossp`
and reinstall the package.

**Emergency-only fallback (NOT recommended for normal use):** if you absolutely
cannot install `libossp-uuid.so.16` on the target host, you can create a
`public.uuid_generate_v4()` SQL function that wraps `gen_random_uuid()` (from
`pgcrypto`, which is already installed). This makes migrations that call
`uuid_generate_v4()` succeed without the `uuid-ossp` extension. **Prefer
installing the proper package** — this fallback exists only for emergency
compatibility and should be removed once the package is installed:

```sql
-- EMERGENCY FALLBACK ONLY — prefer installing libossp-uuid.so.16 (see above).
-- Run as a superuser against the iRexPro database.
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT gen_random_uuid()';
```

> **Why prefer the package:** the real `uuid-ossp` extension and the
> `public.uuid_generate_v4()` wrapper both return UUIDv4s, so functionally they
> are equivalent for iRexPro. But the wrapper adds a permanent `public` schema
> function that must be maintained/removed manually, while the package install
> is a one-time OS-level fix that makes the extension work the standard way.

### 2.4 PostgreSQL hardening

- **Bind to localhost only** in `postgresql.conf` (`listen_addresses = 'localhost'`)
  unless you have a private network between app and DB nodes.
- **Require SSL** for app connections in production: set `DB_SSL=true` in
  `.env` and configure `pg_hba.conf` with `hostssl` rules. (Staging ran with
  `DB_SSL=false` because the DB and API were on the same host; production
  should use `DB_SSL=true` if DB and API are on different hosts.)
- **Backups:** enable `pg_dump` cron jobs (see §11 Rollback).
- **Connection pool:** the default `DB_MAX_CONNECTIONS=10` in `.env.example` is
  fine for a single small instance. Increase to 20–30 on a 4 vCPU / 8 GB node.

### 2.5 Verify

```bash
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U irexpro -d irexpro_prod -c "SELECT 1;"
# Expected: a single row "1" is returned.
```

---

## 3. Redis setup

### 3.1 Install (Ubuntu)

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

### 3.2 Hardening

Edit `/etc/redis/redis.conf`:

```conf
bind 127.0.0.1 ::1
protected-mode yes
requirepass REPLACE_WITH_STRONG_REDIS_PASSWORD
appendonly yes
maxmemory 512mb
maxmemory-policy allkeys-lru
```

Restart: `sudo systemctl restart redis-server`.

### 3.3 Database separation

The NestJS API uses `REDIS_DB=0` (default). The Python AI engine uses
`REDIS_DB=1` (configured in `services/ai-engine/.env.example`). This separation
is **required** — do not point both services at the same Redis DB number, or
BullMQ queue keys and AI OHLCV cache keys may collide.

### 3.4 Verify

```bash
redis-cli -h 127.0.0.1 -a "$REDIS_PASSWORD" PING
# Expected: PONG
```

---

## 4. Environment variable setup

### 4.1 Copy the example files

```bash
cd /opt/irexpro          # or /home/lightworld/webapps/irexpro-staging on the verified staging host
cp apps/api/.env.example apps/api/.env
cp services/ai-engine/.env.example services/ai-engine/.env
```

### 4.1.1 Correct DB env variable names (verified staging finding)

The app reads **`DB_USER`**, NOT `DB_USERNAME`. The validation schema
(`validation.schema.ts`) and `configuration.ts` both use `DB_USER`. Setting
`DB_USERNAME` will be silently ignored and the app will fall back to the
default user (`irexpro`) or fail to boot. A correct DB block in
`apps/api/.env` looks like:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=irexpro_staging           # irexpro_prod in production
DB_USER=irexpro_staging_user      # NOT DB_USERNAME
DB_PASSWORD=<strong generated secret>
DB_SSL=false                      # true in production if DB is remote
DB_SYNCHRONIZE=false              # NEVER true in production
```

### 4.1.2 API port (verified staging finding)

The API reads **`APP_PORT`** as the source of truth (in `configuration.ts`).
Some deployment tooling also expects a `PORT` env var; set both to the same
value for staging/production so PM2, Nginx, and the app agree:

```bash
PORT=3010
APP_PORT=3010
```

Do not reuse frontend ports (e.g. `3005`/`3006`) for the API. The AI engine
uses `AI_ENGINE_PORT=8011` and must remain on its own port (see §1.4).

### 4.2 Generate strong secrets

Generate every `CHANGE_ME_*` / `PLACEHOLDER` value. Never reuse dev secrets in
production. Example generators:

```bash
# JWT_SECRET (min 32 chars), COOKIE_SECRET (min 16 chars), BROKER_ENCRYPTION_KEY (min 32 chars)
openssl rand -base64 48        # use for JWT_SECRET
openssl rand -base64 32        # use for COOKIE_SECRET
openssl rand -hex 32           # use for BROKER_ENCRYPTION_KEY (64 hex chars = 32 bytes)
openssl rand -hex 32           # use for NESTJS_INTERNAL_API_KEY (must match in both .env files)

# DB password, Redis password
openssl rand -base64 24
```

### 4.3 Production-only values you MUST change

| Variable | Dev/example value | Production requirement |
|---|---|---|
| `NODE_ENV` | `development` | **`production`** |
| `DB_NAME` | `irexpro_dev` | `irexpro_prod` |
| `DB_PASSWORD` | `CHANGE_ME_DEV_PASSWORD` | Strong generated password |
| `DB_SSL` | `false` | `true` (recommended) |
| `DB_SYNCHRONIZE` | `false` | **`false`** (NEVER `true` in production) |
| `DB_LOGGING` | `false` | `false` (or `true` only for debugging; never log in long-term prod) |
| `REDIS_PASSWORD` | (empty) | Strong generated password |
| `JWT_SECRET` | `CHANGE_ME_...` | Strong generated secret (min 32 chars) |
| `COOKIE_SECRET` | `CHANGE_ME_...` | Strong generated secret (min 16 chars) |
| `BROKER_ENCRYPTION_KEY` | `CHANGE_ME_...` | Strong generated key (min 32 chars) — see §4.5 |
| `NESTJS_INTERNAL_API_KEY` | `dev_internal_key_change_me` | Strong generated key — **must match** `services/ai-engine/.env` |
| `SWAGGER_ENABLED` | `true` | **`false`** in production (Swagger is also disabled by `main.ts` when `NODE_ENV=production`, but set the flag too) |
| `APP_PORT` / `PORT` | `3000` | `3010` (staging-verified) — set both to the same value |
| `CORS_ORIGINS` | `localhost` URLs | Your production frontend origin(s) only — see §4.3.1 |
| `PAYSTACK_ENABLED` | `false` | `true` only after you have configured real sandbox/live keys |
| `STRIPE_ENABLED` | `false` | `true` only after you have configured real sandbox/live keys |
| `PAYSTACK_CALLBACK_URL` / `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | `localhost` | Your production frontend URLs |
| `AI_ENGINE_PORT` (AI engine) | `8001` | `8011` (staging-verified) — local only, never public |
| `AI_ENGINE_SCHEDULER_ENABLED` | `false` | `true` only when you are ready to run the paper-mode signal scheduler |
| `AI_SIGNAL_MODE` (AI engine) | `paper` | **`paper`** (live is not supported and will be rejected; must remain `paper` unless live trading has passed a separate controlled approval process) |
| `AI_ALLOW_MOCK_MARKET_DATA` (AI engine) | `false` | **`false`** in staging/production (never `true`) |
| `AI_ENGINE_ENV` (AI engine) | `development` | **`production`** in staging and production |
| `AI_CORS_ORIGINS` (AI engine) | `localhost` URLs | Origin only, no path — see §4.3.1 |

### 4.3.1 CORS guidance (verified staging finding)

**NestJS API `CORS_ORIGINS`** (in `apps/api/.env`):
- Set to the real frontend/staging domain, e.g. `CORS_ORIGINS=https://irexpro.lightworldtech.com`.
- During staging frontend testing, localhost frontend origins may be temporarily
  included, e.g. `CORS_ORIGINS=https://irexpro.lightworldtech.com,http://localhost:3005`.
- Remove localhost origins before going to production.

**AI engine `AI_CORS_ORIGINS`** (in `services/ai-engine/.env`):
- Use an **origin only, no path**. The AI engine is internal-only and is called
  by the NestJS API, not by browsers.
- ✅ Correct: `AI_CORS_ORIGINS=http://localhost:3010`
- ❌ Wrong: `AI_CORS_ORIGINS=http://localhost:3010/api/v1` (the `/api/v1` path
  is rejected by CORS origin parsing).

### 4.4 File permissions

```bash
chmod 600 apps/api/.env services/ai-engine/.env
chown irexpro:irexpro apps/api/.env services/ai-engine/.env   # owned by the service user, not root
```

### 4.5 BROKER_ENCRYPTION_KEY — critical note

This key encrypts every broker credential (MetaTrader account login/password)
at rest with AES-256-GCM. **If you lose this key, every encrypted broker
connection becomes permanently unrecoverable.** If you rotate it, you must
re-encrypt every existing `broker_connections` row (a migration/rotation script
does not yet exist — do NOT rotate casually). Store this key in:

1. Your password manager / vault (primary), AND
2. A sealed offline backup (recovery).

The validation schema (`validation.schema.ts`) enforces `min(32)` and `required`
— the app will not boot without it.

### 4.6 Match the internal API key between services

`NESTJS_INTERNAL_API_KEY` in `apps/api/.env` **must exactly match**
`NESTJS_INTERNAL_API_KEY` in `services/ai-engine/.env`. The Python AI engine
sends this key in the `x-irexpro-internal-api-key` header when publishing
signals to NestJS; NestJS verifies it with a constant-time HMAC comparison via
`InternalApiKeyGuard`. A mismatch causes every AI signal to be rejected with
401.

---

## 5. Build process

### 5.0 Checkout the production branch

**Production always deploys from the `main` branch, never from a sprint branch.**

- Sprint branches (e.g. `sprint-19-production-deployment`) are for development
  and review only. They are NOT deployment targets.
- Sprint work must be merged into `main` before it can be deployed. If a sprint
  branch's work needs to reach production, merge it into `main` first, then
  deploy from `main`.
- Do not deploy from a sprint branch, a feature branch, or a detached HEAD
  unless you are performing a tagged rollback (see §11.1 Application rollback,
  which intentionally checks out a `sprint-*-complete` tag).
- Before building, confirm the working tree is on `main` and up to date with
  the remote. Record the commit hash so you can roll back to it if the deploy
  misbehaves.

```bash
cd /opt/irexpro
git checkout main
git pull --ff-only origin main
git rev-parse HEAD    # record this commit for rollback
git branch --show-current
```

`git branch --show-current` must print `main`. If it prints anything else, stop
and re-run the checkout step before proceeding.

### 5.1 NestJS API

```bash
cd /opt/irexpro
pnpm install --frozen-lockfile --prod=false   # devDeps needed for the build step
pnpm --filter @irexpro/api build              # outputs to apps/api/dist/
```

The build uses `nest build` (TypeScript compiler). Output goes to
`apps/api/dist/`. The `.gitignore` already excludes `dist/` (Sprint 18 hygiene),
so the build must run on the server (or in CI) — `dist/` is not shipped in git.

### 5.1.1 Run the test suite BEFORE PM2 startup (Sprint 20 lesson)

**Always run the test suite after building, before starting the API under PM2.**
This catches runtime DI / module-wiring failures that `nest build` cannot detect
(the build only type-checks; it does not resolve the NestJS dependency graph).

```bash
pnpm --filter @irexpro/api test
```

The suite includes `apps/api/src/bootstrap.spec.ts` (added in Sprint 20) — a
runtime DI smoke test that compiles the real feature-module graph. If any
provider is missing an export (the exact failure that broke the staging PM2
startup in Sprint 20 — `ExecutionService` could not resolve
`CredentialEncryptionService`), this test fails with the same error PM2 would
show at boot. Catching it here means you fix it before the deploy reaches PM2.

Expected on a clean tree: **743 tests passing, 45 suites** (Sprint 20
baseline). If any test fails, do NOT proceed to PM2 startup — fix the failure
first.

### 5.2 Python AI engine

```bash
cd /opt/irexpro/services/ai-engine
python3.11 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -e .          # installs runtime deps from pyproject.toml
# (dev deps not needed in production: pip install -e ".[dev]" only for testing)
```

### 5.2.1 Correct Uvicorn entrypoint (verified staging finding)

The AI engine FastAPI app lives at `app.main:app` (the `app` package, `main`
module, `app` object). The correct Uvicorn entrypoint is:

```bash
# ✅ Correct
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Do NOT use any of these (they will fail with `ModuleNotFoundError` or
`AssertionError: No module found`):

```bash
# ❌ Wrong — there is no top-level main.py
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8011

# ❌ Wrong — there is no src package
.venv/bin/python -m uvicorn src.main:app --host 127.0.0.1 --port 8011
```

The PM2 ecosystem file (`infrastructure/pm2/ecosystem.config.js`) already uses
the correct `app.main:app` entrypoint — see §7.1. The AI engine must bind to
`127.0.0.1` only (never `0.0.0.0`); it is internal-only — see §8.1.

### 5.3 Verify the build artifacts exist

```bash
test -f apps/api/dist/main.js && echo "API build OK" || echo "API build MISSING"
test -f services/ai-engine/.venv/bin/uvicorn && echo "AI engine venv OK" || echo "AI engine venv MISSING"
```

---

## 6. Migration run process

Migrations are **idempotent** (`CREATE ... IF NOT EXISTS`) but you must run
them in order. The `data-source.ts` reads from `apps/api/.env`, so run from the
`apps/api` directory (or set the env vars in your shell).

### 6.1 Check pending migrations (should show all applied, none pending)

```bash
cd /opt/irexpro/apps/api
pnpm migration:show -d src/database/data-source.ts
```

Expected output: a table listing all 8 migrations with `[x]` (applied). If any
show `[ ]` (pending), run the next step.

### 6.2 Run pending migrations

```bash
cd /opt/irexpro/apps/api
pnpm migration:run -d src/database/data-source.ts
```

### 6.3 Pre-migration duplicate check (Sprint 18 migration only)

**Before** running migration `1751500000000-AddPaymentTransactionReferenceUniqueGuard`
against any database that already contains historical payment data, run the
duplicate-check SQL documented in
`docs/runbooks/sprint-18-provider-reference-unique-guard.md`. If it returns any
rows, resolve them before applying the migration or it will fail with a 23505
unique violation at `CREATE INDEX` time.

On a fresh `irexpro_prod` database (no historical data), this check is not
required — the index creates cleanly.

### 6.4 Verify migration state after the run

```bash
cd /opt/irexpro/apps/api
pnpm migration:show -d src/database/data-source.ts
# All 8 migrations should show [x] applied. None pending.
```

### 6.5 Seed (country config)

```bash
cd /opt/irexpro/apps/api
pnpm seed    # loads global-config country seed
```

### 6.6 NEVER set DB_SYNCHRONIZE=true in production

`DB_SYNCHRONIZE=false` is enforced by convention and the `.env.example`
default. Setting it to `true` lets TypeORM auto-alter tables from entity
metadata — this is destructive in production and must never be enabled.

---

## 7. Start process (PM2 recommended)

### 7.1 PM2 ecosystem file

A reference PM2 ecosystem file is provided at
`infrastructure/pm2/ecosystem.config.js` (created in Sprint 19, hardened Sprint
21). It contains **no secrets** — all secrets come from the `.env` files on the
server. The AI engine entrypoint is `app.main:app` (see §5.2.1).

```bash
cd /opt/irexpro
pm2 start infrastructure/pm2/ecosystem.config.js
pm2 save
pm2 startup    # follow the printed instructions to enable boot-on-start
```

### 7.1.1 PM2 + systemd startup sequence (verified staging finding)

PM2 registers itself as a `pm2-<user>` systemd service (e.g. `pm2-root` when
run as root, or `pm2-lightworld` when run as the Webuzo app user). After
starting the API and AI engine, run this full sequence to ensure the PM2
process list is saved AND the underlying systemd unit is healthy:

```bash
# 1. Save the current process list so PM2 restores it on boot
pm2 save

# 2. Generate + install the systemd unit (run once per machine)
pm2 startup
#    PM2 prints the exact sudo command to run — copy/paste it.

# 3. Reload systemd so it picks up the PM2 unit
sudo systemctl daemon-reload

# 4. Clear any stale "failed" state from a previous broken boot
#    (old failed systemd state can persist even while PM2 processes are
#    currently online — this is cosmetic but confusing. reset-failed cleans it.)
sudo systemctl reset-failed pm2-root    # or pm2-<user> if not running as root

# 5. Restart the PM2 unit so it reloads the saved process list
sudo systemctl restart pm2-root         # or pm2-<user>

# 6. Confirm the unit is active and the processes are online
sudo systemctl status pm2-root --no-pager
pm2 status
```

> **Verified:** on the AlmaLinux 9.8 staging host, `systemctl status pm2-root`
> occasionally showed a stale `failed (Result: exit-code)` state even while
> `pm2 status` showed both processes `online`. This happens when a previous
> boot attempt failed (e.g. before the Sprint 20 DI fix) and systemd remembers
> the failure. Step 4 (`reset-failed`) + step 5 (`restart`) clears the stale
> state cleanly. The processes themselves were never actually down — it was a
> systemd bookkeeping artifact.

### 7.2 systemd alternative

If you prefer systemd over PM2, reference unit files are at:
- `infrastructure/systemd/irexpro-api.service`
- `infrastructure/systemd/irexpro-ai-engine.service`

Install:

```bash
sudo cp infrastructure/systemd/irexpro-api.service /etc/systemd/system/
sudo cp infrastructure/systemd/irexpro-ai-engine.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now irexpro-api irexpro-ai-engine
```

### 7.3 Process manager: PM2 vs systemd

| Concern | PM2 | systemd |
|---|---|---|
| Node.js memory | Built-in cluster mode, heap dumps | Manual (NODE_OPTIONS) |
| Log rotation | `pm2-logrotate` module | `logrotate` config |
| Boot-on-start | `pm2 startup` | `systemctl enable` |
| Python service | Yes (interpreter flag) | Yes (native) |
| Zero-config restart | Yes | Yes |
| Recommendation | Easiest for Node+Python on one box | More standard for pure-Linux ops teams |

Pick **one** — do not run both. This runbook recommends PM2 for a single-node
VPS because it manages both the Node.js API and the Python AI engine from one
config file.

---

## 8. Nginx reverse proxy + TLS

### 8.1 Nginx server block (verified staging structure)

The staging dry-run on AlmaLinux 9.8 / Webuzo verified this Nginx structure.
A version-controlled example is also at
`infrastructure/nginx/irexpro-staging.example.conf`.

**Key rules (verified staging findings):**
- Do NOT define duplicate `location ^~ /` blocks — Nginx will reject the config
  or route unpredictably.
- Use `location ^~ /api/v1/` (with `^~`) for the NestJS API so it takes
  precedence over the frontend `location /` catch-all.
- The AI engine (port `8011`) is **never** publicly proxied. The NestJS API
  talks to it internally at `http://127.0.0.1:8011`. Do NOT add a public
  `location` block for the AI engine through Nginx or Cloudflare.
- Do NOT globally hide `Content-Security-Policy` unless you are fixing a
  documented frontend CSP issue. The API does not set CSP; the frontend
  manages its own.

```nginx
# /etc/nginx/conf.d/irexpro.conf  (AlmaLinux/Webuzo)
# or /etc/nginx/sites-available/irexpro.conf  (Ubuntu)

# Upstreams — match the ports in apps/api/.env (APP_PORT) and
# services/ai-engine/.env (AI_ENGINE_PORT). The AI engine upstream is defined
# for documentation only; it is NOT referenced by any public location block.
upstream irexpro_api      { server 127.0.0.1:3010; keepalive 32; }
upstream irexpro_frontend { server 127.0.0.1:3005; keepalive 16; }
# upstream irexpro_ai    { server 127.0.0.1:8011; }   # internal-only — NOT proxied publicly

server {
    listen 80;
    server_name irexpro.lightworldtech.com;   # your domain
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name irexpro.lightworldtech.com;

    ssl_certificate     /etc/letsencrypt/live/irexpro.lightworldtech.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/irexpro.lightworldtech.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ── NestJS API (public) — takes precedence over the frontend catch-all ──
    location ^~ /api/v1/ {
        proxy_pass http://irexpro_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # WebSocket for realtime gateway
        proxy_read_timeout 75s;
        # Payment webhooks under /api/v1/payments/webhooks/ need the full raw
        # body for HMAC signature verification. proxy_request_buffering on
        # (the default) ensures NestJS receives the complete body.
        proxy_request_buffering on;
    }

    # ── Next.js static assets (public) — served directly by the frontend ──
    location ^~ /_next/static/ {
        proxy_pass http://irexpro_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Static assets are immutable — cache aggressively at the proxy.
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # ── Frontend (public) — catch-all, proxies everything else to Next.js ──
    location / {
        proxy_pass http://irexpro_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # Next.js HMR (dev) / WebSocket
        proxy_read_timeout 75s;
    }

    # NOTE: there is intentionally NO public location block for the AI engine
    # (port 8011). The AI engine is internal-only — the NestJS API communicates
    # with it at http://127.0.0.1:8011. Do NOT proxy /ai-engine/ or any other
    # path to the AI engine through Nginx or Cloudflare.
}
```

### 8.2 TLS via Let's Encrypt

```bash
sudo certbot --nginx -d irexpro.lightworldtech.com \
  --redirect --agree-tos --no-eff-email --email admin@yourdomain.com
```

### 8.3 Reload + verify

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://irexpro.lightworldtech.com/api/v1/health    # expect 200
```

---

## 9. Health-check verification

### 9.1 NestJS API health endpoint

> **Verified staging finding:** the API health endpoint is at **`/api/v1/health`**,
> NOT `/health`. The NestJS app sets a global prefix `api/v1` (see `main.ts`:
> `app.setGlobalPrefix(apiPrefix)` where `apiPrefix` defaults to `api/v1`), and
> the `HealthController` is mounted at `@Controller('health')` under that
> prefix. The original Sprint 19 runbook incorrectly said `/health` — that
> returns 404.

The API exposes `GET /api/v1/health` (public, no auth) which runs `SELECT 1`
against PostgreSQL and returns:

```json
{
  "status": "ok",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "environment": "production",
  "version": "0.1.0",
  "database": "connected"
}
```

Verify locally (staging-verified port `3010`):

```bash
curl -i http://127.0.0.1:3010/api/v1/health
# "status": "ok", "database": "connected"
```

Verify through Nginx + TLS (staging-verified domain):

```bash
curl -i https://irexpro.lightworldtech.com/api/v1/health
```

A `"status": "degraded"` or `"database": "disconnected"` response means the API
booted but cannot reach PostgreSQL — check `DB_*` env vars and the PostgreSQL
service. A 404 means you hit `/health` instead of `/api/v1/health`.

### 9.2 Python AI engine health endpoint

> **Verified staging finding:** the AI engine health endpoint is also at
> **`/api/v1/health`**, NOT `/health`. The FastAPI router is mounted at the
> `/api/v1` prefix (`app.include_router(health.router, prefix='/api/v1')`).

The AI engine is internal-only (port `8011`, bound to `127.0.0.1`). Verify
locally:

```bash
curl -i http://127.0.0.1:8011/api/v1/health
```

Do NOT expose this endpoint publicly — the AI engine must remain behind the
NestJS API (see §8.1).

### 9.3 Redis connectivity (runtime check)

If the API is running and BullMQ queues are wired, a failed Redis connection
will surface as BullMQ errors in the PM2/systemd logs. Verify directly:

```bash
redis-cli -h 127.0.0.1 -a "$REDIS_PASSWORD" PING    # PONG
```

### 9.4 Continuous health monitoring (recommended)

Set up an external uptime monitor (UptimeRobot, BetterStack, or a simple cron
`curl`) hitting `https://irexpro.lightworldtech.com/api/v1/health` every 60
seconds. Alert on non-200 or `status != ok`.

---

## 10. Logs

### 10.1 With PM2

```bash
pm2 logs irexpro-api          # follow API logs
pm2 logs irexpro-ai-engine    # follow AI engine logs
pm2 logs                      # follow all

# Log rotation (install once):
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

### 10.2 With systemd

```bash
journalctl -u irexpro-api -f
journalctl -u irexpro-ai-engine -f
```

Configure `logrotate` for the JSON log files if the app writes any to disk.

### 10.3 What logs must NEVER contain

Per the safety rules, logs must never include:
- Broker credentials (encrypted ciphertext, IV, tag, or plaintext)
- Raw payment webhook payloads
- Card data, mobile-money PINs
- `STRIPE_SECRET_KEY`, `PAYSTACK_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PAYSTACK_WEBHOOK_SECRET`
- `BROKER_ENCRYPTION_KEY`, `JWT_SECRET`, `COOKIE_SECRET`
- `NESTJS_INTERNAL_API_KEY`
- `METAAPI_TOKEN`

The codebase is audited to not log these (Sprint 14–18 invariants). If you see
any of these in logs, treat it as a critical incident.

---

## 11. Rollback process

### 11.1 Application rollback (code revert)

```bash
cd /opt/irexpro
git fetch --tags
# Find the last known-good tag
git tag -l 'sprint-*-complete'

# Checkout the previous stable tag (e.g., sprint-18-complete)
git checkout sprint-18-complete
pnpm install --frozen-lockfile
pnpm --filter @irexpro/api build
pm2 restart irexpro-api     # or: sudo systemctl restart irexpro-api
```

### 11.2 Database rollback (migration revert)

**Only revert migrations if the new migrations are confirmed broken.** Reverting
a migration that has already processed real payment/fee data can lose data.

```bash
cd /opt/irexpro/apps/api
# Show current state
pnpm migration:show -d src/database/data-source.ts

# Revert ONLY the last applied migration (one step back)
pnpm migration:revert -d src/database/data-source.ts
```

Each migration has a `down()` method. The Sprint 18 unique-guard migration
(`1751500000000`) drops only the index on revert — no data loss. Earlier
schema-creation migrations drop tables — **do not revert those on a production
database with real data**.

### 11.3 Database backup + restore (always have one before deploying)

Before any deployment or migration run:

```bash
# Backup
pg_dump -h 127.0.0.1 -U irexpro -d irexpro_prod -Fc -f /backups/irexpro_prod_$(date +%Y%m%d_%H%M%S).dump

# Restore (if needed)
pg_restore -h 127.0.0.1 -U irexpro -d irexpro_prod -c /backups/irexpro_prod_YYYYMMDD_HHMMSS.dump
```

Keep at least 7 days of daily backups + 4 weeks of weekly backups. Test a
restore on a staging DB at least once before you need it for real.

### 11.4 Configuration rollback

Keep the previous `.env` file before each deploy:

```bash
cp apps/api/.env /backups/env/api.env.$(date +%Y%m%d_%H%M%S).bak
cp services/ai-engine/.env /backups/env/ai-engine.env.$(date +%Y%m%d_%H%M%S).bak
```

If a bad env var is pushed, restore the previous `.env` and restart the
processes.

---

## 12. Deployment checklist

Print this and tick every box before going live.

### 12.1 Pre-deploy (server + dependencies)

- [ ] VPS meets minimum specs (§1.1)
- [ ] Ubuntu 22.04/24.04 LTS, all security patches applied (`sudo apt update && sudo apt upgrade`)
- [ ] Node.js 20.x LTS installed (`node -v`)
- [ ] pnpm 9.x installed (`pnpm -v`)
- [ ] Python 3.11 installed (`python3.11 --version`)
- [ ] PostgreSQL 15 installed, running, bound to localhost
- [ ] Redis 7 installed, running, password set, bound to localhost
- [ ] Nginx installed
- [ ] PM2 installed (or systemd unit files ready)
- [ ] Firewall: only 22/80/443 open; 3010/8011/5432/6379 NOT public (AI engine 8011 is local-only)

### 12.2 Database

- [ ] `irexpro_prod` database created
- [ ] `irexpro` role created with strong password
- [ ] All 9 schemas created (`identity`, `subscriptions`, `trading`,
      `performance`, `revenue`, `platform`, `broker`, `audit`, `notifications`)
- [ ] `uuid-ossp` + `pgcrypto` extensions enabled
- [ ] `DB_SSL=true` (recommended)
- [ ] `DB_SYNCHRONIZE=false` (NEVER true)
- [ ] Fresh pg_dump backup taken

### 12.3 Configuration

- [ ] `apps/api/.env` copied from `.env.example`, all `CHANGE_ME_*` / `PLACEHOLDER` values replaced
- [ ] `services/ai-engine/.env` copied from `.env.example`, all values replaced
- [ ] `NODE_ENV=production` in `apps/api/.env`
- [ ] `AI_ENGINE_ENV=production` in `services/ai-engine/.env`
- [ ] `SWAGGER_ENABLED=false`
- [ ] `AI_SIGNAL_MODE=paper` (NOT live)
- [ ] `AI_ALLOW_MOCK_MARKET_DATA=false`
- [ ] `NESTJS_INTERNAL_API_KEY` matches exactly between the two `.env` files
- [ ] `BROKER_ENCRYPTION_KEY` is 32+ chars, strong, backed up offline (§4.5)
- [ ] `CORS_ORIGINS` set to production frontend URL(s) only
- [ ] `PAYSTACK_ENABLED` / `STRIPE_ENABLED` set to `true` ONLY if real keys configured
- [ ] Both `.env` files `chmod 600`, owned by the service user

### 12.4 Build + migrate

- [ ] Confirmed `git branch --show-current` reports `main`, not a sprint or feature branch.
- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm --filter @irexpro/api build` succeeds, `apps/api/dist/main.js` exists
- [ ] AI engine venv created, `pip install -e .` succeeds
- [ ] `pnpm migration:show` — all migrations applied, none pending
- [ ] (If first run with historical data) Sprint 18 duplicate-check SQL returns 0 rows
- [ ] `pnpm seed` succeeds

### 12.5 Process + network

- [ ] PM2 (or systemd) starts both `irexpro-api` and `irexpro-ai-engine`
- [ ] `pm2 save` + `pm2 startup` configured (boot-on-start) — full sequence in §7.1.1
- [ ] `systemctl reset-failed pm2-root` + `systemctl restart pm2-root` run (clears stale failed state)
- [ ] Nginx config valid (`nginx -t`), reloaded
- [ ] Let's Encrypt cert installed, auto-renew enabled (`certbot renew --dry-run`)
- [ ] `curl -i http://127.0.0.1:3010/api/v1/health` → `"status":"ok"` (port 3010, path `/api/v1/health`)
- [ ] `curl -i http://127.0.0.1:8011/api/v1/health` → AI engine healthy (local only)
- [ ] `curl -i https://irexpro.lightworldtech.com/api/v1/health` → `"status":"ok"`

### 12.6 Safety spot-checks

- [ ] `grep -r "CHANGE_ME\|PLACEHOLDER\|dev_internal_key" apps/api/.env services/ai-engine/.env` → no matches
- [ ] `git status` on the server shows no uncommitted changes to tracked files (`.env` must be gitignored)
- [ ] Confirm `apps/api/dist/` is NOT tracked in git (`git ls-files apps/api/dist | wc -l` → 0)
- [ ] Confirm no real secrets in any committed file (run §2 of `secrets-never-committed.md`)
- [ ] Confirm `DB_USER` (not `DB_USERNAME`) is set in `apps/api/.env`
- [ ] Confirm AI engine is NOT publicly proxied (no Nginx `location` block for port 8011)
- [ ] External uptime monitor hitting `https://irexpro.lightworldtech.com/api/v1/health` is configured

### 12.7 Post-deploy

- [ ] First webhook test from Stripe/Paystack sandbox succeeds (signature verified)
- [ ] First non-production user signup + login works
- [ ] PM2 log rotation configured (or logrotate for systemd)
- [ ] Daily pg_dump cron scheduled
- [ ] Backup restore tested on a staging DB at least once

---

## 13. What must never be committed to GitHub

See `docs/runbooks/secrets-never-committed.md` for the full, authoritative
list. The short version: `.env` files, `dist/`, `node_modules/`, Python
`.venv/`, private keys, certificates, broker credentials, payment provider
secret keys, JWT/cookie/encryption secrets, internal API keys, MetaAPI tokens,
raw webhook payloads, card data, mobile-money PINs.

The `.gitignore` already excludes most of these; the checklist in §12.6
verifies it.

---

## 14. Fail-closed behaviour preserved

Sprint 19 does NOT change any fail-closed behaviour. The following remain
exactly as designed in Sprints 10–18:

| System | Fail-closed behaviour |
|---|---|
| Paystack provider | Fails closed unless `PAYSTACK_ENABLED=true` + `PAYSTACK_SECRET_KEY` configured |
| Stripe provider | Fails closed unless `STRIPE_ENABLED=true` + `STRIPE_SECRET_KEY` configured |
| Stripe webhook signature | Fails closed if `Stripe-Signature` header, raw body, or `STRIPE_WEBHOOK_SECRET` missing |
| Manual payment provider | Blocked at public webhook endpoint; DEV/TEST only, admin-only activation |
| Risk engine | Any error → `RISK_ENGINE_ERROR` rejection; kill switch checked first; mandatory, non-bypassable |
| Broker credential encryption | App will not boot without `BROKER_ENCRYPTION_KEY` (min 32 chars, Joi-validated) |
| Market data service | Throws `ServiceUnavailableException` on broker failure — no mock-data fallback in production |
| AI engine live mode | `ai_signal_mode == 'live'` raises `LiveModeNotSupportedError`; `AI_ALLOW_MOCK_MARKET_DATA=true` required to use mock provider (must be `false` in production) |
| DB connection failure | Health endpoint reports `degraded`; app does not fall back to SQLite or demo data |
| HWM update | `max(oldHWM, endingRealisedBalance)` — never regresses (Sprint 18) |

**Do NOT introduce** any demo-data fallback, SQLite assumption, localStorage
auth, or Next.js API-route backend logic during deployment. If a dependency
(PostgreSQL, Redis, a payment provider) is unavailable in production, the
affected flow must fail visibly, not silently degrade into a demo state.

---

## 15. Related files

- `apps/api/.env.example` — API env template (no real secrets)
- `services/ai-engine/.env.example` — AI engine env template (no real secrets)
- `apps/api/src/config/validation.schema.ts` — Joi env validation (enforces required + min lengths)
- `apps/api/src/database/data-source.ts` — TypeORM CLI DataSource for migrations
- `apps/api/src/health/health.service.ts` — `GET /api/v1/health` implementation (global prefix `api/v1` set in `main.ts`)
- `apps/api/src/main.ts` — Nest bootstrap (rawBody for webhooks, Helmet, Swagger disabled in production)
- `infrastructure/docker/postgres/init.sql` — schema + extension bootstrap (mirrors §2.2)
- `infrastructure/pm2/ecosystem.config.js` — PM2 ecosystem (Sprint 19, hardened Sprint 21, no secrets)
- `infrastructure/systemd/irexpro-api.service` — systemd unit (Sprint 19, no secrets)
- `infrastructure/systemd/irexpro-ai-engine.service` — systemd unit (Sprint 19, no secrets)
- `infrastructure/nginx/irexpro-staging.example.conf` — Nginx staging example (Sprint 21, no secrets)
- `docs/runbooks/sprint-18-provider-reference-unique-guard.md` — pre-migration duplicate check
- `docs/runbooks/secrets-never-committed.md` — what must never be committed
- `docs/architecture/15-devops-and-deployment.md` — long-term Kubernetes/AWS target (Phase 2)

---

## 16. Verified Staging Dry-Run Checklist (Sprint 21)

This checklist records exactly what passed on the real Webuzo VPS staging
dry-run (AlmaLinux 9.8, PostgreSQL 18, PM2, Nginx + Cloudflare). Every item
below was verified on the staging host at `/home/lightworld/webapps/irexpro-staging`
with public API `https://irexpro.lightworldtech.com/api/v1`. Use it as a
"go-live readiness" gate: do not promote to production until every box is
ticked on the production host too.

### 16.1 Source + dependencies

- [ ] `git clone` from `main` works (`git checkout main && git pull --ff-only origin main`)
- [ ] `pnpm install` works (frozen lockfile, no peer-dep errors)
- [ ] Node.js 20.x LTS + pnpm 9.x installed (`node -v`, `pnpm -v`)
- [ ] Python 3.11 installed (`python3.11 --version`)

### 16.2 Database

- [ ] PostgreSQL connection works (`psql -h 127.0.0.1 -U <DB_USER> -d <DB_NAME> -c "SELECT 1"`)
- [ ] `uuid-ossp` issue resolved — `SELECT uuid_generate_v4();` returns a UUID (see §2.3)
- [ ] `DB_USER` (not `DB_USERNAME`) set in `apps/api/.env`
- [ ] `DB_SYNCHRONIZE=false`
- [ ] `pnpm migration:show` — all 8 migrations applied, no pending

### 16.3 Build + tests

- [ ] `pnpm --filter @irexpro/api build` succeeds, `apps/api/dist/main.js` exists
- [ ] API test suite passes: **743 tests, 45 suites** (includes the Sprint 20 bootstrap smoke test)
- [ ] Python 3.11 venv works (`services/ai-engine/.venv/bin/python --version`)
- [ ] AI engine `pip install -e .` succeeds

### 16.4 API runtime

- [ ] API starts under PM2 (`pm2 start infrastructure/pm2/ecosystem.config.js`)
- [ ] `pm2 status` shows `irexpro-api` online
- [ ] API health passes at `http://127.0.0.1:3010/api/v1/health` → `"status":"ok"`
- [ ] `APP_PORT=3010` / `PORT=3010` set in `apps/api/.env`

### 16.5 AI engine runtime

- [ ] AI engine starts with `app.main:app` entrypoint (NOT `main:app` or `src.main:app`)
- [ ] `pm2 status` shows `irexpro-ai-engine` online
- [ ] AI health passes at `http://127.0.0.1:8011/api/v1/health`
- [ ] `AI_ENGINE_ENV=production`, `AI_SIGNAL_MODE=paper`, `AI_ALLOW_MOCK_MARKET_DATA=false`
- [ ] AI engine bound to `127.0.0.1:8011` only (not `0.0.0.0`)

### 16.6 Process management

- [ ] `pm2 save` run (process list saved)
- [ ] `pm2 startup` run (systemd unit installed)
- [ ] `systemctl daemon-reload` run
- [ ] `systemctl reset-failed pm2-root` run (clears stale failed state — see §7.1.1)
- [ ] `systemctl restart pm2-root` run
- [ ] `systemctl status pm2-root --no-pager` shows active
- [ ] `pm2 status` shows both processes online

### 16.7 Network + public endpoint

- [ ] Nginx config valid (`nginx -t`), reloaded
- [ ] No duplicate `location ^~ /` blocks
- [ ] `location ^~ /api/v1/` proxies to `127.0.0.1:3010`
- [ ] No public `location` block for AI engine port `8011`
- [ ] `CORS_ORIGINS` set to the real frontend domain
- [ ] `AI_CORS_ORIGINS` uses origin only, no path (e.g. `http://localhost:3010`)
- [ ] Public Cloudflare/Nginx API health works: `curl -i https://irexpro.lightworldtech.com/api/v1/health` → 200

### 16.8 Safety spot-checks

- [ ] No `CHANGE_ME` / `PLACEHOLDER` / `dev_internal_key` in real `.env` files
- [ ] `apps/api/.env` and `services/ai-engine/.env` are `chmod 600` and gitignored
- [ ] `NESTJS_INTERNAL_API_KEY` matches exactly between the two `.env` files
- [ ] `BROKER_ENCRYPTION_KEY` is 32+ chars and backed up offline
- [ ] No real secrets in any committed file
- [ ] AI engine is NOT publicly reachable (only the NestJS API is public)

---

## 17. Sprint 20 runtime DI failure — pre-deploy gate (lesson learned)

The real staging dry-run discovered that migrations + the full unit test suite
could pass while the NestJS API still failed at runtime under PM2:

```
Nest can't resolve dependencies of the ExecutionService
(TradeRepository, TradingSessionRepository, BrokerService, BrokerAdapterRegistry,
 ?, AuditService, DataSource, DomainEventBus).
Please make sure that the argument CredentialEncryptionService at index [4]
is available in the ExecutionModule context.
```

**Root cause:** `CredentialEncryptionService` was a provider in `BrokerModule`
but was NOT in `BrokerModule`'s `exports` array, so `ExecutionModule` (which
imports `BrokerModule`) could not inject it. The existing unit tests missed
this because each spec builds an isolated `TestingModule` with manual mocks —
the real module/export boundary was never exercised.

**Sprint 20 fix:** added `CredentialEncryptionService` to `BrokerModule`'s
`exports`, and added `apps/api/src/bootstrap.spec.ts` — a runtime DI smoke test
that compiles the real feature-module graph (all 21 modules) so any missing
provider export surfaces as a CI test failure rather than a runtime PM2 crash.

**Pre-deploy gate (mandatory):** always run `pnpm --filter @irexpro/api test`
after building and BEFORE starting the API under PM2 (see §5.1.1). The
bootstrap smoke test is part of that suite. If it fails, do NOT proceed to PM2
startup — fix the DI wiring first. This catches an entire class of runtime
bootstrap failures that `nest build` (type-check only) cannot detect.
