# iRexPro — Implementation Roadmap

## Current Phase: Phase 1 Sprint 16 Complete — Subscription Checkout Idempotency + Pending Invoice Reuse

---

## Immediate Next Step

**Begin Phase 1, Sprint 1: Backend Scaffolding**

See the next Cursor prompt at the bottom of this document.

---

## Phase 0 — Architecture Foundation ✅ Complete

All documentation created:

| File | Status |
|---|---|
| `docs/architecture/01-system-overview.md` | ✅ |
| `docs/architecture/02-product-scope.md` | ✅ |
| `docs/architecture/03-user-journeys.md` | ✅ |
| `docs/architecture/04-system-architecture.md` | ✅ |
| `docs/architecture/05-domain-model.md` | ✅ |
| `docs/architecture/06-bounded-contexts.md` | ✅ |
| `docs/architecture/07-api-architecture.md` | ✅ |
| `docs/architecture/08-database-architecture.md` | ✅ |
| `docs/architecture/09-broker-integration-architecture.md` | ✅ |
| `docs/architecture/10-ai-trading-architecture.md` | ✅ |
| `docs/architecture/11-risk-engine-architecture.md` | ✅ |
| `docs/architecture/12-execution-engine-architecture.md` | ✅ |
| `docs/architecture/13-subscription-and-profit-sharing.md` | ✅ |
| `docs/architecture/14-security-architecture.md` | ✅ |
| `docs/architecture/15-devops-and-deployment.md` | ✅ |
| `docs/architecture/16-observability-and-monitoring.md` | ✅ |
| `docs/architecture/17-testing-strategy.md` | ✅ |
| `docs/architecture/18-compliance-and-risk-disclosures.md` | ✅ |
| `docs/architecture/19-future-wallet-model-b.md` | ✅ |
| `docs/architecture/20-roadmap.md` | ✅ |
| `docs/adr/0001-use-broker-connected-model-a-first.md` | ✅ |
| `docs/adr/0002-use-modular-monolith-before-microservices.md` | ✅ |
| `docs/adr/0003-use-risk-engine-before-execution.md` | ✅ |
| `docs/adr/0004-use-high-water-mark-for-performance-fees.md` | ✅ |
| `README.md` | ✅ |
| `PROJECT_VISION.md` | ✅ |
| `TECH_STACK.md` | ✅ |
| `DEVELOPMENT_RULES.md` | ✅ |
| `IMPLEMENTATION_ROADMAP.md` | ✅ |
| `CURSOR_WORKFLOW.md` | ✅ |

---

## Phase 1 Implementation Sequence

### Sprint 1-2 (Weeks 1-4): Backend Foundation

**Goal:** Working NestJS API with auth, database, and Docker environment

Tasks (in order):

1. **NestJS project scaffold**
   - `apps/api/` with modular structure
   - TypeScript strict mode configuration
   - ESLint + Prettier configuration
   - Folder structure per architecture docs

2. **Database setup**
   - PostgreSQL connection via TypeORM
   - Schema namespace setup (identity, brokerage, subscriptions, trading, risk, performance, revenue, audit, admin)
   - Initial migrations for all core tables (from doc 08)
   - Redis connection

3. **AuthModule**
   - User registration with email verification
   - Login with JWT (RS256) access + refresh token
   - MFA support (TOTP setup and verification)
   - Password reset flow
   - Guards and decorators

4. **UsersModule**
   - UserProfile CRUD
   - Onboarding state management
   - Risk disclosure acceptance recording

5. **AuditModule**
   - Append-only audit log service
   - Event types enum
   - Integration with other modules

6. **Docker Compose development environment**
   - postgres, redis, api, signal-engine containers
   - `.env.example` file

7. **CI pipeline (GitHub Actions)**
   - Lint check
   - Unit tests
   - Build check

---

### ✅ Sprint 1 — NestJS Backend Foundation (COMPLETE)
### ✅ Sprint 2 — Broker Adapter Layer (COMPLETE)
### ✅ Sprint 3 — MetaTrader Live Adapter (COMPLETE)
### ✅ Sprint 4 — Risk Engine Foundation (COMPLETE)
### ✅ Sprint 5 — Trade Execution Engine (COMPLETE)
### ✅ Sprint 5C — Stabilization (all tests passing, no open handles) (COMPLETE)
### ✅ Sprint 6 — Realtime Event Layer + Strategy Orchestrator + AI Signal Flow (COMPLETE)

**Sprint 6 delivered:**
- `EventsModule` — global in-memory `DomainEventBus` for decoupled event wiring
- `RealtimeModule` — Socket.IO gateway (`/realtime`), JWT WebSocket auth, user/session rooms
- `StrategyModule` — `StrategyOrchestratorService` (full gate chain: structure → confidence → session → subscription → broker → Risk → Execution)
- `AiModule` — `AiSignalService`, `AiController` with DEV-ONLY `POST /ai/dev/simulate-signal`
- `TradingModule` — full session management: `POST /trading/sessions/start|stop`, `GET /active|:id`
- Domain events wired into `ExecutionService`, `RiskService`, `BrokerService`, `TradingService`
- **234 tests passing, 17 suites, 0 open handles**
- Build: ✅ `pnpm api:build` passes

---

### ✅ Sprint 7 — Python AI Signal Engine Scaffold + Safe Market-Data Pipeline (COMPLETE)

**Sprint 7 delivered:**
- `services/ai-engine/` — Full FastAPI Python service scaffold
- **Configuration** — `pydantic-settings` based config; `AI_SIGNAL_MODE=paper` default; live mode blocked
- **Signal Schema** — `AiSignalCandidate` compatible with NestJS Sprint 6 interface (camelCase ↔ snake_case mapping)
- **Market Data Foundation** — `MarketDataProvider` interface, `MockMarketDataProvider` (deterministic synthetic OHLCV), `BrokerMarketDataProvider` placeholder
- **Redis OHLCV Cache** — `OHLCVRedisCache` with graceful degradation when Redis unavailable
- **Feature Engineering** — 9 baseline features (returns, MAs, volatility, body size, HL range); anti-lookahead validated
- **Baseline XGBoost Scaffold** — `BaselineXGBoostModel` with heuristic placeholder (no real weights); approved for paper only
- **Model Registry + Governance** — `ModelRegistry`, `ModelGovernanceMetadata`; no live approval by default
- **Signal Generator** — full pipeline: OHLCV → features → model → confidence gate → `AiSignalCandidate`
- **NestJS Integration Client** — `NestJsClient` POSTs candidates via `x-irexpro-internal-api-key`
- **NestJS Internal Endpoint** — `POST /api/v1/ai/internal/signals` protected by `InternalApiKeyGuard`
- **Docker Compose** — `ai-engine` service added (port 8001, depends on redis)
- **Python tests** — 20+ tests (health, schema, mock data, feature engineering, signal generator, NestJS client)
- **NestJS tests** — `ai.controller.internal.spec.ts` (5 tests for guard + endpoint)
- **Safety**: Paper mode enforced, no live approval, no direct broker calls, all signals through Risk Engine

---

### ✅ Sprint 8 — Market Data Ingestion + Scheduled Paper-Mode Signal Generation (COMPLETE)

**Sprint 8 delivered:**
- **NestJS MarketDataModule** — `GET /api/v1/market-data/internal/ohlcv` protected by `InternalApiKeyGuard`
- **BrokerService.getOhlcvForConnection()** — fetches OHLCV via `IBrokerAdapter`; credentials never exposed
- **Python BrokerMarketDataProvider** — calls NestJS internal endpoint (no direct MetaAPI from Python)
- **Redis OHLCV cache** — key format `ai:ohlcv:{source}:{instrument}:{timeframe}`; TTL configurable; graceful fallback
- **OHLCVService** — mock/broker sources, validation (ordering, no future timestamps, min candle count)
- **SignalScheduler** — APScheduler paper-mode jobs; disabled by default (`AI_SCHEDULER_ENABLED=false`)
- **Scheduler API** — `POST /api/v1/scheduler/sessions/start|stop` (internal API key protected)
- **NestJS AiEngineClient** — notifies AI engine on trading session start/stop (`AI_ENGINE_SCHEDULER_ENABLED=false` default)
- **Offline training scaffold** — `app/domain/training/` research-only; no live model approval
- **Safety**: No direct AI→Broker path; scheduler paper-only; mock data blocked in production unless explicitly allowed

---

### ✅ Sprint 10 — Secure Global Subscription Billing and Payment Gateway Foundation (COMPLETE)

**Sprint 10 delivered:**
- `PaymentTransaction`, `Invoice`, `PaymentWebhookEvent` entities with explicit PostgreSQL types
- `IPaymentProvider` hardened interface: `createCheckoutSession`, `verifyWebhookSignature`, `getTransactionStatus`, `refundPayment`
- `PaymentRoutingService` — country/currency-aware provider routing (excludes ManualPaymentProvider from public checkout)
- `WebhookProcessorService` — fail-closed signature verification, idempotency, event routing, no raw body storage
- `SubscriptionsService.initiateCheckout` — full checkout flow with DRAFT invoice + PENDING transaction
- `SubscriptionsService.activateSubscriptionFromPayment` — called only from verified webhook handler
- `PaymentsController` — `GET /payments/providers`, `POST /payments/webhooks/:provider` (rawBody enabled)
- Migration `1750900000000-CreatePaymentsSchema` — payments schema, enums, tables, indexes
- Sprint 10 audit fixes: `rawBody: true` in main.ts, ManualPaymentProvider blocked from webhook endpoint, `INVOICE_CREATED` audit log added
- **341 tests passing, 24 suites**

---

### ✅ Sprint 11 — Performance Fee + High-Water Mark Engine (COMPLETE)

**Sprint 11 delivered:**

**Part A — Sprint 10 Warning Fixes:**
- Billing interval fix: `handlePaymentSucceeded` now uses `plan.billingInterval` (MONTHLY/QUARTERLY/ANNUAL) for correct `periodEnd` computation via `computePeriodEnd()` helper. Safe fallback to MONTHLY when plan not found.
- Idempotency fix: duplicate webhook with `processed=true` → idempotent success; `processed=false` → safe retry. No double-activation.
- `SubscriptionsService.getPlanById()` added. `initiateCheckout` now stores `planId` in `providerPayloadSummary`.

**Part B — Performance Fee Domain Model:**
- `PerformanceFeePolicy` entity — `feePercent`, `billingFrequency`, `calculationMode=HIGH_WATER_MARK`, `appliesTo=REALISED_PROFIT_ONLY`
- `TradingAccountPerformance` entity — `currentHighWaterMark`, `totalRealisedProfit`, `totalFeesCharged`, deposit/withdrawal tracking
- `PerformanceFeeAssessment` entity — full audit trail: HWM start/end, deposits excluded, realised profit for fee, fee amount, status lifecycle
- `PerformanceFeeLedgerEntry` entity — immutable event log: DEPOSIT (excluded), REALISED_TRADE_PROFIT, REALISED_TRADE_LOSS, FEE_ASSESSED, FEE_PAID, ADJUSTMENT
- Migration `1751000000000-CreatePerformanceFeesSchema` — `performance_fees` schema, enums, tables, indexes; safe `down()`

**Part C — PerformanceFeeService:**
- `calculateAssessment()` — loads subscription, finds policy, loads ledger entries, excludes deposits, computes net realised P&L, HWM comparison, BigInt-safe fee arithmetic
- `invoiceAssessment()` — creates `Invoice` + `PaymentTransaction` (purpose=PERFORMANCE_FEE), `FEE_ASSESSED` ledger entry
- `markAssessmentPaid()` — marks PAID, updates HWM to new peak, updates `totalFeesCharged`
- `recordLedgerEntry()` — admin-only manual entry with audit log
- Fee formula: `feeAmount = floor(profitAboveHWM × feePercent × 100 / 1_000_000)` (BigInt, no float precision loss)

**Part D — Payment Integration:**
- `WebhookProcessorService.handlePaymentSucceeded` now routes on `paymentPurpose`:
  - `SUBSCRIPTION_*` → existing subscription activation path
  - `PERFORMANCE_FEE` → marks assessment PAID, adds FEE_PAID ledger entry, updates HWM, emits `PERFORMANCE_FEE_PAID` audit event

**Part E — API Endpoints:**
- `GET /api/v1/performance-fees/policies` — ADMIN+
- `POST /api/v1/performance-fees/policies` — ADMIN+
- `GET /api/v1/performance-fees/me/summary` — authenticated user (own data)
- `GET /api/v1/performance-fees/assessments` — ADMIN+
- `POST /api/v1/performance-fees/assessments/calculate` — ADMIN+
- `POST /api/v1/performance-fees/assessments/:id/invoice` — ADMIN+
- `POST /api/v1/performance-fees/ledger-entries` — ADMIN+

**Part F — Audit Actions:**
- `PERFORMANCE_FEE_POLICY_CREATED`, `PERFORMANCE_FEE_ASSESSMENT_CALCULATED`, `PERFORMANCE_FEE_ASSESSMENT_INVOICED`, `PERFORMANCE_FEE_ASSESSMENT_WAIVED`, `PERFORMANCE_FEE_PAID`, `PERFORMANCE_FEE_LEDGER_ENTRY_CREATED`, `HIGH_WATER_MARK_UPDATED`

**Part G — Tests:**
- `performance-fee.service.spec.ts` — 23 tests: HWM logic, deposit exclusion, realised-only rule, duplicate prevention, invoice integration, subscription checks, security
- `webhook-processor.service.spec.ts` — expanded with 10 new tests: billing interval (monthly/quarterly/annual/unknown), idempotency retry, PERFORMANCE_FEE webhook payment
- **378 tests passing, 25 suites**

**Safety invariants enforced:**
- No live broker withdrawals — invoice only
- No fee on deposits, top-ups, bonuses, credits
- No fee on unrealised/floating P&L
- No fee on demo, paper, or backtest results
- HWM updated only after confirmed payment (status=PAID)
- No duplicate assessment for same user/broker/period (unless DRAFT)
- No invoice for zero-fee assessment
- No automatic payment provider charge

---

### ✅ Sprint 9 — Backtesting and Paper Trading Validation Engine (COMPLETE)

**Sprint 9 delivered:**
- **Python backtesting engine** — `app/domain/backtesting/` (schemas, engine, simulator, metrics, report_builder, validation)
- **BacktestEngine** — no-lookahead iteration over OHLCV candles; never publishes to NestJS
- **TradeSimulator** — BUY/SELL simulation with SL/TP/spread/slippage; conservative same-candle SL/TP assumption
- **BacktestMetrics** — win rate, net profit, profit factor, max drawdown, balance curve
- **BacktestResult** — `simulatedOnly=True` always; includes simulation warnings
- **Backtest API** — `POST /api/v1/backtests/run`, `GET /api/v1/backtests/sample-report`
- **NestJS PaperBrokerAdapter** — `paper-broker` implements `IBrokerAdapter`; PAPER_ONLY; LIVE mode rejected
- **Safety**: backtest never calls broker/NestJS execution; paper adapter cannot be set to LIVE mode

---

### Sprint 3-4 (Weeks 5-8): Broker Integration

1. **BrokerAdapterInterface** — define TypeScript interface (from doc 09)
2. **BrokerAdapterRegistry** — factory service
3. **Credential encryption service** — AES-256-GCM with KMS abstraction
4. **First broker adapter** — implement for selected Phase 1 broker (sandbox)
5. **BrokerModule** — connection management, health check, account sync
6. **BrokerHealthCheckJob** — BullMQ recurring health check

---

### Sprint 5-6 (Weeks 9-11): Country Config + Payment/SMS Infrastructure

1. **CountryConfigModule** — `platform.country_configs` schema, `CountryConfigService`, Redis caching
2. **Country seed data** — seed initial 10 launch countries with provider routing and KYC levels
3. **CountryGateGuard** — block unsupported/sanctioned countries at registration and API layer
4. **PaymentModule** — `IPaymentProvider` interface, `PaymentProviderRegistry`, `PaymentProviderRouter`
5. **ManualPaymentProvider** — admin-activated subscriptions for Phase 1 pilots
6. **Payment webhook infrastructure** — per-provider endpoints, signature validation, BullMQ async processing
7. **SmsModule** — `ISmsProvider` interface, `SmsProviderRegistry`, `SmsProviderRouter`
8. **Twilio adapter** — global SMS fallback (implement first as most universal)
9. **Hubtel SMS adapter** — Ghana SMS (implement alongside Twilio)
10. **Arkesel SMS adapter** — Africa SMS
11. **OTP service** — generate, hash, validate, expire, rate-limit
12. **SubscriptionPlan seeding** — seed plans with multi-currency pricing in `plan_pricing` table
13. **SubscriptionModule** — full lifecycle, gates, expiry handling, tax rule application
14. **Invoice generation** — with tax, currency, provider reference fields

---

### Sprint 7-8 (Weeks 12-15): AI Signal Engine (Python)

1. **Python FastAPI scaffold** for `services/signal-engine/`
2. **MarketDataService** — OHLCV ingestion and Redis cache
3. **Technical indicator computation** — pandas-ta integration
4. **Market regime detection** — rule-based initial version
5. **Signal generation** — XGBoost baseline model with initial training
6. **NestJS SignalModule** — signal intake and routing

---

### Sprint 9-10 (Weeks 16-18): Risk Engine

1. **RiskProfile entity and management API**
2. **Risk Engine validation pipeline** — all 15 rules from doc 11
3. **Kill switch** — database singleton + Redis cache
4. **Risk violation recording**
5. **Risk Engine unit tests** — 100% branch coverage (mandatory)

---

### Sprint 11-12 (Weeks 19-21): Execution Engine

1. **ExecutionModule** — order preparation and broker submission
2. **Idempotency key service** — hash generation + Redis distributed lock
3. **Trade lifecycle management** — state machine
4. **Reconciliation job** — BullMQ job, broker state sync
5. **Execution audit events**

---

### Sprint 13-14 (Weeks 22-23): Trading Session + WebSocket

1. **TradingSessionModule** — full lifecycle with gates
2. **WebSocketGateway** — Socket.IO setup
3. **Real-time trade events** — push to connected clients
4. **Kill switch enforcement** in session layer

---

### Sprint 15-16 (Weeks 24-25): Revenue Engine

1. **PerformanceModule** — P&L aggregation, metrics calculation
2. **RevenueModule** — fee calculation, HWM logic, settlement job
3. **FeeStatement generation**

---

### Sprint 17-18 (Weeks 26-27): Admin Dashboard Backend

1. **AdminModule** — user management, subscription management
2. **Kill switch admin API**
3. **Revenue summary API**
4. **Audit log viewer API**

---

### Sprint 19-26 (Weeks 28-43): Frontend Development

- Web app (Next.js) — sprints 19-22
- Mobile app (React Native) — sprints 23-26
- Admin dashboard (Next.js) — parallel track

---

### Sprint 27-30 (Weeks 44-53): Validation and Pilot

- Backtesting service
- Paper trading validation
- Integration and E2E test suite
- Internal beta
- Security review
- Performance testing

---

## Key Decision Points

| Point | Decision Required |
|---|---|
| Sprint 3 | Which Forex broker to use for Phase 1 (API quality, sandbox availability, geographic coverage) |
| Sprint 5 | Confirm first 3 payment providers to integrate (recommend: Hubtel + Paystack for Africa, Stripe for global) |
| Sprint 5 | Confirm SMS provider priority (recommend: Hubtel for GH, Arkesel for NG/KE, Twilio global) |
| Sprint 5 | Legal sign-off for Phase 1 launch countries (GH, NG, KE required before Sprint 5 completion) |
| Sprint 7 | AI model training data source (broker historical data vs. third-party provider) |
| Sprint 28 | Model backtest results review — proceed to paper trading? |
| Sprint 30 | Pilot results review — proceed to live trading? |
| Phase 2 | US market legal review — this is the most complex jurisdiction and requires dedicated counsel |

---

## Next Cursor Prompt — Backend Scaffolding

Use the following prompt to begin Phase 1 Sprint 1 backend scaffolding:

---

```
You are acting as a senior full-stack engineer building iRexPro — a production-grade autonomous AI Forex trading platform.

Architecture documentation is complete in /docs/architecture/ and /docs/adr/.
Key rules are in DEVELOPMENT_RULES.md.
Tech stack is defined in TECH_STACK.md.

Begin Phase 1, Sprint 1: NestJS Backend Scaffolding.

Create the complete NestJS backend project at apps/api/ with:

1. Project structure:
   apps/api/
   ├── src/
   │   ├── modules/
   │   │   ├── auth/
   │   │   ├── users/
   │   │   ├── broker/
   │   │   ├── subscriptions/
   │   │   ├── trading-session/
   │   │   ├── signals/
   │   │   ├── risk/
   │   │   ├── execution/
   │   │   ├── performance/
   │   │   ├── revenue/
   │   │   ├── audit/
   │   │   ├── notifications/
   │   │   ├── admin/
   │   │   └── health/
   │   ├── common/
   │   │   ├── decorators/
   │   │   ├── filters/
   │   │   ├── guards/
   │   │   ├── interceptors/
   │   │   └── pipes/
   │   ├── database/
   │   │   ├── migrations/
   │   │   └── entities/
   │   ├── config/
   │   └── main.ts
   ├── test/
   ├── package.json
   ├── tsconfig.json
   └── .env.example

2. Configure:
   - NestJS with TypeScript strict mode
   - TypeORM with PostgreSQL (schema-namespaced per bounded context as defined in 08-database-architecture.md)
   - Redis via ioredis
   - BullMQ for job queues
   - JWT authentication (RS256) with access + refresh tokens
   - Global ValidationPipe with whitelist: true
   - Helmet for security headers
   - Rate limiting via @nestjs/throttler
   - Swagger/OpenAPI at /api/docs
   - Winston structured logging
   - Health check endpoints (/health, /health/ready, /health/live)

3. Create all database migrations for the core tables defined in 08-database-architecture.md

4. Implement AuthModule fully:
   - Registration, email verification, login, logout
   - JWT RS256 access token (15 min) + HttpOnly refresh token (7 days)
   - TOTP MFA setup and verification
   - Password reset
   - JwtAuthGuard and RolesGuard

5. Implement UsersModule:
   - User profile CRUD
   - Onboarding state management
   - Risk disclosure acceptance recording (immutable)

6. Implement AuditModule:
   - Append-only AuditService
   - AuditLog entity (no update/delete)
   - AuditEventType enum

7. Create Docker Compose configuration:
   - PostgreSQL 15
   - Redis 7
   - NestJS API
   - .env.example with all required variables

8. Create GitHub Actions CI pipeline:
   - Lint check (ESLint)
   - Unit tests (Jest)
   - Build check

Follow all rules in DEVELOPMENT_RULES.md, especially:
- Decimal.js for all monetary values
- No secrets in code
- Broker credentials use @Exclude() in DTOs
- Audit log entries for all auth and user events
- No hardcoded country, provider, or currency

Do not implement broker, subscription, AI, payment provider, or trading features yet — only the foundation.
```

---

## Next Cursor Prompt — Country Config + Payment/SMS Infrastructure (Sprint 5-6)

Use this prompt after Sprint 1-2 (backend foundation) is complete:

```
You are building the Country Configuration, Payment Provider, and SMS Provider infrastructure
for iRexPro — a global-first Forex AI trading platform.

Architecture specifications:
@docs/architecture/23-country-and-regional-configuration.md
@docs/architecture/21-payment-provider-architecture.md
@docs/architecture/22-sms-provider-architecture.md
@DEVELOPMENT_RULES.md (Rules 16, 17, 18 are critical)

Build the following in apps/api/src/modules/:

1. CountryConfigModule
   - TypeORM entity: platform.country_configs (schema from doc 23)
   - CountryConfigService with Redis caching (TTL: 300s)
   - CountryGateGuard: blocks blocked/unsupported countries on authenticated routes
   - Seed data for initial countries: GH, NG, KE, ZA, GB, US, CA, AU, SG, AE
     (each with correct payment provider, SMS provider, currency, KYC level)
   - Endpoints: GET /platform/countries, GET /platform/countries/:code, 
     PUT /admin/countries/:code (SuperAdmin), POST /admin/countries/:code/block

2. PaymentModule
   - IPaymentProvider interface (full spec from doc 21 section 3)
   - PaymentProviderRegistry and PaymentProviderRouter classes
   - ManualPaymentProvider (admin-activated, no real processing)
   - Per-provider webhook endpoints: POST /webhooks/stripe, /webhooks/paystack,
     /webhooks/flutterwave, /webhooks/hubtel
   - WebhookProcessorService: validate signature → BullMQ async queue
   - TypeORM entities: subscriptions.user_payment_profiles, subscriptions.tax_rules,
     subscriptions.plan_pricing, subscriptions.invoices (with tax fields)

3. SmsModule
   - ISmsProvider interface (full spec from doc 22 section 3)
   - SmsProviderRegistry and SmsProviderRouter classes
   - TwilioSmsProvider (global fallback)
   - HubtelSmsProvider (Ghana — hubtel.com API)
   - ArkeselSmsProvider (Africa — arkesel.com API)
   - OtpService: 6-digit code, bcrypt hash, 10-min expiry, 3/30min rate limit per number
   - TypeORM entities: identity.otp_records, notifications.sms_deliveries,
     notifications.notification_preferences
   - Endpoints: POST /auth/phone/send-otp, POST /auth/phone/verify-otp,
     GET /notifications/preferences, PUT /notifications/preferences

4. Update SubscriptionModule
   - Use PaymentProviderRouter.selectProvider(user.country, currency) for all billing
   - Apply tax_rules by user country when creating invoices
   - Multi-currency plan pricing via plan_pricing table

Critical rules (from DEVELOPMENT_RULES.md):
- No hardcoded country, currency, payment provider, or SMS provider in business logic
- All providers used through their interface only — never direct SDK calls in services
- Webhook endpoints: validate signature BEFORE any processing (raw body required)
- OTP codes hashed with bcrypt — never stored in plaintext
- SMS delivery logs must NOT store message body — PII minimisation
- All CountryConfig changes logged to AuditModule
- All payment events logged to AuditModule
- All SMS delivery attempts logged to notifications.sms_deliveries
```

---

## Sprint 10 Complete — Secure Global Subscription Billing and Payment Gateway Foundation

**Completed:** 2026-06-26

### What was built

**Payment Domain Model (PART A)**
- `PaymentTransaction` entity (`payments.payment_transactions`) — tracks all payment attempts, provider refs, status, amount in minor units
- `Invoice` entity (`payments.invoices`) — draft/issued/paid/void lifecycle, all amounts in bigint cents
- `PaymentWebhookEvent` entity (`payments.payment_webhook_events`) — idempotency store with provider+eventId unique constraint
- Migration: `CreatePaymentsSchema1750900000000`

**IPaymentProvider Hardening (PART B)**
- Added `createCheckoutSession(request)` → `CreateCheckoutSessionResult`
- Added `verifyWebhookSignature(rawBody, headers)` — fail-closed on base provider
- Added `getTransactionStatus(reference)`
- Added `refundPayment(reference, amountMinor?)`
- Added `supportedPaymentMethods[]` field on all providers
- All placeholder providers fail closed (return `false` or throw `NotImplementedException`)

**PaymentRoutingService (PART C)**
- Routes checkout to best provider via `CountryConfig.enabledPaymentProviders`
- Prioritises: preferred provider → CountryConfig order → Stripe global fallback
- Exposes `GET /api/v1/payments/providers` (no secrets)
- Rejects blocked countries, unsupported currency/country combinations
- ManualPaymentProvider never routable via public checkout

**Subscription Checkout Flow (PART D)**
- `POST /api/v1/subscriptions/checkout` — creates invoice + transaction → calls provider → returns session
- `POST /api/v1/subscriptions/cancel`
- Subscription activated ONLY via verified webhook — never via frontend callback

**Webhook Handling (PART E)**
- `POST /api/v1/payments/webhooks/:provider` — raw body capture for signature verification
- Signature verification BEFORE any state change
- Idempotent: duplicate providerEventId returns safe success
- `PAYMENT_SUCCEEDED` → marks transaction SUCCEEDED, marks invoice PAID, activates subscription
- `PAYMENT_FAILED` → marks transaction FAILED, subscription remains inactive
- All events audit-logged

**Provider Placeholders (PART F)**
- All 6 providers (Stripe, Paystack, Flutterwave, Hubtel, PayPal/Braintree, Wise) have `supportedPaymentMethods`
- All fail closed: `verifyWebhookSignature` returns `false` until live integration
- `createCheckoutSession` throws `NotImplementedException` until live HTTP integration built

**CountryConfig Seed (PART G)**
- GH: hubtel, paystack, flutterwave, stripe (Stripe fallback)
- US: stripe, paypal (PayPal/Braintree)
- GB: stripe, paypal, wise (payout future)
- NG: paystack, flutterwave, stripe
- KE: flutterwave, stripe
- ZA: paystack, flutterwave, stripe

**Audit Actions Added (PART I)**
- `PAYMENT_CHECKOUT_INITIATED`, `PAYMENT_CHECKOUT_FAILED`
- `PAYMENT_WEBHOOK_RECEIVED`, `PAYMENT_WEBHOOK_SIGNATURE_FAILED`
- `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`
- `INVOICE_CREATED`, `INVOICE_PAID`
- `SUBSCRIPTION_ACTIVATED`

**Tests (PART J)**
- `payment-routing.service.spec.ts` — 14 tests covering routing, country filtering, Ghana/US providers, edge cases
- `webhook-processor.service.spec.ts` — 6 tests covering signature rejection, idempotency, activation, security
- Updated `subscriptions.service.spec.ts` — 22 tests (gate regression, checkout, cancel, manual activate)
- Updated `payments.spec.ts` — 26 tests (fail-closed providers, ManualPaymentProvider, registry)

**Test count:** 339 tests, 24 suites — all passing

### Safety rules enforced
- ManualPaymentProvider cannot be routed to via `PaymentRoutingService.routeForCheckout()`
- `verifyWebhookSignature` must return `true` before any state change
- No provider secrets in responses, logs, or test fixtures
- Subscription activation only via verified webhook
- All amounts stored as bigint strings (no float)
- Frontend payment success alone never activates subscription

---

## Sprint 12 — Broker Trade Reconciliation → Realised P&L Ledger Entries

**Completed:** 2026-06-30

### What was built

**PART A — Sprint 11 Hardening**
- Migration `1751100000000-AddPerfFeeAssessmentDuplicateGuard`: Two partial unique indexes on `performance_fee_assessments` enforce DB-level "one assessment per user/broker/period" rule, safely handling NULL `brokerConnectionId` via separate partial indexes.
- `markAssessmentPaid` consolidation: Circular dependency documented — `WebhookProcessorService` (payments) imports `Invoice` and `PaymentTransaction`; pulling in the full `PerformanceFeeService` would require `PerformanceFeeService` (which imports payments entities) to also import back from payments — creating a circular dependency. The current `WebhookProcessorService.handlePerformanceFeePaymentSucceeded()` duplication is deliberate and safe.

**PART B — Domain Entities** (entities created prior to sprint)
- `BrokerTradeReconciliationRun` — audit record per reconciliation run, in `broker_reconciliation` schema
- `BrokerReconciledTrade` — immutable record per closed trade; unique on `(userId, brokerConnectionId, brokerTradeId)`

**PART C — Closed Trade Normalization**
- `ClosedTradeNormalizerService` — converts `BrokerClosedTrade[]` → `NormalizedClosedTrade[]`
- Maps `externalOrderId` → `brokerTradeId`; converts major-unit decimal strings to minor-unit bigint strings using string arithmetic (zero float risk)
- `netRealisedPnl = grossRealisedPnl + commission + swap` (no double-subtraction)
- Skips: missing `brokerTradeId`, future `closedAt`, null `closedAt` (open trades), invalid P&L

**PART D + E — BrokerTradeReconciliationService + Fee Eligibility**
- Validates time range (fromTime < toTime, ≤ 90 days, no future ranges)
- Enforces LIVE-only broker connections; demo/paper/backtest connections rejected
- Loads fee eligibility context per run (active subscription + performance fee policy)
- Creates `BrokerReconciledTrade` + `PerformanceFeeLedgerEntry` atomically
  - `netRealisedPnl > 0` → `REALISED_TRADE_PROFIT`; `< 0` → `REALISED_TRADE_LOSS`; `= 0` → no entry
- Deduplication via unique constraint catch (code `23505`)
- Tracks run stats; `COMPLETED_WITH_WARNINGS` on partial failure
- Does NOT create performance-fee assessments or invoices

**PART F — API Endpoints**
- `POST /api/v1/broker-reconciliation/closed-trades/run` — ADMIN/SUPER_ADMIN only
- `GET /api/v1/broker-reconciliation/runs` — admin sees all; user sees own only
- `GET /api/v1/broker-reconciliation/reconciled-trades` — admin sees all; user sees own only

**PART G — Audit Actions**
- `BROKER_RECONCILIATION_STARTED`, `BROKER_RECONCILIATION_COMPLETED`, `BROKER_RECONCILIATION_FAILED`
- `BROKER_TRADE_RECONCILED`, `BROKER_TRADE_RECONCILIATION_SKIPPED`
- `PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE`

**PART H — Tests**
- 30+ test cases in `broker-trade-reconciliation.service.spec.ts`
- 15+ test cases in `ClosedTradeNormalizerService` unit tests (same file)
- Covers: winning/losing/zero P&L, duplicates, time range validation, DEMO rejection, adapter failure, partial failure, no subscription, no policy, cross-broker isolation, no secrets in audit, no auto-assessment/invoice

**Migrations added**
- `1751100000000-AddPerfFeeAssessmentDuplicateGuard` (PART A)
- `1751200000000-CreateBrokerReconciliationSchema` (PART B)

### Safety rules enforced
- No live broker withdrawals at any point
- No auto-charge of users
- No automatic performance-fee assessments or invoices from reconciliation
- Demo/paper/backtest/mock trades are never fee-eligible
- Broker account balance is never used as fee basis
- All money values stored as bigint minor-unit strings (no float)
- Deduplication enforced at both app level (idempotent run) and DB level (unique index)
- No secrets, credentials, or raw broker payloads in audit metadata
- High-water mark only advances after confirmed fee payment (unchanged from Sprint 11)

---

## Sprint 13 — Performance Fee Billing Cycle Orchestrator

**Completed:** 2026-06-30

### What was built

**PART A — Domain Entity + Migration**
- `PerformanceFeeBillingCycle` entity in `performance_billing` schema with 9 statuses (DRAFT → INVOICED / NO_FEE_DUE / CANCELLED)
- Migration `1751300000000-CreatePerformanceBillingSchema`: schema, enum, table, 5 regular indexes, 2 partial unique indexes for NULL-safe duplicate prevention
- Money columns (`totalRealisedProfit`, `feeAmount`) stored as BIGINT minor-unit strings

**PART B/C/E — Service + Integration + State Machine**
- `PerformanceFeeBillingCycleService` orchestrates: reconciliation → assessment → invoice
- Explicit state machine with final-state guard (INVOICED / NO_FEE_DUE / CANCELLED cannot rerun)
- FAILED cycles can retry safely
- Delegates to `BrokerTradeReconciliationService` (reconciliation) and `PerformanceFeeService` (assessment + invoice)
- No fee calculation logic duplicated — uses existing HWM engine
- No circular dependencies: `PerformanceBillingModule` imports `BrokerReconciliationModule` + `PerformanceFeesModule`; neither imports back

**PART D — API Endpoints**
- `POST /api/v1/performance-billing/cycles` — create DRAFT (ADMIN/SUPER_ADMIN)
- `POST /api/v1/performance-billing/cycles/run` — create + run direct (ADMIN/SUPER_ADMIN)
- `POST /api/v1/performance-billing/cycles/:id/run` — run by id (ADMIN/SUPER_ADMIN)
- `GET  /api/v1/performance-billing/cycles` — list (admin: all; user: own only)
- `GET  /api/v1/performance-billing/cycles/:id` — get (admin: any; user: own only)
- `POST /api/v1/performance-billing/cycles/:id/cancel` — cancel (ADMIN/SUPER_ADMIN)

**PART F — Audit Actions**
- 8 new audit events: `PERFORMANCE_BILLING_CYCLE_CREATED/STARTED/RECONCILED/ASSESSED/INVOICED/NO_FEE_DUE/FAILED/CANCELLED`

### Safety invariants (enforced, never violated)
- No live broker withdrawals
- No auto-charge of users
- No HWM update — HWM advances only after verified payment webhook
- No duplicate assessment or invoice for the same user/broker/period
- Cycle in a final state cannot be rerun
- All money values remain bigint minor-unit strings
- No secrets in errorSummary, metadata, or audit logs

## Sprint 14 — Performance Fee Invoice Payment Flow + Provider Checkout Assignment

**Completed:** 2026-07-02

### What was built

**PART B/C — Service + Provider Routing**
- `PerformanceFeePaymentService` (payments module): `initiatePerformanceFeeCheckout`, `getPerformanceFeePaymentStatus`, `getInvoiceView`, `listUserPerformanceFeeInvoices`
- Assigns a routed provider (via `PaymentRoutingService.routeForCheckout`, which excludes `manual` and fails closed) to the PENDING performance-fee transaction created at invoicing — no duplicate payable transaction
- Reuses an in-progress non-`manual` session idempotently; rejects already-`SUCCEEDED` transactions
- Placed inside the payments module (reuses `Invoice`/`PaymentTransaction`/`PerformanceFeeAssessment` repos + `PaymentRoutingService`) to avoid any new circular dependency

**PART D — API Endpoints (`/api/v1/performance-fees/invoices`)**
- `GET  /invoices` — list (user: own; admin: any via `userId`)
- `GET  /invoices/:invoiceId` — view (user: own; admin: any)
- `POST /invoices/:invoiceId/checkout` — initiate provider checkout
- `GET  /invoices/:invoiceId/payment-status` — payment status
- RBAC: non-admin cross-user access → 403

**PART E — Manual/admin settlement:** intentionally **skipped** — any manual "settle" path risks bypassing the webhook-only paid/HWM invariant. Documented as deferred.

**PART F — Webhook regression:** unchanged and green — verified-success marks paid + FEE_PAID (once) + HWM (once); duplicate/failed/invalid-signature never mark paid.

**PART G — Audit Actions**
- 3 new: `PERFORMANCE_FEE_CHECKOUT_INITIATED`, `PERFORMANCE_FEE_CHECKOUT_FAILED`, `PERFORMANCE_FEE_PAYMENT_STATUS_VIEWED`

### Safety invariants (enforced, never violated)
- Checkout NEVER marks invoice/assessment PAID, never creates FEE_PAID ledger, never updates HWM
- Verified provider webhook remains the ONLY paid/HWM path; frontend success is never trusted
- `manual` provider is never a public checkout provider; providers fail closed when unconfigured
- No duplicate payable transaction/invoice; money values remain bigint minor-unit strings
- No secrets in responses, `providerPayloadSummary`, or audit metadata
- No new migrations (reuses existing `payments` schema)

## Sprint 15 — Paystack Sandbox Checkout Integration

**Completed:** 2026-07-06

### What was built

**PART A — Configuration**
- `PAYSTACK_ENABLED` (default `false`), `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_BASE_URL` (default `https://api.paystack.co`), `PAYSTACK_CALLBACK_URL`
- Added to `config/configuration.ts`, `config/validation.schema.ts` (all optional/defaulted — never required), and `.env.example` (placeholder values only)

**PART B/C — Provider + HTTP client**
- `PaystackHttpClient` (new, injectable): thin wrapper around native `fetch` with an `AbortController` timeout, sanitised/length-capped error messages, and safe handling of non-2xx and Paystack's `status: false` API-level failures — no Paystack SDK dependency
- `PaystackPaymentProvider` (rewritten from a placeholder to a real sandbox implementation of `IPaymentProvider`):
  - `createCheckoutSession` → `POST /transaction/initialize` (amount in minor units, safe whitelisted metadata, generated `psk_<uuid>` reference)
  - `verifyWebhookSignature` → HMAC-SHA512 of the raw body vs `x-paystack-signature`, `crypto.timingSafeEqual`, fails closed on any missing input
  - `parseWebhookEvent` → maps `charge.success`→`PAYMENT_SUCCEEDED`, `charge.failed`/`invoice.payment_failed`→`PAYMENT_FAILED`, `subscription.disable`→`SUBSCRIPTION_CANCELLED`; never stores the raw payload, only whitelisted metadata
  - `getTransactionStatus` → `GET /transaction/verify/:reference`, read-only server-side status check
  - `refundPayment`/`cancelSubscription`/`createCustomer` remain fail-closed (inherited `NotImplementedException`)
  - `isLive` is computed from config (`PAYSTACK_ENABLED=true` **and** a secret key present) — fails closed otherwise

**PART D/E — Subscription + performance-fee checkout integration**
- **No business-logic changes required** — `SubscriptionsService.initiateCheckout` and `PerformanceFeePaymentService.initiatePerformanceFeeCheckout` already call the generic `IPaymentProvider` interface via `PaymentRoutingService`; Paystack now works through both flows automatically once enabled/configured
- Verified via new integration tests that checkout never touches subscription/invoice/assessment/HWM state

**PART F — Webhook integration**
- `POST /api/v1/payments/webhooks/paystack` reuses the existing `WebhookProcessorService` — no controller changes needed; signature verification happens before any state change, exactly as for other providers
- `manual` provider remains hard-blocked at the webhook endpoint (pre-existing guard, re-verified)

**PART G — Provider routing**
- No routing code changes — `paystack` was already present in `GH`/`NG`/`ZA` `CountryConfig.enabledPaymentProviders` seeds; it now resolves to a real (sandbox) implementation instead of a placeholder
- `GET /payments/providers` now reports `isLive: true` for Paystack only when `PAYSTACK_ENABLED=true` and a secret key is configured — otherwise `isSandbox: true`, matching every other provider's default

**PART I — Tests**
- New: `paystack.provider.spec.ts`, `paystack-http.client.spec.ts`, `webhook-processor.paystack.spec.ts`, `subscriptions.service.paystack.spec.ts`, `performance-fee-payment.paystack.spec.ts`, plus new describe blocks in `payment-routing.service.spec.ts`
- Updated: `payments.spec.ts` and `payment-routing.service.spec.ts` to construct the real `PaystackPaymentProvider(ConfigService, PaystackHttpClient)` instead of the old zero-arg placeholder constructor

### Safety invariants (enforced, never violated)
- Checkout NEVER marks invoice/subscription/assessment PAID, never creates FEE_PAID ledger, never updates HWM
- Verified `x-paystack-signature` webhook remains the ONLY paid/HWM/subscription-activation path; frontend callback is never trusted
- Paystack Verify Transaction is read-only server-side confirmation only — never a webhook-signature-verification substitute
- `PAYSTACK_SECRET_KEY`/`PAYSTACK_WEBHOOK_SECRET` never logged, returned, or present in thrown errors
- No raw card data or mobile money PINs read/stored/forwarded; raw webhook payload never persisted (whitelisted metadata only)
- Provider fails closed when disabled or unconfigured; `manual` provider still never reachable via public checkout/webhook
- No live broker withdrawals, no auto-charge, no Stripe/Flutterwave/Hubtel changes, no frontend/mobile work
- No new migrations (reuses existing `payments` schema)

## Sprint 16 — Subscription Checkout Idempotency + Pending Invoice Reuse

**Completed:** 2026-07-06

### What was built

**PART B — Checkout reuse rules**
- `SubscriptionsService.initiateCheckout()` rewritten: looks up an existing `DRAFT`/`ISSUED` invoice + `PENDING`/`PROCESSING` transaction for the same `(userId, planId, currency, countryCode, paymentPurpose)` identity and reuses it instead of creating a new pair
- An `ACTIVE`/`TRIAL` subscription still within its current period blocks checkout (`409`) before any invoice/transaction is touched
- A `PAID` invoice/`SUCCEEDED` transaction blocks checkout; an amount/currency/plan mismatch never reuses (fresh invoice/transaction created instead)
- `FAILED`/`CANCELLED`/`REFUNDED` transactions supersede (cancel) the stale invoice and allow a fresh checkout attempt
- A provider mismatch with an existing real `providerTransactionReference` is rejected safely (`409`); provider switching is only allowed when no session reference exists yet

**PART C — Optional idempotency key**
- Optional `Idempotency-Key` header (or `idempotencyKey` in `CheckoutDto`) — no schema change: a SHA-256 hash of the key plus a SHA-256 fingerprint of the checkout parameters are stored in the existing `Invoice.metadata` JSONB column
- Same key + same parameters replays the exact same result; same key + different parameters fails with `409 Conflict`

**PART D — Atomicity / race safety**
- New migration `AddSubscriptionCheckoutDuplicateGuard` (`1751400000000`): partial unique index on `payments.invoices` covering `user_id`, `currency`, `metadata->>'planId'`, `metadata->>'countryCode'`, `metadata->>'paymentPurpose'`, scoped to `status IN ('DRAFT','ISSUED')` and `metadata->>'type' = 'SUBSCRIPTION'`
- Postgres `23505 unique_violation` on invoice creation is caught and resolved by re-fetching and reusing the winning invoice/transaction
- Atomic conditional claim (`UPDATE ... WHERE status IN ('PENDING','FAILED') SET status = 'PROCESSING'`) immediately before any provider call — prevents two concurrent requests from both creating a provider session for the same transaction; a lost claim returns the winner's session or a safe retry response

**PART E — Provider session reuse**
- An existing `PROCESSING` transaction with an active `providerTransactionReference` + `checkoutUrl`/`sessionId` is returned as-is — `provider.createCheckoutSession()` is never called twice for the same transaction
- Provider call failure reverts the transaction to `PENDING` (not `FAILED`) so it is retryable without creating a duplicate invoice; never activates a subscription

**PART G — API response**
- `CheckoutResult` now includes `reused: boolean` and `reason: 'NEW_CHECKOUT' | 'REUSED_PENDING_CHECKOUT' | 'PROVIDER_SESSION_REUSED' | 'IDEMPOTENCY_KEY_REPLAY'` alongside the existing safe fields — no secrets added

**PART H — Audit actions**
- New: `PAYMENT_CHECKOUT_REUSED`, `PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED`
- All audit metadata (existing and new) remains free of provider secrets, authorization headers, raw provider responses, card data, PINs, and tokens

**PART I — Tests**
- Rewrote `subscriptions.service.spec.ts` and `subscriptions.service.paystack.spec.ts` with full `createQueryBuilder`-aware repository mocks
- New coverage: reuse (new/existing/active-session/failed-superseded/mismatches), concurrency (`23505` handling, atomic-claim races), idempotency key replay + parameter-mismatch rejection, provider-mismatch rejection, and Paystack-specific reuse (no duplicate HTTP calls to Paystack)

### Safety invariants (enforced, never violated)
- Checkout NEVER activates a subscription, marks an invoice `PAID`, or marks a transaction `SUCCEEDED` — only a verified webhook does (unchanged, regression-tested)
- Frontend checkout success is never trusted; no auto-charge
- Reuse/idempotency logic lives entirely in `SubscriptionsService` (provider-agnostic) — no provider-specific code changes; applies identically to Stripe/Paystack/Flutterwave/Hubtel/PayPal/Wise
- No secrets in checkout responses, audit metadata, or `providerPayloadSummary`
- No Stripe/Flutterwave/Hubtel/PayPal/Wise/Braintree implementation work, no live broker withdrawals, no frontend/mobile work
- One new migration (`AddSubscriptionCheckoutDuplicateGuard`), applied and verified

## Sprint 16 Audit — Payment/Idempotency/Security Audit (PASS WITH FIXES)

**Completed:** 2026-07-06

A dedicated audit of the Sprint 16 checkout idempotency/reuse implementation found and
fixed three real, narrow-scope bugs before Sprint 17 began:

1. **Raw DB error leak on a narrow concurrency race** in `createInvoiceAndTransaction()`'s
   23505 handler — a `'supersede'`/`'none'` outcome after losing the unique-index race
   (invoice committed, its transaction not yet — two non-atomic inserts) fell through to
   `throw err`, re-throwing the raw `QueryFailedError`. Fixed to always throw a safe
   `ConflictException` instead.
2. **Idempotency fingerprint missing `paymentPurpose`/`amountMinor`** — a mid-flight price
   change combined with the same `Idempotency-Key` would have replayed a stale-priced
   session instead of failing safely. Fixed by binding the fingerprint to `paymentPurpose`
   and `amountMinor` in addition to the existing fields.
3. **Empty `Idempotency-Key` header could shadow a valid body field** — `header ??
   dto.idempotencyKey` let an empty-string header win. Fixed to trim and only prefer the
   header when non-empty.

Also added a previously-missing `subscriptions.controller.spec.ts` (header/body
Idempotency-Key precedence was untested), plus new service-level tests for the
price-change-with-idempotency-key and 23505-not-yet-reusable-winner scenarios, and a
migration comment documenting PostgreSQL's NULL-uniqueness semantics for the partial
index (informational — unreachable today since all identity fields are always
non-null in the current checkout flow). See
[docs/architecture/21-payment-provider-architecture.md §17.7](./docs/architecture/21-payment-provider-architecture.md)
for full details. Final count: 648 tests, 39 suites, all passing.
