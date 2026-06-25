# 12 — Execution Engine Architecture

## iRexPro — Trade Execution and Order Lifecycle Management

---

## 1. Purpose

This document defines the Execution Engine architecture for iRexPro — the layer that receives Risk Engine-approved orders and manages the complete lifecycle of trade submission, tracking, modification, and closure through the Broker Adapter.

---

## 2. Core Responsibilities

The Execution Engine is responsible for:

1. Receiving `RiskApproved` signals from the Risk Engine
2. Preparing order objects conforming to the Broker Adapter interface
3. Assigning and enforcing idempotency keys
4. Submitting orders to the Broker Adapter
5. Tracking and persisting trade state throughout the full lifecycle
6. Managing trade modifications (SL/TP adjustment, trailing stop updates)
7. Processing trade closures (SL hit, TP hit, manual close, AI close signal)
8. Reconciling local trade state with broker-reported state
9. Generating execution audit events

---

## 3. Execution Flow

```
Step 1: Receive RiskApproved event
  Input: { signalId, validatedOrder: { instrument, direction, lotSize, entryPrice, SL, TP } }

Step 2: Create Trade record (status: PENDING)
  - Generate idempotency key: hash of (userId + instrument + direction + timestamp_window)
  - Check idempotency key does not already exist (duplicate prevention)
  - Insert Trade record with status = PENDING

Step 3: Prepare BrokerOrderRequest
  - Map validated order fields to BrokerOrderRequest schema
  - Include idempotency key in order comment field (broker-side dedup)
  - Validate required fields present

Step 4: Call BrokerAdapter.placeOrder(orderRequest)
  - Timeout: 10 seconds
  - On success: broker returns externalOrderId and filledPrice

Step 5: Update Trade record
  - status: OPEN
  - externalOrderId: from broker response
  - entryPrice: actual fill price (may differ from requested)
  - openedAt: broker fill timestamp

Step 6: Emit TradeOpened event
  - WebSocket gateway notifies user
  - Performance module updates tracking
  - Audit log records trade open

Step 7: Begin trade monitoring
  - Trade added to monitoring registry
  - Reconciliation job checks state periodically
```

---

## 4. Idempotency Model

### 4.1 Key Generation

```typescript
function generateIdempotencyKey(
  userId: string,
  instrument: string,
  direction: 'BUY' | 'SELL',
  signalId: string,
): string {
  // Incorporates signalId to ensure each unique signal produces at most one trade
  return sha256(`${userId}:${instrument}:${direction}:${signalId}`);
}
```

### 4.2 Idempotency Enforcement

Before any order submission:

```
1. Check trades table: SELECT id FROM trading.trades WHERE idempotency_key = $key
2. If record found AND status = OPEN or CLOSED: return existing trade, do not resubmit
3. If record found AND status = PENDING: wait briefly (retry race condition)
4. If no record: proceed with new order
```

### 4.3 Concurrent Request Protection

A Redis distributed lock is acquired per idempotency key before DB insert, ensuring no two concurrent requests create duplicate records even under race conditions:

```
SETNX lock:execution:{idempotency_key} {processId} EX 30
→ If lock acquired: proceed
→ If lock exists: wait up to 15s, then check DB for existing record
```

---

## 5. Trade Lifecycle State Machine

```
        ┌─────────────────────────────────────┐
        │                                     │
        ▼                                     │
   [PENDING] ──────────────────────────► [REJECTED]
      │                                  (broker rejection)
      │ broker confirms fill
      ▼
   [OPEN] ─────────────────────────────► [CANCELLED]
      │                                  (cancelled before fill)
      │ SL hit / TP hit / manual close / AI close signal
      ▼
   [CLOSED]
```

### 5.1 State Transition Rules

| From | To | Trigger |
|---|---|---|
| PENDING | OPEN | Broker confirms order fill |
| PENDING | REJECTED | Broker rejects order |
| PENDING | CANCELLED | Execution Engine cancels before fill |
| OPEN | CLOSED | SL hit, TP hit, manual close, AI CLOSE signal |
| OPEN | CLOSED | Admin kill switch force-close |

---

## 6. Trade Modification

### 6.1 Triggers for Modification

- Trailing stop adjustment (automatic, based on price movement)
- AI signal generating MODIFY action for an existing open trade
- User manual modification (if exposed via dashboard)
- Risk Engine tightening SL after risk limit proximity

### 6.2 Modification Flow

```
1. Receive ModifyTrade request (source: AI signal, trailing stop job, user)
2. Validate new SL/TP values:
   - New SL must not move further from current price (reducing risk only)
   - Exception: trailing stop naturally moves in favour of trade
3. Call BrokerAdapter.modifyOrder(externalOrderId, modifications)
4. On success: update Trade record, emit TradeModified event
5. On failure: log error, retain original values, alert if persistent
```

### 6.3 Trailing Stop Automation

```
TrailingStopJob (runs every 30 seconds for active sessions):
  For each OPEN trade with trailing_stop_pips configured:
    1. Fetch current market price
    2. Calculate trail distance in pips
    3. If current_price has moved > trailing_stop_pips in favourable direction:
       - Calculate new SL (price - trailing_stop_pips for BUY, price + for SELL)
       - If new SL > current SL (for BUY) / new SL < current SL (for SELL):
         - Update SL via BrokerAdapter.modifyOrder()
         - Log modification
```

---

## 7. Trade Closure

### 7.1 Automatic Closure (Broker-Triggered)

When SL or TP is hit, the broker closes the trade. The Reconciliation Job detects this:

```
ReconciliationJob (runs every 60 seconds):
  For each OPEN trade:
    1. Call BrokerAdapter.getPositionById(externalOrderId)
    2. If broker returns: position not found → trade was closed by broker
       - Call BrokerAdapter.getClosedTrades(from: trade.openedAt, to: now)
       - Find matching closed trade
       - Update Trade record: status = CLOSED, exitPrice, realisedPnl, closedAt
       - Emit TradeClosed event
```

### 7.2 AI-Initiated Closure

When the AI Signal Engine generates a CLOSE signal for an open trade:

```
1. Strategy Orchestrator receives CLOSE signal with target instrument
2. Risk Engine validates CLOSE action (confirm trade exists, session active, broker connected)
3. Execution Engine calls BrokerAdapter.closeOrder(externalOrderId)
4. On success: update Trade record, emit TradeClosed event
```

### 7.3 Kill Switch Force-Close

When admin activates the kill switch and selects "close all positions":

```
AdminKillSwitchService.forceCloseAllPositions():
  1. Fetch all OPEN trades across all users
  2. For each trade: call BrokerAdapter.closeOrder(externalOrderId)
  3. Log each closure in audit log with reason: KILL_SWITCH_FORCE_CLOSE
  4. Update all Trade records to CLOSED
  5. Emit TradeForceClosedByAdmin event
```

---

## 8. Execution Error Handling

| Error Type | Response |
|---|---|
| Broker timeout (< 3 retries) | Retry with exponential backoff (1s, 3s, 9s) |
| Broker timeout (all retries failed) | Set trade status to RECONCILIATION_PENDING; alert admin |
| Broker REJECTED response | Set trade status to REJECTED; log reason; no retry |
| Broker DUPLICATE_ORDER response | Idempotency check: return existing trade; no resubmit |
| Network error | Retry; if persistent, halt execution, alert admin |
| Invalid order parameters | Reject at preparation stage; do not call broker |
| Broker account suspended | Set BrokerConnection.status = SUSPENDED; halt all trading |

---

## 9. Execution Audit Trail

Every execution step generates an immutable audit event:

| Event | Captured Data |
|---|---|
| `TRADE_PREPARED` | userId, instrument, direction, lotSize, SL, TP, idempotencyKey |
| `TRADE_SUBMITTED` | externalOrderId (if available), brokerRequest |
| `TRADE_OPENED` | externalOrderId, entryPrice, openedAt, signalId |
| `TRADE_MODIFIED` | tradeId, oldSL, newSL, oldTP, newTP, modifiedBy, reason |
| `TRADE_CLOSED` | tradeId, exitPrice, realisedPnl, closedAt, closeReason |
| `TRADE_REJECTED` | tradeId, rejectionReason, brokerMessage |
| `TRADE_RECONCILED` | tradeId, reconciledState, discrepanciesFound |

---

## 10. Performance Considerations

| Concern | Approach |
|---|---|
| Order submission latency | Async processing with acknowledgement; target < 500ms broker round-trip |
| High concurrent orders | Connection pool for broker API client; async order handling |
| Reconciliation load | Paginated reconciliation; priority to PENDING trades over OPEN |
| Trailing stop precision | Use broker-native trailing stop where supported; fall back to job-based |
| Database write load | Batch reconciliation updates where possible |
