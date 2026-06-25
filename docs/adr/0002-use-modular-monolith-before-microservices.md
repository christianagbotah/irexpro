# ADR 0002 — Use Modular Monolith Before Microservices

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Platform Architecture Team  
**Context:** Backend application architecture style selection

---

## Context and Problem Statement

iRexPro's backend architecture must support multiple distinct domains: authentication, broker integration, subscription management, AI signal processing, risk management, trade execution, performance reporting, and revenue management.

The primary architectural choice is between:

1. **Microservices from day one:** Each domain as a fully independent deployable service with its own database, deployed and scaled independently.

2. **Modular monolith first:** All domains built as isolated, well-bounded modules within a single deployable unit, with explicit contracts between modules that enable future extraction.

3. **Mini-services / selective separation:** Core domains in a monolith; AI/ML and broker services separate (due to different language/runtime requirements).

---

## Decision

**We will use a modular monolith for the NestJS backend, with Python AI services as separate processes from day one.**

Rationale for NestJS monolith: All TypeScript/NestJS domains are co-deployed but strictly module-isolated.  
Rationale for separate Python services: Python is required for AI/ML workloads (scikit-learn, PyTorch, pandas-ta). These cannot reasonably live in the NestJS process.

The monolith is designed with microservices extraction in mind:
- Each NestJS module has its own folder, controllers, services, repositories, DTOs, and events
- No circular dependencies between modules
- Modules communicate through defined service interfaces and internal events
- Database schema is namespaced per bounded context
- API contracts between modules are documented (enabling future REST-based service split)

---

## Reasoning

### Against Microservices From Day One

**Operational complexity:** Microservices require service discovery, distributed tracing, network-level error handling, inter-service authentication, and independent deployment pipelines. This overhead is significant for a team building the initial product.

**Premature optimisation:** The scaling boundaries of iRexPro are not yet known. Building microservices for hypothetical scale before real usage data exists is wasteful. Microservices are most valuable when services need to scale independently at different rates — unknown at launch.

**Distributed systems problems:** Microservices introduce distributed transactions, eventual consistency challenges, and network latency between services. For a trading system where the signal-to-execution chain is latency-sensitive, unnecessary network hops are undesirable.

**Team size:** The initial development team is small. Microservices work well for large organisations with multiple teams who need independent deployment velocity. A small team managing 10 independent services with their own databases, CI/CD pipelines, and observability is an operational burden.

### For Modular Monolith

**Speed:** One codebase, one deployment, shared in-process communication. Faster to build, test, and debug.

**Refactoring latitude:** When requirements change (they will), modifying module boundaries in a monolith is far simpler than changing service contracts across deployed microservices.

**Performance:** In-process function calls between modules are orders of magnitude faster than HTTP calls between services. The risk engine evaluating a signal can call the broker module synchronously without network overhead.

**Extraction path preserved:** Because modules are isolated with explicit interfaces, any module can be extracted into a microservice later by:
1. Exposing the module's interface as an HTTP API
2. Replacing in-process calls with HTTP client calls
3. Deploying the extracted module independently
No business logic needs to be rewritten — only the communication mechanism changes.

### Why Python AI Services Are Separate from Day One

- Python is required for numerical computing, ML libraries (scikit-learn, pandas-ta, PyTorch), and data processing
- Python and Node.js cannot share a process
- AI services have different runtime characteristics (CPU/memory intensive, separate scaling needs)
- This is a technology boundary, not a premature architecture boundary
- These services are always separate regardless of microservices vs. monolith decision

---

## Module Isolation Rules

The following rules enforce true module isolation within the NestJS monolith:

1. **No cross-module database queries** — each module queries only its own schema namespace
2. **No direct repository injection across modules** — modules access other domains via service interfaces only
3. **Events over tight coupling** — asynchronous domain events (via internal EventEmitter or Redis pub/sub) for cross-cutting concerns
4. **DTOs at module boundaries** — data crossing module boundaries uses explicit DTOs, never internal entity classes
5. **No circular dependencies** — enforced by NestJS module graph; validated by linter rule

---

## Consequences

### Positive

- Faster initial development and deployment
- Simpler debugging and local development experience
- Easier refactoring during early product evolution
- No distributed systems overhead in Phase 1
- Microservices extraction is possible later without business logic rewrite

### Negative

- Single deployment unit — a bug in one module can affect others (mitigated by testing)
- Cannot scale modules independently in Phase 1 (the whole API scales together)
- A very large team cannot work on truly independent services simultaneously

### Future Extraction Candidates

When the platform grows and scaling requirements become clear, the following modules are the most likely first extraction candidates:

1. **ExecutionEngine** — latency-critical, benefits from dedicated resources
2. **AISignalService** (NestJS side) — high event volume
3. **PerformanceModule** — heavy read workload for reporting queries
4. **AuditModule** — append-only, benefits from dedicated write-optimised service

---

## Related Decisions

- [ADR 0001](./0001-use-broker-connected-model-a-first.md) — Model A first
- [ADR 0003](./0003-use-risk-engine-before-execution.md) — Risk Engine as gateway
