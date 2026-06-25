# ADR 0003 — Risk Engine as Mandatory Pre-Execution Gateway

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Platform Architecture Team  
**Context:** AI signal to trade execution control flow design

---

## Context and Problem Statement

iRexPro is a fully autonomous AI trading platform. The AI Signal Engine generates trading signals that must ultimately result in orders being placed at a broker. The critical design question is: **what controls exist between a signal being generated and an order being placed at the broker?**

Two architectural approaches were considered:

**Option 1 — AI → Execution (Direct):**
The AI Signal Engine or Strategy Orchestrator directly instructs the Execution Engine to place orders. Risk rules are embedded in the signal generation logic.

**Option 2 — AI → Risk Engine → Execution (Mandatory Gateway):**
Every signal must pass through an independent Risk Engine as a mandatory, non-bypassable gateway before reaching the Execution Engine. The Risk Engine operates independently of the AI and applies its own validation logic.

---

## Decision

**The Risk Engine is a mandatory, non-bypassable gateway between AI signals and trade execution.**

No trade action (open, modify, close) may be submitted to the Execution Engine without a validated `APPROVED` decision from the Risk Engine. This is an architectural invariant, not a configuration option.

The flow is:

```
AI Signal Engine
  → Strategy Orchestrator
  → Risk Engine (MANDATORY — cannot be bypassed)
  → Execution Engine
  → Broker Adapter
```

---

## Reasoning

### Separation of Concerns — Intelligence vs. Safety

The AI Signal Engine's purpose is to identify profitable trading opportunities. Its objective function is return maximisation within a strategy. It must not be responsible for applying risk rules — this is a conflict of interest within the same component.

The Risk Engine's sole purpose is safety validation: enforcing limits, preventing excessive loss, ensuring broker connectivity, and protecting the user's capital. These two concerns are best separated into independent components.

### Defence Against AI Model Failure

AI/ML models can:
- Overfit to historical data and perform poorly on live markets
- Produce highly confident but incorrect signals during regime changes
- Generate an unusual number of signals during technical anomalies
- Produce signals with technically valid structure but dangerous position sizes

The Risk Engine catches all of these problems regardless of what the AI model does, because the Risk Engine operates on objective measurable quantities (current balance, open trade count, margin available) rather than probabilistic model outputs.

### Auditability and Accountability

Having a discrete Risk Engine with explicit, documented rules and an explicit APPROVED/REJECTED decision for every signal means:
- Every trade has a clear audit trail: signal → risk decision → execution
- Every non-trade has a clear explanation: risk rejection with specific code and reason
- Regulators and users can understand why any trade was or was not taken
- The AI model is not accountable for risk management — the Risk Engine is

### Kill Switch Centralisation

The global kill switch is enforced in the Risk Engine. This means a single place must be changed to halt all trading regardless of what the AI is doing. If risk rules were embedded in the AI layer, the kill switch would need to be implemented multiple places and could be bypassed by a model that didn't check it.

### Future Model Changes

AI models will be retrained, versioned, and swapped over the platform's lifetime. If risk rules were embedded in the AI layer, every model change would require re-verification of all risk controls. With a separate Risk Engine, model changes are validated only for signal quality — risk controls are independent and unchanged.

### Fail-Closed Requirement

When the Risk Engine encounters a system error (exception, timeout, database failure), it returns `REJECTED` with code `RISK_ENGINE_ERROR`. Trading is halted, not continued. This is only possible with a discrete gateway — if risk checks were embedded in the execution path, a risk check exception would be ambiguous (does it mean proceed or halt?).

---

## Implementation Requirements

This decision creates the following implementation requirements:

1. **No direct path from Strategy Orchestrator to Execution Engine** — the Orchestrator may only emit signals to the Risk Engine

2. **Risk Engine must be the only entity that emits `RiskApproved` events** — the Execution Engine only acts on `RiskApproved` events

3. **Risk Engine errors always return `REJECTED`** — exception handling must never default to approval

4. **Kill switch is checked first** — before any other risk evaluation, saving computational cost and ensuring instant halt

5. **Risk Engine is stateless per evaluation** — it fetches all required context on each call (does not carry state between evaluations) to prevent stale data from bypassing limits

6. **Risk Engine test coverage: 100% branch coverage** — every approval and rejection code path is tested

---

## Consequences

### Positive

- Clear separation between intelligence (AI) and safety (Risk Engine)
- Kill switch centralisation at one point
- Every trade decision is fully auditable
- Model changes do not require risk rule review
- Fail-closed on system errors
- Risk rules can be updated independently of AI strategy

### Negative

- Added latency in the signal-to-execution chain (Risk Engine evaluation adds ~5–20ms)
- Two systems must be healthy for trading to function (both AI and Risk Engine)
- Requires explicit event-driven or synchronous integration between Strategy Orchestrator and Risk Engine

### Mitigations

- Latency of ~5–20ms is acceptable for the trading style iRexPro targets (not high-frequency trading)
- Risk Engine health is monitored and alerted — failure halts trading safely
- Integration is straightforward: synchronous REST call from Orchestrator to Risk Engine (or internal NestJS service call in Phase 1)

---

## Related Decisions

- [ADR 0001](./0001-use-broker-connected-model-a-first.md) — Model A first
- [ADR 0002](./0002-use-modular-monolith-before-microservices.md) — Modular monolith
- [ADR 0004](./0004-use-high-water-mark-for-performance-fees.md) — High-water mark fees
