# Sprint 50 — Live Account Foundation

> Branch: `feat/live-account-foundation` (from `main` @ `7ac0e35`)
> Scope: Live Account vertical slice #1 — broker account / authorization /
> credential foundation + emergency control plane (Directive §10, §11, §14,
> §15, §16, §28, §48).

## What this sprint delivers

### 1. Broker authorization state machine (Directive §15)

The live-account activation gate was previously two booleans
(`demoValidated` / `liveTradingEnabled`) — and `demoValidated` was **never
set anywhere in the API**, making the DEMO-before-LIVE invariant unreachable
in practice.

Now:

- `broker.broker_connections.authorization_status` — 12-state explicit
  server-side state machine:
  `NOT_CONNECTED, CONNECTING, CONNECTED, VERIFYING, AUTHORIZATION_REQUIRED,
  AUTHORIZED, READY, ACTIVE, SUSPENDED, REVOKED, ERROR, DISCONNECTED`
- Transitions validated by `BrokerAuthorizationStateMachine` (pure,
  centralized, exhaustive table). Arbitrary mutation is impossible; DB CHECK
  constraints back the enum.
- **Only `ACTIVE` is executable** — `isExecutable()` fails closed on
  null/unknown states.
- `ACTIVE` is reachable ONLY through the explicit `enable-live-trading`
  endpoint (LIVE accounts, registry LIVE support, prior validated DEMO, user
  action).
- A successful **DEMO handshake now completes demo validation**
  (`CONNECTING → AUTHORIZED` + `demoValidated=true` dual-write), fixing the
  unreachable gate.
- Legacy booleans dual-written for backward compatibility; the state machine
  is authoritative.
- New endpoints: `POST :id/revoke-authorization` (→ REVOKED, fail-closes
  liveTradingEnabled), plus state-machine-aware connect/disconnect/health.

### 2. Credential lifecycle (Directive §14)

- `credential_status`: `CREATED → VERIFIED → ROTATED / REVOKED / EXPIRED /
  INVALID`.
- Auth-class connect failures mark credentials `INVALID`.
- New endpoint `POST :id/rotate-credentials` — validates the NEW credential
  set against the provider BEFORE replacing ciphertext; on failure the old
  set is kept. No plaintext ever persisted or returned.

### 3. Broker provider registry + capability model (Directive §L/§M/§N/§AF/§AU)

- `GET /api/v1/broker/registry` — the single server-authoritative broker
  catalog (web/admin/mobile must render it; no client-side lists).
- Capability model (`BrokerCapability`, 24 capabilities) + connection routes
  (`BrokerConnectionRoute`) per broker — no fake per-platform broker entries.
- **Status honesty:** a catalog entry without a registered runtime adapter
  can never be reported `SUPPORTED` (runtime downgrade, tested).
- `createConnection` now gates environment support through the registry
  (paper-broker LIVE is rejected by design — environment isolation).
- Catalog: metatrader5 (SUPPORTED), paper-broker (SUPPORTED, DEMO-only),
  oanda (NOT_STARTED), ctrader (PARTNER_APPROVAL_REQUIRED).
- `docs/brokers/provider-matrix.md` — evidence-based matrix + research
  checklist (Directive §AC/§BD).

### 4. Emergency control plane (Directive §28)

- New module `execution-control` + `platform.execution_controls` table.
- Scopes: GLOBAL / PROVIDER / USER / BROKER_CONNECTION, cascade
  precedence, **fail closed** on unreadable store.
- Integrated into the Risk pipeline as **Step 1a-pre** (before kill switch)
  with structured rejection code `EXECUTION_CONTROL_ACTIVE` + audit record
  `EXECUTION_CONTROL_BLOCKED`.
- Admin API (RBAC + audit + realtime event):
  `GET /execution-control/status`, `POST /execution-control/activate`,
  `DELETE /execution-control/:id`.
- Runbook: `docs/brokers/execution-control-plane.md` (includes in-flight
  request boundary documentation).

### 5. LIVE authorization gate in the risk pipeline (Directive §16)

Risk Step 1c: when the user's active connection is a LIVE account, execution
requires `authorizationStatus === ACTIVE`. DEMO/PAPER behavior is unchanged
(they were never live-execution paths). Unknown states fail closed.

### 6. Security hardening

- **WebSocket gateway CORS wildcard removed** — the realtime gateway now uses
  the same fail-closed `parseCorsOrigins` allowlist as the HTTP API
  (`CORS_ORIGINS`). Previously `origin: '*'` let any origin open a socket.
- New realtime events: `broker.connection.authorization_changed`,
  `execution.control.changed` (safe payloads only).

### 7. Shared types (Directive §AU)

`@irexpro/types`: `BrokerAuthorizationStatus`, `BrokerCredentialStatus`,
new `BrokerConnectionView` fields, and the `./broker-registry` subpath
(`BrokerRegistryCatalog`, `BrokerRegistryEntry`, capabilities, routes,
statuses) consumed identically by web/admin/mobile.

## Migrations

1. `1753400000000-AddBrokerAuthorizationStateMachine` — adds
   `authorization_status` (12-state CHECK), `credential_status` (6-state
   CHECK), `authorized_at`, `authorization_revoked_at`; conservative
   fail-closed backfill from legacy booleans (most privileged state first).
2. `1753500000000-CreateExecutionControls` — `platform.execution_controls`
   with scope CHECK constraints, one-active-per-scope unique index
   (NULL-safe via COALESCE), expiry index.

## Test evidence

- New suites: `broker-authorization-state-machine.spec.ts`,
  `broker-authorization-lifecycle.spec.ts`,
  `broker-provider-registry.spec.ts`, `execution-control.spec.ts`.
- Full API suite: **131 suites / 1538 tests passing** (baseline: 127/1474 —
  +4 suites, +64 tests, 0 regressions).
- Lint: 0 errors (122 pre-existing warnings in untouched legacy specs).
- `pnpm api:build`: clean.

## Known limitations / next steps

- GitHub push from this environment was blocked (no credentials); the branch
  is commit-ready locally and must be pushed by an operator (see the
  delivery report).
- Web/admin UI for the new endpoints (revoke, rotate, registry catalog,
  control-plane panel) is the next vertical slice — the API surface here is
  complete and typed.
- cTrader/OANDA adapters remain NOT_STARTED by design (research/partner
  approval first — see provider matrix).
- AI-engine live mode remains separately gated (out of scope for this slice).
