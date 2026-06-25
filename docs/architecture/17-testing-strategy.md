# 17 — Testing Strategy

## iRexPro — Testing Architecture, Standards, and Requirements

---

## 1. Purpose

This document defines the testing strategy for iRexPro, covering all test types, test requirements per component, coverage targets, and the mandatory testing gate before any live trading deployment.

---

## 2. Testing Philosophy

iRexPro is a financial trading platform. Defects in trading logic, risk validation, or execution handling can result in real financial loss for users. The testing standards reflect this responsibility:

- **Risk Engine must have 100% branch coverage** — every rejection path must be tested
- **Idempotency must be tested under concurrency** — duplicate order prevention is critical
- **Broker adapter must be tested against sandbox** — no real money in test environments
- **AI signal pipeline must be backtested** — no new model deploys without validated backtest
- **Paper trading is mandatory** before any live trading activation
- **Demo/sandbox testing is mandatory** before production live trading

---

## 3. Test Pyramid

```
        /\
       /  \       End-to-End (E2E) Tests
      /    \      Small count, high value
     /──────\
    /        \    Integration Tests
   /          \   Moderate count
  /────────────\
 /              \  Unit Tests
/                \ High count, fast
──────────────────
```

---

## 4. Unit Tests

### 4.1 Scope

Each module, service, and utility function has unit tests. External dependencies (DB, broker, Redis) are mocked.

### 4.2 Coverage Targets

| Module | Minimum Coverage |
|---|---|
| Risk Engine | 100% branch coverage |
| Execution Engine | 95% branch coverage |
| Subscription module | 95% branch coverage |
| Revenue / fee calculation | 100% branch coverage |
| Auth module | 90% branch coverage |
| All other modules | 80% statement coverage |

### 4.3 Key Unit Test Cases

**Risk Engine**
```
✓ Rejects signal when kill switch is active
✓ Rejects signal when session is not active
✓ Rejects signal when broker is disconnected
✓ Rejects signal when daily loss limit exceeded
✓ Rejects signal when max drawdown exceeded
✓ Rejects signal when insufficient margin
✓ Rejects signal when max concurrent trades exceeded
✓ Rejects signal missing stop-loss
✓ Rejects signal missing take-profit
✓ Rejects signal when SL distance below minimum
✓ Rejects signal for non-whitelisted instrument
✓ Rejects signal during high volatility
✓ Rejects duplicate signal within cooldown window
✓ Approves valid signal under normal conditions
✓ Reduces position size to max allowed (soft limit)
✓ Fails closed on internal error (RISK_ENGINE_ERROR code returned)
```

**Performance Fee Calculation**
```
✓ Calculates correct fee when profit above HWM
✓ Returns zero fee when profit below HWM
✓ Returns zero fee when no new profit
✓ Updates HWM after fee calculation
✓ Does not include unrealised P&L in fee basis
✓ Does not include deposit amounts in fee basis
✓ Handles negative period P&L correctly (no fee, HWM preserved)
✓ Handles edge case: profit exactly equals HWM (no fee)
✓ Uses correct fee rate from subscription plan
✓ Decimal precision preserved throughout calculation
```

**Idempotency**
```
✓ Returns existing trade for duplicate idempotency key
✓ Does not submit second order for duplicate key
✓ Handles concurrent duplicate requests (distributed lock test)
✓ Generates unique keys for distinct signals
```

**Broker Credential Security**
```
✓ Credentials are encrypted before persistence
✓ Credentials are never present in BrokerConnection DTO response
✓ Decryption only occurs within adapter invocation
✓ KMS key ID is stored, not the key itself
```

### 4.4 Tools

| Technology | Tool |
|---|---|
| NestJS / TypeScript | Jest + ts-jest |
| Python services | pytest + pytest-asyncio |
| Mocking (TS) | Jest mocks, ts-mockery |
| Mocking (Python) | unittest.mock, respx |
| Coverage (TS) | Jest coverage (Istanbul) |
| Coverage (Python) | pytest-cov |

---

## 5. Integration Tests

### 5.1 Scope

Integration tests verify that modules work correctly together with real database (test DB) and real Redis, but mocked broker and payment providers.

### 5.2 Key Integration Test Scenarios

**Trading Session Activation**
```
✓ Cannot activate AI trading without active subscription
✓ Cannot activate AI trading without connected broker
✓ Cannot activate AI trading with kill switch active
✓ Creates TradingSession record on successful activation
✓ Creates audit log entry on activation
✓ WebSocket event emitted on activation
```

**Trade Execution Flow**
```
✓ Valid signal → Risk approved → Trade created in DB
✓ Idempotent: same signal submitted twice = one trade record
✓ Broker rejection recorded as REJECTED status
✓ Trade closure updates realised P&L and fires TradeClosed event
✓ Reconciliation job closes trade matching broker closed state
```

**Subscription Webhooks**
```
✓ Valid Stripe webhook activates subscription
✓ Invalid webhook signature returns 401
✓ Duplicate webhook (same event ID) is idempotent
✓ Subscription expiry triggers session suspension
```

**Risk Engine Integration**
```
✓ Daily loss counter incremented on trade closure with loss
✓ Daily loss limit triggers session suspension
✓ Kill switch activation rejects all subsequent signals
```

### 5.3 Test Database

```
Docker service: postgres:15-alpine
DB name: irexpro_test
Lifecycle: Clean schema migrated before test suite; truncated between test suites
Seeding: Factory functions per entity (e.g., UserFactory, SubscriptionFactory)
```

---

## 6. End-to-End (E2E) Tests

### 6.1 Scope

E2E tests simulate real user journeys against a running application stack (all services up, test database, sandbox broker).

### 6.2 Key E2E Scenarios

```
Scenario 1: New User Registration and Onboarding
  → Register → Verify email → Complete onboarding → Check audit log entries

Scenario 2: Broker Connection
  → Connect demo broker → Validate connection success → Check BrokerConnection record

Scenario 3: Subscription Activation
  → Select plan → Simulate payment webhook → Verify subscription ACTIVE
  → Attempt AI trading activation → Verify success

Scenario 4: AI Trading Session Full Flow
  → Activate AI trading → Simulate signal generation → Verify risk approval
  → Verify trade record created → Simulate broker closure → Verify P&L recorded

Scenario 5: Kill Switch
  → Admin activates kill switch → Verify all sessions suspended
  → Attempt signal processing → Verify rejection
  → Deactivate kill switch → Verify sessions can resume

Scenario 6: Performance Fee Calculation
  → Simulate closed trades with profit → Run settlement job
  → Verify fee record created → Verify HWM updated → Verify no fee on next run (below HWM)
```

### 6.3 Tools

| Purpose | Tool |
|---|---|
| API E2E | Supertest (NestJS) |
| Web E2E (future) | Playwright |
| Mobile E2E (future) | Detox |
| Broker sandbox | First broker's sandbox environment |

---

## 7. Backtesting Requirements

Before any AI model or strategy is promoted to paper trading:

```
Required backtest criteria:
  ✓ Minimum backtest period: 12 months of historical data
  ✓ Walk-forward testing: minimum 3 out-of-sample windows
  ✓ Sharpe ratio ≥ 1.0
  ✓ Maximum drawdown ≤ 20%
  ✓ Win rate ≥ 45%
  ✓ Profit factor ≥ 1.3
  ✓ Tested on at least 3 different market regimes (trending, ranging, volatile)
  ✓ Commission and slippage modelled in simulation
```

Backtest reports are stored in the Model Registry and reviewed during the model promotion approval workflow.

---

## 8. Paper Trading Requirements

Before any AI model is promoted to live trading:

```
Required paper trading criteria:
  ✓ Minimum paper trading period: 2 weeks on broker sandbox
  ✓ Minimum 20 completed paper trades
  ✓ No critical Risk Engine errors during paper trading period
  ✓ All trade lifecycle events (open, modify, close) function correctly
  ✓ Reconciliation job functioning correctly
  ✓ P&L calculation matches expected values
  ✓ No duplicate orders submitted
  ✓ SuperAdmin sign-off required to promote to live
```

Paper trading results are recorded and available in the admin dashboard model promotion workflow.

---

## 9. Security Testing

| Test | Tool | Frequency |
|---|---|---|
| Dependency vulnerability scan | npm audit, pip audit | Every CI build |
| Static analysis | Semgrep, ESLint security ruleset | Every CI build |
| Secret detection | TruffleHog, GitGuardian | Every commit |
| OWASP ZAP baseline | OWASP ZAP | Every release |
| Manual penetration test | External security firm | Pre-launch + annually |

---

## 10. Performance Testing

Before production launch and after major releases:

| Scenario | Tool | Target |
|---|---|---|
| API load test (100 concurrent users) | k6 | p95 response time < 500ms |
| Signal processing throughput | pytest-benchmark | 100 signals/second |
| Database query performance | EXPLAIN ANALYZE | No query > 100ms on indexed fields |
| WebSocket concurrent connections | Artillery | 1000 concurrent connections |
| Risk Engine evaluation throughput | pytest-benchmark | 500 evaluations/second |

---

## 11. Test Environments

| Environment | Test Type | Broker |
|---|---|---|
| Local (docker compose) | Unit, Integration | Mocked adapter |
| CI | Unit, Integration | Mocked adapter |
| Staging | E2E, Performance | Broker sandbox |
| Pre-production | Paper trading | Broker sandbox |
| Production | Paper trading (pre-live) | Broker live (demo account) |
