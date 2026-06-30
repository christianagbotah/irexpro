# iRexPro — Fully Autonomous AI Forex Trading Platform

> **Important Notice:** Forex trading involves a high level of risk and may not be suitable for all investors. iRexPro does not guarantee trading profits. Past performance does not guarantee future results. Please read the full risk disclosure before using this platform.

---

## Overview

iRexPro is a **global-first**, production-grade, broker-connected, fully autonomous AI Forex trading platform for web, Android, and iOS. The platform connects to a user's regulated broker account and executes AI-driven trades autonomously — handling market analysis, signal generation, risk validation, order execution, and trade management without requiring the user to manually analyse charts or make trading decisions.

iRexPro supports users from multiple countries worldwide with regional payment providers, regional SMS providers, country-specific compliance rules, multi-currency subscriptions, and country-based configuration — all through a provider-agnostic, globally extensible architecture.

**Users simply:**
1. Create an account and complete onboarding
2. Connect their regulated broker account
3. Subscribe to an active plan
4. Activate AI Auto Trading Mode
5. Monitor performance
6. Stop or pause AI mode as desired

---

## Current Status

**Phase 1 Sprint 12 — Broker Trade Reconciliation: Complete**

- ✅ Sprint 1-2: Backend Foundation (NestJS, Auth, Users, Audit)
- ✅ Sprint 3-4: Broker Integration (MetaTrader adapter, credentials, health checks)
- ✅ Sprint 5-6: Subscriptions + Payments (providers, webhooks, checkout)
- ✅ Sprint 7-8: AI Signal Engine (Python FastAPI, indicators, signals)
- ✅ Sprint 9-10: Risk Engine (kill switch, risk profiles, position sizing)
- ✅ Sprint 11: Performance Fee + High-Water Mark Engine
- ✅ Sprint 12: Broker Trade Reconciliation → Realised P&L Ledger Entries

See [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) for the next steps and Cursor prompts.

---

## Global Platform Design

iRexPro is global-first. Regional providers are plug-in implementations of global interfaces:

| Concern | Architecture |
|---|---|
| Payment providers | `IPaymentProvider` interface — Stripe, Paystack, Flutterwave, Hubtel, PayPal |
| SMS providers | `ISmsProvider` interface — Twilio, Hubtel SMS, Arkesel, AWS SNS |
| Regional configuration | `CountryConfig` entity — per-country provider routing, KYC, currency, compliance |
| Multi-currency billing | `PlanPricing` entity — per-currency pricing for each plan |

No country, provider, or currency is hardcoded. All regional behaviour is configuration, not code.

---

## AI Trading System

The AI trading system is **core platform scope**, not a future idea:

```
Market Data Feed
  → AI Signal Engine     (confidence scoring, regime detection, indicator analysis)
  → Strategy Orchestrator (governance, version control, signal filtering)
  → Risk Engine          (mandatory pre-execution validation — cannot be bypassed)
  → Execution Engine     (idempotent order submission, trade lifecycle)
  → Broker Adapter       (pluggable per-broker implementation)
  → Broker Account       (user funds remain here in Model A)
```

The AI supports: signal confidence scoring · trend/momentum analysis · volatility prediction · market-regime detection · model versioning · model rollback · backtesting · walk-forward testing · paper trading · controlled live trading.

---

## Project Structure

```
irexpro/
├── apps/
│   ├── web/                    # Next.js 14 web application
│   ├── mobile/                 # React Native mobile app (Android + iOS)
│   ├── admin/                  # Next.js admin dashboard
│   └── api/                    # NestJS backend API (modular monolith)
├── services/
│   ├── market-data/            # Python FastAPI — market data ingestion
│   ├── signal-engine/          # Python FastAPI — AI signal generation
│   ├── strategy-orchestrator/  # Python FastAPI — strategy governance
│   ├── backtesting/            # Python FastAPI — backtesting and walk-forward testing
│   └── model-registry/         # Python FastAPI — ML model versioning and rollback
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   ├── shared-ui/              # Shared UI components
│   └── shared-utils/           # Shared utilities
├── infrastructure/
│   ├── docker/                 # Dockerfiles
│   ├── kubernetes/             # Kubernetes manifests
│   └── scripts/                # Deployment scripts
└── docs/
    ├── architecture/           # 23 architecture documents
    └── adr/                    # 4 Architecture Decision Records
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web Frontend | Next.js 14+, TypeScript, Tailwind CSS |
| Mobile | React Native, TypeScript |
| Backend API | NestJS, TypeScript (modular monolith) |
| AI/ML Services | Python 3.11+, FastAPI, XGBoost, pandas-ta |
| Database | PostgreSQL 15+ |
| Cache / Queue | Redis 7+, BullMQ |
| Payment Providers | Stripe, Paystack, Flutterwave, Hubtel, PayPal (IPaymentProvider) |
| SMS Providers | Twilio, Hubtel SMS, Arkesel, AWS SNS (ISmsProvider) |
| Containerisation | Docker, Docker Compose |
| Production Orchestration | Kubernetes (Phase 2) |

Full stack details: [TECH_STACK.md](./TECH_STACK.md)

---

## Architecture Documentation

### Core Architecture (23 documents)

| Document | Description |
|---|---|
| [01-system-overview.md](docs/architecture/01-system-overview.md) | High-level system overview and principles |
| [02-product-scope.md](docs/architecture/02-product-scope.md) | Feature scope, global regions, in/out of scope |
| [03-user-journeys.md](docs/architecture/03-user-journeys.md) | 10 core user journeys |
| [04-system-architecture.md](docs/architecture/04-system-architecture.md) | Component architecture and module design |
| [05-domain-model.md](docs/architecture/05-domain-model.md) | 18 domain entities with fields and rules |
| [06-bounded-contexts.md](docs/architecture/06-bounded-contexts.md) | DDD bounded contexts and event flows |
| [07-api-architecture.md](docs/architecture/07-api-architecture.md) | REST API catalogue and WebSocket gateway |
| [08-database-architecture.md](docs/architecture/08-database-architecture.md) | PostgreSQL schema, all DDL, Redis patterns |
| [09-broker-integration-architecture.md](docs/architecture/09-broker-integration-architecture.md) | IBrokerAdapter interface and multi-broker design |
| [10-ai-trading-architecture.md](docs/architecture/10-ai-trading-architecture.md) | AI Signal Engine, strategy orchestration, model governance |
| [11-risk-engine-architecture.md](docs/architecture/11-risk-engine-architecture.md) | Risk Engine — all rules, fail-closed design |
| [12-execution-engine-architecture.md](docs/architecture/12-execution-engine-architecture.md) | Trade execution, idempotency, reconciliation |
| [13-subscription-and-profit-sharing.md](docs/architecture/13-subscription-and-profit-sharing.md) | Global subscription, HWM fees, Model A collection |
| [14-security-architecture.md](docs/architecture/14-security-architecture.md) | JWT, encryption, RBAC, global compliance |
| [15-devops-and-deployment.md](docs/architecture/15-devops-and-deployment.md) | CI/CD, Docker, Kubernetes, rollback |
| [16-observability-and-monitoring.md](docs/architecture/16-observability-and-monitoring.md) | Metrics, alerts, SLOs, trading-specific monitoring |
| [17-testing-strategy.md](docs/architecture/17-testing-strategy.md) | Unit, integration, E2E, backtest, paper trading requirements |
| [18-compliance-and-risk-disclosures.md](docs/architecture/18-compliance-and-risk-disclosures.md) | Global regulatory scope, risk disclosures |
| [19-future-wallet-model-b.md](docs/architecture/19-future-wallet-model-b.md) | Future wallet/custody architecture |
| [20-roadmap.md](docs/architecture/20-roadmap.md) | Phased product roadmap — Africa first, global ready |
| [21-payment-provider-architecture.md](docs/architecture/21-payment-provider-architecture.md) | IPaymentProvider interface and all provider adapters |
| [22-sms-provider-architecture.md](docs/architecture/22-sms-provider-architecture.md) | ISmsProvider interface, OTP, message templates |
| [23-country-and-regional-configuration.md](docs/architecture/23-country-and-regional-configuration.md) | CountryConfig, global routing, KYC, currency, compliance |

### Architecture Decision Records (4 ADRs)

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-use-broker-connected-model-a-first.md) | Use broker-connected Model A first |
| [0002](docs/adr/0002-use-modular-monolith-before-microservices.md) | Modular monolith before microservices |
| [0003](docs/adr/0003-use-risk-engine-before-execution.md) | Risk Engine as mandatory gateway |
| [0004](docs/adr/0004-use-high-water-mark-for-performance-fees.md) | High-water mark for performance fees |

---

## Development Rules

See [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md) for all 18 development rules.

**Critical rules (abbreviated):**
- AI signals never execute trades directly — Risk Engine is mandatory and non-bypassable
- Every trade must have a stop-loss (enforced by Risk Engine, no exceptions)
- Performance fees only on realised profits, HWM prevents double-charging
- Broker credentials never in API responses (AES-256 encryption, KMS-managed)
- Paper trading before live trading (mandatory gate)
- Active subscription required before AI trading (server-side gate)
- No hardcoded country, payment provider, SMS provider, or currency
- ManualPaymentProvider is for development/testing only — not for commercial use
- Webhook signature validated before any processing

---

## Getting Started (After Scaffolding)

```bash
# Start development environment
docker compose up -d

# Run migrations
npm run migration:run

# Start API
cd apps/api && npm run start:dev

# Start web app
cd apps/web && npm run dev
```

---

## Risk Disclosure

**Forex trading involves substantial risk of loss and is not appropriate for all investors. The high degree of leverage can work against you as well as for you. iRexPro does not guarantee profitable trading. Past performance is not indicative of future results.**
