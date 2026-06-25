# ADR 0001 — Use Broker-Connected Model A First

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Platform Architecture Team  
**Context:** iRexPro initial operating model selection

---

## Context and Problem Statement

iRexPro needs to determine its initial operating model for handling user funds and executing trades. Two principal models exist:

**Model A — Broker-connected, non-custodial:**
The platform connects to a user's own regulated broker account via API. The user's funds stay at their regulated broker. iRexPro instructs the broker to place, modify, and close trades on the user's behalf.

**Model B — Internal wallet, custodial:**
The platform holds user funds internally in iRexPro-managed wallets. The platform executes trades from its own master broker accounts, allocating capital per user. Users deposit into and withdraw from iRexPro directly.

The decision of which model to implement first has significant implications for:
- Regulatory complexity and licensing requirements
- Time to market
- Technical complexity
- Capital requirements
- Trust and liability

---

## Decision

**We will implement Model A (broker-connected, non-custodial) first.**

Model A will be the sole operating model for Phase 1 and Phase 2 of the platform. Model B will be designed, documented, and data-model-prepared in Phase 1 but not implemented until regulatory and business prerequisites are met.

---

## Reasoning

### Regulatory Simplification

Model B requires iRexPro to hold customer funds, which in most jurisdictions triggers:
- Electronic Money Institution (EMI) licence requirements
- Anti-Money Laundering (AML) programme obligations
- Know Your Customer (KYC) obligations at platform level
- Payment services licensing for deposit and withdrawal flows
- Potential securities or investment services licensing

Model A avoids all of the above in Phase 1. The user's broker — a regulated entity — holds their funds and performs its own KYC. iRexPro acts as a software service provider, not a financial institution.

### Speed to Market

Model B requires:
- Regulatory licensing (6–24 months depending on jurisdiction)
- Payment provider integrations and testing
- Full KYC/AML system build
- Internal wallet and double-entry ledger build
- Significant additional security surface

Model A allows the core AI trading technology, risk engine, and user experience to be validated with real users before adding financial custody complexity.

### Trust and Credibility

Users who connect their own regulated broker account retain full visibility and control of their funds. They can:
- See their balance at the broker at any time
- Close positions manually if desired
- Disconnect from iRexPro without losing access to their funds
- Trust that their broker's regulatory protections apply to their funds

This model aligns with how many professional algorithmic trading tools operate and is easier for users to understand and trust at launch.

### Risk Reduction

If iRexPro experiences a technical failure, security breach, or business disruption in Model A:
- User funds are protected at the regulated broker
- iRexPro's exposure is limited to operational and reputational risk

In Model B, any operational failure or security breach could directly affect user funds held by iRexPro, creating far greater liability.

---

## Consequences

### Positive

- Faster time to market for the core AI trading product
- Reduced regulatory burden in Phase 1
- Reduced technical complexity (no wallet, no payment processing, no KYC system to build)
- Reduced operational risk for users
- Modular design allows Model B to be layered on later

### Negative

- iRexPro cannot directly control deposit/withdrawal flows (user must manage their broker balance)
- Performance fee collection in Model A must be managed differently (invoice/external payment vs. automatic deduction from wallet)
- Broker API dependency — if the broker's API changes or becomes unavailable, trading is affected
- Less control over the end-to-end user financial experience

### Mitigations

- Performance fees in Model A are collected via the subscription billing system (invoice-based or separate charge)
- Broker adapter pattern ensures no single broker dependency
- Model B is architecturally pre-designed and data-model-ready, so the transition when needed is well-defined

---

## Related Decisions

- [ADR 0002](./0002-use-modular-monolith-before-microservices.md) — Modular monolith first
- [ADR 0003](./0003-use-risk-engine-before-execution.md) — Risk Engine as mandatory gateway
