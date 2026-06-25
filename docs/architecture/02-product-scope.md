# 02 — Product Scope

## iRexPro — Feature Scope and System Boundaries

---

## 1. Purpose

This document defines the complete feature scope of iRexPro, what is in scope for Phase 1, what is explicitly out of scope, and the rationale for each boundary decision.

---

## 2. Global-First Platform Principle

iRexPro is designed as a **global Forex AI trading platform**. It is not a single-country or single-region product. The platform must:

- Support users from any eligible country worldwide
- Route payments through regional providers appropriate to each user's country
- Route SMS notifications through regional providers with local delivery quality
- Apply country-specific compliance, KYC, and regulatory rules
- Support multi-currency billing and performance fee records
- Enable or restrict broker availability by country
- Never hardcode any country, provider, or currency as the only option

Regional providers (such as Hubtel and Arkesel for Ghana, or Paystack and Flutterwave for Africa) are **plug-in implementations** of global provider interfaces. They serve their markets excellently but do not limit the platform's global reach.

See [23-country-and-regional-configuration.md](./23-country-and-regional-configuration.md) for the full regional configuration architecture.

---

## 2. In-Scope — Phase 1 (Model A)

### 2.1 User Account Management
- User registration with email verification
- User login with MFA (TOTP / SMS)
- Password reset and account recovery
- KYC-ready profile fields (name, country, phone, ID document readiness)
- User dashboard

### 2.2 Broker Account Connection
- Connect regulated broker account via API key / OAuth credentials
- Credential validation against broker sandbox and live endpoints
- Broker connection health monitoring
- Broker disconnect/reconnect handling
- Support for one primary broker at launch (adapter pattern for future brokers)
- Read-only broker account balance and position sync

### 2.3 Subscription System
- Multiple subscription plan tiers (e.g., Starter, Pro, Elite)
- Free trial period support (configurable per plan)
- Subscription activation and deactivation
- Subscription expiry and auto-renewal readiness
- Subscription status enforcement before AI trading access
- Subscription invoice generation
- Multi-currency plan pricing (plan priced in multiple currencies per country)
- Tax/VAT readiness (country-level tax rules applied to invoices)
- Payment provider abstraction layer — `IPaymentProvider` interface
- Regional provider support: Stripe, PayPal, Paystack, Flutterwave, Hubtel (and future providers)
- Country-based payment provider routing
- Failed payment handling with grace period and retry
- Subscription history and audit log
- See [21-payment-provider-architecture.md](./21-payment-provider-architecture.md)

### 2.4 AI Auto Trading Mode
- Enable / Disable AI Auto Trading toggle
- Subscription gate enforcement at activation
- Broker connection gate enforcement at activation
- Active trade session management
- AI trading parameters (risk level preference, max trades)
- Real-time trade status display on dashboard

### 2.5 AI Signal Engine
- Multi-timeframe market data ingestion
- Technical indicator computation (MA, RSI, MACD, Bollinger Bands, ATR, etc.)
- Market regime detection (trending, ranging, volatile, low-liquidity)
- Signal generation: BUY / SELL / HOLD / CLOSE / MODIFY
- Signal confidence score (0–100)
- Volatility scoring
- Trend strength scoring
- News/sentiment integration readiness hooks
- Signal audit log

### 2.6 Strategy Orchestrator
- Signal intake from AI Signal Engine
- Strategy governance (active strategy version control)
- Strategy parameter management
- Signal filtering and deduplication
- Pass approved signals to Risk Engine

### 2.7 Risk Engine
- Maximum daily loss limit check
- Maximum drawdown check
- Maximum position size validation
- Maximum concurrent open trades limit
- Exposure limit monitoring
- Margin availability validation
- Leverage compliance validation
- Mandatory stop-loss enforcement
- Mandatory take-profit enforcement
- Trailing stop configuration enforcement
- Volatility-based trade suspension
- Kill switch (immediate halt of all AI trading)
- Broker disconnection protection (halt trading on disconnect)
- Duplicate order prevention
- Risk rejection audit log

### 2.8 Execution Engine
- Order preparation (instrument, direction, size, SL, TP)
- Idempotency key assignment
- Broker adapter call
- Order acknowledgement and tracking
- Trade open / modify / close lifecycle management
- Trade state reconciliation against broker
- Execution audit log

### 2.9 Broker Adapter Layer
- Broker Adapter Interface definition
- First broker adapter implementation
- Sandbox / paper trading mode
- Live trading mode
- Account balance sync
- Open positions sync
- Order status polling / event subscription

### 2.10 Performance Reporting
- Real-time open trade P&L
- Closed trade history
- Daily / weekly / monthly P&L summary
- Win rate, average win, average loss, risk-reward ratio
- Maximum drawdown tracking
- Equity curve data
- Trade duration statistics

### 2.11 Profit Sharing and Revenue Engine
- Performance fee percentage configuration per plan
- Realised-profit-only fee calculation
- High-water mark per user account
- Fee calculation on each settlement cycle (daily / weekly / monthly)
- Platform owner revenue ledger
- Fee statement generation per user
- Fee audit log

### 2.12 Admin Dashboard
- User management (view, suspend, reactivate)
- Subscription management
- Global kill switch for AI trading
- Broker connection status overview
- System health monitoring
- Revenue summary
- Audit log viewer

### 2.13 Real-time Dashboard (WebSocket)
- Live trade updates pushed to user dashboard
- Account balance updates
- Open P&L streaming
- Alerts: trade opened, trade closed, SL hit, TP hit, risk limit reached

### 2.13 SMS and Notification System
- SMS provider abstraction layer — `ISmsProvider` interface
- Regional SMS routing: Twilio (global), Hubtel (Ghana), Arkesel (Africa), AWS SNS (global)
- Country-based SMS provider routing
- OTP delivery for registration and MFA
- Security alerts: login, password reset
- Trading alerts: session start/stop, trade opened/closed, risk limits
- Broker alerts: connection lost, reconnected
- Subscription alerts: payment success, payment failure, expiry
- SMS template system (no PII in log entries)
- Delivery tracking and fallback provider support
- See [22-sms-provider-architecture.md](./22-sms-provider-architecture.md)

### 2.14 Country and Regional Configuration
- Supported country management (enable/block/restrict per country)
- Country-to-payment-provider mapping
- Country-to-SMS-provider mapping
- Country-to-broker availability mapping
- KYC level requirements per country
- Multi-currency configuration per country
- VAT/tax rules per country
- Timezone and localisation metadata
- Country gate at registration (block unsupported/sanctioned countries)
- See [23-country-and-regional-configuration.md](./23-country-and-regional-configuration.md)

### 2.15 Security
- JWT-based authentication with refresh tokens
- Role-based access control (User, Admin, SuperAdmin)
- Broker credential encryption at rest (AES-256 envelope encryption)
- API rate limiting
- Input validation and sanitisation
- Audit log for all sensitive operations

### 2.15 Observability
- Structured logging (JSON)
- Distributed tracing readiness
- Health check endpoints
- Metrics collection (Prometheus-compatible)
- Alerting readiness (PagerDuty / Slack)

---

## 3. Out of Scope — Phase 1

| Feature | Reason |
|---|---|
| Internal user wallet (deposit/withdraw) | Model B only |
| Bank / mobile money payouts | Model B only |
| Crypto trading | Model B only |
| iRexPro holding user funds | Model B only — explicitly excluded from Model A |
| Payment gateway live integration | Abstraction layer designed; provider integration is Phase 2 |
| Copy trading (social trading) | Future feature |
| Strategy marketplace | Future feature |
| Multi-account management per user | Future feature |
| Algorithmic strategy builder (user-created) | Future feature — AI strategies are platform-managed only |
| White-label / franchise model | Future commercial expansion |
| Proprietary broker | Regulatory and capital requirements; excluded from initial scope |

---

## 4. Explicitly Excluded Platform Behaviours

The following behaviours must **never** be implemented:

1. AI signals executing orders without Risk Engine validation
2. Performance fees charged on unrealised (floating) profit
3. Performance fees charged on deposit amounts
4. Guarantees or promises of trading profit in any system-generated communication
5. Broker credentials returned to frontend clients
6. Live trading enabled without prior demo/sandbox validation
7. AI trading enabled for users without an active subscription
8. ManualPaymentProvider used as a commercial subscription billing mechanism for paying customers
9. Automatic withdrawal from a user's broker account as a fee collection method in Model A (unless explicitly verified with the broker's API, legal approval, and user authorisation)
10. Hardcoded country, currency, payment provider, or SMS provider in any service or business logic class
11. Any payment provider's webhook processed without signature validation

---

## 4.1 ManualPaymentProvider — Scope Restriction

A `ManualPaymentProvider` is included in the payment system for the following purposes **only**:

- **Local development** — test subscription flows without a live payment gateway
- **Internal testing** — QA testing of subscription state transitions
- **Admin pilot activation** — manually activate a subscription for a beta user (with audit log)

The `ManualPaymentProvider` **must not** be:
- Exposed as a payment option to end users in any environment
- Used for commercial revenue collection from paying customers
- The mechanism by which production subscriptions are billed

All production subscribers must be billed through a live `IPaymentProvider` implementation (Stripe, Paystack, Flutterwave, Hubtel, PayPal, or other approved provider). The `ManualPaymentProvider` can only be activated by a `SuperAdmin` and every activation must create an audit log entry with justification.

---

## 4.2 AI System — Core Scope Confirmation

The AI trading system is **core iRexPro scope**. It is not a future feature or a roadmap placeholder. The platform does not exist without it.

The following AI capabilities are in scope for Phase 1 implementation:

| Capability | Status |
|---|---|
| Multi-timeframe indicator computation | Core Phase 1 |
| Signal confidence scoring (0–100) | Core Phase 1 |
| Market-regime detection | Core Phase 1 |
| Trend and momentum analysis | Core Phase 1 |
| Volatility analysis (ATR, Bollinger) | Core Phase 1 |
| Strategy Orchestrator (governance, versioning) | Core Phase 1 |
| Model versioning and rollback | Core Phase 1 |
| Backtesting (12-month minimum) | Core Phase 1 (gate before live) |
| Walk-forward testing | Core Phase 1 (gate before live) |
| Paper trading mode | Core Phase 1 (gate before live) |
| Live trading (controlled) | Core Phase 1 (after paper trading gate) |
| News/sentiment integration | Phase 2 (hooks already in signal pipeline) |

The mandatory pipeline is:
```
Market Data → AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker Adapter
```

No step may be skipped. The AI never places trades. The Risk Engine is the sole gateway to order execution.

---

## 5. Phase 1 → Phase 2 Transition Features

These items are designed in Phase 1 but activated in Phase 2:

| Feature | Phase 1 Status | Phase 2 Status |
|---|---|---|
| Internal wallet data model | Schema designed, not activated | Fully activated |
| Payment provider integration | Abstraction layer only | Live integrations |
| Profit-share settlement flow | Ledger designed, manual review | Automated settlement |
| Crypto trading adapters | Interface defined | First adapters built |
| Multi-broker support | Second adapter built | N adapters supported |

---

## 6. User Roles and Permissions

| Role | Permissions |
|---|---|
| **Guest** | View public marketing pages only |
| **Registered User** | Account management, broker connect, subscribe |
| **Active Subscriber** | All above + AI Auto Trading activation |
| **Admin** | User management, subscription management, kill switch, revenue view |
| **SuperAdmin** | All above + system configuration, plan management, audit access |

---

## 7. Supported Platforms

| Platform | Phase 1 |
|---|---|
| Web (desktop/tablet) | Yes — Next.js PWA-ready |
| Android | Yes — React Native |
| iOS | Yes — React Native |
| Admin web panel | Yes — Next.js separate app |

---

## 8. Global Launch Regions (Phased)

| Phase | Region | Priority Countries |
|---|---|---|
| Phase 1 Launch | Africa | Ghana, Nigeria, Kenya, South Africa |
| Phase 1 Launch | International | United Kingdom |
| Phase 2 Expansion | International | United States, Canada, Australia, Singapore, UAE |
| Phase 3 Expansion | Europe | Germany, France, Netherlands, Spain |
| Phase 3 Expansion | Asia-Pacific | Thailand, Philippines, Malaysia, Indonesia |
| Future | Additional | Based on market demand and regulatory clearance |

Country activation is controlled by `CountryConfig.isSupported` — new markets are enabled via admin configuration, not code deploys.
