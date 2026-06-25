# iRexPro — Cursor Workflow Guide

## How to Work With Cursor on This Project

---

## Overview

This document defines how to use Cursor AI effectively for building iRexPro. It provides the recommended prompt patterns, context-loading approach, session structure, and rules for iterating on the codebase safely and efficiently.

---

## Golden Rules for Working With Cursor on iRexPro

1. **Always reference architecture docs in prompts** — point Cursor to the relevant doc before asking it to build a feature
2. **Always include DEVELOPMENT_RULES.md in context** — all 18 rules must not be violated by generated code
3. **One feature/module per session** — don't ask Cursor to build multiple modules in one prompt
4. **Verify financial logic manually** — always review fee calculation, HWM, risk engine, and Model A fee collection code personally before committing
5. **Never accept code that bypasses the Risk Engine** — if Cursor generates code that routes around the Risk Engine, reject it and re-prompt
6. **Test first, then implement** — for critical modules (Risk Engine, fee calculation, HWM), write unit tests first as specification
7. **Never accept hardcoded providers** — if Cursor writes `new StripeAdapter()` directly in a service, reject it; all providers must be used through `IPaymentProvider` and `ISmsProvider` interfaces via their registries
8. **Never accept single-country assumptions** — if Cursor writes country-specific logic in business code rather than routing through `CountryConfigService`, reject it

---

## Recommended Session Structure

### Starting a New Module Build Session

```
1. Open relevant architecture document(s) in Cursor context:
   @docs/architecture/11-risk-engine-architecture.md

2. Reference development rules:
   @DEVELOPMENT_RULES.md

3. Reference tech stack:
   @TECH_STACK.md

4. Provide the prompt (see prompt patterns below)
```

### Continuing a Session

When resuming work on an existing module:
```
1. Open the module folder in context: @apps/api/src/modules/risk/
2. Open the architecture doc: @docs/architecture/11-risk-engine-architecture.md
3. Describe what was done and what needs to happen next
```

---

## Prompt Patterns

### Pattern 1: New Module Build

```
You are building [ModuleName] for iRexPro.

Architecture specification: [paste or @reference the relevant section from architecture docs]

Tech stack: NestJS, TypeScript, TypeORM, Decimal.js
Rules: [paste key rules from DEVELOPMENT_RULES.md relevant to this module]

Build the complete [ModuleName] including:
- Entity class (TypeORM)
- Repository
- Service with all business logic
- Controller with all endpoints defined in 07-api-architecture.md
- DTOs (request and response) with class-validator decorators
- Unit tests with [X]% coverage target

Do not build adjacent modules — only [ModuleName].
```

### Pattern 2: Unit Test Generation

```
Generate comprehensive unit tests for [ServiceName] in iRexPro.

The service is at: @apps/api/src/modules/risk/risk.service.ts
Architecture spec: @docs/architecture/11-risk-engine-architecture.md

Required test cases:
[List specific scenarios from the architecture doc]

Coverage requirement: 100% branch coverage for all rejection paths.
Use Jest with NestJS testing utilities. Mock all external dependencies.
```

### Pattern 3: Database Migration

```
Generate a TypeORM migration for iRexPro based on:

Schema specification: @docs/architecture/08-database-architecture.md
Section: [specific table name, e.g., "5.8 trading.trades"]

Requirements:
- Use schema namespace: trading
- All monetary fields: DECIMAL(18,8)
- UUID primary keys with gen_random_uuid()
- Include indexes as specified
- Include down() migration
- No FLOAT or DOUBLE PRECISION for financial fields
```

### Pattern 4: Bug Fix

```
There is a bug in [file/module] in iRexPro.

Relevant architecture: @docs/architecture/[relevant-doc].md
DEVELOPMENT_RULES.md rule being violated: Rule [N] — [rule name]

Bug description: [describe the issue]
Expected behaviour: [describe correct behaviour per architecture docs]

Fix the bug without changing the overall architecture or bypassing any rules in DEVELOPMENT_RULES.md.
```

### Pattern 5: Python AI Service Build

```
Build the [ServiceName] Python FastAPI service for iRexPro.

Architecture specification: @docs/architecture/10-ai-trading-architecture.md
Section: [specific section]

Tech stack: Python 3.11, FastAPI, pandas-ta, XGBoost, Decimal module for financial values
Project location: services/[service-name]/

Build:
- main.py (FastAPI app)
- requirements.txt
- Dockerfile
- Data models (Pydantic v2)
- Core service logic per architecture spec
- pytest unit tests

Remember: This service generates signals only. It must not call the Execution Engine or Broker Adapter directly.
```

---

## Critical Review Checklist After Each Cursor Session

After Cursor generates code, review every file manually for:

### Trading/Risk Logic

- [ ] Risk Engine is called before any broker action
- [ ] No direct path from signal/strategy to execution exists
- [ ] Risk Engine errors default to REJECTED (fail closed)
- [ ] Kill switch is checked first in Risk Engine
- [ ] All risk rules from architecture doc are implemented

### Financial Calculations

- [ ] All monetary arithmetic uses `Decimal.js` or `decimal.Decimal`
- [ ] No `Number * Number` or `float * float` for money calculations
- [ ] Database columns are `DECIMAL(18,8)`, not `FLOAT`
- [ ] API responses return monetary values as strings

### Security

- [ ] Broker credentials are excluded from all DTOs (`@Exclude()`)
- [ ] No credential fields in any API response
- [ ] No hardcoded secrets or API keys
- [ ] Audit log entry created for all state changes

### Performance Fees

- [ ] Fee calculation only uses closed trade `realisedPnl`
- [ ] Deposit amounts are not in fee basis
- [ ] HWM logic: fee only on profit above HWM
- [ ] HWM updates only upward

### Subscription Gate

- [ ] AI trading activation checks subscription status server-side
- [ ] The check is in the service layer, not just the controller

---

## Module Build Order (Follow This Sequence)

Follow the sequence in IMPLEMENTATION_ROADMAP.md. Don't skip ahead.

**Why:** Later modules depend on earlier ones. Building the execution engine before the risk engine means the risk engine might be retrofitted incorrectly.

**Exceptions:**
- You may build the audit module at any point (it has no dependencies)
- You may build TypeScript type definitions (`packages/shared-types/`) at any point
- You may set up Docker Compose and CI pipeline independently

---

## Working With the AI Trading Pipeline

The signal-to-execution pipeline spans multiple modules and two languages (TypeScript + Python). The AI system is **core platform scope** — not a future feature. When building or modifying any part of this pipeline:

1. **Read all 5 pipeline architecture docs first:**
   - `@docs/architecture/10-ai-trading-architecture.md`
   - `@docs/architecture/11-risk-engine-architecture.md`
   - `@docs/architecture/12-execution-engine-architecture.md`
   - `@docs/architecture/09-broker-integration-architecture.md`
   - `@docs/architecture/06-bounded-contexts.md`

2. **State the change clearly:** "I am adding X to the [specific stage] of the pipeline."

3. **Verify the invariant is preserved:** After any change, trace the full pipeline mentally:
   ```
   Market Data → Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker
   ```
   The Risk Engine must still be the only path forward.

---

## Working With Payment and SMS Providers

The payment and SMS systems use pluggable provider architectures. All providers are interchangeable implementations of interfaces.

1. **Read provider architecture docs first:**
   - `@docs/architecture/21-payment-provider-architecture.md`
   - `@docs/architecture/22-sms-provider-architecture.md`
   - `@docs/architecture/23-country-and-regional-configuration.md`

2. **Never write direct provider SDK calls in services.** All payment operations go through `PaymentProviderRouter → IPaymentProvider`. All SMS operations go through `SmsProviderRouter → ISmsProvider`.

3. **Webhook handlers always validate signatures first.** Raw body must reach the validator before JSON parsing.

4. **ManualPaymentProvider is for development and testing only.** If Cursor uses it in non-test code paths for commercial use, reject it.

5. **Country routing is always via `CountryConfigService`.** Never hardcode `if (country === 'GH')` in business logic.

**Context to load for payment/SMS sessions:**
```
@docs/architecture/21-payment-provider-architecture.md
@docs/architecture/22-sms-provider-architecture.md
@docs/architecture/23-country-and-regional-configuration.md
@DEVELOPMENT_RULES.md  (Rules 16, 17, 18)
```

---

## Working With the Subscription and Revenue System

The subscription + performance fee system is core business logic. When building or modifying it:

1. **Read the subscription doc:**
   - `@docs/architecture/13-subscription-and-profit-sharing.md`

2. **Critical things to verify in generated code:**
   - Fee calculation uses only `realisedPnl` from closed trades — no floating P&L, no deposits
   - HWM only moves upward (never reset without explicit admin action + audit log)
   - Withdrawal adjustment uses `max(0, hwm - withdrawal_amount)` formula
   - Model A fee collection goes through the payment provider — NOT via broker account withdrawal
   - ManualPaymentProvider is never used for commercial subscriptions

3. **Test coverage requirement:** 100% branch coverage on `RevenueService.calculateFee()` — every path through the HWM logic must be unit-tested

---

## Git Workflow

```
main          — production-ready code only
develop       — integration branch
feature/*     — individual feature branches
hotfix/*      — emergency production fixes
```

Commit message format (Conventional Commits):
```
feat(risk-engine): add volatility score threshold check
fix(execution): handle broker timeout with exponential backoff
refactor(audit): convert to append-only service
test(revenue): add HWM boundary condition unit tests
docs(architecture): update risk engine rejection codes
```

---

## Testing Expectations Per Module

| Module | Coverage Target | Special Requirements |
|---|---|---|
| Risk Engine | 100% branches | Every rejection code must have a test |
| Fee Calculation | 100% branches | Deposit exclusion, HWM boundary tests required |
| Execution Engine | 95% branches | Idempotency concurrency test required |
| Auth Module | 90% branches | MFA flow tests required |
| Broker Adapter | 90% branches | Credential never-exposed test required |
| All others | 80% statements | Standard Jest coverage |
