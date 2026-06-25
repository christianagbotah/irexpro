# iRexPro — Project Vision

---

## Vision Statement

iRexPro exists to make sophisticated, AI-powered Forex trading accessible to everyday users worldwide — without requiring them to become traders, analysts, or programmers.

We believe that the barrier to professional-quality trading is not intelligence or capital, but access to the right tools. iRexPro provides those tools: a fully autonomous AI trading engine that analyses markets, manages risk, and executes trades on behalf of users who have connected their own regulated broker accounts — available to anyone, in any eligible country, through a globally accessible platform.

---

## The Problem We Solve

Retail Forex traders face an uneven playing field:

- Professional trading firms use algorithmic systems with advanced risk management, executing hundreds of decisions per second
- Retail traders rely on manual chart reading, emotional decision-making, and inconsistent discipline
- The result: the majority of retail Forex traders lose money — primarily due to poor risk management and emotional trading, not lack of market intelligence

This problem is not limited to one country or region. It affects retail traders in Ghana, Nigeria, Kenya, South Africa, the United Kingdom, Southeast Asia, and every other market where retail Forex participation is active.

iRexPro closes this gap globally by giving retail traders access to:
- AI-driven market analysis across multiple timeframes and instruments
- Systematic, emotion-free trade execution
- Enforced risk management rules that protect capital
- A track record of realised performance — not promises

---

## Global-First Platform

iRexPro is built as a **global-first platform from day one**. This means:

- Users from multiple countries can register, subscribe, and trade
- Payment providers are regional: Hubtel and Paystack for Ghana/Africa, Stripe for the UK and international markets, Flutterwave for Pan-Africa, and others as the platform expands
- SMS providers are regional: Hubtel SMS and Arkesel for Ghana and Africa, Twilio globally
- Country configuration drives KYC requirements, tax rules, broker availability, and compliance
- Subscription plans are priced in local currencies (GHS, NGN, GBP, USD, etc.)
- New countries are activated by configuration, not code — enabling rapid expansion without redevelopment

Ghana and Africa are important launch markets. But they are one regional configuration within a globally extensible architecture — not constraints on the platform's design.

---

## What iRexPro Is

- A **fully autonomous AI trading platform** — users do not make trade-by-trade decisions
- A **global platform** — accessible from multiple countries with regional provider support
- A **broker-connected service** — user funds stay at their own regulated broker (Phase 1, Model A)
- A **subscription platform** — access to AI trading requires an active, paid subscription
- A **performance-fee platform** — the platform earns more when users profit more (HWM-based)
- A **risk-first platform** — every AI signal passes through the Risk Engine before execution
- A **transparent platform** — complete trade history, risk decisions, and fee statements available to users

---

## What iRexPro Is Not

- iRexPro is **not a broker** — we do not hold user funds in Phase 1 (Model A)
- iRexPro is **not a single-country platform** — regional providers are plug-ins, not the platform identity
- iRexPro is **not an investment advisor** — we do not provide personalised financial advice
- iRexPro is **not a guaranteed profit system** — Forex trading carries inherent risk of loss
- iRexPro is **not a get-rich-quick scheme** — we do not make profit promises
- iRexPro is **not a black box** — all trading decisions are logged and auditable

---

## The AI System Is Core — Not a Future Feature

iRexPro's AI trading system is the product. It is not a bolt-on or a future roadmap item. The AI system is implemented as core platform infrastructure with:

- **Signal confidence scoring** — every signal has a numerical confidence score
- **Multi-timeframe analysis** — M15, H1, H4, D1 technical indicator computation
- **Trend and momentum analysis** — MA crossovers, MACD, ADX, RSI
- **Volatility analysis** — ATR, Bollinger Bands, Average Daily Range
- **Market-regime detection** — trending, ranging, high-volatility, low-liquidity classification
- **Model versioning and rollback** — every deployed model is versioned; rollback is a first-class operation
- **Model governance** — no model reaches live trading without passing backtest, walk-forward test, and paper trading gates
- **Backtesting** — minimum 12-month historical data validation
- **Walk-forward testing** — out-of-sample validation before deployment
- **Paper trading** — minimum 2 weeks of paper trading before any live trading
- **Future sentiment integration** — hooks for news and sentiment data already in the signal pipeline design

The AI pipeline is enforced as a strict one-way flow:

```
Market Data → AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker
```

The AI never places trades directly. The Risk Engine is the mandatory, non-bypassable gateway.

---

## Operating Principles

### 1. Risk First, Returns Second
The AI is designed to generate returns. The Risk Engine is designed to protect capital. The Risk Engine's authority supersedes the AI's decisions — always. The AI must never bypass the Risk Engine.

### 2. Transparency Over Hype
We show real performance data. Win rates, drawdown, individual trade results. We never cherry-pick or misrepresent performance. No guaranteed profit claims in any platform communication.

### 3. User Funds Are Sacred
In Phase 1 (Model A), user funds stay with their regulated broker. iRexPro never touches user funds directly. Performance fees are collected through the platform's payment system — not by withdrawing from the broker account. When Model B is launched, it operates with the highest standards of fund security and regulatory compliance.

### 4. Technology Serves the User
The complexity of our AI, risk management, and execution systems is entirely hidden from the user. Their interface is simple: activate, monitor, stop.

### 5. Commercial Alignment
iRexPro earns more when its users profit. The performance fee + high-water mark model means our commercial interests are directly aligned with user success. We do not earn performance fees on losses, deposits, or previously-charged profit.

### 6. Global Architecture, Local Experience
The platform is one codebase designed for the world. Regional differences (language, currency, payment method, SMS provider, compliance) are configuration, not separate products. A user in Ghana and a user in the UK use the same platform with locally appropriate providers and pricing.

### 7. Build for Scale and Trust
Every architectural decision is made with production-grade quality, security, and auditability in mind. We build a platform that can stand up to regulatory scrutiny, security audits, and the trust of thousands of users globally.

---

## Target Markets

**Primary Launch (Phase 1-2):** Africa — Ghana, Nigeria, Kenya, South Africa
**Secondary Launch (Phase 2):** United Kingdom, international English-speaking markets
**Expansion (Phase 3+):** United States, Canada, Australia, Singapore, UAE, Europe

Users in every market receive locally appropriate payment methods and SMS providers. The platform experience is consistent; the regional implementation is abstracted.

---

## Success Metrics

| Metric | Phase 1 Target | Phase 2 Target |
|---|---|---|
| Active subscribers | 50 (pilot) | 500 |
| Countries supported | 5 (GH, NG, KE, ZA, GB) | 10+ |
| Broker connections | 50 | 500 |
| Platform uptime | 99.9% | 99.9% |
| User satisfaction (NPS) | > 40 | > 50 |
| Performance fee revenue | Proof of concept | Recurring MRR |
| AI win rate (live) | > 50% | > 55% |
| Max drawdown (platform-wide) | < 20% | < 15% |

---

## Long-Term Vision

Phase 1 establishes iRexPro as a trusted, AI-powered autonomous trading platform serving Africa and international markets simultaneously.

Phase 2 adds full fund custody (Model B), enabling iRexPro to operate as a complete financial platform with internal wallets, deposits, and withdrawals — with global and African payment providers fully integrated.

Phase 3 introduces a strategy ecosystem — multiple AI models, crypto trading, and eventually a marketplace where the best-performing strategies are made available to subscribers worldwide.

The ultimate vision: iRexPro becomes the global go-to autonomous trading platform for retail participants in Forex and digital asset markets — combining the power of professional-grade AI with the accessibility of a consumer mobile app, available to any eligible user in any country.
