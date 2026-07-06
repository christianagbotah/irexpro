# iRexPro — Technology Stack

---

## Stack Selection Principles

1. **Production-grade first** — no prototype technologies; every selection must support production workloads
2. **TypeScript everywhere** — type safety across frontend and backend reduces bugs in financial logic
3. **Python for AI/ML** — Python is the de-facto standard for ML; use it where it excels
4. **Separation of concerns** — each layer uses the right tool for its job
5. **Open standards** — avoid vendor lock-in; prefer open standards and cloud-agnostic approaches
6. **Observability-native** — every component must support structured logging, metrics, and health checks

---

## Frontend — Web Application

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 14+ | React framework with App Router, SSR/SSG, API routes |
| **TypeScript** | 5+ | Static typing for all frontend code |
| **Tailwind CSS** | 3+ | Utility-first CSS framework |
| **shadcn/ui** | Latest | Accessible, headless UI component library |
| **Zustand** | Latest | Lightweight client state management |
| **TanStack Query** | v5 | Server state management, caching, background sync |
| **Socket.IO client** | 4+ | WebSocket client for real-time updates |
| **React Hook Form** | Latest | Form management with validation |
| **Zod** | Latest | Runtime type validation (shared with backend) |
| **Recharts** | Latest | Chart library for equity curve and P&L charts |
| **date-fns** | Latest | Date manipulation (no Moment.js) |

---

## Frontend — Mobile Application

| Technology | Version | Purpose |
|---|---|---|
| **React Native** | 0.73+ | Cross-platform mobile framework |
| **TypeScript** | 5+ | Static typing |
| **Expo** | Latest SDK | Managed workflow for faster development |
| **React Navigation** | v6 | Navigation and routing |
| **TanStack Query** | v5 | Server state management |
| **Socket.IO client** | 4+ | Real-time updates |
| **React Native Paper** | Latest | Material Design UI components |
| **React Native Reanimated** | Latest | Performant animations |
| **Zod** | Latest | Schema validation (shared with web) |

---

## Backend — API

| Technology | Version | Purpose |
|---|---|---|
| **NestJS** | 10+ | TypeScript Node.js framework (modular monolith) |
| **TypeScript** | 5+ | Static typing |
| **TypeORM** | Latest | ORM with migration support |
| **class-validator** | Latest | DTO validation decorators |
| **class-transformer** | Latest | Serialisation and DTO transformation |
| **@nestjs/swagger** | Latest | OpenAPI documentation auto-generation |
| **@nestjs/jwt** | Latest | JWT token management |
| **@nestjs/throttler** | Latest | Rate limiting |
| **@nestjs/websockets** | Latest | WebSocket gateway (Socket.IO) |
| **BullMQ** | Latest | Redis-backed job queue |
| **ioredis** | Latest | Redis client |
| **bcrypt** | Latest | Password hashing |
| **Winston** | Latest | Structured logging |
| **Helmet** | Latest | HTTP security headers |
| **Decimal.js** | Latest | Decimal-safe arithmetic for all financial calculations |
| **uuid** | Latest | UUID v4 generation |
| **Zod** | Latest | Schema validation (shared with frontend) |

---

## AI/ML Services — Python (`services/ai-engine/`)

> Sprint 8: market-data ingestion via NestJS, Redis OHLCV cache, scheduled paper-mode signals. No live trading approval.

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | Runtime |
| **FastAPI** | 0.115+ | HTTP API framework |
| **Uvicorn** | 0.32+ | ASGI server |
| **pydantic** | v2.9+ | Data validation and schemas |
| **pydantic-settings** | 2.6+ | Environment variable config |
| **pandas** | 2.2+ | Data manipulation and feature engineering |
| **numpy** | 2.1+ | Numerical computation |
| **scikit-learn** | 1.5+ | ML preprocessing |
| **XGBoost** | 2.1+ | Gradient boosting classifier (baseline scaffold) |
| **redis (redis-py async)** | 5.2+ | OHLCV Redis cache (separate DB from API) |
| **httpx** | 0.27+ | Async HTTP client for NestJS integration |
| **structlog** | 24.4+ | Structured JSON logging |
| **python-dotenv** | 1.0+ | .env file loading |
| **pytest** | 8.3+ | Testing |
| **pytest-asyncio** | 0.24+ | Async test support |
| **ruff** | 0.7+ | Fast linter and formatter |
| **mypy** | 1.13+ | Static type checking |
| **coverage** | 7.6+ | Test coverage |
| **APScheduler** | Latest | Scheduled signal generation jobs (Sprint 8+) |
| **MLflow** | Latest | Model versioning and experiment tracking (Sprint 9+) |
| **LightGBM / PyTorch** | Latest | Alternative models (future sprints) |

**Service endpoints:**
- `GET /api/v1/health` — health check
- `GET /api/v1/models/active` — active model metadata
- `POST /api/v1/market-data/mock-ohlcv` — mock OHLCV (dev only)
- `POST /api/v1/signals/generate` — generate candidate (not published)
- `POST /api/v1/signals/publish-to-api` — generate + forward to NestJS

**NestJS integration:**
- `POST /api/v1/ai/internal/signals` — protected by `InternalApiKeyGuard` (`x-irexpro-internal-api-key`)
- All signals route through `AiSignalService → StrategyOrchestrator → RiskEngine → Execution`

---

## Database

| Technology | Version | Purpose |
|---|---|---|
| **PostgreSQL** | 15+ | Primary relational database |
| **Redis** | 7+ | Cache, session store, pub/sub, job queue |
| **TimescaleDB** (future) | Latest | Time-series extension for market data |

---

## Infrastructure and DevOps

| Technology | Version | Purpose |
|---|---|---|
| **Docker** | Latest | Containerisation |
| **Docker Compose** | v2 | Local development orchestration |
| **Kubernetes** | 1.28+ | Production orchestration (Phase 2) |
| **Nginx** | Latest | Reverse proxy, TLS termination |
| **GitHub Actions** | — | CI/CD pipelines |
| **AWS ECS Fargate** | — | Initial production container hosting |
| **AWS RDS (PostgreSQL)** | — | Managed production database |
| **AWS ElastiCache (Redis)** | — | Managed production cache |
| **AWS KMS** | — | Key encryption key management |
| **AWS Secrets Manager** | — | Secret storage |
| **AWS S3** | — | File storage, backup |
| **AWS CloudFront** | — | CDN for web app |
| **AWS Route 53** | — | DNS management |

---

## Observability

| Technology | Version | Purpose |
|---|---|---|
| **Prometheus** | Latest | Metrics collection |
| **Grafana** | Latest | Metrics dashboards |
| **Sentry** | Latest | Error tracking and alerting |
| **CloudWatch Logs** | — | Log aggregation (AWS) |
| **OpenTelemetry** | Latest | Distributed tracing (Phase 2) |
| **Jaeger / Grafana Tempo** | Latest | Trace storage and visualisation (Phase 2) |

---

## Payment Providers (IPaymentProvider Adapters)

Routing: `PaymentRoutingService` → `CountryConfig.enabledPaymentProviders` → provider selection.
All providers implement `IPaymentProvider`. No direct SDK calls in business logic.

| Provider | ID | Region | Payment Methods | Status |
|---|---|---|---|---|
| **Stripe** | `stripe` | Global (incl. NG, KE, GH, ZA) | Card | Sandbox placeholder — Sprint 10+ |
| **PayPal / Braintree** | `paypal` | Global (US, GB, CA, AU, DE, FR) | PayPal, Card | Sandbox placeholder |
| **Paystack** | `paystack` | Africa (NG, GH, KE, ZA) | Card, Mobile Money, Bank | **Sandbox-live — Sprint 15** (fails closed unless `PAYSTACK_ENABLED=true` + secret key set) |
| **Flutterwave** | `flutterwave` | Pan-Africa (30+ countries) | Card, Mobile Money, USSD | Sandbox placeholder |
| **Hubtel** | `hubtel` | Ghana | Mobile Money (MTN/Vodafone/Airtel), Card | Sandbox placeholder |
| **Wise** | `wise` | Global (payout-only) | Bank Transfer | Sandbox placeholder — Phase 3 |
| **Manual (Admin)** | `manual` | All | Manual | DEV/TEST ONLY — never public checkout |

**Security rules:**
- Placeholder providers fail closed: `verifyWebhookSignature` returns `false`
- Paystack fails closed identically when `PAYSTACK_ENABLED` is not `'true'` or `PAYSTACK_SECRET_KEY` is missing (`isLive` reflects both conditions)
- ManualPaymentProvider excluded from `PaymentRoutingService.routeForCheckout()`
- Subscription activated ONLY via verified webhook — frontend payment success never trusted
- All monetary amounts stored as bigint strings (minor units) — never float

### Paystack Sandbox Integration (Sprint 15)

| Component | Location | Status |
|---|---|---|
| `PaystackHttpClient` (native `fetch` wrapper, no SDK) | `payments/providers/paystack-http.client.ts` | ✅ Sprint 15 |
| `PaystackPaymentProvider` (`createCheckoutSession`/`verifyWebhookSignature`/`parseWebhookEvent`/`getTransactionStatus`) | `payments/providers/paystack.provider.ts` | ✅ Sprint 15 |
| `PAYSTACK_ENABLED`/`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`/`PAYSTACK_WEBHOOK_SECRET`/`PAYSTACK_BASE_URL`/`PAYSTACK_CALLBACK_URL` | `config/configuration.ts`, `config/validation.schema.ts` | ✅ Sprint 15 |
| Webhook endpoint reuse (`POST /api/v1/payments/webhooks/paystack`) | `payments.controller.ts` (no changes needed) | ✅ Sprint 15 |
| Migrations | — | None (reuses `payments` schema) |

**Paystack API surface used** (per [official docs](https://paystack.com/docs/api/)): Transaction Initialize (`POST /transaction/initialize`), Transaction Verify (`GET /transaction/verify/:reference`), and webhook signature verification (`x-paystack-signature` = HMAC-SHA512 of the raw body). No undocumented fields are used.

---

## SMS Providers (ISmsProvider Adapters)

| Provider | ID | Region | Phase |
|---|---|---|---|
| **Twilio** | `twilio` | Global | Phase 1 |
| **Hubtel SMS** | `hubtel` | Ghana | Phase 1 |
| **Arkesel** | `arkesel` | Africa (GH, NG, KE, ZA) | Phase 1 |
| **AWS SNS** | `aws_sns` | Global | Phase 1 (fallback) |
| **Africa's Talking** | `africastalking` | Africa (18 countries) | Phase 3 |

---

## Security

| Technology | Purpose |
|---|---|
| **AWS KMS** | Key Encryption Key for broker credential envelope encryption |
| **HashiCorp Vault** (alternative) | Secret management and dynamic secrets |
| **TruffleHog** | Secret scanning in Git history and CI |
| **Semgrep** | Static application security testing (SAST) |
| **OWASP ZAP** | Dynamic application security testing (DAST) |
| **npm audit / pip audit** | Dependency vulnerability scanning |

---

## Testing

| Technology | Purpose |
|---|---|
| **Jest** + ts-jest | NestJS unit and integration tests |
| **Supertest** | NestJS E2E HTTP testing |
| **pytest** | Python service tests |
| **pytest-asyncio** | Python async tests |
| **pytest-cov** | Python coverage reporting |
| **Playwright** (future) | Web E2E testing |
| **Detox** (future) | React Native E2E testing |
| **k6** | Load and performance testing |
| **Artillery** | WebSocket load testing |

---

## Development Tools

| Tool | Purpose |
|---|---|
| **ESLint** | TypeScript linting |
| **Prettier** | Code formatting |
| **Ruff** | Python linting (fast) |
| **Black** | Python formatting |
| **Husky** | Git hooks for pre-commit checks |
| **lint-staged** | Run linters on staged files only |
| **Conventional Commits** | Commit message standards |
| **commitlint** | Enforce conventional commit format |

---

## Internationalisation and Regionalisation

| Technology | Purpose |
|---|---|
| **next-intl** | Next.js i18n routing and translations (web app) |
| **react-i18next** | React Native translations (mobile app) |
| **Intl API** (browser/Node built-in) | Number, date, currency formatting per locale |
| **date-fns-tz** | Timezone-aware date manipulation |
| **Open Exchange Rates / Frankfurter** | FX rate API for display currency conversion |

---

## Sprint 11 — Performance Fee Engine (Implemented)

| Component | Location | Status |
|---|---|---|
| `PerformanceFeePolicy` entity | `performance-fees/entities/` | ✅ Sprint 11 |
| `TradingAccountPerformance` entity | `performance-fees/entities/` | ✅ Sprint 11 |
| `PerformanceFeeAssessment` entity | `performance-fees/entities/` | ✅ Sprint 11 |
| `PerformanceFeeLedgerEntry` entity | `performance-fees/entities/` | ✅ Sprint 11 |
| `PerformanceFeeService` | `performance-fees/services/` | ✅ Sprint 11 |
| `PerformanceFeesController` | `performance-fees/` | ✅ Sprint 11 |
| Migration `1751000000000` | `database/migrations/` | ✅ Sprint 11 |

**Key arithmetic rule:** Performance fee calculations use `BigInt` arithmetic to avoid floating-point precision loss. Formula: `fee = floor(profitAboveHWM × feePercent × 100 / 1_000_000)`.

### Broker Trade Reconciliation (Sprint 12)

| Component | Location | Status |
|---|---|---|
| `BrokerTradeReconciliationRun` entity | `broker-reconciliation/entities/` | ✅ Sprint 12 |
| `BrokerReconciledTrade` entity | `broker-reconciliation/entities/` | ✅ Sprint 12 |
| `NormalizedClosedTrade` interface | `broker-reconciliation/interfaces/` | ✅ Sprint 12 |
| `ClosedTradeNormalizerService` | `broker-reconciliation/services/` | ✅ Sprint 12 |
| `BrokerTradeReconciliationService` | `broker-reconciliation/services/` | ✅ Sprint 12 |
| `BrokerReconciliationController` | `broker-reconciliation/` | ✅ Sprint 12 |
| `BrokerReconciliationModule` | `broker-reconciliation/` | ✅ Sprint 12 |
| Migration `1751100000000` (assessment duplicate guard) | `database/migrations/` | ✅ Sprint 12 |
| Migration `1751200000000` (broker_reconciliation schema) | `database/migrations/` | ✅ Sprint 12 |

**Reconciliation P&L arithmetic:** `netRealisedPnl = grossRealisedPnl + commission + swap` (all in minor currency units as bigint strings). Major-unit decimal strings from broker adapters are converted using string arithmetic — no float risk.

### Performance Fee Invoice Payment Flow (Sprint 14)

| Component | Location | Status |
|---|---|---|
| `PerformanceFeePaymentService` | `payments/services/` | ✅ Sprint 14 |
| `PerformanceFeePaymentController` (`/api/v1/performance-fees/invoices`) | `payments/` | ✅ Sprint 14 |
| `InitiatePerformanceFeeCheckoutDto` | `payments/dto/` | ✅ Sprint 14 |
| Audit actions `PERFORMANCE_FEE_CHECKOUT_INITIATED/CHECKOUT_FAILED/PAYMENT_STATUS_VIEWED` | `common/enums/` | ✅ Sprint 14 |
| Migrations | — | None (reuses `payments` schema) |

**Payment safety:** checkout only assigns a routed provider + creates a provider session; it never marks paid and never updates the high-water mark. A verified provider webhook remains the sole path to paid/HWM state. The `manual` provider is excluded from public checkout and providers fail closed when unconfigured.

### Paystack Sandbox Checkout Integration (Sprint 15)

Both the subscription checkout (`SubscriptionsService.initiateCheckout`) and performance-fee
checkout (`PerformanceFeePaymentService.initiatePerformanceFeeCheckout`) flows now work
end-to-end with Paystack via the existing provider-agnostic `IPaymentProvider` interface —
no business-logic changes were required in either service. See
[docs/architecture/21-payment-provider-architecture.md](./docs/architecture/21-payment-provider-architecture.md)
for the full design and safety invariants.

### Subscription Checkout Idempotency + Pending Invoice Reuse (Sprint 16)

| Component | Location | Status |
|---|---|---|
| `initiateCheckout` reuse/idempotency rewrite | `subscriptions/subscriptions.service.ts` | ✅ Sprint 16 |
| `idempotencyKey` DTO field + `Idempotency-Key` header support | `subscriptions/dto/checkout.dto.ts`, `subscriptions.controller.ts` | ✅ Sprint 16 |
| Audit actions `PAYMENT_CHECKOUT_REUSED`/`PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED` | `common/enums/audit-action.enum.ts` | ✅ Sprint 16 |
| Migration `1751400000000-AddSubscriptionCheckoutDuplicateGuard` (partial unique index on `payments.invoices`) | `database/migrations/` | ✅ Sprint 16 |

A repeated checkout for the same `(userId, planId, currency, countryCode,
paymentPurpose)` now reuses the existing pending invoice/transaction (or active
provider session) instead of creating a duplicate. A DB-level partial unique index
backstops true concurrency, with app-level `23505` handling and an atomic
conditional claim (`PENDING`/`FAILED` → `PROCESSING`) before any provider call.
Applies identically to every provider — no provider-specific changes. Checkout still
never activates a subscription or marks anything paid; only a verified webhook does.
See [docs/architecture/21-payment-provider-architecture.md §17](./docs/architecture/21-payment-provider-architecture.md)
for the full design.

---

## Decimal Arithmetic Policy

**All financial calculations must use `Decimal.js` (TypeScript) or Python's `decimal.Decimal` module.**

JavaScript's native `Number` type uses IEEE 754 floating-point, which produces rounding errors in financial calculations:

```javascript
// WRONG — never do this:
0.1 + 0.2 === 0.3 // false!

// CORRECT — always do this:
import Decimal from 'decimal.js';
new Decimal('0.1').plus('0.2').equals('0.3') // true
```

All monetary fields in API requests and responses use **string representation** to preserve precision across language boundaries.

All database monetary columns use `DECIMAL(18,8)` — never `FLOAT` or `DOUBLE`.
