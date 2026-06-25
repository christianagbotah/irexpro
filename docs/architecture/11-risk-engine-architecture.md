# 11 — Risk Engine Architecture

## iRexPro — Risk Management and Pre-Execution Validation Design

---

## 1. Purpose

This document defines the complete architecture of the iRexPro Risk Engine — the mandatory validation gateway between the AI Signal layer and the Trade Execution layer. No trade action of any kind may bypass the Risk Engine.

---

## 2. Core Invariant

> **The Risk Engine is the single, non-bypassable gateway between a trading signal and a broker order.**

This means:
- No signal can proceed to execution without a Risk Engine `APPROVED` decision
- No code path exists that routes around the Risk Engine
- Risk Engine failures always fail **closed** — a system error results in trade rejection, not trade approval

---

## 3. Risk Engine Responsibilities

The Risk Engine performs the following validation categories for every proposed trade action:

| Category | Rules |
|---|---|
| **Account-level** | Daily loss limit, maximum drawdown, margin availability |
| **Position-level** | Max position size, max concurrent trades, instrument whitelist |
| **Order-level** | Mandatory SL/TP, trailing stop config, leverage validation |
| **Session-level** | Kill switch check, trading hours, session active status |
| **Duplicate prevention** | Idempotency check, same-instrument cooldown |
| **Volatility** | Volatility score threshold, regime filter |
| **Broker health** | Connected broker check before any order |

---

## 4. Risk Validation Flow

```
Incoming Signal (from Strategy Orchestrator)
  │
  ▼
Step 1: Pre-condition Checks (fail fast)
  ├─ Is GlobalKillSwitch active? → REJECT: KILL_SWITCH_ACTIVE
  ├─ Is TradingSession ACTIVE? → else REJECT: SESSION_NOT_ACTIVE
  └─ Is BrokerConnection CONNECTED? → else REJECT: BROKER_DISCONNECTED
  │
  ▼
Step 2: Fetch Current Risk Context
  ├─ Load RiskProfile for user
  ├─ Load current BrokerAccount state (balance, equity, margin)
  ├─ Load open trades count and exposure
  └─ Load today's realised P&L and trade count
  │
  ▼
Step 3: Account-Level Checks
  ├─ Daily loss check: has today's realised loss exceeded MaxDailyLossPercent? → REJECT if yes
  ├─ Drawdown check: has equity dropped below MaxDrawdown threshold? → REJECT if yes
  └─ Margin check: is freeMargin sufficient for proposed position? → REJECT if no
  │
  ▼
Step 4: Position-Level Checks
  ├─ Concurrent trades: open trade count >= MaxConcurrentTrades? → REJECT if yes
  ├─ Daily trade count: today's trade count >= MaxDailyTrades? → REJECT if yes
  ├─ Position size: proposed lotSize > MaxPositionSizeLots? → REJECT if yes
  │    (if signal suggests larger size, Engine may reduce to max allowed)
  └─ Instrument allowed: instrument in AllowedInstruments list? → REJECT if not
  │
  ▼
Step 5: Order Integrity Checks
  ├─ Stop-loss present? → REJECT if missing (stop-loss is mandatory, always)
  ├─ Take-profit present? → REJECT if missing (take-profit is mandatory, always)
  ├─ Stop-loss distance: is SL at least MinStopLossPips from entry? → REJECT if too close
  ├─ Take-profit distance: is TP valid (correct direction from entry)? → REJECT if invalid
  └─ Leverage: does proposed position respect account leverage limits? → REJECT if exceeds
  │
  ▼
Step 6: Volatility and Regime Checks
  ├─ Volatility score above MaxVolatilityScore threshold? → REJECT if yes
  └─ Regime flagged as LOW_LIQUIDITY? → REJECT
  │
  ▼
Step 7: Duplicate Prevention
  ├─ Does an idempotency key match already exist? → Return existing result, do not re-process
  └─ Cooldown check: same instrument + same direction within cooldown window? → REJECT if yes
  │
  ▼
Step 8: Emit Risk Decision
  ├─ APPROVED → emit RiskApproved event with validated order parameters
  └─ REJECTED → emit RiskRejected event with rejection code and reason
                 log RiskViolation record
```

---

## 5. Risk Rules Reference

### 5.1 Maximum Daily Loss

```
Rule: DailyLossLimit
  Check: sum(realised_pnl WHERE date = today AND pnl < 0) >= (opening_balance × max_daily_loss_percent / 100)
  Action on breach: REJECT all new signals, set TradingSession status to SUSPENDED_RISK_LIMIT
  Recovery: resets at start of next trading day (configurable: UTC midnight or broker session open)
```

### 5.2 Maximum Drawdown

```
Rule: MaxDrawdown
  Check: (peak_equity - current_equity) / peak_equity >= max_drawdown_percent / 100
  Action on breach: REJECT all new signals, alert user and admin
  Recovery: manual admin review and user reactivation required
```

### 5.3 Maximum Position Size

```
Rule: MaxPositionSize
  Check: proposed_lot_size > max_position_size_lots
  Action: If signal suggests larger size, reduce to max_position_size_lots (soft limit)
          Log position size reduction in audit trail
          If reduction would make trade below min_lot_size: REJECT
```

### 5.4 Maximum Concurrent Trades

```
Rule: MaxConcurrentTrades
  Check: count(trades WHERE status = OPEN AND user_id = ?) >= max_concurrent_trades
  Action on breach: REJECT signal (do not queue — signal is time-sensitive and should not be delayed)
```

### 5.5 Margin Validation

```
Rule: MarginCheck
  Required margin = (lot_size × contract_size × current_price) / leverage
  Check: required_margin > free_margin × 0.95  (5% safety buffer above minimum)
  Action: REJECT if insufficient free margin
```

### 5.6 Stop-Loss Enforcement

```
Rule: MandatoryStopLoss
  Check: stop_loss field present AND direction-valid AND >= min_sl_pips from entry
  Action: REJECT if any check fails — no trade may be placed without a valid stop-loss
```

### 5.7 Kill Switch

```
Rule: GlobalKillSwitch
  Check: SELECT is_active FROM admin.global_kill_switch WHERE id = 1
  Check: Redis cache key "killswitch:active" (cache TTL: 10 seconds)
  Action: REJECT ALL signals if kill switch is active
  Note: Kill switch check is the FIRST check in every risk validation — fail fast
```

### 5.8 Broker Disconnection Protection

```
Rule: BrokerConnectionCheck
  Check: BrokerConnection.status = CONNECTED
  Action: REJECT if broker is DISCONNECTED or SUSPENDED
  Note: Prevents placing orders that cannot be confirmed or monitored
```

### 5.9 Volatility Protection

```
Rule: VolatilityFilter
  Check: signal.volatility_score > max_volatility_threshold (default: 0.85)
  Action: REJECT if volatility is extreme
  Purpose: Prevents trading during news spikes, flash crashes, or abnormal market conditions
```

---

## 6. Risk Decision Output

### 6.1 Approved Signal

```typescript
interface RiskApprovalResult {
  decision: 'APPROVED';
  signalId: string;
  validatedOrder: {
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;        // May be reduced from original signal
    entryPrice: string;
    stopLoss: string;
    takeProfit: string;
    trailingStopPips?: string;
  };
  appliedRules: string[];   // List of rules checked
  riskScore: number;        // Composite risk score 0-100
  evaluatedAt: Date;
}
```

### 6.2 Rejected Signal

```typescript
interface RiskRejectionResult {
  decision: 'REJECTED';
  signalId: string;
  rejectionCode: RiskRejectionCode;
  rejectionReason: string;
  evaluatedAt: Date;
}

enum RiskRejectionCode {
  KILL_SWITCH_ACTIVE = 'KILL_SWITCH_ACTIVE',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  BROKER_DISCONNECTED = 'BROKER_DISCONNECTED',
  DAILY_LOSS_LIMIT_REACHED = 'DAILY_LOSS_LIMIT_REACHED',
  MAX_DRAWDOWN_REACHED = 'MAX_DRAWDOWN_REACHED',
  INSUFFICIENT_MARGIN = 'INSUFFICIENT_MARGIN',
  MAX_CONCURRENT_TRADES = 'MAX_CONCURRENT_TRADES',
  MAX_DAILY_TRADES = 'MAX_DAILY_TRADES',
  POSITION_SIZE_EXCEEDED = 'POSITION_SIZE_EXCEEDED',
  MISSING_STOP_LOSS = 'MISSING_STOP_LOSS',
  MISSING_TAKE_PROFIT = 'MISSING_TAKE_PROFIT',
  INVALID_SL_DISTANCE = 'INVALID_SL_DISTANCE',
  LEVERAGE_EXCEEDED = 'LEVERAGE_EXCEEDED',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_LIQUIDITY_REGIME = 'LOW_LIQUIDITY_REGIME',
  DUPLICATE_SIGNAL = 'DUPLICATE_SIGNAL',
  INSTRUMENT_NOT_ALLOWED = 'INSTRUMENT_NOT_ALLOWED',
  RISK_ENGINE_ERROR = 'RISK_ENGINE_ERROR',  // Fail-closed: system error = rejection
}
```

---

## 7. Risk Violation Recording

Every rejection is recorded as a `RiskViolation` for monitoring and pattern analysis:

```sql
CREATE TABLE risk.risk_violations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  signal_id       UUID,
  rejection_code  VARCHAR(50) NOT NULL,
  rejection_reason TEXT NOT NULL,
  risk_context    JSONB NOT NULL,   -- Snapshot of risk state at time of rejection
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 8. Risk Monitoring and Alerting

| Condition | Alert Target | Action |
|---|---|---|
| Daily loss limit reached | User + Admin | Suspend session, send notification |
| Max drawdown reached | User + Admin | Suspend session, require manual review |
| Kill switch activated | All active users + Admins | Suspend all sessions |
| Broker disconnection | User + Admin | Suspend session, start reconnection |
| High frequency of risk rejections (>10 in 1 hour) | Admin | Alert for investigation |
| Risk Engine error (fail-closed) | Admin | Immediate alert, investigate root cause |

---

## 9. Risk Profile Updates During Live Session

A user's risk profile can be updated at any time, but changes take effect:
- For new signals: immediately
- For open trades: existing SL/TP are not modified retroactively (unless user explicitly requests modification via dashboard)

When a user updates their risk profile during an active session:
1. New `RiskProfile` record is saved
2. `TradingSession.riskProfileSnapshot` is updated
3. Audit log entry records the change
4. Running trades are not modified

---

## 10. Future Risk Engine Enhancements

| Enhancement | Description |
|---|---|
| Correlation risk | Reject signals that would create correlated exposure (e.g., long EURUSD + long GBPUSD simultaneously) |
| Portfolio-level VaR | Value at Risk calculation across all open positions |
| Dynamic position sizing | Kelly criterion or fixed fractional position sizing |
| News-aware risk | Automatic tightening of limits during high-impact news events |
| Real-time margin monitoring | Intra-trade margin level alerts before broker margin call |
| AI-assisted risk review | ML model that detects anomalous trading patterns |
