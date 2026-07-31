\# iRexPro Current Project State



\## Current Sprint Checkpoint

Current sprint: Sprint 25 — Authentication Security Hardening + Roles Session Contract (IN PROGRESS).

Last completed sprint: Sprint 24 — Cross-Platform Auth UI Flow (PASS, merged to `main`, tagged `sprint-24-complete`).

Previous: Sprint 23 — Staging Frontend/Admin Deployment Verification (PASS, merged to `main`, tagged `sprint-23-complete`).


\## Sprint 25 — Authentication Security Hardening + Roles Session Contract (in progress)

Sprint 25 hardens the authentication contract so web/admin/mobile can safely maintain sessions and the admin portal can reliably identify admin/back-office users. It addresses two Sprint 24 limitations: (1) web/admin sessions were lost on page refresh, and (2) /auth/me did not return frontend-safe roles.

**Chosen session strategy: Hybrid — httpOnly refresh cookie (web/admin) + SecureStore (mobile).**

Rationale: the backend is token-based (Bearer access token + refresh token in JSON body). Sprint 25 amendment adds httpOnly refresh cookie support so web/admin sessions survive page refresh without localStorage. The backend still returns tokens in JSON for mobile compatibility. Both flows work simultaneously:
- Web/admin: access token in memory (NOT localStorage); refresh token in httpOnly cookie set by the backend. On page refresh, the AuthProvider calls /auth/refresh (cookie sent automatically via credentials:'include') → gets new access token → calls /auth/me → session restored. No localStorage, no sessionStorage.
- Mobile: tokens persisted in Expo SecureStore (iOS Keychain / Android Keystore). Sessions survive app restarts. Mobile sends refreshToken in the JSON body to /auth/refresh. AsyncStorage is prohibited.

**Backend changes (minimal, fully tested):**
- `GET /auth/me` now returns a frontend-safe `AuthUserDto` (new file `apps/api/src/modules/auth/dto/auth-user.dto.ts`) that explicitly allowlists only safe fields: `id`, `email`, `firstName`, `lastName`, `countryCode`, `status`, `roles`, `mfaEnabled`, `lastLoginAt`, `createdAt`. Sensitive fields (`passwordHash`, `mfaSecret`, `deletedAt`, `userRoles`, `profile` PII) are never included.
- `roles` is now always present in the /auth/me response — it comes from the JWT payload (set by `JwtStrategy.validate()` from the user's assigned roles at token-sign time).
- `firstName`/`lastName` are loaded from the `UserProfile` relation.
- New `AuthCookieService` (`apps/api/src/modules/auth/auth-cookie.service.ts`) — manages the httpOnly refresh cookie: `setRefreshCookie`, `clearRefreshCookie`, `getRefreshTokenFromCookie`. Cookie settings: httpOnly=true, secure=true in production, sameSite=none in production (cross-origin admin → API), path=/api/v1/auth, maxAge=7 days.
- `POST /auth/login` and `POST /auth/register` now set the httpOnly refresh cookie on the response (in addition to returning tokens in JSON for mobile).
- `POST /auth/refresh` now checks the httpOnly cookie first, then falls back to the JSON body `refreshToken`. Both paths work. `RefreshTokenDto.refreshToken` is now optional.
- `POST /auth/logout` now clears the httpOnly refresh cookie.
- 17 new tests: 5 in `auth.service.spec.ts` (getAuthUserDto safe fields, roles, sensitive exclusion, not-found, null profile) + 4 in `auth.service.spec.ts` (refreshTokens valid/invalid/not-found/suspended) + 8 in `auth-cookie.service.spec.ts` (set cookie, secure/sameSite settings, clear cookie, get from cookie, cookie name).
- No payment/webhook/broker/risk/AI/migration logic changed.

**Frontend changes:**
- `packages/types`: `AuthUser` updated to match the backend DTO — `roles` is now `UserRole[]` (not optional), added `firstName`/`lastName`, removed `phone`/`timezone`/`preferredCurrency`/`updatedAt` (not in the DTO). Doc updated to reflect hybrid strategy.
- `packages/api-client`: `refresh()` now takes optional `refreshToken?` — when omitted (web/admin), relies on the httpOnly cookie via credentials:'include'. When provided (mobile), sends it in the JSON body.
- `apps/web`: AuthProvider now restores session on page refresh — on mount, calls `api.refresh()` (no args, cookie flow) → `api.me()` → user populated. Added `restoring` state to prevent UI flash during restore. `/login` and `/register` redirect to `/dashboard` if already authenticated (after restore completes). `/dashboard` shows "Restoring session…" during restore.
- `apps/admin`: same session restore pattern as web. `hasAdminRole` uses real `roles[]` from `/auth/me`. Dashboard shows "Access denied" if signed in without ADMIN/SUPER_ADMIN role. Admin login redirects if already authenticated admin.
- `apps/mobile`: `expo-secure-store` added; tokens persisted to SecureStore. Session restore on app launch. Logout clears SecureStore.

**Verification (all passing):**
- 760 API tests pass (743 existing + 17 new), 46 suites.
- API build exit 0.
- Web build exit 0, admin build exit 0.
- Mobile typecheck exit 0, packages typecheck exit 0.
- No secrets committed, no .env files committed.


\## Sprint 24 — Cross-Platform Auth UI Flow (PASS, merged to `main`)

Sprint 23 documents and hardens the actual staging frontend + admin deployment now that both portals load publicly in the browser on the real Webuzo VPS. The staging VPS now successfully serves:

- Web portal (client/trader): `https://irexpro.lightworldtech.com` (apps/web, port 3005)
- Admin portal (back-office): `https://irexproadmin.lightworldtech.com` (apps/admin, port 3006)
- Public API: `https://irexpro.lightworldtech.com/api/v1` (apps/api, port 3010)
- API health: `https://irexpro.lightworldtech.com/api/v1/health`
- AI engine (private/internal only): `http://127.0.0.1:8011/api/v1` — never publicly proxied

Sprint 23 is a **documentation and deployment-example hardening sprint only**. It does NOT change backend business logic, payment logic, webhook behavior, broker execution logic, risk gate logic, AI execution logic, database migrations, secrets, or commit any `.env` files. No Fovi architecture. No demo DB fallbacks. AI engine remains private.

Deliverables:

1. **Runbook §8.4 rewritten** (`docs/runbooks/production-deployment-vps-webuzo.md`) — verified two-domain staging topology: main domain (`irexpro.lightworldtech.com`) serves web + API; admin domain (`irexproadmin.lightworldtech.com`) serves admin portal. Nginx route tables for both domains. AI engine has no public location block on either domain.

2. **Runbook §8.5 added** — CORS alignment for two staging domains. Because admin is cross-origin with the API, `CORS_ORIGINS` must include both: `https://irexpro.lightworldtech.com,https://irexproadmin.lightworldtech.com`.

3. **Runbook §7.1.2 added** — staging PM2 process commands for four processes: `irexpro-api-staging` (port 3010), `irexpro-ai-staging` (port 8011, internal), `irexpro-web-staging` (port 3005), `irexpro-admin-staging` (port 3006). Includes `pm2 save` + `pm2 status` and a port→process map.

4. **Runbook §18 added** — public staging verification checklist with curl checks for: web home/login/dashboard, admin home/login/dashboard, public API health, local AI health (must succeed) + public AI health (must fail — AI is private), and CORS OPTIONS preflight checks for both origins.

5. **Nginx example updated** (`infrastructure/nginx/irexpro-staging.example.conf`) — now documents two server blocks: main domain (`/api/v1/` → 3010, `/_next/static/` → 3005, `/` → 3005) and admin domain (`/_next/static/` → 3006, `/` → 3006). No public proxy to 8011 on either domain.

6. **Backend `.env.example` CORS updated** — documents the staging-verified two-domain `CORS_ORIGINS` value.

7. **`apps/admin/.env.example` updated** — `NEXT_PUBLIC_APP_URL` now points at the verified admin subdomain (`https://irexproadmin.lightworldtech.com`), with a note that the API's CORS must include the admin origin.

PM2 process names and ports (verified staging):
- `irexpro-api-staging` → port 3010 (NestJS API, public via Nginx `/api/v1/`)
- `irexpro-ai-staging` → port 8011 (AI engine, internal only — never public)
- `irexpro-web-staging` → port 3005 (Next.js client web, public via main domain)
- `irexpro-admin-staging` → port 3006 (Next.js admin, public via admin subdomain)

No production safety rules were changed: AI never executes broker orders directly, risk gate remains mandatory, payment checkout never marks paid, only verified webhooks confirm payment, no floating-point money, no demo fallback, no localStorage/Fovi-style assumptions, no secrets committed, AI engine never publicly exposed. NestJS tests remain at 743 passing across 45 suites (unchanged — no backend source logic changed).


\## Sprint 22 — Staging Frontend/API Integration (PASS, merged to `main`)

Sprint 22 (revised) creates a proper cross-platform frontend foundation that is buildable, type-safe, and aligned with the verified staging API. iRexPro is a cross-platform system: a client/trader web app, an admin/back-office portal, a native mobile app, and two shared packages. All are scaffolded as real, buildable pnpm workspace packages — not placeholders.

Sprint 22 is a **frontend + documentation sprint only**. It does NOT change backend production logic, migrations, payment state transitions, webhook payment confirmation rules, broker execution rules, risk gate logic, AI trading/execution flow, or secrets. No `.env` files committed. No secrets in frontend/mobile env. No backend source logic changed.

Verified staging backend endpoints (from Sprint 21):
- Public API base: `https://irexpro.lightworldtech.com/api/v1`
- Local API: `http://127.0.0.1:3010/api/v1`
- AI engine (internal only): `http://127.0.0.1:8011/api/v1` — never exposed to frontend/mobile.

Cross-platform workspace structure created:

\- `apps/web` — Next.js 14 client/trader web app (App Router, TypeScript, port 3005). Buildable. Routes: `/`, `/login`, `/dashboard`, `/payments/success`, `/payments/cancel`, `/payments/callback`. Reads `NEXT_PUBLIC_API_BASE_URL` from env. Payment pages are display-only — never mark paid.

\- `apps/admin` — Next.js 14 admin/back-office portal (App Router, TypeScript, port 3006). Buildable. Routes: `/` (redirect), `/admin` (redirect), `/admin/login`, `/admin/dashboard`, `/admin/users`, `/admin/subscriptions`, `/admin/payments`, `/admin/brokers`, `/admin/audit`. Reads `NEXT_PUBLIC_API_BASE_URL` from env. Admin RBAC enforced by backend.

\- `apps/mobile` — Expo + React Native foundation for iOS and Android (TypeScript). Typechecks cleanly. Screens: Login, Dashboard, Account, Payments. Reads `EXPO_PUBLIC_API_BASE_URL` from env. Live trading and broker execution NOT implemented (foundation only).

\- `packages/types` (`@irexpro/types`) — shared frontend-safe TypeScript types (Auth, Subscription, Payment, Invoice, Broker view, Health, ApiError). No backend entities or secrets. Typechecks cleanly. All money values are integer minor-unit strings.

\- `packages/api-client` (`@irexpro/api-client`) — shared typed fetch client factory (`createApiClient`). Takes base URL as a parameter — never reads env directly, never hardcodes localhost. Supports `credentials: 'include'` for web (httpOnly cookies) and Bearer-token mode for mobile. Typechecks cleanly.

Env examples created (no secrets): `apps/web/.env.example`, `apps/admin/.env.example`, `apps/mobile/.env.example`. Each explicitly documents the backend-only secrets that must NEVER appear in frontend/mobile env: `AI_ENGINE_URL`, `NESTJS_INTERNAL_API_KEY`, `BROKER_ENCRYPTION_KEY`, `DB_PASSWORD`, `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `METAAPI_TOKEN`, and others.

Backend `.env.example` aligned: `CORS_ORIGINS`, `PAYSTACK_CALLBACK_URL`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` now document staging-verified values. Runbook §8.4 rewritten for cross-platform deployment (web 3005, admin 3006, AI engine 8011 private, admin on `/admin` or separate subdomain). Integration spec at `docs/integration/frontend-staging-integration.md` covers the full cross-platform contract.

Verification (all passing):
\- `pnpm install` — all workspace packages install cleanly.
\- `pnpm --filter @irexpro/web build` — Next.js build succeeds, 7 routes generated.
\- `pnpm --filter @irexpro/admin build` — Next.js build succeeds, 10 routes generated.
\- `pnpm --filter @irexpro/mobile typecheck` — TypeScript typecheck passes (exit 0).
\- `pnpm --filter @irexpro/types typecheck` — passes (exit 0).
\- `pnpm --filter @irexpro/api-client typecheck` — passes (exit 0).
\- `pnpm --filter @irexpro/api test` — 743 tests pass, 45 suites (unchanged from Sprint 20).
\- `pnpm --filter @irexpro/api build` — NestJS build exit 0.

No production safety rules were changed: AI never executes broker orders directly, risk gate remains mandatory, payment checkout never marks paid (payment redirect pages are display-only), only verified webhooks confirm payment, no floating-point money, no demo fallback, no localStorage/Fovi-style assumptions (httpOnly cookies for web, Bearer token for mobile), no secrets committed, AI engine never referenced from frontend/mobile.




\## Sprint 21 — Staging Runbook Hardening (PASS, merged to `main`)

Sprint 21 hardens the production deployment runbook with findings from a real Webuzo VPS staging dry-run on AlmaLinux 9.8 (PostgreSQL 18, PM2, Nginx + Cloudflare). The dry-run used VPS app path `/home/lightworld/webapps/irexpro-staging`, public staging API `https://irexpro.lightworldtech.com/api/v1`, NestJS API local `http://127.0.0.1:3010/api/v1`, and AI engine local-only `http://127.0.0.1:8011/api/v1`.

Sprint 21 is a **documentation and deployment-examples sprint only**. It does NOT change any production application logic, migrations, payment logic, broker logic, risk gate logic, AI trading logic, database schemas, or secrets.

Verified staging findings documented in this sprint:

1. **PostgreSQL uuid-ossp on PG 18 / AlmaLinux:** migrations require `uuid_generate_v4()`. On Webuzo PG 18 the `uuid-ossp` extension can fail with a missing `libossp-uuid.so.16` error. Fix: install the AlmaLinux `uuid` package (or `uuid-dev`/`libossp-uuid16` on Ubuntu), run `ldconfig`, then retry `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` and verify with `SELECT uuid_generate_v4()`. An emergency-only fallback (`public.uuid_generate_v4()` wrapping `gen_random_uuid()`) is documented but the proper package install is preferred.

2. **Correct DB env variable names:** the app reads `DB_USER`, NOT `DB_USERNAME`. Setting `DB_USERNAME` is silently ignored. Documented with a correct DB env block example.

3. **API ports:** staging-verified API port is `3010` (`APP_PORT=3010`, also `PORT=3010` for tooling). Frontend uses `3005` or `3006`. AI engine uses `8011`. Do not reuse frontend ports for the API.

4. **Health endpoints:** both the NestJS API and the AI engine expose health at `/api/v1/health`, NOT `/health`. The original Sprint 19 runbook incorrectly said `/health` (returns 404). Documented with curl examples for local API, local AI engine, and public endpoint.

5. **AI engine entrypoint:** the correct Uvicorn entrypoint is `app.main:app` (NOT `main:app` or `src.main:app`). The correct PM2 command is `.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011`. `AI_ENGINE_ENV=production`, `AI_SIGNAL_MODE=paper`, `AI_ALLOW_MOCK_MARKET_DATA=false` in staging/production.

6. **AI engine remains private:** the AI engine is NOT publicly proxied through Nginx or Cloudflare. The NestJS API communicates with it internally at `http://127.0.0.1:8011`. Public traffic goes through the NestJS API only.

7. **CORS guidance:** API `CORS_ORIGINS` = real frontend/staging domain (e.g. `https://irexpro.lightworldtech.com`); localhost frontend origins may be temporarily included during staging. AI engine `AI_CORS_ORIGINS` = origin only, no path (e.g. `http://localhost:3010`, NOT `http://localhost:3010/api/v1`).

8. **Nginx/Webuzo reverse proxy:** do not define duplicate `location ^~ /` blocks. Recommended structure: `location /` proxies frontend to `127.0.0.1:3005`, `location ^~ /api/v1/` proxies NestJS API to `127.0.0.1:3010`, `location ^~ /_next/static/` proxies Next.js static assets. No public location block for AI engine 8011. Do not globally hide Content-Security-Policy. A version-controlled example config was added at `infrastructure/nginx/irexpro-staging.example.conf`.

9. **PM2/systemd startup:** documented the full verified sequence — `pm2 save`, `pm2 startup`, `systemctl daemon-reload`, `systemctl reset-failed pm2-root`, `systemctl restart pm2-root`, `systemctl status pm2-root --no-pager`, `pm2 status`. Noted that old failed systemd state can persist even while PM2 processes are online; `reset-failed` + `restart` cleans it.

10. **Verified Staging Dry-Run Checklist:** added §16 to the runbook — a go-live readiness gate covering source clone, pnpm install, PostgreSQL connection, uuid-ossp resolution, 8 migrations applied, API build, 743 tests / 45 suites passing, API start under PM2, API health at `/api/v1/health`, Python venv, AI engine start with `app.main:app`, AI health at `/api/v1/health`, PM2 startup saved, and public Cloudflare/Nginx API health.

11. **Sprint 20 runtime DI failure documented:** the runbook now records that the real staging dry-run discovered a runtime NestJS DI failure (`ExecutionService` could not resolve `CredentialEncryptionService`), that Sprint 20 fixed it by exporting `CredentialEncryptionService` from `BrokerModule` and adding a bootstrap smoke test, and that operators must run the test suite before PM2 startup so this class of runtime failure is caught before deployment.

Files changed in Sprint 21: `docs/runbooks/production-deployment-vps-webuzo.md` (hardened with all 11 findings + new §16/§17 sections), `infrastructure/nginx/irexpro-staging.example.conf` (new — version-controlled Nginx staging example, no secrets), `infrastructure/pm2/ecosystem.config.js` (comments + AI engine port updated to staging-verified 8011 + entrypoint documentation — no structural/behavior change), `docs/project-state/CURRENT_STATE.md` (this section).

No production safety rules were changed: AI never executes broker orders directly, risk gate remains mandatory, payment checkout never marks paid, only verified webhooks confirm payment, no floating-point money, no demo fallback, no localStorage/Fovi-style assumptions, no secrets committed. NestJS tests remain at 743 passing across 45 suites (unchanged from Sprint 20 — no source logic changed).


\## Sprint 20 — Runtime Bootstrap Fix (PASS, merged to `main`)

Sprint 20 fixes a staging runtime bootstrap DI failure discovered during VPS dry-run. On the real Webuzo VPS staging deployment, migrations passed and all 739 tests passed, but the NestJS API failed at runtime under PM2 with:

  Nest can't resolve dependencies of the ExecutionService
  (TradeRepository, TradingSessionRepository, BrokerService, BrokerAdapterRegistry, ?, AuditService, DataSource, DomainEventBus).
  Please make sure that the argument CredentialEncryptionService at index [4] is available in the ExecutionModule context.

Root cause: `CredentialEncryptionService` was declared as a provider in `BrokerModule` but was NOT included in `BrokerModule`'s `exports` array. `ExecutionService` (in `ExecutionModule`, which imports `BrokerModule`) injects `CredentialEncryptionService` at constructor index [4]. Because the service was not exported across the module boundary, NestJS could not resolve it at runtime. The existing unit tests did not catch this because each spec builds an isolated `TestingModule` with manually-mocked providers — the real module boundary / export graph was never exercised.

Fix: added `CredentialEncryptionService` to `BrokerModule`'s `exports` array. The service remains a single provider owned by `BrokerModule` — it is NOT re-declared anywhere else. This is the proper NestJS module-boundary fix: no hacks, no manual instantiation, no duplicate providers.

Bootstrap smoke test: added `apps/api/src/bootstrap.spec.ts` — a runtime DI smoke test that compiles the REAL feature-module graph (all 21 modules from AppModule) so that any missing provider export surfaces as a test failure in CI rather than at runtime. The test mocks `@nestjs/typeorm` and `@nestjs/bullmq` at the module level (no-op forRoot, forFeature provides mock repository tokens, registerQueue provides mock queue tokens) to avoid requiring live PostgreSQL/Redis connections, while every real feature module is imported unchanged. The test verifies: (1) the full graph compiles without DI errors, (2) `ExecutionService` is resolvable (the exact resolution that failed on staging), (3) `CredentialEncryptionService` is a single shared instance, (4) `BrokerAdapterRegistry` has both adapters registered.

This test would have caught the staging DI failure before deployment — verified by temporarily reverting the fix and confirming the test fails with the exact staging error message.

No production safety rules were changed: AI never executes broker orders directly, risk gate remains mandatory, payment checkout never marks paid, only verified webhooks confirm payment, no floating-point money, no demo fallback, no localStorage/Fovi-style assumptions, no secrets committed.


\## Sprint 19 — Production Deployment Foundation (in progress)

Sprint 19 prepares iRexPro for safe VPS / Webuzo production deployment. It is a **documentation and deployment-foundation sprint only** — it does NOT change any production logic, payment-state transitions, webhook processing, broker credential handling, risk engine rules, execution engine rules, or the AI-to-trade flow. All Sprints 10–18 safety invariants remain exactly as they were.

Deliverables (Sprint 19 branch `sprint-19-production-deployment`):

\- Production deployment runbook for VPS / Webuzo: `docs/runbooks/production-deployment-vps-webuzo.md` — covers system requirements, PostgreSQL setup, Redis setup, environment variable setup, build process, migration run process, PM2/systemd process management, Nginx reverse proxy + TLS, health-check verification, logs, rollback process, and a full deployment checklist.

\- Secrets policy runbook: `docs/runbooks/secrets-never-committed.md` — the authoritative list of files and values that must never be committed to git, with a pre-push self-check.

\- PM2 ecosystem example: `infrastructure/pm2/ecosystem.config.js` — manages both the NestJS API and the Python AI engine from one config. Contains NO secrets (all read from gitignored `.env` files).

\- systemd unit examples: `infrastructure/systemd/irexpro-api.service` and `infrastructure/systemd/irexpro-ai-engine.service` — alternative to PM2 for teams that prefer native systemd. Contain NO secrets.

\- `.env.example` improvements (both `apps/api/` and `services/ai-engine/`) — added production-deployment pointers and per-variable production notes. No real secrets added; every value remains a `CHANGE_ME_*` / `PLACEHOLDER` / `dev_*` placeholder.

\- `.gitignore` hardened — added `*.egg-info/` to prevent Python package metadata from being tracked. Untracked 5 pre-existing `irexpro_ai_engine.egg-info/` files (kept on disk).

\- This document + `IMPLEMENTATION_ROADMAP.md` updated to reflect Sprint 19 start.

Sprint 19 safety rules preserved (no regressions from Sprints 10–18):

\- Checkout never marks invoice/transaction/subscription/assessment/HWM paid — only a verified provider webhook does.
\- Only a verified provider webhook may confirm payment.
\- Amount and currency must match before confirming payment.
\- HWM may update only through the verified performance-fee webhook success path; HWM cannot regress (Sprint 18 `max()` semantics).
\- `PerformanceFeeService` exposes no method that transitions an assessment to PAID or updates the HWM.
\- DB-level uniqueness on `(provider, provider_transaction_reference)` is enforced; 23505 is caught safely and never leaks.
\- Broker credentials remain AES-256-GCM encrypted; never in responses, logs, audit metadata, WebSocket events, or errors.
\- AI never executes broker orders directly.
\- Risk approval remains mandatory and non-bypassable.
\- All persisted money values remain bigint minor-unit strings. No floating-point money.
\- No demo-data / database-failure fallback in any production path. No SQLite. No Fovi-style Next.js API routes or localStorage auth.
\- Production failures fail closed.

No production logic, migrations, payment-state transitions, webhook processing, broker, risk, execution, or AI code was changed in Sprint 19. NestJS tests remain at 739 passing across 44 suites (unchanged from Sprint 18).


\## Sprint 18 — Payment Transaction Reference Uniqueness + Metadata Consistency Hardening

Sprint 18 hardens the payment-transaction reference uniqueness boundary and the performance-fee high-water-mark safety invariant. It is a defence-in-depth + consistency sprint — no new payment-state transitions were introduced and the webhook-only paid-state invariant is preserved unchanged.

\- DB-level uniqueness guard on `(provider, provider_transaction_reference)` is now enforced via the pre-existing migration `1751500000000-AddPaymentTransactionReferenceUniqueGuard` (partial unique index `ux_payment_transactions_provider_reference`, scoped `WHERE provider_transaction_reference IS NOT NULL AND <> ''`). The migration was already on disk and correct; Sprint 18 verified it, added tests around it, and documented the pre-migration duplicate-check runbook.

\- Both subscription checkout (`SubscriptionsService.initiateCheckout`) and performance-fee checkout (`PerformanceFeePaymentService.initiatePerformanceFeeCheckout`) already caught the 23505 unique-violation from this guard (Sprint 18 PART C): they release the processing claim back to PENDING, audit at CRITICAL severity with `reason: 'PROVIDER_REFERENCE_CONFLICT'`, and throw a sanitized `ConflictException`. They NEVER mark the invoice/transaction/assessment/subscription paid and never leak the raw `QueryFailedError` / constraint name. Sprint 18 added regression tests proving this for both flows.

\- Performance-fee checkout metadata now includes `transactionId` in BOTH the provider-bound `createCheckoutSession` metadata AND the stored `providerPayloadSummary` — consistent with subscription checkout. (The `createCheckoutSession` metadata already had `transactionId` since Sprint 14; Sprint 18 added it to `providerPayloadSummary` for debug-metadata parity and added a regression test.) No payment state transitions were changed.

\- High-water-mark anti-regression hardening: `WebhookProcessorService.handlePerformanceFeePaymentSucceeded` now updates the HWM using `max(currentHighWaterMark, endingRealisedBalance)` via BigInt comparison, so the HWM can never move downward even if a future change to the outstanding-assessment guard, a reconciliation backfill, or a manually-inserted assessment produces an `endingRealisedBalance` below the stored peak. The audit metadata now records `endingRealisedBalance` and a `hwmRegulated` flag so operators can see when the max() guard held the HWM at the old peak.

\- Removed the previously-orphaned `PerformanceFeeService.markAssessmentPaid()` method. It transitioned an assessment to PAID and updated the HWM directly, bypassing the verified payment-webhook path. It had NO production callers (the webhook processor inlines its own HWM logic), but its existence was a latent safety hazard. The invariant "HWM may update only through the verified performance-fee webhook success path" is now enforced structurally — `PerformanceFeeService` exposes NO method that writes `currentHighWaterMark` or transitions an assessment to PAID. The sole production write site is `WebhookProcessorService.handlePerformanceFeePaymentSucceeded`.

\- Repository hygiene: 541 tracked `dist/` build artifacts removed from git tracking (`git rm -r --cached apps/api/dist`). The `.gitignore` `dist/` entry (already present) now protects the working tree. No source code, migrations, tests, or docs were removed.

\- Sprint 18 tests added (all passing): HWM cannot regress after verified payment; HWM advances normally when endingRealisedBalance exceeds the old peak; `markAssessmentPaid` is not exposed by `PerformanceFeeService`; performance-fee checkout metadata includes `transactionId`; performance-fee `providerPayloadSummary` includes `transactionId`; DB unique-violation on `providerTransactionReference` is caught safely in performance-fee checkout (never marks paid, releases claim, audits CRITICAL, sanitized conflict, no error leak); DB unique-violation on `providerTransactionReference` is caught safely in subscription checkout (never marks paid, never activates subscription, releases claim, audits CRITICAL, sanitized conflict).

\- Existing webhook-only paid-state invariants remain intact and regression-tested: checkout never marks paid; only a verified provider webhook confirms payment; amount + currency must match; HWM updates only after confirmed performance-fee payment.

\- Pre-migration runbook added: `docs/runbooks/sprint-18-provider-reference-unique-guard.md` documents the duplicate-check SQL operators must run before applying migration `1751500000000` to any database with existing historical transaction data.

\- No Python files touched. No new migrations created. No new libraries installed.



Last verified status (Sprint 18):

\- NestJS: 739 tests passing, 44 suites (Sprint 17 baseline was 734; added stripe.provider.spec.ts, stripe-http.client.spec.ts, webhook-processor.stripe.spec.ts, subscriptions.service.stripe.spec.ts, performance-fee-payment.stripe.spec.ts + Stripe describe blocks in payment-routing.service.spec.ts). Sprint 18 added 8 tests and removed 3 obsolete markAssessmentPaid tests, resulting in 739 passing NestJS tests across 44 suites.

\- No pending migrations (reuses existing payments schema — no new migration this sprint)

\- No open handles

\- No Python files touched

\- StripePaymentProvider is now a real sandbox implementation of IPaymentProvider (previously a fail-closed placeholder) — createCheckoutSession (Checkout Session, mode: payment), verifyWebhookSignature (HMAC-SHA256 over "${timestamp}.${rawBody}", Stripe-Signature header, 300s replay tolerance), parseWebhookEvent (checkout.session.completed/payment_intent.succeeded -> success; checkout.session.expired/payment_intent.payment_failed -> failed), getTransactionStatus (Checkout Session/PaymentIntent retrieval)

\- StripeHttpClient (new, injectable native fetch wrapper, no SDK) sends application/x-www-form-urlencoded request bodies matching Stripe's documented REST format

\- Stripe fails closed unless STRIPE_ENABLED=true and STRIPE_SECRET_KEY is configured; app boots normally with no Stripe credentials set

\- Subscription checkout and performance-fee checkout both route to Stripe with zero business-logic changes — both already depend only on the generic IPaymentProvider interface; Sprint 16 reuse/idempotency/concurrency logic applies unchanged

\- Checkout never activates a subscription, marks an invoice/assessment paid, creates a FEE_PAID ledger entry, or updates HWM — only a verified Stripe webhook does

\- Provider routing: US/GB already listed stripe first in CountryConfig.enabledPaymentProviders — no seed changes needed; Paystack remains the auto-routed live choice for GH/NG/ZA when both providers are configured

\- GET /payments/providers exposes no Stripe secrets (secret key, publishable key, webhook secret) — only isLive/isSandbox and public capability fields

\- No secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, Authorization header, raw webhook payload, card data) in checkout responses, logs, errors, or audit metadata

\- Flutterwave, Hubtel, PayPal, Wise, and Braintree remain untouched fail-closed placeholders — explicitly out of scope for this sprint

\- Sprint 17 AUDIT (2026-07-06) — PASS, no code fixes required. Reviewed config fail-closed behaviour, StripeHttpClient, createCheckoutSession request shape/metadata, webhook signature verification (HMAC-SHA256, timestamp tolerance, timingSafeEqual, never throws), parseWebhookEvent mapping and safe-field extraction, amount/currency verification, getTransactionStatus read-only behaviour, subscription and performance-fee checkout integration, provider routing (US/GB vs GH/NG/ZA), module wiring (real PaymentsModule graph compiles), audit log metadata, and build-artifact (dist) tracking convention. All 734 tests pass (44 suites), db:migrate has no pending migrations, api:build succeeds, no open handles. One minor non-security observation noted: performance-fee checkout metadata (shared PerformanceFeePaymentService code, pre-existing since Sprint 14) does not pass a `transactionId` key into provider metadata the way subscription checkout does — invoiceId/assessmentId already uniquely identify the transaction, so this is a debug-metadata completeness gap only, not a payment-state or security risk, and applies identically to Paystack (already audited/passed). No fix applied — out of the Sprint 17 Stripe-specific audit scope. Note: Sprint 18 clarified this issue. The provider-bound createCheckoutSession metadata already included transactionId; the missing part was the stored providerPayloadSummary, which Sprint 18 now populates with transactionId.

\- SubscriptionsService.initiateCheckout no longer creates a new invoice/transaction on every call — reuses an existing DRAFT/ISSUED invoice + PENDING/PROCESSING transaction for the same (userId, planId, currency, countryCode, paymentPurpose) identity

\- An existing active provider session (PROCESSING + providerTransactionReference) is returned as-is — never a second provider session

\- DB-level partial unique index on payments.invoices backstops the app-level reuse check against real concurrent double-clicks; a losing 23505 is caught and safely resolved to the winner's invoice/transaction

\- Atomic conditional UPDATE (WHERE status IN (PENDING, FAILED)) claims a transaction before any provider call, preventing two concurrent requests from both creating a provider session for the same row

\- Optional Idempotency-Key support (header or body field) — same key+params replay the same result; same key+different params fails with 409; only a SHA-256 hash of the key is ever persisted, never the raw value

\- Active ACTIVE/TRIAL subscription for the same plan blocks a new checkout before any invoice/transaction is touched; a PAID invoice or SUCCEEDED transaction likewise blocks checkout

\- FAILED/CANCELLED/REFUNDED transactions supersede (cancel) the stale invoice and allow a fresh checkout attempt

\- Provider call failure reverts the transaction to PENDING (not FAILED) so a retry reuses it instead of creating a new invoice

\- Checkout still never activates a subscription, never trusts frontend success, and never marks anything paid — only a verified webhook does (Sprint 10-15 invariant unchanged and regression-tested)

\- Sprint 15 Paystack audit fixes (amount/currency webhook verification, Ghana live-provider routing) remain in place and regression-tested

\- No secrets (provider keys, idempotency keys, webhook secrets, Authorization header) in checkout responses, audit metadata, or providerPayloadSummary

\- AUDIT FIX: the 23505-unique-violation recovery path could re-throw a raw QueryFailedError to the API caller in a narrow race window (winner's invoice committed, its transaction not yet) — now converted to a safe ConflictException asking the caller to retry shortly

\- AUDIT FIX: idempotency-key fingerprint now also binds paymentPurpose and amountMinor — a mid-flight price change with the same idempotency key now fails closed (409) instead of replaying a stale-priced session

\- AUDIT FIX: an empty/whitespace-only Idempotency-Key header no longer shadows a valid idempotencyKey body field



\## Critical Safety Rules

\- No live broker withdrawals.

\- No auto-charge.

\- Do not mark invoice PAID without verified webhook.

\- Do not update high-water mark outside verified payment webhook.

\- Do not trust frontend payment success.

\- Do not charge deposits/top-ups.

\- Do not charge unrealised/open trades.

\- Do not charge demo/paper/backtest/mock trades.

\- Do not expose secrets, credentials, tokens, raw webhook payloads, card data, or mobile money PINs.

\- All money values must remain decimal-safe.

\- Paystack provider must fail closed unless PAYSTACK_ENABLED=true and a secret key is configured.

\- Paystack Transaction Verify (getTransactionStatus) is read-only confirmation only — never a substitute for webhook signature verification.

\- Stripe provider must fail closed unless STRIPE_ENABLED=true and a secret key is configured.

\- Stripe webhook signature verification must fail closed if the Stripe-Signature header, raw body, or STRIPE_WEBHOOK_SECRET is missing.

\- Stripe Checkout Session/PaymentIntent retrieval (getTransactionStatus) is read-only confirmation only — never a substitute for webhook signature verification.



\## Completed Sprint Summary

\- Sprint 1: Architecture foundation

\- Sprint 2: Backend foundation

\- Sprint 3: Broker adapter / MetaTrader integration

\- Sprint 4: Risk engine

\- Sprint 5: Trade execution engine

\- Sprint 6: Realtime events + Strategy Orchestrator

\- Sprint 7: Python AI Signal Engine

\- Sprint 8: Market data ingestion + paper scheduler

\- Sprint 9: Backtesting + PaperBrokerAdapter

\- Sprint 10: Subscription billing + payment gateway foundation

\- Sprint 10 audit: raw-body webhook, manual webhook risk, invoice audit fixed

\- Sprint 11: Performance fee + high-water mark engine

\- Sprint 11 audit: double-charge risk, wrong-plan policy leak, broker-scope leak fixed

\- Sprint 12: Broker trade reconciliation → realised P\&L ledger entries

\- Sprint 12 audit: currency minor-units + partial-failure ledger backfill fixed

\- Sprint 13: Performance fee billing cycle orchestrator

\- Sprint 13 audit: failed reconciliation treated as success fixed; null-broker duplicate lookup fixed

\- Sprint 14: Performance fee invoice checkout + provider assignment

\- Sprint 15: Paystack sandbox checkout integration (subscription + performance-fee) — webhook-only paid/HWM path preserved

\- Sprint 16: Subscription checkout idempotency + pending invoice reuse — DB-level duplicate guard, atomic provider-session claim, optional Idempotency-Key support

\- Sprint 16 audit: raw DB error leak on a narrow 23505 race, idempotency fingerprint missing paymentPurpose/amount, empty Idempotency-Key header precedence bug — all fixed

\- Sprint 17: Stripe sandbox checkout integration (subscription + performance-fee) — webhook-only paid/HWM path preserved; zero business-logic changes required in SubscriptionsService/PerformanceFeePaymentService/WebhookProcessorService

\- Sprint 17 audit: PASS, no fixes required — see Last verified status above for scope and detail

\- Sprint 18: Payment transaction reference uniqueness + metadata consistency hardening — HWM anti-regression (max() semantics), removed orphaned `markAssessmentPaid()`, performance-fee `providerPayloadSummary` now includes `transactionId`, `dist/` untracked from git, pre-migration duplicate-check runbook added. Migration `1751500000000` verified as pre-existing and correct. No new migrations, no new libraries, no Python changes. Sprint 18 merged to `main` and tagged `sprint-18-complete`.

\- Sprint 19: Production deployment foundation — VPS/Webuzo deployment runbook, secrets policy runbook, PM2 ecosystem + systemd unit examples (no secrets), `.env.example` production notes, `.gitignore` hardened (`*.egg-info/`), `irexpro_ai_engine.egg-info/` untracked. Documentation + infrastructure only — no production logic, migrations, or payment/risk/execution/AI changes. Merged to `main`, tagged `sprint-19-complete`.

\- Sprint 20: Runtime bootstrap DI fix — `CredentialEncryptionService` exported from `BrokerModule` so `ExecutionService` can resolve it at runtime; added `apps/api/src/bootstrap.spec.ts` runtime DI smoke test that compiles the real feature-module graph (all 21 modules). The staging dry-run discovered that migrations + 739 unit tests passed but the API crashed under PM2 with a DI resolution failure; Sprint 20 fixed the wiring and added the smoke test so this class of failure is caught in CI. 743 tests passing across 45 suites. Merged to `main`, tagged `sprint-20-complete`.

\- Sprint 21: Staging runbook hardening — hardened the production deployment runbook with 11 verified findings from the real Webuzo VPS staging dry-run on AlmaLinux 9.8 (PG 18, PM2, Nginx + Cloudflare): uuid-ossp/`libossp-uuid.so.16` fix, `DB_USER` (not `DB_USERNAME`), API port `3010` / AI engine port `8011`, health endpoints at `/api/v1/health` (not `/health`), AI engine entrypoint `app.main:app`, AI engine remains private (no public Nginx proxy), CORS guidance (origin only, no path for AI engine), Nginx `^~ /api/v1/` structure with no duplicate location blocks, PM2/systemd `reset-failed` startup sequence, a Verified Staging Dry-Run Checklist (§16), and a Sprint 20 DI-failure pre-deploy gate (§17). Added `infrastructure/nginx/irexpro-staging.example.conf`. PM2 ecosystem comments + AI engine port updated to staging-verified `8011`. Documentation + infrastructure only — no production logic, migrations, or payment/risk/execution/AI changes. 743 NestJS tests still passing across 45 suites. Merged to `main`, tagged `sprint-21-complete`.

\- Sprint 22: Cross-platform staging frontend/API integration — scaffolded a buildable cross-platform frontend foundation: `apps/web` (Next.js 14 client/trader, port 3005, routes /, /login, /dashboard, /payments/*), `apps/admin` (Next.js 14 admin portal, port 3006, /admin/* routes), `apps/mobile` (Expo + React Native, 4 screens), `packages/types` (shared frontend-safe TS types), `packages/api-client` (shared typed fetch client, env-driven base URL). All build/typecheck: web build ✅, admin build ✅, mobile typecheck ✅, packages typecheck ✅. Env examples for all three apps document never-in-frontend secrets. Payment redirect pages are display-only — never mark paid; payment truth is backend-only via verified webhooks. AI engine never referenced from frontend/mobile. No backend source logic, migrations, payment-state transitions, webhook rules, broker/risk/execution/AI logic, or secrets changed. 743 NestJS tests still passing across 45 suites; backend build exit 0. Merged to `main`, tagged `sprint-22-complete`.

\- Sprint 23 (in progress): Staging frontend/admin deployment verification — documented and hardened the actual staging deployment now that both portals load publicly. Verified two-domain topology: web at `https://irexpro.lightworldtech.com` (port 3005), admin at `https://irexproadmin.lightworldtech.com` (port 3006), API at `https://irexpro.lightworldtech.com/api/v1` (port 3010), AI engine private at `127.0.0.1:8011`. Runbook §8.4 rewritten for two domains; §8.5 added for cross-origin CORS (both domains in CORS_ORIGINS); §7.1.2 added for four staging PM2 processes (irexpro-api-staging, irexpro-ai-staging, irexpro-web-staging, irexpro-admin-staging); §18 added for public verification checklist (curl checks for web/admin/API health + AI-private check + CORS OPTIONS preflight for both origins). Nginx example updated with main + admin server blocks (no public proxy to 8011). Backend + admin `.env.example` CORS/URL docs aligned to staging. Documentation + deployment-example hardening only — no backend business logic, payment logic, webhook behavior, broker/risk/execution/AI logic, migrations, secrets, or `.env` files changed. AI engine remains private. 743 NestJS tests still passing across 45 suites; all frontend builds/typechecks pass.



\## Current Main Modules

\- apps/api/src/modules/payments

\- apps/api/src/modules/subscriptions

\- apps/api/src/modules/performance-fees

\- apps/api/src/modules/performance-billing

\- apps/api/src/modules/broker-reconciliation

\- apps/api/src/modules/broker

\- apps/api/src/modules/trading

\- apps/api/src/modules/risk

\- services/ai-engine



\## Model Strategy

\- Main implementation: Claude Sonnet 5

\- Fallback: Claude Sonnet 4.6

\- Small fixes/docs: Sonnet 4.5 or Composer

\- Opus 4.8 only for rare final/deep audits because it consumes too many tokens.

