# iRexPro — Implementation Roadmap

## Current Phase: Phase 1 Sprint 6 Complete — Realtime Event Layer + Strategy Orchestrator

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
