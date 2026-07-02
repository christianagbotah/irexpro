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

### Sprint 14+: Execution Engine (3 weeks)

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
