# 04 — System Architecture

## iRexPro — Detailed Component Architecture

---

## 1. Purpose

This document describes the full component architecture of iRexPro, including all services, their responsibilities, communication patterns, data flows, and infrastructure topology.

---

## 2. Architecture Style

iRexPro is built as a **modular monolith** in Phase 1, with clear module boundaries designed for future microservices extraction without application rewrites.

| Principle | Implementation |
|---|---|
| **Module isolation** | Each domain module has its own controllers, services, repositories, and DTOs |
| **No circular dependencies** | Modules communicate through defined interfaces and events |
| **Service boundaries** | AI/ML services are separate Python processes from day one |
| **Future extraction** | Each NestJS module can become an independent microservice with an API contract already defined |

---

## 3. Top-Level Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                   │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │  Web App         │  │  Mobile App      │  │  Admin Dashboard  │   │
│  │  Next.js 14+     │  │  React Native    │  │  Next.js          │   │
│  │  TypeScript      │  │  TypeScript      │  │  TypeScript       │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────────┘   │
└───────────┼────────────────────┼─────────────────────┼──────────────┘
            │                    │                      │
            └────────────────────┼──────────────────────┘
                                 │ HTTPS / WSS
┌────────────────────────────────▼───────────────────────────────────────┐
│                         API Gateway Layer                              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                   NestJS API Server                              │ │
│  │                                                                  │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │ │
│  │  │  Auth      │  │  Users     │  │  Broker    │  │  Subs     │  │ │
│  │  │  Module    │  │  Module    │  │  Module    │  │  Module   │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │ │
│  │                                                                  │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │ │
│  │  │  Trading   │  │  Risk      │  │  Revenue   │  │  Admin    │  │ │
│  │  │  Session   │  │  Config    │  │  Module    │  │  Module   │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │ │
│  │                                                                  │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │ │
│  │  │  WebSocket │  │  Notify    │  │  Audit     │                 │ │
│  │  │  Gateway   │  │  Module    │  │  Module    │                 │ │
│  │  └────────────┘  └────────────┘  └────────────┘                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
            │                    │                      │
  ┌─────────▼──────┐   ┌─────────▼──────┐   ┌──────────▼─────────┐
  │  PostgreSQL    │   │   Redis         │   │  Message Queue     │
  │  (Primary DB)  │   │   (Cache/Jobs)  │   │  (BullMQ / Redis)  │
  └────────────────┘   └────────────────┘   └────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                         AI/ML Services Layer (Python)                  │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │  Market Data     │  │  AI Signal       │  │  Strategy        │    │
│  │  Service         │  │  Engine          │  │  Orchestrator    │    │
│  │  FastAPI         │  │  FastAPI         │  │  FastAPI         │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐                           │
│  │  Backtesting     │  │  Model Registry  │                           │
│  │  Service         │  │  Service         │                           │
│  │  FastAPI         │  │  FastAPI         │                           │
│  └──────────────────┘  └──────────────────┘                           │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                         Execution Layer                                │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │  Risk Engine     │  │  Execution       │  │  Broker Adapter  │    │
│  │  (NestJS/Python) │  │  Engine (NestJS) │  │  Layer           │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. NestJS Backend — Module Architecture

### 4.1 Module List

| Module | Responsibility |
|---|---|
| `AuthModule` | JWT auth, MFA, refresh tokens, session management |
| `UsersModule` | User CRUD, profile, onboarding state |
| `BrokerModule` | Broker connection management, credential encryption |
| `SubscriptionModule` | Plans, subscriptions, invoices, payment webhooks |
| `PaymentModule` | `IPaymentProvider` registry, router, webhook processing |
| `SmsModule` | `ISmsProvider` registry, router, OTP, alerts |
| `CountryConfigModule` | Country/regional configuration, currency, routing |
| `TradingSessionModule` | AI trading session lifecycle management |
| `SignalModule` | Signal intake from Python services, signal routing |
| `RiskModule` | Risk configuration per user, risk event consumption |
| `ExecutionModule` | Order lifecycle, execution state, reconciliation |
| `PerformanceModule` | Trade history, P&L aggregation, reporting |
| `RevenueModule` | Performance fee calculation, high-water mark, owner ledger |
| `AuditModule` | Immutable event logging |
| `NotificationModule` | Email, push, WebSocket, SMS orchestration |
| `AdminModule` | Admin operations, kill switch, user management, country config |
| `WebSocketGateway` | Real-time push to clients |
| `HealthModule` | Health check endpoints |

### 4.2 Module Dependency Rules

```
AuthModule              → UsersModule, SmsModule
BrokerModule            → UsersModule, CountryConfigModule, AuditModule
SubscriptionModule      → UsersModule, PaymentModule, AuditModule, SmsModule
PaymentModule           → CountryConfigModule, AuditModule
SmsModule               → CountryConfigModule, AuditModule
CountryConfigModule     → (no upstream — foundational config module)
TradingSessionModule    → UsersModule, BrokerModule, SubscriptionModule, RiskModule
SignalModule            → TradingSessionModule
RiskModule              → SignalModule, BrokerModule
ExecutionModule         → RiskModule, BrokerModule, AuditModule
PerformanceModule       → ExecutionModule
RevenueModule           → PerformanceModule, AuditModule
AdminModule             → (all modules via read access)
AuditModule             → (no upstream dependencies — leaf module)
```

---

## 5. Python AI Services — Service Architecture

### 5.1 Services

| Service | Port | Responsibility |
|---|---|---|
| `market-data-service` | 8001 | OHLCV ingestion, normalisation, storage |
| `signal-engine` | 8002 | Indicator computation, ML inference, signal output |
| `strategy-orchestrator` | 8003 | Strategy governance, signal filtering, signal dispatch |
| `backtesting-service` | 8004 | Historical backtesting, walk-forward testing |
| `model-registry` | 8005 | Model versioning, deployment, rollback |

### 5.2 Communication

- Python services expose REST APIs consumed by NestJS
- Python services can consume from BullMQ/Redis for async job processing
- Python services write signal events to shared Redis pub/sub channel
- NestJS Signal Module subscribes to signal channel

---

## 6. AI Trading Pipeline — Core Architecture

**The AI trading system is core iRexPro scope.** It is not a roadmap placeholder. These five stages are all implemented as first-class platform services:

```
┌──────────────────────────────────────────────────────────────────┐
│  AI TRADING PIPELINE  (enforced one-way flow — cannot be skipped) │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Market Data Service                                              │
│    OHLCV ingestion, normalisation, Redis/DB storage               │
│         ↓                                                         │
│  AI Signal Engine  ← CORE SCOPE                                  │
│    - Indicator computation (MA, RSI, MACD, BB, ATR, Stochastic)  │
│    - Market-regime detection (trending/ranging/volatile)          │
│    - Signal confidence scoring (0–100)                           │
│    - Model versioning and rollback                               │
│    - Outputs: signal with confidence, entry, SL, TP, reasoning   │
│         ↓                                                         │
│  Strategy Orchestrator  ← CORE SCOPE                             │
│    - Active strategy governance                                   │
│    - Confidence threshold filtering                               │
│    - Signal deduplication and cooldown                            │
│    - Strategy version control                                     │
│         ↓                                                         │
│  Risk Engine  ← MANDATORY GATEWAY — CANNOT BE BYPASSED           │
│    - All risk rule checks (see 11-risk-engine-architecture.md)    │
│    - APPROVED → proceed to execution                              │
│    - REJECTED → logged, trade discarded, user alerted             │
│         ↓ (only on APPROVED)                                      │
│  Execution Engine  ← CORE SCOPE                                  │
│    - Order preparation, idempotency key                           │
│    - BrokerAdapter call                                           │
│    - Trade lifecycle tracking                                     │
│         ↓                                                         │
│  Broker Adapter (IBrokerAdapter)                                 │
│    - Pluggable per-broker implementation                          │
│    - Sandbox / paper trading / live modes                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Architectural invariant:** The AI Signal Engine never has a direct path to the Broker Adapter. Every signal passes through Strategy Orchestrator → Risk Engine → Execution Engine in order. Any code that shortcuts this pipeline is an architectural violation.

### 6.1 Data Flow — Trading Signal Pipeline

```
Step 1: Market Data Ingestion
  market-data-service polls broker data feed (OHLCV)
  Data normalised and stored in time-series cache (Redis) and DB

Step 2: Signal Generation (every 60s or configurable)
  signal-engine reads market data
  Applies indicators: SMA, EMA, RSI, MACD, BB, ATR, Stochastic
  Runs regime detection model
  Runs signal generation model
  Outputs: { instrument, direction, confidence, entry_price, sl, tp, reasoning }

Step 3: Strategy Orchestration
  strategy-orchestrator receives raw signal
  Checks: active strategy version, strategy parameters, min confidence threshold
  Deduplicates: filters same-direction signal within cooldown window
  Outputs: approved signal or discarded (with reason logged)

Step 4: Risk Validation
  Input: approved signal + user risk config + current broker state
  Checks: all risk rules (see 11-risk-engine-architecture.md)
  Outputs: APPROVED | REJECTED (with reason)
  CRITICAL: Risk Engine is FAIL-CLOSED — any error results in REJECTED, not APPROVED

Step 5: Execution
  ExecutionModule prepares order struct
  Assigns idempotency key
  Calls BrokerAdapter.placeOrder()
  Awaits broker confirmation
  Creates Trade record
  Emits TradeOpened event

Step 6: Real-time Update
  WebSocketGateway emits TradeOpened event to user's connected clients
  PerformanceModule updates open P&L in real time
```

---

## 6.2 Model A Revenue Flow

In Model A, user funds remain at the broker. iRexPro's revenue system operates entirely within the platform and does not withdraw from the broker account:

```
Trade closes at broker
  → BrokerAdapter publishes TradeClosedEvent
  → ExecutionModule records closed Trade with realisedPnl
  → PerformanceModule updates PerformanceAccount.totalRealisedPnl

Settlement cycle (BullMQ scheduled job)
  → RevenueModule reads closed trades since lastSettledAt
  → Calculates pnlAboveHighWaterMark
  → Creates FeeRecord (status: CALCULATED)
  → Emits PerformanceFeeCalculatedEvent

Fee collection (via payment system)
  → SubscriptionModule or RevenueModule triggers charge via PaymentProviderRouter
  → IPaymentProvider.createPaymentIntent(feeAmount, userCurrency)
  → On provider webhook PAYMENT_SUCCEEDED:
       FeeRecord.status → COLLECTED
       OwnerRevenueEntry created
       AuditLog entry created

IMPORTANT: iRexPro does NOT withdraw from the user's broker account as a fee mechanism.
Fee collection is a separate billing event via the platform's IPaymentProvider system.
```

---

## 7. Communication Patterns

| Pattern | Used For |
|---|---|
| **REST HTTP** | Client → NestJS, NestJS → Python services |
| **WebSocket** | NestJS → Client (real-time updates) |
| **Redis Pub/Sub** | Python signal service → NestJS signal subscriber |
| **BullMQ (Redis queues)** | Background jobs: fee calculation, report generation, reconciliation, SMS delivery, payment retry |
| **Webhook** | Payment providers → NestJS per-provider webhook endpoints |
| **Database polling** | Broker state reconciliation (backup path) |
| **Provider Adapter** | IPaymentProvider and ISmsProvider adapter pattern for all external providers |

---

## 8. Infrastructure Components

| Component | Technology | Purpose |
|---|---|---|
| Primary database | PostgreSQL 15+ | Persistent data for all domains |
| Cache | Redis 7+ | Session cache, signal pub/sub, job queues, country config cache |
| Job queue | BullMQ (Redis) | Async background processing |
| File storage | S3-compatible | Document uploads (future KYC) |
| Secret management | Vault / cloud KMS | Broker credential encryption keys, payment provider secrets |
| Container runtime | Docker | Local dev and initial deployment |
| Orchestration | Docker Compose (dev), Kubernetes (prod-ready) | Service orchestration |
| Reverse proxy | Nginx / cloud ALB | TLS termination, routing |
| CI/CD | GitHub Actions | Build, test, deploy pipeline |
| Observability | Prometheus + Grafana, structured logs | Metrics and dashboards |
| Payment Providers | Stripe, Paystack, Flutterwave, Hubtel, PayPal | Regional payment routing via IPaymentProvider |
| SMS Providers | Twilio, Hubtel, Arkesel, AWS SNS | Regional SMS routing via ISmsProvider |
| FX Rate API | Open Exchange Rates / Frankfurter | Display currency conversion (not billing) |

---

## 9. Security Architecture Summary

| Layer | Control |
|---|---|
| Transport | TLS 1.3 everywhere, HSTS |
| Authentication | JWT RS256, short-lived access tokens, refresh token rotation |
| Authorisation | RBAC on all endpoints, module-level guards |
| Secrets | Broker credentials encrypted with AES-256, key in KMS |
| Input | DTO validation via class-validator on all endpoints |
| Rate limiting | Per-IP and per-user rate limiting on auth endpoints |
| Audit | Immutable audit log for all sensitive operations |
| Admin | MFA required for admin roles |

---

## 10. Scalability Design

### Phase 1 — Single Node

- All NestJS modules in one process
- Python services as separate containers
- PostgreSQL single instance with read replica readiness
- Redis single instance with Sentinel readiness

### Phase 2 — Horizontal Scale

- NestJS API behind load balancer (stateless, JWT auth)
- AI signal service scaled independently (high compute)
- Execution engine scaled independently (low latency)
- PostgreSQL with read replicas for reporting queries
- Redis Cluster for session and queue scale

### Phase 3 — Microservices Extraction

- Extract modules to independent services as load requires
- Introduce API Gateway (e.g., Kong) for service mesh
- Event streaming via Kafka for high-throughput signal events
- Kubernetes deployment with autoscaling

---

## 11. Failure Handling

| Failure | Response |
|---|---|
| Broker API timeout | Retry with exponential backoff; halt trading after max retries |
| AI service unavailable | Trading session suspended; alert admin and user |
| Risk Engine error | Fail closed — trade rejected, not approved |
| Database connection failure | Circuit breaker; queued operations where safe |
| Payment webhook not received | Admin reconciliation workflow |
| Idempotency key conflict | Return existing order state, do not resubmit |
| Kill switch active | All trade signals and executions blocked immediately |
