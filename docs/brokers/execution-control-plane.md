# Execution Control Plane — Emergency Controls Runbook

> Sprint 50 — server-side emergency control plane (Directive §28).
> Implementation: `apps/api/src/modules/execution-control/`.

## Purpose

Give operators an immediate, audited, fail-closed way to stop automated
execution at four scopes:

| Scope | Effect | scopeKey |
| --- | --- | --- |
| `GLOBAL` | Blocks ALL execution platform-wide | null |
| `PROVIDER` | Blocks execution through one broker provider | brokerId (e.g. `metatrader5`) |
| `USER` | Blocks one user's execution | userId |
| `BROKER_CONNECTION` | Blocks one specific connection | brokerConnectionId |

## Semantics

1. **Presence = disabled.** A control row in `platform.execution_controls`
   means execution is blocked at that scope. Clearing a control deletes the
   row. There is no ambiguous "enabled/disabled" flag.
2. **Cascade order:** GLOBAL → PROVIDER → USER → BROKER_CONNECTION. The first
   active control wins and is reported to the caller.
3. **Fail closed (critical):** if the control store cannot be read (DB
   outage), every permission check reports blocked with reason
   `EXECUTION_CONTROL_STORE_UNAVAILABLE`. Execution is NEVER permitted on an
   unreadable control plane.
4. **Immediate effect on new work:** the check runs as Risk pipeline Step
   1a-pre — before kill switch, before broker checks, before any provider
   dispatch. Every new signal/AI decision is gated.
5. **In-flight requests:** a provider request already dispatched before
   activation is NOT cancelled by the control plane. Its result flows through
   the existing execution reconciliation path (uncertain-result handling,
   `TRADE_RECONCILIATION_PENDING`). This is the documented boundary.
6. **Expiry:** controls may carry `expiresAt` (maintenance windows). Expired
   controls are ignored and cleaned lazily.

## API (ADMIN / SUPER_ADMIN only — RBAC via RolesGuard)

```
GET    /api/v1/execution-control/status     → list active controls
POST   /api/v1/execution-control/activate   → { scope, scopeKey?, reason, expiresAt? }
DELETE /api/v1/execution-control/:id        → clear a control
```

All mutations are audited (`EXECUTION_CONTROL_ACTIVATED` / `_DEACTIVATED`,
CRITICAL/WARNING severity) and broadcast on the realtime event
`execution.control.changed`.

## Risk pipeline integration

When a control blocks a signal, the trade is REJECTED with the structured
rejection code `EXECUTION_CONTROL_ACTIVE` and an audit record
`EXECUTION_CONTROL_BLOCKED` is written. Users see the rejection through the
existing risk-violation surfaces; the global control inventory is
admin-only.

## Suggested operational procedures

- **Provider outage (e.g. MetaApi degraded):** activate
  `PROVIDER`/`metatrader5` with reason; deactivate once health checks are
  green again.
- **Suspected account compromise:** activate `USER`/`<userId>`, then
  investigate via audit trail; revoke broker authorization as needed
  (`POST /broker/connections/:id/revoke-authorization`).
- **Global incident:** activate `GLOBAL`; consider also triggering the
  existing per-user kill switches.
- **Maintenance window:** activate with `expiresAt` so a forgotten control
  cannot wedge execution indefinitely.

## Test evidence

`apps/api/src/modules/execution-control/execution-control.spec.ts` covers:
cascade precedence, fail-closed behavior on store failure, expiry handling,
duplicate-activation conflicts, scopeKey validation, deactivation, audit
integrity (no secrets), and the throwing `assertExecutionAllowed` gate.
