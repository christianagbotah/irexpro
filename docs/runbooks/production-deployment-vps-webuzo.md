# Runbook — Sprint 19 Production Deployment (VPS / Webuzo)

This runbook describes how to deploy iRexPro to a single VPS (Virtual Private
Server) managed via Webuzo or an equivalent Linux VPS control panel. It is the
**first production target** for iRexPro and intentionally simpler than the
Kubernetes/AWS target described in
`docs/architecture/15-devops-and-deployment.md` (which remains the Phase 2
long-term target).

Sprint 19 is a **documentation and deployment-foundation sprint only**. It does
NOT change any production logic, payment-state transitions, webhook processing,
broker credential handling, risk engine rules, execution engine rules, or the
AI-to-trade flow. All of those invariants remain exactly as they were after
Sprint 18.

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
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Swap | 2 GB | 4 GB |

### 1.2 Required software stack

| Component | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS (≥ 20.0.0) | NestJS API runtime |
| pnpm | 9.x (≥ 9.0.0) | Package manager (workspace) |
| Python | 3.11 (≥ 3.11.0) | AI engine runtime |
| PostgreSQL | 15 (≥ 15.0) | Primary database |
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

**Do NOT expose** ports 3000 (NestJS API), 8001 (AI engine), 5432 (PostgreSQL),
or 6379 (Redis) to the public internet. Bind them to `127.0.0.1` or a private
network interface only. Nginx proxies public 443 → internal 3000.

---

## 2. PostgreSQL setup

### 2.1 Install (Ubuntu, non-Webuzo path)

```bash
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib
sudo systemctl enable --now postgresql
```

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

### 2.3 PostgreSQL hardening

- **Bind to localhost only** in `postgresql.conf` (`listen_addresses = 'localhost'`)
  unless you have a private network between app and DB nodes.
- **Require SSL** for app connections in production: set `DB_SSL=true` in
  `.env` and configure `pg_hba.conf` with `hostssl` rules.
- **Backups:** enable `pg_dump` cron jobs (see §11 Rollback).
- **Connection pool:** the default `DB_MAX_CONNECTIONS=10` in `.env.example` is
  fine for a single small instance. Increase to 20–30 on a 4 vCPU / 8 GB node.

### 2.4 Verify

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
cd /opt/irexpro
cp apps/api/.env.example apps/api/.env
cp services/ai-engine/.env.example services/ai-engine/.env
```

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
| `CORS_ORIGINS` | `localhost` URLs | Your production frontend origin(s) only |
| `PAYSTACK_ENABLED` | `false` | `true` only after you have configured real sandbox/live keys |
| `STRIPE_ENABLED` | `false` | `true` only after you have configured real sandbox/live keys |
| `PAYSTACK_CALLBACK_URL` / `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | `localhost` | Your production frontend URLs |
| `AI_ENGINE_SCHEDULER_ENABLED` | `false` | `true` only when you are ready to run the paper-mode signal scheduler |
| `AI_SIGNAL_MODE` (AI engine) | `paper` | **`paper`** (live is not supported and will be rejected) |
| `AI_ALLOW_MOCK_MARKET_DATA` (AI engine) | `false` | **`false`** in production (never `true`) |
| `AI_ENGINE_ENV` (AI engine) | `development` | **`production`** |

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

### 5.1 NestJS API

```bash
cd /opt/irexpro
pnpm install --frozen-lockfile --prod=false   # devDeps needed for the build step
pnpm --filter @irexpro/api build              # outputs to apps/api/dist/
```

The build uses `nest build` (TypeScript compiler). Output goes to
`apps/api/dist/`. The `.gitignore` already excludes `dist/` (Sprint 18 hygiene),
so the build must run on the server (or in CI) — `dist/` is not shipped in git.

### 5.2 Python AI engine

```bash
cd /opt/irexpro/services/ai-engine
python3.11 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -e .          # installs runtime deps from pyproject.toml
# (dev deps not needed in production: pip install -e ".[dev]" only for testing)
```

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
`infrastructure/pm2/ecosystem.config.js` (created in Sprint 19). It contains
**no secrets** — all secrets come from the `.env` files on the server.

```bash
cd /opt/irexpro
pm2 start infrastructure/pm2/ecosystem.config.js
pm2 save
pm2 startup    # follow the printed instructions to enable boot-on-start
```

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

### 8.1 Nginx server block

```nginx
# /etc/nginx/sites-available/irexpro.conf
upstream irexpro_api { server 127.0.0.1:3000; keepalive 32; }
upstream irexpro_ai  { server 127.0.0.1:8001; keepalive 16; }

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # NestJS API (public)
    location / {
        proxy_pass http://irexpro_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # WebSocket for realtime gateway
        proxy_read_timeout 75s;
    }

    # Payment webhooks MUST receive the raw body — Nginx does not buffer/modify it,
    # but ensure no proxy_buffering interferes with signature verification.
    location ~ ^/api/v1/payments/webhooks/ {
        proxy_pass http://irexpro_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering on;     # NestJS needs the full raw body for HMAC
        proxy_buffering off;
    }

    # AI engine — NOT publicly exposed. Uncomment ONLY if you have a private
    # network + IP allowlist. By default the AI engine is internal-only.
    # location /ai-engine/ {
    #     allow 10.0.0.0/8;
    #     deny all;
    #     proxy_pass http://irexpro_ai/;
    # }
}
```

### 8.2 TLS via Let's Encrypt

```bash
sudo certbot --nginx -d api.yourdomain.com \
  --redirect --agree-tos --no-eff-email --email admin@yourdomain.com
```

### 8.3 Reload + verify

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://api.yourdomain.com/health    # expect 200
```

---

## 9. Health-check verification

### 9.1 NestJS API health endpoint

The API exposes `GET /health` (public, no auth) which runs `SELECT 1` against
PostgreSQL and returns:

```json
{
  "status": "ok",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "environment": "production",
  "version": "0.1.0",
  "database": "connected"
}
```

Verify locally:

```bash
curl -s http://127.0.0.1:3000/health | python3 -m json.tool
# "status": "ok", "database": "connected"
```

Verify through Nginx + TLS:

```bash
curl -s https://api.yourdomain.com/health | python3 -m json.tool
```

A `"status": "degraded"` or `"database": "disconnected"` response means the API
booted but cannot reach PostgreSQL — check `DB_*` env vars and the PostgreSQL
service.

### 9.2 Python AI engine health endpoint

```bash
curl -s http://127.0.0.1:8001/api/v1/health | python3 -m json.tool
```

### 9.3 Redis connectivity (runtime check)

If the API is running and BullMQ queues are wired, a failed Redis connection
will surface as BullMQ errors in the PM2/systemd logs. Verify directly:

```bash
redis-cli -h 127.0.0.1 -a "$REDIS_PASSWORD" PING    # PONG
```

### 9.4 Continuous health monitoring (recommended)

Set up an external uptime monitor (UptimeRobot, BetterStack, or a simple cron
`curl`) hitting `https://api.yourdomain.com/health` every 60 seconds. Alert on
non-200 or `status != ok`.

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
- [ ] Firewall: only 22/80/443 open; 3000/8001/5432/6379 NOT public

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

- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm --filter @irexpro/api build` succeeds, `apps/api/dist/main.js` exists
- [ ] AI engine venv created, `pip install -e .` succeeds
- [ ] `pnpm migration:show` — all migrations applied, none pending
- [ ] (If first run with historical data) Sprint 18 duplicate-check SQL returns 0 rows
- [ ] `pnpm seed` succeeds

### 12.5 Process + network

- [ ] PM2 (or systemd) starts both `irexpro-api` and `irexpro-ai-engine`
- [ ] `pm2 save` + `pm2 startup` configured (boot-on-start)
- [ ] Nginx config valid (`nginx -t`), reloaded
- [ ] Let's Encrypt cert installed, auto-renew enabled (`certbot renew --dry-run`)
- [ ] `curl http://127.0.0.1:3000/health` → `"status":"ok"`
- [ ] `curl https://api.yourdomain.com/health` → `"status":"ok"`

### 12.6 Safety spot-checks

- [ ] `grep -r "CHANGE_ME\|PLACEHOLDER\|dev_internal_key" apps/api/.env services/ai-engine/.env` → no matches
- [ ] `git status` on the server shows no uncommitted changes to tracked files (`.env` must be gitignored)
- [ ] Confirm `apps/api/dist/` is NOT tracked in git (`git ls-files apps/api/dist | wc -l` → 0)
- [ ] Confirm no real secrets in any committed file (run §2 of `secrets-never-committed.md`)
- [ ] External uptime monitor hitting `https://api.yourdomain.com/health` is configured

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
- `apps/api/src/health/health.service.ts` — `GET /health` implementation
- `apps/api/src/main.ts` — Nest bootstrap (rawBody for webhooks, Helmet, Swagger disabled in production)
- `infrastructure/docker/postgres/init.sql` — schema + extension bootstrap (mirrors §2.2)
- `infrastructure/pm2/ecosystem.config.js` — PM2 ecosystem (Sprint 19, no secrets)
- `infrastructure/systemd/irexpro-api.service` — systemd unit (Sprint 19, no secrets)
- `infrastructure/systemd/irexpro-ai-engine.service` — systemd unit (Sprint 19, no secrets)
- `docs/runbooks/sprint-18-provider-reference-unique-guard.md` — pre-migration duplicate check
- `docs/runbooks/secrets-never-committed.md` — what must never be committed
- `docs/architecture/15-devops-and-deployment.md` — long-term Kubernetes/AWS target (Phase 2)
