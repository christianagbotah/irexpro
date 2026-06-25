# 06 — Bounded Contexts

## iRexPro — Domain-Driven Design Bounded Contexts

---

## 1. Purpose

This document defines the bounded contexts within iRexPro's domain model using Domain-Driven Design (DDD) principles. Each bounded context represents a cohesive area of business responsibility with its own ubiquitous language, domain models, and clear integration contracts with other contexts.

---

## 2. Bounded Context Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        iRexPro System                                   │
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────┐                        │
│  │   Identity &    │◄────────│  Subscription   │                        │
│  │   Access        │         │  & Billing      │                        │
│  │   Context       │         │  Context        │                        │
│  └────────┬────────┘         └────────┬────────┘                        │
│           │                           │                                 │
│           │                  ┌────────▼────────┐                        │
│           └─────────────────►│  Trading        │                        │
│                              │  Session        │                        │
│                              │  Context        │                        │
│                              └────────┬────────┘                        │
│                                       │                                 │
│              ┌────────────────────────┼────────────────────────┐        │
│              │                        │                        │        │
│   ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌─────────▼──────┐ │
│   │   Market Analysis   │  │   Risk Management   │  │  Broker        │ │
│   │   & AI Signals      │  │   Context           │  │  Integration   │ │
│   │   Context           │  │                     │  │  Context       │ │
│   └─────────────────────┘  └──────────┬──────────┘  └─────────┬──────┘ │
│                                        │                       │        │
│                              ┌─────────▼───────────────────────▼──────┐ │
│                              │        Trade Execution Context          │ │
│                              └─────────────────────────────────────────┘ │
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────┐                        │
│  │   Performance   │◄────────│  Revenue &      │                        │
│  │   Reporting     │         │  Fee Engine     │                        │
│  │   Context       │         │  Context        │                        │
│  └─────────────────┘         └─────────────────┘                        │
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────┐                        │
│  │   Audit &       │         │  Administration │                        │
│  │   Compliance    │         │  Context        │                        │
│  │   Context       │         │                 │                        │
│  └─────────────────┘         └─────────────────┘                        │
│                                                                         │
│  ┌─────────────────────────────────────────────┐                        │
│  │   [Future] Internal Wallet Context (Model B) │                       │
│  └─────────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Context Definitions

### 3.1 Identity & Access Context

**Ubiquitous Language:** User, Account, Role, Permission, Session, Credential, Verification

**Responsibilities:**
- User registration and lifecycle (active, suspended, closed)
- Email and phone verification
- Password management and MFA
- JWT token issuance and rotation
- Role-based access control
- Onboarding state tracking (risk disclosure, terms acceptance)

**Key Entities:** `User`, `UserProfile`, `AuthToken`, `VerificationToken`

**Publishes Events:**
- `UserRegistered`
- `UserVerified`
- `UserSuspended`
- `UserLoggedIn`

**Consumes Events:** None (upstream producer)

**Integration:** Other contexts consume User identity via shared User ID reference only. No other context should replicate User authentication logic.

---

### 3.2 Subscription & Billing Context

**Ubiquitous Language:** Plan, Subscription, Trial, Invoice, Payment, Billing Cycle, Expiry, Renewal

**Responsibilities:**
- Subscription plan configuration
- Subscription lifecycle (trial, active, expired, cancelled)
- Payment provider abstraction and webhook processing
- Invoice creation and tracking
- Subscription status enforcement interface

**Key Entities:** `SubscriptionPlan`, `Subscription`, `Invoice`, `PaymentEvent`

**Publishes Events:**
- `SubscriptionActivated`
- `SubscriptionExpired`
- `SubscriptionCancelled`
- `InvoicePaid`
- `InvoiceFailed`

**Consumes Events:**
- `UserRegistered` (to initialise subscription state)

**Integration Contracts:**
- Exposes `SubscriptionStatus.isActive(userId)` as a query interface used by Trading Session Context
- Exposes `getActiveSubscriptionPlan(userId)` to Revenue Context for fee rate lookup

---

### 3.3 Broker Integration Context

**Ubiquitous Language:** Broker, Connection, Credential, Account, Position, Order, Market Data, Adapter, Sandbox

**Responsibilities:**
- Broker account connection and credential management
- Credential encryption and secure storage
- Broker Adapter interface and concrete implementations
- Broker health monitoring
- Account state synchronisation (balance, equity, margin)
- Market data subscription management

**Key Entities:** `BrokerConnection`, `BrokerAccount`, `BrokerAdapter` (interface)

**Publishes Events:**
- `BrokerConnected`
- `BrokerDisconnected`
- `BrokerReconnected`
- `BrokerAccountSynced`

**Consumes Events:**
- `UserRegistered` (to associate broker connection with user)

**Critical Rule:** Broker credentials (`encryptedCredentials`) must never leave this context. No other context receives or returns raw credentials. Credential decryption happens only within the Broker Adapter invocation path.

---

### 3.4 Trading Session Context

**Ubiquitous Language:** Trading Session, Activation, Pause, Stop, Kill Switch, Session State, Session Gate

**Responsibilities:**
- Trading session lifecycle management (start, pause, stop, suspend)
- Pre-activation gate enforcement (subscription check, broker check)
- Session state tracking and persistence
- Kill switch enforcement
- Risk profile snapshot capture at session start

**Key Entities:** `TradingSession`, `GlobalKillSwitch`, `SessionGate`

**Publishes Events:**
- `TradingSessionStarted`
- `TradingSessionPaused`
- `TradingSessionStopped`
- `TradingSessionSuspended`

**Consumes Events:**
- `SubscriptionExpired` → suspend active sessions
- `BrokerDisconnected` → suspend active sessions
- `GlobalKillSwitchActivated` → suspend all active sessions

**Integration Contracts:**
- Queries `SubscriptionStatus.isActive()` before activation
- Queries `BrokerConnection.isConnected()` before activation

---

### 3.5 Market Analysis & AI Signals Context

**Ubiquitous Language:** Signal, Confidence Score, Indicator, Regime, Timeframe, Strategy, Model Version

**Responsibilities:**
- Real-time market data processing
- Technical indicator computation
- Market regime detection
- AI/ML model inference
- Signal generation (BUY/SELL/HOLD/CLOSE/MODIFY)
- Strategy governance (version control, parameters)
- Signal filtering and deduplication
- Backtesting and walk-forward testing
- Model versioning and rollback

**Key Entities:** `Signal`, `StrategyVersion`, `ModelVersion`, `IndicatorSnapshot`

**Publishes Events:**
- `SignalGenerated`
- `SignalExpired`
- `StrategyVersionDeployed`
- `ModelRolledBack`

**Consumes Events:**
- `TradingSessionStarted` (begin analysis for user)
- `TradingSessionStopped` (cease analysis)
- `BrokerDisconnected` (halt signal generation)

**Physical Implementation:** Python FastAPI services (signal-engine, strategy-orchestrator, market-data-service)

---

### 3.6 Risk Management Context

**Ubiquitous Language:** Risk Profile, Limit, Drawdown, Exposure, Margin, Leverage, Kill Switch, Violation, Approval

**Responsibilities:**
- Per-user risk profile management
- Pre-execution risk validation for every proposed trade action
- Risk limit monitoring during live sessions
- Kill switch enforcement at execution level
- Risk violation logging and alerting

**Key Entities:** `RiskProfile`, `RiskValidationResult`, `RiskViolation`

**Publishes Events:**
- `RiskApproved`
- `RiskRejected` (with reason)
- `RiskLimitBreached` (daily loss, drawdown, etc.)
- `KillSwitchTriggered`

**Consumes Events:**
- `SignalGenerated` (validate each signal)
- `TradeOpened`, `TradeClosed` (update risk counters)
- `BrokerAccountSynced` (refresh margin/balance data)
- `GlobalKillSwitchActivated`

**Critical Rule:** Risk Management Context is the mandatory gateway between Signal generation and Trade Execution. No bypass path must exist.

---

### 3.7 Trade Execution Context

**Ubiquitous Language:** Order, Trade, Execution, Idempotency Key, Broker Order, Fill, Reconciliation

**Responsibilities:**
- Order preparation and submission to Broker Adapter
- Idempotency key management
- Trade lifecycle management (open → modify → close)
- Trade state reconciliation against broker state
- Execution audit trail

**Key Entities:** `Trade`, `TradeExecution`, `IdempotencyRecord`

**Publishes Events:**
- `TradeOpened`
- `TradeModified`
- `TradeClosed`
- `TradeRejectedByBroker`
- `TradeReconciled`

**Consumes Events:**
- `RiskApproved` (proceed with execution)
- `BrokerDisconnected` (halt execution)

**Critical Rule:** Trade Execution Context only acts on events from Risk Management Context with status APPROVED. It must never act directly on signals.

---

### 3.8 Performance Reporting Context

**Ubiquitous Language:** Realised P&L, Unrealised P&L, Win Rate, Drawdown, Equity Curve, Trade History

**Responsibilities:**
- Aggregating closed trade results
- Calculating performance metrics (win rate, risk-reward, drawdown)
- Providing historical and real-time performance data for dashboards
- Generating equity curve data

**Key Entities:** `PerformanceSnapshot`, `TradeHistoryEntry`, `MetricAggregation`

**Publishes Events:** None (read/reporting context)

**Consumes Events:**
- `TradeClosed` (update aggregates)
- `TradeOpened` (track open exposure)

---

### 3.9 Revenue & Fee Engine Context

**Ubiquitous Language:** Performance Fee, High-Water Mark, Settlement, Realised Profit, Fee Period, Revenue Account

**Responsibilities:**
- Performance fee calculation on realised profits only
- High-water mark tracking per user
- Settlement cycle processing
- Platform owner revenue ledger management
- Fee statement generation

**Key Entities:** `PerformanceAccount`, `FeeRecord`, `OwnerRevenueAccount`, `FeeStatement`

**Publishes Events:**
- `FeeCalculated`
- `HighWaterMarkUpdated`
- `SettlementCompleted`

**Consumes Events:**
- `TradeClosed` (with realised P&L)

**Critical Rules:**
- Only closed trade P&L is included in fee calculations
- Deposit amounts are never treated as profit
- High-water mark prevents double-charging on same equity peak

---

### 3.10 Audit & Compliance Context

**Ubiquitous Language:** Audit Log, Event, Actor, Immutable Record, Compliance Evidence

**Responsibilities:**
- Receiving and persisting audit events from all contexts
- Ensuring immutability of audit records
- Supporting compliance reporting and audit reviews
- Retention policy enforcement

**Key Entities:** `AuditLog`

**Integration:** All other contexts publish events to this context. This context is append-only.

---

### 3.11 Administration Context

**Ubiquitous Language:** Admin, Platform Configuration, Kill Switch, User Management, Revenue Summary

**Responsibilities:**
- Admin user management interface
- Global kill switch operation
- Platform configuration (plan management, risk defaults)
- Revenue and subscription monitoring
- System health overview

**Key Entities:** `AdminUser`, `PlatformConfig`, `SystemHealthReport`

---

### 3.12 [Future] Internal Wallet Context (Model B)

**Ubiquitous Language:** Wallet, Deposit, Withdrawal, Transfer, Ledger Entry, Settlement, Payout

**Responsibilities (Future):**
- User funding wallet management
- User trading wallet management
- Deposit processing (bank, mobile money, crypto)
- Withdrawal and payout processing
- Immutable double-entry ledger
- Profit-share settlement from trading wallet to owner account
- Payment provider integrations (Paystack, Flutterwave, Stripe)

**Status:** Schema designed and context boundaries defined. Implementation deferred to Phase 2.

---

## 4. Context Integration Contracts

### 4.1 Synchronous (REST)

| Consumer | Provider | Query |
|---|---|---|
| TradingSession | Subscription | `isSubscriptionActive(userId)` |
| TradingSession | Broker | `isBrokerConnected(userId)` |
| Risk Engine | Broker | `getCurrentAccountState(userId)` |
| Execution | Broker Adapter | `placeOrder(orderRequest)` |

### 4.2 Asynchronous (Events)

All events are published to internal event bus (Redis Pub/Sub in Phase 1, Kafka in Phase 3).

| Event | Published By | Consumed By |
|---|---|---|
| `TradingSessionStarted` | Trading Session | AI Signals, Risk |
| `SignalGenerated` | AI Signals | Risk Management |
| `RiskApproved` | Risk Management | Execution |
| `TradeOpened` | Execution | Performance, Audit, Revenue |
| `TradeClosed` | Execution | Performance, Audit, Revenue |
| `SubscriptionExpired` | Subscription | Trading Session |
| `BrokerDisconnected` | Broker | Trading Session, Risk, Execution |
| `GlobalKillSwitchActivated` | Administration | All contexts |
