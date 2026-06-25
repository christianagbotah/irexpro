# 03 — User Journeys

## iRexPro — Core User Journeys and System Interaction Flows

---

## 1. Purpose

This document describes the primary user journeys for iRexPro across the full lifecycle of a user's engagement with the platform. Each journey maps user actions to system behaviours, API calls, and business rule enforcements.

---

## 2. Journey 1 — New User Registration and Onboarding

### User Goal
Create an account and prepare to trade autonomously.

### Steps

```
1. User visits iRexPro web or mobile app
2. User clicks "Create Account"
3. User enters: name, email, password, country, phone number
4. System validates input (email format, password strength, country eligibility)
5. System creates User record with status: PENDING_VERIFICATION
6. System sends email verification link (expires in 24 hours)
7. User clicks email verification link
8. System updates User status: ACTIVE
9. User completes onboarding wizard:
   a. Risk disclosure acknowledgement (mandatory, logged)
   b. Trading experience declaration
   c. Platform terms acceptance (timestamped, immutable)
10. System creates UserProfile record
11. User is redirected to dashboard (no subscription yet)
```

### Business Rules
- Email must be unique
- Password must meet complexity requirements
- Risk disclosure acceptance must be recorded with timestamp and IP
- Users in restricted jurisdictions must be blocked at registration

### Failure Cases
- Email already registered → return existing account hint, do not expose
- Invalid email verification token → prompt re-send
- User in blocked jurisdiction → display notice, do not create account

---

## 3. Journey 2 — Broker Account Connection

### User Goal
Link a personal regulated broker account to iRexPro.

### Steps

```
1. User navigates to "Connect Broker" section
2. User selects broker from supported list
3. User reads broker connection instructions
4. User enters broker API credentials (API Key, API Secret, Account ID)
   OR completes OAuth flow if broker supports it
5. System validates credential format
6. System calls Broker Adapter to test connection (sandbox first)
7. Broker Adapter returns: account ID, balance, account type (demo/live)
8. System stores encrypted credentials (AES-256, envelope encryption)
9. System creates BrokerConnection record with status: CONNECTED
10. System displays confirmed connection with masked credential reference
11. System begins periodic broker connection health checks
```

### Business Rules
- Credentials are encrypted before storage — never stored in plaintext
- Credentials are never returned in any API response
- Demo/sandbox account connection must be validated before live
- A user may connect only one active broker account in Phase 1

### Failure Cases
- Invalid credentials → clear error, prompt retry, log failed attempt
- Broker API unreachable → display connectivity warning, allow retry
- Credential test fails broker-side → surface broker error message (sanitised)
- Account suspended at broker → display notice, halt AI trading for that user

---

## 4. Journey 3 — Subscription Purchase

### User Goal
Purchase a subscription plan to unlock AI Auto Trading.

### Steps

```
1. User navigates to "Subscription" or prompted after broker connection
2. System displays available plans (Starter, Pro, Elite)
3. User selects a plan
4. If free trial is available: system prompts trial acceptance
5. User proceeds to payment (payment provider redirect or embedded widget)
6. Payment provider processes payment
7. Payment provider sends webhook to iRexPro
8. System validates webhook signature
9. System creates Subscription record with status: ACTIVE
10. System creates Invoice record
11. System sends subscription confirmation email
12. System records audit log entry
13. User gains access to AI Auto Trading Mode
```

### Business Rules
- Payment must be confirmed via webhook before subscription is activated
- Subscription status is checked at every AI Auto Trading activation request
- Free trial has a hard expiry; system must auto-set status to EXPIRED
- Users may not activate AI trading with an EXPIRED or INACTIVE subscription

### Failure Cases
- Payment fails → subscription remains INACTIVE, user prompted to retry
- Webhook not received → fallback polling or manual admin reconciliation
- Duplicate webhook → idempotency check prevents double-activation

---

## 5. Journey 4 — AI Auto Trading Activation

### User Goal
Activate fully autonomous AI trading.

### Steps

```
1. User navigates to dashboard and clicks "Activate AI Trading"
2. System checks:
   a. Subscription status = ACTIVE → proceed
   b. Broker connection status = CONNECTED → proceed
   c. Broker account type = LIVE (or DEMO for testing mode) → proceed
   d. No existing active trading session → proceed
3. System displays final confirmation modal:
   - Current risk settings
   - Broker account balance
   - Confirmation that trading will begin autonomously
4. User confirms activation
5. System creates TradingSession record with status: ACTIVE
6. System emits TradingSessionStarted event
7. AI Signal Engine begins market analysis for user's session
8. Strategy Orchestrator receives signals
9. Risk Engine validates signals before any execution
10. Execution Engine submits approved orders to broker
11. Dashboard WebSocket begins streaming live trade updates
```

### Business Rules
- Steps 2a through 2d are hard gates — any failure halts activation
- User must re-confirm with explicit acknowledgement
- Trading session is tracked with start time, user ID, and broker account reference
- Risk parameters are locked at session start (user cannot change during live session without re-activating)

### Failure Cases
- Subscription expired since last check → block activation, show renewal prompt
- Broker disconnected → block activation, show reconnect prompt
- Broker account has insufficient margin → warning displayed, user can proceed with caution or abort
- Existing active session found → prevent duplicate session creation

---

## 6. Journey 5 — AI Trading in Progress (Automated Flow)

### System-Driven Flow (No User Action Required)

```
Every N seconds/minutes (configurable per strategy):
1. Market Data Service fetches OHLCV data from broker data feed
2. AI Signal Engine processes data:
   - Applies technical indicators
   - Runs ML model inference
   - Generates signal: BUY/SELL/HOLD/CLOSE/MODIFY
   - Assigns confidence score
3. Strategy Orchestrator:
   - Filters signal below confidence threshold
   - Checks strategy governance rules
   - Passes approved signal to Risk Engine
4. Risk Engine validates:
   - Daily loss limit not breached
   - Max drawdown not exceeded
   - Position size within limits
   - Max concurrent trades not exceeded
   - Margin available
   - Leverage within policy
   - Not a duplicate signal
5. If Risk Engine approves:
   - Execution Engine prepares order
   - Assigns idempotency key
   - Calls Broker Adapter
   - Broker Adapter submits order to broker
   - Broker returns order confirmation
   - Trade record created
   - Real-time dashboard update pushed via WebSocket
6. If Risk Engine rejects:
   - Rejection reason logged
   - Signal discarded
   - Dashboard may show "Risk limit reached" notification
```

### Monitoring During Active Session
- Open trade P&L streamed to dashboard
- SL/TP hit events pushed to user
- Trailing stop adjustments logged
- Trade closure events pushed to user

---

## 7. Journey 6 — Stop / Pause AI Trading

### User Goal
Pause or fully stop autonomous AI trading.

### Steps

```
1. User clicks "Pause AI Trading" or "Stop AI Trading"
2. System presents confirmation modal
3. User confirms action
4. System sets TradingSession status: PAUSED or STOPPED
5. Strategy Orchestrator ceases generating new signals for this user
6. Existing open trades: remain open (not auto-closed unless user requests)
7. System logs TradingSessionPaused / TradingSessionStopped event
8. Dashboard updates to show inactive state
```

### Behaviour Note
- Stopping AI trading does **not** automatically close open positions
- User is informed that open trades will be managed by broker rules (SL/TP as set) or manual intervention
- Future: admin kill switch can force-close all positions (Risk Engine override path)

---

## 8. Journey 7 — Performance Review

### User Goal
Review trading performance, closed trades, and fees.

### Steps

```
1. User navigates to "Performance" dashboard
2. System loads:
   - Total realised P&L (all time, 30 days, 7 days, today)
   - Open unrealised P&L
   - Win rate (%)
   - Average winning trade / average losing trade
   - Maximum drawdown
   - Number of trades opened / closed
   - Equity curve chart data
3. User filters by date range, instrument, or strategy
4. User views closed trade list with: instrument, direction, entry, exit, P&L, duration, SL, TP
5. User views fee statements: platform performance fees deducted per settlement cycle
```

---

## 9. Journey 8 — Performance Fee Calculation (System-Driven)

### System-Driven Flow

```
At each settlement cycle (daily/weekly/monthly per plan):
1. System fetches all closed trades since last settlement for user
2. System sums realised profit
3. System checks high-water mark:
   - If realised profit > high-water mark → fee applies to profit above HWM
   - If realised profit <= high-water mark → no fee
4. System calculates fee: (profit above HWM) × performance fee rate
5. System records FeeRecord in platform owner revenue ledger
6. System updates high-water mark to new equity peak
7. System generates fee statement for user
8. System logs fee calculation event (immutable)
```

---

## 10. Journey 9 — Broker Disconnection Recovery

### System-Driven Flow

```
1. Broker Adapter health check fails
2. System marks BrokerConnection status: DISCONNECTED
3. Risk Engine receives BROKER_DISCONNECTED event → suspends all pending signals
4. Execution Engine halts new order submission
5. System emits alert: user dashboard, admin dashboard, monitoring alert
6. Reconnection service attempts re-authentication (configurable retry policy)
7. On successful reconnection:
   - BrokerConnection status: CONNECTED
   - Open trade positions reconciled against broker state
   - TradingSession resumes if user session was ACTIVE
   - Audit log records reconnection event
8. If reconnection fails after max retries:
   - TradingSession marked SUSPENDED_BROKER_FAILURE
   - Admin notified
   - User notified via email/push notification
```

---

## 11. Journey 10 — Admin Kill Switch

### Admin Goal
Immediately halt all AI trading platform-wide.

### Steps

```
1. Admin (or SuperAdmin) accesses Kill Switch in admin dashboard
2. Admin confirms intent (double-confirmation required)
3. System sets GlobalKillSwitch: ACTIVE
4. All active TradingSession records → status: SUSPENDED_KILL_SWITCH
5. AI Signal Engine halts signal distribution
6. Risk Engine rejects all signals
7. Execution Engine halts new orders
8. All affected users receive real-time notification
9. Admin audit log records: who, when, reason
10. To resume: admin deactivates kill switch, users must manually re-activate AI trading
```
