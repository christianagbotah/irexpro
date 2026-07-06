# 13 — Subscription and Profit Sharing

## iRexPro — Global Subscription System and Revenue Engine Architecture

---

## 1. Purpose

This document defines the subscription lifecycle, billing model, profit-sharing calculation engine, high-water mark mechanics, and platform revenue recording for iRexPro. The subscription system is **global-ready**: it supports multiple currencies, regional payment providers, country-level tax rules, and provider-specific payment references.

---

## 2. Subscription and Revenue Model Overview

iRexPro uses a **subscription + performance fee** dual revenue model:

| Revenue Stream | Description |
|---|---|
| **Subscription fees** | Fixed periodic fees for platform access, billed through regional/global payment providers |
| **Performance fees** | Percentage of realised trading profits above high-water mark, calculated by the platform and collected through the payment system |

Both revenue streams are tracked separately in the platform's revenue ledger. Both are **core business scope** — not future features.

### ManualPaymentProvider — Development and Testing Only

A `ManualPaymentProvider` exists for development, internal testing, and admin-managed pilot activations. It allows subscriptions to be activated without a live payment gateway. **It is not and must never be used as a commercial subscription mechanism for real paying customers.** It exists exclusively for:

- Developer local environment testing
- Internal beta user onboarding
- Admin override for exceptional cases

All commercial subscribers must be billed through a live `IPaymentProvider` implementation (Stripe, Paystack, Hubtel, Flutterwave, etc.).

---

## 3. Subscription Plans

### 3.1 Plan Structure

Each plan defines:
- Name and description
- Billing cycle (monthly, quarterly, annual)
- Free trial days (0 = no trial)
- Performance fee rate (e.g., 20%)
- Maximum concurrent trades allowed by AI
- Feature flags (e.g., advanced analytics, priority execution)
- Active/inactive status

Pricing is defined per-currency in `subscriptions.plan_pricing` (not on the plan itself), enabling the same plan to be priced in GHS, NGN, GBP, USD, etc.

### 3.2 Example Plan Tiers

| Plan | USD Price | GBP Price | GHS Price | Trial | Perf. Fee | Max Trades |
|---|---|---|---|---|---|---|
| Starter | $29 | £23 | GHS 420 | 7 days | 20% | 3 |
| Pro | $79 | £63 | GHS 1,150 | 7 days | 15% | 10 |
| Elite | $199 | £159 | GHS 2,900 | 14 days | 10% | 30 |

> Plan and pricing details are configurable by SuperAdmin. Prices above are illustrative only.

### 3.3 Tax/VAT on Subscriptions

Tax is applied at invoice generation time based on `subscriptions.tax_rules` for the user's country:

```
Invoice amount calculation:
  base_amount = plan_pricing.amount_cents (in user's currency)
  tax_rule = SELECT * FROM subscriptions.tax_rules WHERE country_code = user.country
  tax_amount = base_amount × tax_rule.tax_rate
  total_amount = base_amount + tax_amount
```

Countries with no tax rule or `tax_type = NONE` receive invoices with `tax_amount_cents = 0`.

---

## 4. Subscription Lifecycle

### 4.1 States

```
TRIAL → ACTIVE → EXPIRED
         │
         └──► CANCELLED
         └──► SUSPENDED (payment failure)
```

### 4.2 State Transitions

| Transition | Trigger |
|---|---|
| Created → TRIAL | User starts trial (trial_days > 0) |
| TRIAL → ACTIVE | Trial ends + payment processed |
| TRIAL → EXPIRED | Trial ends + no payment |
| Created → ACTIVE | Direct subscription (no trial) + payment confirmed |
| ACTIVE → EXPIRED | expires_at passed + no renewal |
| ACTIVE → CANCELLED | User or admin cancels |
| ACTIVE → SUSPENDED | Payment failed (grace period) |
| SUSPENDED → ACTIVE | Payment recovered within grace period |
| SUSPENDED → EXPIRED | Grace period expired without payment |

### 4.3 Subscription Gate for AI Trading

The AI Trading activation check must verify:

```typescript
async function isSubscriptionActiveForTrading(userId: string): Promise<boolean> {
  const subscription = await this.subscriptionsRepo.findActiveByUser(userId);
  if (!subscription) return false;

  const now = new Date();

  if (subscription.status === 'TRIAL') {
    return now < subscription.trialEndsAt;
  }

  if (subscription.status === 'ACTIVE') {
    return now < subscription.expiresAt;
  }

  return false;
}
```

This check is server-side and called at every AI trading activation request. It must never be bypassed.

---

## 5. Payment Provider Architecture

The full `IPaymentProvider` interface, `PaymentProviderRegistry`, `PaymentProviderRouter`, provider capability matrix, webhook security, and failure handling are defined in [21-payment-provider-architecture.md](./21-payment-provider-architecture.md).

### 5.1 Global Provider Support

| Provider | ID | Region | Phase |
|---|---|---|---|
| Stripe | `stripe` | Global | **Sandbox-live since Sprint 17** |
| PayPal / Braintree | `paypal` | Global | Phase 2 |
| Paystack | `paystack` | Africa (NG, GH, KE, ZA) | Phase 1 interface → Phase 2 live |
| Flutterwave | `flutterwave` | Africa (30+ countries) | Phase 1 interface → Phase 2 live |
| Hubtel | `hubtel` | Ghana | Phase 1 interface → Phase 2 live |
| Wise | `wise` | Global (payouts) | Phase 3 |
| Adyen | `adyen` | Global (enterprise) | Phase 3 |
| Manual (Admin) | `manual` | All countries | Phase 1 (pilot onboarding) |

### 5.2 Country-Based Provider Routing

Provider selection is automatic based on user country and plan currency:

```
User in Ghana (GH), plan in GHS → PaymentProviderRouter → Hubtel or Paystack
User in Nigeria (NG), plan in NGN → PaymentProviderRouter → Paystack
User in UK (GB), plan in GBP → PaymentProviderRouter → Stripe
User in US (US), plan in USD → PaymentProviderRouter → Stripe
```

Routing rules are defined in `CountryConfig.preferredPaymentProvider` and managed via admin dashboard. No routing logic is hardcoded.

### 5.3 Webhook Security

Each payment provider's webhook endpoint validates the provider-specific signature before any processing. See [21-payment-provider-architecture.md §12](./21-payment-provider-architecture.md) for per-provider signature validation details.

---

## 6. Performance Fee Architecture

### 6.1 Principle

Performance fees are calculated **only on realised (closed trade) profit**. The following are **never** included:

- Unrealised (floating) profit from open trades
- Deposit amounts
- Balance transfers
- Swap or rollover income from open positions (controversial — excluded for simplicity)

### 6.2 High-Water Mark (HWM)

The high-water mark represents the highest cumulative realised profit level achieved by a user's account. Performance fees are only charged on profit **above** the previous high-water mark.

**Why HWM is required:**
- Prevents charging a fee on the same profit twice
- Prevents charging a fee when the account is recovering from a loss period
- Aligns incentives: platform only earns when user is in net profit

### 6.3 HWM Example

```
Initial HWM: $0
Month 1: Realised profit = $500 → P&L above HWM = $500 → Fee = $500 × 20% = $100 → New HWM = $500
Month 2: Realised profit = -$200 → P&L above HWM = $0 → Fee = $0 → HWM remains $500
Month 3: Realised profit = $150 → Cumulative = $450 → P&L above HWM = $0 → Fee = $0 (still below $500 HWM)
Month 4: Realised profit = $300 → Cumulative = $750 → P&L above HWM = $250 → Fee = $250 × 20% = $50 → New HWM = $750
```

### 6.4 Settlement Cycle

Settlement runs at the end of each configured period (configurable per plan):

```
SettlementJob (BullMQ scheduled job):
  1. For each user with an ACTIVE subscription:
     a. Fetch all closed trades since last_settled_at
     b. Sum realised_pnl (closed trades only, positive and negative)
     c. Calculate period_pnl = sum of realised_pnl in period
     d. Calculate cumulative_pnl = total_realised_pnl + period_pnl
     e. If cumulative_pnl > high_water_mark:
        - pnl_above_hwm = cumulative_pnl - high_water_mark
        - fee_amount = pnl_above_hwm × performance_fee_rate
        - Create FeeRecord
        - Update high_water_mark = cumulative_pnl
        - Update total_realised_pnl
     f. If cumulative_pnl <= high_water_mark:
        - No fee
        - Update total_realised_pnl (can go negative during drawdown)
     g. Update last_settled_at
     h. Generate FeeStatement for user
  2. Post all fee_records to owner revenue account
  3. Log SettlementCompleted event
```

---

## 7. Model A Performance Fee Collection — Important Clarification

### 7.1 The Model A Constraint

In Model A, **user funds remain inside the user's own regulated broker account at all times**. iRexPro does not hold or have direct financial control over those funds. This creates an important distinction in how performance fees are **calculated** versus how they are **collected**.

| Aspect | Model A | Model B (Future) |
|---|---|---|
| **Calculation** | Platform calculates fees from closed trade P&L data | Same |
| **Fee record creation** | Platform creates `FeeRecord` in its ledger | Same |
| **Fee collection mechanism** | Via subscription/payment provider billing (separate charge) | Automatic deduction from Trading Wallet |
| **Timing** | Settled at end of period; charged as a separate payment | Settled directly from wallet at end of period |
| **Broker withdrawal** | Not performed — iRexPro does not withdraw from broker account | N/A — internal wallet deduction |

### 7.2 Model A Fee Collection Flow

```
Settlement cycle completes:
  1. Platform calculates: pnl_above_hwm, fee_amount
  2. Creates FeeRecord (status: CALCULATED)
  3. Generates FeeStatement for user

Fee collection:
  Option A — Performance fee charged via payment provider:
    - Platform initiates a separate charge through the user's payment method on file
    - This is a distinct billing event from the subscription fee
    - IPaymentProvider.createPaymentIntent(feeAmount, currency)
    - On payment success: FeeRecord status → COLLECTED, OwnerRevenueEntry created

  Option B — Bundled into next subscription invoice:
    - Fee amount added as a line item on the next subscription invoice
    - User pays combined subscription + performance fee together

  Option C — Manual settlement (pilot / agreement-based):
    - Admin generates fee statement and invoices user manually
    - Used during early pilot phase before automated billing is live
```

### 7.3 What iRexPro Does NOT Do in Model A

**iRexPro does not and cannot automatically withdraw money from a user's broker account as a fee payment**, unless:

1. The connected broker's API explicitly supports authorised third-party withdrawals
2. The user has provided explicit authorisation for such withdrawals
3. The arrangement complies with the legal and regulatory requirements of the user's jurisdiction
4. The broker account agreement permits it

**The default and safe assumption is that fees are collected via the platform's own payment system**, not via broker account withdrawal. Any broker-account-level fee collection mechanism requires separate legal and technical validation per broker and jurisdiction.

### 7.4 Fee Transparency to Users

Users must always be able to see:
- Performance fee rate (from their subscription plan)
- Cumulative realised P&L
- Current high-water mark
- Amount of profit above HWM in any settlement period
- Calculated fee amount
- Fee collection status (calculated, invoiced, collected)

This is displayed in the user dashboard under "Fee Statements" and "Performance" sections.

---

## 9. Owner Revenue Account

### 9.1 Structure

```sql
CREATE TABLE revenue.owner_revenue_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_label         VARCHAR(100) NOT NULL,  -- e.g., "Performance Fees USD", "Subscription Revenue USD"
  currency              CHAR(3) NOT NULL,
  total_revenue         DECIMAL(18,8) NOT NULL DEFAULT 0,
  last_settlement_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE revenue.owner_revenue_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id      UUID NOT NULL REFERENCES revenue.owner_revenue_accounts(id),
  entry_type            VARCHAR(30) NOT NULL CHECK (entry_type IN ('SUBSCRIPTION_FEE','PERFORMANCE_FEE','REFUND','ADJUSTMENT')),
  amount                DECIMAL(18,8) NOT NULL,
  currency              CHAR(3) NOT NULL,
  source_user_id        UUID,
  source_record_id      UUID,  -- FK to FeeRecord or Invoice
  description           TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 9.2 Double-Entry Readiness

While Model A does not involve iRexPro holding funds, all revenue entries are designed as double-entry-compatible records for future Model B expansion:

- Every credit to the platform owner account has a corresponding debit reference (user fee obligation)
- The ledger is immutable (append-only entries, no updates)

---

## 10. Fee Statement Generation

A fee statement is generated for each user at the end of each settlement cycle and covers:

```
FeeStatement {
  userId: uuid
  statementPeriod: { from, to }
  openingEquity: decimal
  closingEquity: decimal
  realisedPnlInPeriod: decimal
  openingHighWaterMark: decimal
  closingHighWaterMark: decimal
  pnlAboveHighWaterMark: decimal
  performanceFeeRate: decimal
  performanceFeeAmount: decimal
  currency: string
  generatedAt: timestamp
  trades: [ { tradeId, instrument, pnl } ]  // Summary of closed trades in period
}
```

Fee statements are accessible via the user dashboard and downloadable as PDF (future).

---

## 11. Deposit Exclusion and Withdrawal Adjustment (Critical Rules)

### 9.1 Deposits Must Never Be Treated as Trading Profit

Deposit amounts must never affect the fee calculation basis. They are not profit.

In Model B, deposits update `wallet.wallets.total_deposited`, not `performance.performance_accounts.total_realised_pnl`. This is enforced at the data model level.

### 9.2 Withdrawal Adjustment Logic

When a user withdraws funds from a Model B Trading Wallet, the high-water mark must be adjusted downward to reflect the reduced capital base. Otherwise the user would need to re-earn already-withdrawn profit before any new fees could be charged — which is unfair in the other direction.

**Withdrawal Adjustment Formula:**

```
new_hwm = max(0, current_hwm - withdrawal_amount)
```

**Example:**
```
HWM before withdrawal: $1,000
User withdraws $400
HWM after adjustment: max(0, $1,000 - $400) = $600

Next month: +$300 profit → cumulative = $900 → $300 above new HWM ($600) → Fee applies on $300
```

Withdrawal adjustments are recorded in the audit log and FeeRecord history.

**Model A note:** Since user funds are at the broker in Model A, iRexPro does not directly observe withdrawals from the broker account. In Model A, withdrawal adjustment is approximated through the periodic broker account balance reconciliation. If the broker account balance drops significantly (suggesting a withdrawal), the PerformanceAccount HWM can be adjusted by admin action with audit log justification, or a user-declared withdrawal trigger in the dashboard. The exact withdrawal adjustment mechanism in Model A is subject to the capabilities of the connected broker's API.

---

## 12. Sprint 11 — Performance Fee Engine Implementation (Current)

### Entities Implemented

| Entity | Schema | Purpose |
|---|---|---|
| `PerformanceFeePolicy` | `performance_fees` | Defines fee terms (rate, frequency, mode) per plan |
| `TradingAccountPerformance` | `performance_fees` | Tracks HWM, realised P&L, deposits, fees per account |
| `PerformanceFeeAssessment` | `performance_fees` | Full audit record of one fee calculation period |
| `PerformanceFeeLedgerEntry` | `performance_fees` | Immutable event log for all fee-relevant monetary movements |

### Fee Calculation Rules (Enforced)

1. **Realised profit only** — REALISED_TRADE_PROFIT + REALISED_TRADE_LOSS ledger entries only
2. **Deposits excluded** — DEPOSIT ledger entries are NEVER counted as profit
3. **HWM comparison** — fee applies only when cumulative realised P&L exceeds current HWM
4. **Zero-fee assessment** — if profit ≤ HWM, feeAmount=0 and status=DRAFT; no invoice created
5. **HWM update** — only after assessment status transitions to PAID via verified webhook
6. **No automatic withdrawal** — invoice created; payment handled via existing payment provider flow
7. **No demo/paper/backtest fees** — only live broker REALISED_TRADE_* entries are valid input
8. **BigInt arithmetic** — `fee = floor(profitAboveHWM × feePercent × 100 / 1_000_000)` — no float precision loss

### API Endpoints (Admin Only Except Summary)

```
GET    /api/v1/performance-fees/policies                    (ADMIN+)
POST   /api/v1/performance-fees/policies                    (ADMIN+)
GET    /api/v1/performance-fees/me/summary                  (authenticated user — own data)
GET    /api/v1/performance-fees/assessments                 (ADMIN+)
POST   /api/v1/performance-fees/assessments/calculate       (ADMIN+)
POST   /api/v1/performance-fees/assessments/:id/invoice     (ADMIN+)
POST   /api/v1/performance-fees/ledger-entries              (ADMIN+)
```

### Assessment Lifecycle

```
DRAFT → ASSESSED (when feeAmount > 0)
ASSESSED → INVOICED (via invoiceAssessment)
INVOICED → PAID (via verified payment webhook)
ASSESSED → WAIVED (admin action — future sprint)
DRAFT/ASSESSED/INVOICED → CANCELLED (admin action — future sprint)
```

---

## 13. Subscription and Revenue Audit Log

All subscription, payment, and revenue events produce immutable audit log entries:

| Event | Audit Entry |
|---|---|
| Subscription created | SUBSCRIPTION_CREATED |
| Trial started | SUBSCRIPTION_TRIAL_STARTED |
| Payment provider selected | PAYMENT_PROVIDER_SELECTED |
| Customer created at provider | PAYMENT_CUSTOMER_CREATED |
| Payment received (webhook) | PAYMENT_SUCCEEDED |
| Payment failed (webhook) | PAYMENT_FAILED |
| Payment retried | PAYMENT_RETRIED |
| Subscription activated | SUBSCRIPTION_ACTIVATED |
| Subscription past due | SUBSCRIPTION_PAST_DUE |
| Subscription suspended (payment) | SUBSCRIPTION_SUSPENDED_PAYMENT_FAILURE |
| Subscription expired | SUBSCRIPTION_EXPIRED |
| Subscription cancelled | SUBSCRIPTION_CANCELLED |
| Subscription renewed | SUBSCRIPTION_RENEWED |
| Invoice created | INVOICE_CREATED |
| Invoice paid | INVOICE_PAID |
| Webhook received | WEBHOOK_RECEIVED |
| Invalid webhook signature | WEBHOOK_INVALID_SIGNATURE |
| Performance fee calculated | PERFORMANCE_FEE_CALCULATED |
| Settlement completed | SETTLEMENT_COMPLETED |
| High-water mark updated | HIGH_WATER_MARK_UPDATED |
| Revenue entry posted | REVENUE_ENTRY_POSTED |
| Broker reconciliation started | BROKER_RECONCILIATION_STARTED |
| Broker reconciliation completed | BROKER_RECONCILIATION_COMPLETED |
| Broker reconciliation failed | BROKER_RECONCILIATION_FAILED |
| Broker trade reconciled | BROKER_TRADE_RECONCILED |
| Broker trade reconciliation skipped | BROKER_TRADE_RECONCILIATION_SKIPPED |
| Ledger entry from broker trade | PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE |

---

## 11. Broker Trade Reconciliation (Sprint 12)

### Realised P&L Source of Truth

`PerformanceFeeLedgerEntry` is the single source of truth for performance-fee calculations. Sprint 12 introduces the broker reconciliation pipeline that populates it from real confirmed closed broker trades.

### Reconciliation Architecture

```
IBrokerAdapter.getClosedTrades(from, to)
        ↓
ClosedTradeNormalizerService
  - Maps externalOrderId → brokerTradeId (MetaTrader: the deal ticket id, stable & unique per account)
  - Converts major-unit decimal → minor-unit bigint strings using the account
    currency's ISO 4217 exponent (USD/EUR=2, JPY=0, KWD=3) — never a fixed ×100
  - Validates: non-empty ID, past closedAt, valid P&L
  - Computes: netRealisedPnl = grossRealisedPnl + commission + swap
        ↓
BrokerTradeReconciliationService
  - Validates time range (< 90 days, no future, from < to)
  - Enforces LIVE-only broker connections
  - Checks fee eligibility (active subscription + policy)
  - Deduplicates by (userId, brokerConnectionId, brokerTradeId)
        ↓
BrokerReconciledTrade (immutable record)
  + PerformanceFeeLedgerEntry (fee-eligible trades only)
        ↓
PerformanceFeeService.calculateAssessment() reads from ledger
```

### Fee Eligibility Rules

A trade is fee-eligible only when ALL of:
1. Broker connection is `accountType = LIVE` (not DEMO)
2. User has an active subscription
3. Subscription plan has an active performance fee policy
4. `netRealisedPnl ≠ 0`
5. Trade has not already been reconciled

**Never fee-eligible:** demo broker, paper broker, backtest, mock, open/unrealised positions, future closedAt, missing brokerTradeId.

### Safety Invariants

- No live broker withdrawals are implemented or triggered
- No automatic fee assessments or invoices from reconciliation
- Broker account balance is never used as fee basis
- High-water mark only advances after confirmed fee payment
- Deduplication enforced at DB level (unique index on userId + brokerConnectionId + brokerTradeId)
- No secrets, credentials, or raw broker payloads in any reconciliation record or audit log
- Currency minor-unit conversion is currency-aware and **fails closed** (`BadRequestException`) for any account currency without a known exponent, rather than silently assuming 2 decimals
- Reconciliation is self-healing on retry: if a prior run saved a `BrokerReconciledTrade` row but failed before writing its `PerformanceFeeLedgerEntry`, a later run detects the gap (fee-eligible + non-zero P&L + no linked ledger entry) and backfills the missing ledger entry — without double-counting fully-processed trades

---

## Performance Fee Billing Cycle (Sprint 13)

`PerformanceFeeBillingCycle` orchestrates the end-to-end billing workflow for an admin-driven billing period. It is **not** automated — an admin must explicitly trigger each cycle.

### Workflow

```
Admin triggers POST /api/v1/performance-billing/cycles/run
        ↓
PerformanceFeeBillingCycleService.runBillingCycleForUserPeriod()
        ↓
BrokerTradeReconciliationService.runReconciliation()   ← reconcile closed trades for period
        ↓ (reconciliationRunId stored on cycle)
PerformanceFeeService.calculateAssessment()            ← HWM engine calculates fee
        ↓ (assessmentId stored; feeAmount copied to cycle)
  feeAmount = 0  →  mark NO_FEE_DUE (no invoice)
  feeAmount > 0  →  PerformanceFeeService.invoiceAssessment()  ← create Invoice + PaymentTransaction
                    mark INVOICED (invoiceId stored)
        ↓
Payment received via webhook → markAssessmentPaid() → HWM advances
```

### State Machine

```
DRAFT ──────────────────────────────────────────────────→ CANCELLED
  │
  ↓ (runBillingCycle called)
RECONCILING
  │
  ↓
RECONCILED
  │
  ↓
ASSESSING
  │
  ↓
ASSESSED ──────────────────────────────────────────────→ NO_FEE_DUE (fee=0)
  │
  ↓
INVOICED  ← final state (no rerun)

Any non-final state → FAILED on error
FAILED → RECONCILING (safe retry) or CANCELLED
```

### Safety invariants
- **No auto-charge**: invoice is created but payment requires a verified provider webhook
- **No HWM update**: HWM advances only after `markAssessmentPaid()` is called by the webhook handler
- **No duplicate invoice**: INVOICED is a final state — rerun is rejected with `BadRequestException`
- **Outstanding assessment blocks new cycle**: `PerformanceFeeService.calculateAssessment()` rejects if an unresolved ASSESSED/INVOICED assessment already exists for the user/broker pair
- **RBAC**: only ADMIN/SUPER_ADMIN can create, run, or cancel cycles; normal users can only read their own
- **No secrets**: `errorSummary` is truncated to 500 chars and contains only the thrown error message string — never stack traces, credentials, or provider secrets
- **Failed reconciliation stops billing** (Sprint 13 audit fix): `BrokerTradeReconciliationService.runReconciliation()` catches adapter failures internally and *returns* a run with `status = FAILED` instead of throwing. The billing cycle inspects `reconRun.status` and transitions to `FAILED` (skipping assessment/invoice) when the run failed, so a stale/empty ledger is never billed as if reconciliation succeeded. `COMPLETED_WITH_WARNINGS` is treated as non-fatal (under-inclusive at worst; the HWM engine self-corrects on the next paid cycle) and proceeds to assessment.
- **Account-wide (null broker) duplicate guard is `IsNull`-safe** (Sprint 13 audit fix): `findExistingCycle()` uses `IsNull()` for a null `brokerConnectionId` rather than relying on `undefined` (which TypeORM strips from the where clause), so an account-wide cycle can never false-positive match one of the user's per-broker cycles for the same period. The DB partial unique indexes remain the ultimate backstop.

## Performance Fee Invoice Payment (Sprint 14)

Once the billing cycle has produced an `INVOICED` assessment (invoice `ISSUED`, a
PENDING `PERFORMANCE_FEE` `PaymentTransaction`), a user (or admin) can pay it via
`PerformanceFeePaymentService`. The service assigns a routed provider to that pending
transaction and returns a provider checkout session. It **never** marks the invoice or
assessment paid and **never** updates the high-water mark — a verified provider webhook
remains the only path to paid state / HWM advance. Full details, endpoints, and safety
invariants are documented in
[`21-payment-provider-architecture.md` §15](./21-payment-provider-architecture.md).

## Paystack Sandbox Checkout Integration (Sprint 15)

`PaystackPaymentProvider` is now a real sandbox implementation (previously a fail-closed
placeholder). Both subscription checkout (this section) and performance-fee invoice
checkout (above) can route to Paystack for Ghana/Nigeria users once
`PAYSTACK_ENABLED=true` and a secret key are configured — no changes were needed in
`SubscriptionsService` or `PerformanceFeePaymentService` since both already depend only
on the generic `IPaymentProvider` interface. The webhook-only paid/HWM/subscription-
activation invariant described throughout this document applies identically to Paystack:
`createCheckoutSession` only returns an authorization URL/reference, and only a verified
`charge.success` webhook (HMAC-SHA512 signature over the raw body) activates a
subscription or marks a performance-fee invoice paid. See
[`21-payment-provider-architecture.md` §16](./21-payment-provider-architecture.md) for the
full provider design and safety invariants.

## Subscription Checkout Idempotency + Pending Invoice Reuse (Sprint 16)

`SubscriptionsService.initiateCheckout()` previously created a brand-new `DRAFT`
invoice and `PENDING` `PaymentTransaction` on every call, so a double-click or two
near-simultaneous requests could leave several parallel pending invoices for the same
subscription. It now deterministically **reuses** an existing unpaid checkout for the
same `(userId, planId, currency, countryCode, paymentPurpose)` instead of creating a
duplicate, and an already-active provider session is returned as-is rather than
creating a second one. A database-level partial unique index backstops genuinely
concurrent requests, and an optional client `Idempotency-Key` replays the exact same
result for retried requests. None of this changes the webhook-only paid/activation
invariant above — checkout still only ever returns a session reference, and only a
verified webhook advances any state. Full rules, the reuse decision table, and the
concurrency design are documented in
[`21-payment-provider-architecture.md` §17](./21-payment-provider-architecture.md).

## Stripe Sandbox Checkout Integration (Sprint 17)

`StripePaymentProvider` is now a real sandbox implementation (previously a fail-closed
placeholder), used identically by subscription checkout (this section) and
performance-fee invoice checkout (above) — no changes were needed in
`SubscriptionsService` or `PerformanceFeePaymentService`, since both depend only on
the generic `IPaymentProvider` interface and the Sprint 16 reuse/idempotency logic is
fully provider-agnostic. Stripe becomes a live routing candidate for US/GB
(`enabledPaymentProviders` already lists `stripe` first for those countries) once
`STRIPE_ENABLED=true` and a secret key are configured; Paystack remains the preferred
live provider for GH/NG. The webhook-only paid/activation invariant applies
identically to Stripe: `createCheckoutSession` (Stripe Checkout Session,
`mode: 'payment'`) only returns a hosted checkout URL/session reference, and only a
verified `checkout.session.completed`/`payment_intent.succeeded` webhook (HMAC-SHA256
signature over `"${timestamp}.${rawBody}"`, verified via the `Stripe-Signature`
header and `STRIPE_WEBHOOK_SECRET`, with a 300-second replay-protection window)
activates a subscription or marks a performance-fee invoice paid — never the checkout
call, a redirect, or a frontend callback. See
[`21-payment-provider-architecture.md` §18](./21-payment-provider-architecture.md) for
the full provider design and safety invariants.
