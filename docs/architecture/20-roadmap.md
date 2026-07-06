# 20 — Roadmap

## iRexPro — Product and Technical Roadmap

---

## 1. Purpose

This document defines the phased implementation roadmap for iRexPro, from initial backend scaffolding through production launch to future platform expansion.

---

## 2. Roadmap Overview

```
Phase 0: Foundation (Current)
  Architecture and planning documentation

Phase 1: Core Platform — Model A
  Backend API, AI Engine, Risk Engine, Execution Engine
  Web and Mobile frontends
  First broker integration
  Internal beta and pilot testing

Phase 2: Production Launch
  Security hardening, compliance review
  Live trading activation (demo → live progression)
  Subscription and revenue system live

Phase 3: Scale and Expand
  Additional broker adapters
  Enhanced AI models
  Mobile app polish
  Wallet system pre-work

Phase 4: Model B
  Internal wallet and custody
  Payment provider integrations
  Crypto trading support

Phase 5: Platform Expansion
  Multi-strategy marketplace
  Copy trading
  White-label offering
```

---

## 3. Phase 0 — Architecture Foundation (Complete)

| Deliverable | Status |
|---|---|
| System architecture documentation (20 docs) | Complete |
| ADR records (4 decisions) | Complete |
| Domain model definition | Complete |
| API contract design | Complete |
| Database schema design | Complete |
| Bounded context map | Complete |
| DevOps and CI/CD design | Complete |
| Security architecture design | Complete |
| Risk and compliance framework | Complete |
| Model B future design | Complete |

---

## 4. Phase 1 — Core Platform Build

### Sprint 1-2: Backend Foundation (4 weeks)

| Task | Priority |
|---|---|
| NestJS project scaffold (modular monolith structure) | P0 |
| Database schema creation and initial migrations | P0 |
| AuthModule: registration, email verification, login, JWT | P0 |
| UsersModule: profile, onboarding | P0 |
| Docker Compose development environment | P0 |
| CI pipeline (lint, test, build) | P0 |
| AuditModule: append-only event logging | P0 |

### Sprint 3-4: Broker Integration (4 weeks)

| Task | Priority |
|---|---|
| BrokerAdapterInterface definition | P0 |
| BrokerAdapterRegistry service | P0 |
| First broker adapter implementation (sandbox) | P0 |
| BrokerConnectionModule: connect, health check, sync | P0 |
| Credential encryption service (KMS integration) | P0 |
| BrokerAccount state sync job | P1 |

### Sprint 5-6: Subscription System (3 weeks)

| Task | Priority |
|---|---|
| SubscriptionPlan seeding | P0 |
| SubscriptionModule: lifecycle, gates | P0 |
| ManualPaymentProvider (admin-activated subscriptions) | P0 |
| Invoice generation | P1 |
| Payment webhook abstraction layer | P1 |

### Sprint 7-8: AI Signal Engine (4 weeks)

| Task | Priority |
|---|---|
| Python FastAPI project scaffold | P0 |
| MarketDataService: OHLCV ingestion and cache | P0 |
| Technical indicator computation (pandas-ta) | P0 |
| Market regime detection (rule-based first, ML second) | P0 |
| Initial signal generation model (XGBoost baseline) | P0 |
| SignalModule in NestJS (signal intake from Python) | P0 |

### Sprint 9-10: Risk Engine (3 weeks)

| Task | Priority |
|---|---|
| RiskProfile entity and management | P0 |
| Risk Engine validation pipeline (all rules) | P0 |
| Kill switch implementation | P0 |
| Risk violation recording | P0 |
| Risk Engine unit tests (100% branch coverage) | P0 |

### Sprint 11: Performance Fee + High-Water Mark Engine ✅ Complete

| Task | Status |
|---|---|
| PerformanceFeePolicy entity and service | ✅ |
| TradingAccountPerformance HWM tracking | ✅ |
| PerformanceFeeAssessment + PerformanceFeeLedgerEntry | ✅ |
| Invoice + payment flow integration | ✅ |
| markAssessmentPaid + HWM update on payment | ✅ |
| Duplicate assessment guard (app-level) | ✅ |

### Sprint 12: Broker Trade Reconciliation ✅ Complete

| Task | Status |
|---|---|
| BrokerTradeReconciliationRun entity + migration | ✅ |
| BrokerReconciledTrade entity + deduplication index | ✅ |
| ClosedTradeNormalizerService (major→minor units, skip rules) | ✅ |
| BrokerTradeReconciliationService (fee eligibility, ledger integration) | ✅ |
| DB-level assessment duplicate guard (partial unique indexes) | ✅ |
| BrokerReconciliationModule + Controller | ✅ |
| 45+ tests covering all safety invariants | ✅ |

### Sprint 13: Performance Fee Billing Cycle Orchestrator ✅ Complete

| Task | Status |
|---|---|
| `PerformanceFeeBillingCycle` entity + `performance_billing` schema migration | ✅ |
| `PerformanceFeeBillingCycleService` (reconcile → assess → invoice) | ✅ |
| Explicit state machine (DRAFT/RECONCILING/RECONCILED/ASSESSING/ASSESSED/INVOICED/NO_FEE_DUE/FAILED/CANCELLED) | ✅ |
| Integration with `BrokerTradeReconciliationService` and `PerformanceFeeService` | ✅ |
| `PerformanceBillingModule` (no circular deps) | ✅ |
| `PerformanceBillingController` with RBAC (admin-only write) | ✅ |
| 8 new audit actions | ✅ |
| 51 tests (service + controller) | ✅ |
| No auto-charge, no HWM update, no duplicate invoice | ✅ |

### Sprint 14: Performance Fee Invoice Payment Flow ✅ Complete

| Task | Status |
|---|---|
| `PerformanceFeePaymentService` (checkout / status / list) | ✅ |
| Provider checkout assignment via `PaymentRoutingService` (excludes `manual`) | ✅ |
| Reuse pending performance-fee transaction — no duplicate payable transaction | ✅ |
| Endpoints under `/api/v1/performance-fees/invoices` with RBAC + user scoping | ✅ |
| 3 new audit actions (`CHECKOUT_INITIATED` / `CHECKOUT_FAILED` / `PAYMENT_STATUS_VIEWED`) | ✅ |
| Checkout never marks paid / never updates HWM — webhook remains the only paid path | ✅ |
| Fail closed on unconfigured providers; no secrets exposed | ✅ |
| 35 new tests (service + controller) | ✅ |

### Sprint 15: Paystack Sandbox Checkout Integration ✅ Complete

| Task | Status |
|---|---|
| `PaystackPaymentProvider` — real sandbox implementation (was a placeholder) | ✅ |
| `PaystackHttpClient` — injectable native-`fetch` HTTP wrapper, no SDK | ✅ |
| `createCheckoutSession` (Transaction Initialize), `getTransactionStatus` (Transaction Verify) | ✅ |
| `verifyWebhookSignature` (HMAC-SHA512, `x-paystack-signature`, fails closed) | ✅ |
| `parseWebhookEvent` (`charge.success`/`charge.failed`/`invoice.payment_failed`/`subscription.disable`) | ✅ |
| Subscription + performance-fee checkout work with Paystack — zero business-logic changes | ✅ |
| Webhook endpoint reused unchanged (`POST /payments/webhooks/paystack`) | ✅ |
| `PAYSTACK_ENABLED`/`PAYSTACK_SECRET_KEY`/etc. config, fail-closed by default | ✅ |
| Checkout never marks paid / never updates HWM — verified webhook remains the only paid path | ✅ |
| No secrets in logs, responses, errors, or audit metadata | ✅ |
| 60 new tests (provider, HTTP client, webhook, subscription + performance-fee checkout, routing) | ✅ |

### Sprint 16: Subscription Checkout Idempotency + Pending Invoice Reuse ✅ Complete

| Task | Status |
|---|---|
| `initiateCheckout` reuses an existing DRAFT/ISSUED invoice + PENDING/PROCESSING transaction for the same (userId, planId, currency, countryCode, paymentPurpose) instead of creating a duplicate | ✅ |
| Active provider session (PROCESSING + providerTransactionReference) is returned as-is — no second provider session created | ✅ |
| Active ACTIVE/TRIAL subscription, PAID invoice, or SUCCEEDED transaction blocks a new checkout | ✅ |
| FAILED/CANCELLED/REFUNDED transactions supersede the stale invoice and allow a fresh checkout | ✅ |
| Amount/currency/plan mismatch never reuses — a fresh invoice/transaction pair is created instead | ✅ |
| DB-level partial unique index (`AddSubscriptionCheckoutDuplicateGuard` migration) backstops concurrent double-clicks; Postgres `23505` handled by re-fetching and reusing the winner | ✅ |
| Atomic conditional claim (`PENDING`/`FAILED` → `PROCESSING`) before any provider call — prevents duplicate provider sessions on true concurrency | ✅ |
| Optional `Idempotency-Key` header / `idempotencyKey` DTO field — SHA-256 hash of key + parameter fingerprint stored in existing `Invoice.metadata` (no schema change) | ✅ |
| New audit actions `PAYMENT_CHECKOUT_REUSED` / `PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED` | ✅ |
| Checkout response reports `reused`/`reason` — no secrets exposed | ✅ |
| Applies uniformly to all providers (Stripe/Paystack/Flutterwave/Hubtel/PayPal/Wise) — no provider-specific changes needed | ✅ |
| Webhook-only paid/activation invariant unchanged and regression-tested | ✅ |
| 25 new tests (reuse, concurrency, idempotency key, Paystack-specific reuse) | ✅ |

**Sprint 16 audit (2026-07-06) — PASS WITH FIXES:** found and fixed a narrow-window raw
DB error leak in the 23505 recovery path, an idempotency fingerprint gap
(`paymentPurpose`/`amountMinor` were not bound to the key, so a price change mid-flight
could replay a stale-priced session), and an empty-header precedence bug. Added the
previously-missing `subscriptions.controller.spec.ts`. Final count after fixes: 648
tests, 39 suites.

### Sprint 17: Stripe Sandbox Checkout Integration ✅ Complete

| Task | Status |
|---|---|
| `StripePaymentProvider` — real sandbox implementation (was a placeholder) | ✅ |
| `StripeHttpClient` — injectable native-`fetch` HTTP wrapper, `application/x-www-form-urlencoded`, no SDK | ✅ |
| `createCheckoutSession` (Checkout Session, `mode: 'payment'`), `getTransactionStatus` (Checkout Session / PaymentIntent retrieve) | ✅ |
| `verifyWebhookSignature` (HMAC-SHA256 over `"${timestamp}.${rawBody}"`, `Stripe-Signature` header, 300s replay tolerance, fails closed) | ✅ |
| `parseWebhookEvent` (`checkout.session.completed`/`payment_intent.succeeded`/`checkout.session.expired`/`payment_intent.payment_failed`/async variants) | ✅ |
| Subscription + performance-fee checkout work with Stripe — zero business-logic changes | ✅ |
| `STRIPE_ENABLED`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/etc. config, fail-closed by default | ✅ |
| Provider routing: US/GB prefer Stripe (already first in `enabledPaymentProviders`); Paystack remains preferred for GH/NG — no seed changes needed | ✅ |
| Checkout never marks paid / never updates HWM — verified webhook remains the only paid path | ✅ |
| No secrets in logs, responses, errors, or audit metadata | ✅ |
| Flutterwave, Hubtel, PayPal, Wise, Braintree explicitly out of scope — not implemented | ✅ |
| New tests (provider, HTTP client, webhook, subscription + performance-fee checkout, routing) | ✅ |

**Sprint 17 audit (2026-07-06) — PASS, no fixes required:** reviewed all 17
requested areas (config, HTTP client, checkout, webhook signature/parsing,
amount/currency verification, transaction status, subscription/performance-fee
integration, routing, idempotency, module wiring, audit logging, build artifacts,
regressions, coverage, docs) and found no Stripe-specific bugs. One pre-existing,
non-security observation noted (performance-fee checkout metadata omits
`transactionId`, shared code since Sprint 14, identical for Paystack) — not fixed,
out of scope. Final count unchanged: 734 tests, 44 suites, all passing.

> Note: this is the actual, chronologically-next Sprint 15 (Paystack). The
> "Sprint 15+"/"Sprint 15-16" entries below predate this sprint's numbering and
> describe a separate, aspirational execution/revenue-engine roadmap track that
> has not yet been renumbered — see
> [`docs/project-state/CURRENT_STATE.md`](../project-state/CURRENT_STATE.md) for
> the authoritative, up-to-date sprint checkpoint.

### Sprint 15+: Execution Engine (3 weeks)

| Task | Priority |
|---|---|
| ExecutionModule: order preparation and submission | P0 |
| Idempotency key service | P0 |
| Trade lifecycle management | P0 |
| Trade audit events | P0 |

### Sprint 14-15: Trading Session and WebSocket (2 weeks)

| Task | Priority |
|---|---|
| TradingSessionModule: full lifecycle | P0 |
| WebSocketGateway: real-time trade events | P0 |
| Dashboard P&L streaming | P1 |

### Sprint 15-16: Revenue Engine (2 weeks)

| Task | Priority |
|---|---|
| PerformanceModule: P&L aggregation | P0 |
| RevenueModule: fee calculation, HWM, settlement job | P0 |
| FeeStatement generation | P1 |

### Sprint 17-18: Admin Dashboard Backend (2 weeks)

| Task | Priority |
|---|---|
| AdminModule: user management, revenue view | P0 |
| Kill switch admin API | P0 |
| Audit log viewer API | P1 |
| System health API | P1 |

### Sprint 19-22: Frontend — Web App (4 weeks)

| Task | Priority |
|---|---|
| Next.js project scaffold + Tailwind | P0 |
| Auth pages (login, register, verify) | P0 |
| Onboarding wizard | P0 |
| Dashboard (session status, open trades, P&L) | P0 |
| Broker connection flow | P0 |
| Subscription purchase flow | P0 |
| Performance reports | P1 |

### Sprint 23-26: Frontend — Mobile App (4 weeks)

| Task | Priority |
|---|---|
| React Native project scaffold | P0 |
| Auth and onboarding | P0 |
| Dashboard with real-time updates | P0 |
| Broker connection | P0 |
| Subscription | P0 |
| Push notifications | P1 |

### Sprint 27-28: Backtesting and Paper Trading (2 weeks)

| Task | Priority |
|---|---|
| Backtesting service | P0 |
| PaperBrokerAdapter | P0 |
| Model Registry service | P0 |
| First model backtest validation | P0 |

### Sprint 29-30: Integration Testing and Pilot (3 weeks)

| Task | Priority |
|---|---|
| Full E2E test suite | P0 |
| Internal beta test (team + trusted users) | P0 |
| Paper trading validation (2+ weeks) | P0 |
| Security review | P0 |
| Performance testing | P1 |

---

## 5. Phase 2 — Production Launch (Africa First, Global Ready)

| Task | Timeline |
|---|---|
| Legal review (Ghana, Nigeria, Kenya) | Pre-launch |
| Country configurations seeded (GH, NG, KE, ZA, GB) | Pre-launch |
| Live broker connection (first broker, live account) | Pre-launch |
| Hubtel SMS live (Ghana users) | Pre-launch |
| Arkesel SMS live (Nigeria, Kenya users) | Pre-launch |
| Twilio SMS live (UK + global fallback) | Pre-launch |
| Controlled pilot: 10 users Ghana (demo accounts) | Week 1-2 |
| Controlled pilot: 10 users Nigeria (demo accounts) | Week 1-2 |
| Controlled pilot: 10 users live accounts (small) | Week 3-4 |
| Paystack subscription billing live (NG, GH, KE) | Week 3 |
| Hubtel subscription billing live (GH) | Week 3 |
| Stripe subscription billing live (UK) | Week 4 |
| Broader Africa launch | Month 2 |
| UK market launch | Month 3 |
| Admin dashboard live | Month 1 |
| Monitoring dashboards live | Month 1 |

---

## 6. Phase 3 — Scale and Global Expansion

| Feature | Priority |
|---|---|
| Second broker adapter | High |
| Enhanced AI models (deep learning, multi-timeframe) | High |
| News/sentiment integration | Medium |
| Advanced performance analytics | Medium |
| Flutterwave integration live (Pan-Africa expansion) | High |
| Stripe live (US, CA, AU, SG, AE) | High |
| PayPal integration live | Medium |
| US market legal review and activation | High |
| Australia, Singapore, UAE market activation | Medium |
| Localisation: French (West Africa) | Medium |
| Localisation: Swahili (East Africa) | Medium |
| Mobile app v2 (enhanced UX) | Medium |
| Multi-broker per user | Low |
| Kubernetes migration | Medium |
| Multi-region AWS deployment (EU data residency) | Medium |

---

## 7. Phase 4 — Model B (Internal Wallet)

| Feature | Prerequisite |
|---|---|
| Full KYC workflow | Legal clearance |
| Funding Wallet | EMI licence or equivalent |
| Deposit flows (Paystack, Flutterwave) | Payment services authorisation |
| Withdrawal and payout flows | Payment services authorisation |
| Immutable double-entry ledger | Data architecture ready (designed in Phase 1) |
| Crypto trading (Binance adapter) | VASP registration |
| Profit-share settlement | Model B wallet live |

---

## 8. Phase 5 — Platform Expansion

| Feature | Description |
|---|---|
| Strategy marketplace | Platform-curated and third-party strategies |
| Copy trading | Users follow other users' AI sessions |
| White-label | License iRexPro to third parties |
| API for third-party integrations | Open API for vetted partners |
| Advanced portfolio management | Multi-account, portfolio-level risk |

---

## 9. Key Milestones

| Milestone | Target |
|---|---|
| Architecture documentation complete | Phase 0 — Done |
| First working API with Auth + Broker | Sprint 4 |
| Country config + payment/SMS provider routing | Sprint 5-6 |
| Full trading pipeline (signal → execution) | Sprint 12 |
| First paper trade executed | Sprint 28 |
| Internal beta launch | Sprint 30 |
| First live trade (pilot user, Ghana) | Phase 2, Month 1 |
| First subscription revenue (Hubtel/Paystack) | Phase 2, Month 1 |
| Africa launch (GH, NG, KE, ZA) | Phase 2, Month 2 |
| UK market launch | Phase 2, Month 3 |
| First performance fee collected | Phase 2, Month 2 |
| 100 active subscribers | Phase 2-3 |
| Global expansion (US, AU, SG) | Phase 3 |
| Model B wallet live (Africa first) | Phase 4 |
| Model B live (Global) | Phase 4-5 |
