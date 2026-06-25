# 01 — System Overview

## iRexPro: Fully Autonomous AI Forex Trading Platform

---

## 1. Purpose

This document provides the authoritative high-level overview of the iRexPro system. It describes what the platform is, who it serves, its operating model, core capabilities, and the architectural principles that govern every design and implementation decision.

---

## 2. Platform Identity

| Attribute | Value |
|---|---|
| **Product Name** | iRexPro |
| **Full Name** | iRexPro — Fully Autonomous AI Forex Trading Platform |
| **Platform Type** | Broker-connected autonomous AI trading platform |
| **Target Markets** | Web, Android, iOS |
| **Initial Business Model** | Model A — Broker-connected, non-custodial |
| **Future Business Model** | Model B — Internal wallet, custodial |

---

## 3. What iRexPro Does

iRexPro is a production-grade, fully autonomous AI-driven Forex trading platform. It eliminates the requirement for users to manually analyse markets, choose trading directions, calculate position sizes, configure stop-losses, or build trading strategies.

The platform's AI Trading Engine, Risk Engine, and Execution Engine collectively handle:

- Real-time market data ingestion and analysis
- AI-driven BUY / SELL / HOLD / CLOSE / MODIFY signal generation
- Signal confidence scoring and filtering
- Risk validation and position sizing
- Order execution via broker APIs
- Trade lifecycle monitoring (entry, stop-loss, take-profit, trailing stop, exit)
- Performance reporting and fee calculation

The user's role is limited to:

1. Create an account and complete onboarding
2. Connect a supported regulated broker account
3. Subscribe to an active plan
4. Activate AI Auto Trading Mode
5. Monitor performance dashboard
6. Pause or stop AI mode as desired

---

## 4. Current Operating Model — Model A (Phase 1)

In Phase 1, iRexPro operates as a **broker-connected, non-custodial platform**:

- User funds remain inside the user's own regulated broker account at all times
- iRexPro connects to the broker via authorised API or gateway credentials
- iRexPro sends trade instructions to the broker on the user's behalf
- iRexPro does **not** hold, custody, or transfer user funds

This model reduces regulatory complexity in Phase 1 while delivering full autonomous trading capability.

---

## 5. Future Operating Model — Model B (Phase 2+)

Model B introduces a full internal wallet and custody layer:

- Internal Funding Wallet and Trading Wallet per user
- Deposit, withdrawal, and payout flows
- Bank transfer and mobile money integration
- Immutable double-entry ledger
- Profit-share settlement to platform owner's account
- Crypto trading support

Model B is fully designed in this architecture but not implemented in Phase 1. See [19-future-wallet-model-b.md](./19-future-wallet-model-b.md).

---

## 6. Core Architectural Principles

### 6.1 AI Never Executes Trades Directly

No AI signal, model output, or strategy recommendation is permitted to reach the broker without first passing through the Risk Engine and Execution Engine. This is a non-negotiable system invariant.

```
Market Data → AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker Adapter → Broker Account
```

### 6.2 Risk Engine Is Mandatory

Every proposed trade action, modification, and close instruction must be validated by the Risk Engine before execution. The Risk Engine may reject, modify, or hold any action.

### 6.3 No Guaranteed Profit

The platform must never represent, imply, or promise guaranteed trading profits. Forex trading carries inherent risk of loss. This principle applies to all marketing copy, UI language, and system-generated notifications.

### 6.4 Demo Before Live

Paper trading and broker sandbox environments must be validated before any live trading is enabled for a user or a new AI strategy version.

### 6.5 Subscription Gates AI Trading

AI Auto Trading Mode requires an active, valid subscription. The system must enforce this gate at both the API layer and the execution layer.

### 6.6 Profit Sharing on Realised Profits Only

Performance fees are calculated exclusively on realised (closed) profits. Unrealised (floating) profits are never included in fee calculations. High-water mark logic prevents double-charging.

### 6.7 Audit Immutability

All trading decisions, risk checks, executions, subscription events, revenue events, and admin actions must generate immutable audit log entries. Audit logs must never be deletable through normal application flows.

### 6.8 Broker Credential Security

Broker API credentials, tokens, and secrets are encrypted at rest using envelope encryption and are never returned to the frontend in any response.

### 6.9 Idempotency

All trade execution requests must carry idempotency keys to prevent duplicate order submission, especially during retries, network failures, or system restarts.

### 6.10 Decimal-Safe Monetary Arithmetic

All monetary values, lot sizes, prices, and profit/loss figures must use decimal-safe data types throughout the stack. JavaScript floating-point arithmetic must never be used for financial calculations.

---

## 7. High-Level System Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                         iRexPro Platform                            │
│                                                                     │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │  Web App   │   │  Mobile App  │   │  Admin Dashboard         │  │
│  │  (Next.js) │   │(React Native)│   │  (Next.js)               │  │
│  └─────┬──────┘   └──────┬───────┘   └───────────┬──────────────┘  │
│        └─────────────────┼───────────────────────┘                 │
│                          │ REST / WebSocket                         │
│                 ┌────────▼────────┐                                 │
│                 │   API Gateway   │                                 │
│                 │   (NestJS)      │                                 │
│                 └────────┬────────┘                                 │
│                          │                                          │
│         ┌────────────────┼──────────────────┐                      │
│         │                │                  │                      │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼────────┐             │
│  │  AI Signal  │  │   Risk      │  │   Execution    │             │
│  │  Engine     │  │   Engine    │  │   Engine       │             │
│  │  (Python)   │  │  (NestJS/   │  │  (NestJS)      │             │
│  └──────┬──────┘  │   Python)   │  └───────┬────────┘             │
│         │         └─────────────┘          │                      │
│         │                                  │                      │
│  ┌──────▼──────────────────────────────────▼────────┐             │
│  │                  Broker Adapter Layer             │             │
│  │          (Pluggable broker integrations)          │             │
│  └──────────────────────────┬────────────────────────┘             │
│                             │                                      │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
              ┌───────────────▼──────────────┐
              │    Regulated Broker Account  │
              │    (User funds held here)    │
              └──────────────────────────────┘
```

---

## 8. Key System Capabilities

| Capability | Description |
|---|---|
| AI Signal Generation | ML-driven market analysis producing actionable signals |
| Risk Management | Multi-layer pre-execution risk validation |
| Autonomous Execution | Broker-connected order placement without manual intervention |
| Subscription Control | Plan-gated access to AI trading features |
| Performance Reporting | Real-time and historical P&L, drawdown, win rate |
| Fee Calculation | Realised-profit-only performance fee with high-water mark |
| Audit Trail | Immutable event log for all system actions |
| Broker Abstraction | Adapter pattern for multi-broker support |
| Real-time Dashboard | WebSocket-powered live trade and account updates |

---

## 9. Quality Attributes

| Attribute | Target |
|---|---|
| **Availability** | 99.9% uptime for trading engine and broker connectivity |
| **Latency** | Signal-to-execution < 500ms under normal conditions |
| **Auditability** | 100% of trading events logged with immutable records |
| **Security** | Zero broker credentials exposed to client-side code |
| **Scalability** | Horizontal scaling of AI and execution services |
| **Recoverability** | Broker reconnection with state reconciliation on failure |
| **Testability** | Full paper trading and sandbox modes before live |

---

## 10. Related Architecture Documents

| Document | Description |
|---|---|
| [02-product-scope.md](./02-product-scope.md) | Feature scope and boundaries |
| [04-system-architecture.md](./04-system-architecture.md) | Detailed component architecture |
| [10-ai-trading-architecture.md](./10-ai-trading-architecture.md) | AI Signal Engine design |
| [11-risk-engine-architecture.md](./11-risk-engine-architecture.md) | Risk Engine design |
| [12-execution-engine-architecture.md](./12-execution-engine-architecture.md) | Execution Engine design |
| [09-broker-integration-architecture.md](./09-broker-integration-architecture.md) | Broker adapter design |
| [18-compliance-and-risk-disclosures.md](./18-compliance-and-risk-disclosures.md) | Legal and compliance posture |
