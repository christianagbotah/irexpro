# ADR 0004 — Use High-Water Mark for Performance Fee Calculation

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Platform Architecture Team  
**Context:** Performance fee calculation methodology selection

---

## Context and Problem Statement

iRexPro generates revenue from performance fees — a percentage of user trading profits. The critical design question is: **on what basis are performance fees calculated, and how do we prevent unfair double-charging?**

Three fee calculation approaches were considered:

**Option 1 — Simple Periodic Profit:**
Charge a fee on all positive profit in each settlement period, regardless of prior losses.

**Option 2 — Cumulative Profit (No HWM):**
Charge a fee on total cumulative profit since account start, but do not track a high-water mark.

**Option 3 — High-Water Mark (HWM):**
Charge a fee only on new profit above the highest cumulative profit level previously achieved. If losses occur, no fee is charged during recovery until the previous peak is exceeded.

---

## Decision

**We will use the High-Water Mark (HWM) methodology for all performance fee calculations.**

Performance fees are charged only on realised profit above the previous high-water mark.

---

## Reasoning

### Fairness to Users

Without a high-water mark, a user experiencing the following sequence would be charged unfairly:

```
Month 1: +$1,000 profit → Fee = $200 (20%) → Net to user = $800
Month 2: -$800 loss    → Fee = $0
Month 3: +$800 profit  → Fee = $160 (without HWM) ← UNFAIR: user is not yet profitable

With HWM:
Month 1: +$1,000 → Fee = $200 → HWM = $1,000
Month 2: -$800   → Fee = $0    → HWM = $1,000 (preserved at peak)
Month 3: +$800   → Cumulative = $1,000 → No profit above HWM → Fee = $0
Month 4: +$300   → Cumulative = $1,300 → $300 above HWM → Fee = $60 → HWM = $1,300
```

Without HWM, the user pays twice for the same profit range (Month 1 and Month 3). With HWM, they only pay once.

### Industry Standard

High-water mark is the recognised industry standard for performance fee calculation in:
- Hedge funds
- Managed accounts
- Algorithmic trading platforms
- Investment funds under MiFID II

Using HWM positions iRexPro as a professionally structured platform that operates according to standards that sophisticated users expect.

### Incentive Alignment

HWM aligns the incentives of the platform (earn fees) with the user (make net profit):

- The platform earns fees only when the user is in genuine net new profit
- The platform has no incentive to churn — repeatedly generating profits and losses to maximise fee collection — because losses extend the period before new fees can be collected
- Users trust that the platform's interest is in their genuine long-term profitability

### Regulatory Readiness

Many financial regulators require performance fees on managed accounts to use HWM or equivalent mechanisms to protect investors from unfair charging. Starting with HWM ensures iRexPro is compliant or near-compliant with these requirements from day one.

---

## Implementation Specifics

### What Is Included in the HWM Basis

Only **realised (closed trade) profit and loss** is included:

- Closed trade P&L: included
- Open (floating) P&L: excluded — unrealised profits can evaporate instantly
- Deposit amounts: excluded — deposits are not profit
- Swap/rollover from open positions: excluded (conservative approach)
- Commission and spread costs: included in net P&L (already deducted by broker)

### HWM Reset Policy

The HWM never resets during a user's account lifetime unless:
- The user explicitly closes their account and opens a new one
- A platform admin performs an exceptional reset (requires SuperAdmin approval and audit log entry with justification)

The HWM cannot be reset by a user through self-service. This prevents gaming the system by closing and reopening accounts to avoid HWM charges.

### Settlement Cycle

Fees are calculated at the end of each settlement period (daily, weekly, or monthly, configurable per plan):

1. Sum all closed trade P&L in the period
2. Add to cumulative total
3. Calculate excess above HWM (if any)
4. Apply fee rate to excess
5. Update HWM to new peak (if higher than current HWM)
6. Record FeeRecord

### Deposit Exclusion (Critical)

The deposit exclusion rule is enforced at the data model level. Deposit amounts:
- Are recorded in `wallet.wallets.total_deposited` (future Model B)
- Are **never** added to `performance.performance_accounts.total_realised_pnl`
- Are **never** compared to `high_water_mark`

This separation is structural — there is no code path that can accidentally treat a deposit as profit.

---

## Consequences

### Positive

- Fair to users — fees only on genuine new profit
- Incentive-aligned with user success
- Industry-standard and regulatory-ready
- Transparent and auditable
- Deposit injection cannot manipulate fee calculations

### Negative

- More complex fee calculation than simple percentage of period profit
- Users in extended drawdown periods generate no fee revenue for the platform
- HWM logic must be tested thoroughly to prevent calculation errors

### Mitigations

- Fee calculation logic has 100% branch coverage unit tests
- All fee calculations are immutably logged for auditability
- HWM values are displayed to users in fee statements for full transparency

---

## Related Decisions

- [ADR 0001](./0001-use-broker-connected-model-a-first.md) — Model A first
- [ADR 0003](./0003-use-risk-engine-before-execution.md) — Risk Engine gateway
