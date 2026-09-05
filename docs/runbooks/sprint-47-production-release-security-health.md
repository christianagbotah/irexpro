# Sprint 47 — Production Release Security & Health Runbook

This runbook defines the release-security and health-readiness gate for iRexPro production candidates. It supplements `production-deployment-vps-webuzo.md` and implements Issue #59 without changing broker order submission, strategy logic, execution behavior, or risk overrides.

Sprint 48 operational evidence, secret rotation, restoration rehearsal, incident
ownership, and final sign-off are defined in
`sprint-48-operational-security-readiness.md`. Both runbooks must pass before a
production promotion is considered.

## 1. Release boundary

A release candidate is eligible for promotion only when all evidence is tied to one immutable Git commit SHA. Never promote from a mutable branch name alone.

For the current staging/release-hardening scope:

- `METAAPI_TOKEN` remains unset.
- `AI_ENGINE_SCHEDULER_ENABLED=false`.
- `PAYSTACK_ENABLED=false`.
- `STRIPE_ENABLED=false`.
- The AI engine remains internal-only and paper-mode only.
- No deployment step in this runbook enables broker order submission or changes execution/risk behavior.

## 2. Required exact-head CI gates

The exact release-candidate SHA must have all of the following green:

1. API CI — lint, unit tests, build.
2. Database Migration Compatibility.
3. Risk Execution Concurrency regression suite.
4. UI E2E — Web and Admin responsive Playwright suites and retained evidence.
5. Release Security workflow:
   - VPS Production Dependency Audit.
   - Tracked Source Secret Scan.
   - CodeQL Static Analysis.
   - Python Lock Integrity & Audit.
   - CycloneDX SBOM.

A green result from an older SHA is not sufficient. Any commit after a green run invalidates the previous exact-head release evidence and requires the gates to run again.

## 3. Dependency and supply-chain evidence

### Node / pnpm

- Repository package manager is pinned to `pnpm@10.34.5`.
- Production candidates install with `pnpm install --frozen-lockfile`.
- The committed `pnpm-lock.yaml` is the dependency-resolution authority.
- High or critical advisories affecting VPS deployable roots (`apps/api`, `apps/web`, `apps/admin`) block release.
- Do not suppress or exclude a deployable advisory merely to make the gate green.

### Python AI engine

- Python production dependencies are controlled by `services/ai-engine/requirements.lock`.
- Production installation uses hashes and must not resolve unbounded versions at deploy time.
- The Release Security workflow recompiles the lock deterministically and verifies that the committed lock is current before auditing it.

### GitHub Actions

- Workflows use least-privilege permissions.
- Critical reusable actions are pinned to immutable commit revisions.
- Release workflows are read-only except for narrowly scoped, explicitly temporary maintenance work; any temporary write-capable workflow must be removed before the release candidate is accepted.

## 4. Security evidence retained per candidate

Retain the workflow artifacts associated with the exact candidate SHA:

- Full pnpm production dependency audit JSON.
- VPS-deployable filtered dependency audit JSON.
- Python dependency audit evidence.
- Python deterministic lock evidence.
- CycloneDX SBOM.
- UI E2E reports/evidence where produced.
- Any failure artifacts produced by required workflows.

The artifact set is part of the release record. A candidate without the expected evidence is held even if the application appears healthy manually.

## 5. Health contracts

The public health routes intentionally return status-oriented payloads only. Detailed application version, runtime environment, PostgreSQL state, Redis state, hostnames, connection details, and other operational topology must not be exposed to unauthenticated callers. Dependency checks still run internally; the public readiness result communicates their aggregate outcome through status and HTTP semantics.

### `GET /api/v1/health/live`

Purpose: process liveness only.

Expected healthy response:

- HTTP 2xx.
- body exactly `{"status":"alive"}` modulo JSON whitespace/formatting.
- no dependency, version, environment, host, or connection metadata.

Use liveness to detect a process that is no longer serving requests. Do not use it as proof that dependencies are ready.

### `GET /api/v1/health/ready`

Purpose: aggregate dependency readiness.

Expected ready response:

- HTTP 2xx.
- body exactly `{"status":"ready"}` modulo JSON whitespace/formatting.

Expected unready response:

- HTTP 503.
- response status communicates `not_ready` without naming or describing the failed dependency.
- no exception stacks, credentials, DSNs, internal hostnames, tokens, versions, environments, database identity, Redis identity, or secret values.

Use server-side logs/approved operational diagnostics to investigate which dependency is unavailable. Do not weaken the public response contract for troubleshooting convenience.

### `GET /api/v1/health`

Purpose: compatibility aggregate.

Expected healthy state is HTTP 2xx with `status: "ok"`. A dependency problem may produce `status: "degraded"`, but the public payload remains status-only and `/health/ready` remains the authoritative promotion/readiness probe.

## 6. Pre-promotion verification

Before promoting an immutable candidate SHA:

```bash
EXPECTED_SHA="<verified-candidate-sha>"

git fetch origin
git checkout main
git pull --ff-only origin main

ACTUAL_SHA="$(git rev-parse HEAD)"
printf 'Expected: %s\nActual:   %s\n' "$EXPECTED_SHA" "$ACTUAL_SHA"

test "$ACTUAL_SHA" = "$EXPECTED_SHA"
pnpm install --frozen-lockfile
```

Do not continue if the checkout is dirty, the fast-forward fails, or the SHA differs from the verified candidate.

## 7. Health verification after process start/restart

Use local loopback for dependency-aware API verification before relying on the public proxy. These commands rely on HTTP status and the minimal status contract; they must not require detailed dependency fields:

```bash
curl -fsS http://127.0.0.1:3010/api/v1/health/live
curl -fsS http://127.0.0.1:3010/api/v1/health/ready
curl -fsS http://127.0.0.1:3010/api/v1/health
```

Then verify the public API path:

```bash
curl -fsS https://irexpro.lightworldtech.com/api/v1/health/live
curl -fsS https://irexpro.lightworldtech.com/api/v1/health/ready
```

Do not expose the AI engine, PostgreSQL, Redis, or internal service ports publicly.

## 8. Release hold criteria

Hold the release immediately if any of the following is true:

- Exact-head required workflow is missing, pending, cancelled, or failed.
- High/critical production vulnerability remains in a VPS-deployable dependency path.
- Committed Node or Python lock evidence is stale or non-reproducible.
- Secret scan fails or reports a tracked credential/token.
- CodeQL required analysis fails.
- SBOM generation/evidence is missing.
- API build, UI build, migration compatibility, concurrency, or responsive E2E gate fails.
- `/health/ready` is non-2xx after the normal startup window.
- Required dependency readiness remains unavailable, as confirmed through approved internal diagnostics.
- Public health output exposes version/environment details, named dependency state, secrets, internal hosts, stack traces, or connection strings.
- VPS checkout SHA does not equal the verified candidate SHA.
- A temporary write-capable CI maintenance workflow still exists in the candidate.

Do not waive a hold criterion by editing the scanner/filter to hide the finding.

## 9. Rollback criteria

Rollback to the last verified immutable release SHA when a promoted candidate causes any of the following:

- persistent readiness failure after process restart;
- PM2 restart loop or repeated unexpected process exits;
- database/schema and application version mismatch;
- Web/Admin public smoke regression that blocks normal access;
- API health regression;
- security evidence mismatch between the deployed SHA and the approved candidate;
- newly discovered credential exposure attributable to the candidate.

## 10. Immutable rollback procedure

Record the last known-good SHA before promotion. Roll back by checking out that immutable SHA, restoring its frozen dependencies/build output as required, and restarting only the affected services.

Example verification skeleton:

```bash
ROLLBACK_SHA="<last-known-good-verified-sha>"

git fetch origin
git checkout --detach "$ROLLBACK_SHA"
test "$(git rev-parse HEAD)" = "$ROLLBACK_SHA"
pnpm install --frozen-lockfile
```

Run the same local liveness/readiness/public smoke checks after rollback. Do not declare rollback complete until `/health/ready` is healthy and the deployed SHA is recorded.

Database rollback is not automatic. If a candidate includes schema migrations, use the migration-specific rollback decision/evidence from the deployment runbook and database backup policy. Never run destructive database rollback merely because an application process restart failed.

## 11. Credential and secret boundaries

- Never place real secrets in Git, workflow YAML, build logs, screenshots, SBOM metadata, health responses, or audit artifacts.
- Environment files on the VPS remain outside source control and must be preserved across application code updates.
- Broker credentials remain encrypted at rest and must not be copied into release evidence.
- GitHub Actions evidence should contain package/component metadata only, not environment secret values.
- If a tracked secret is detected, stop promotion, rotate/revoke the credential through its provider, remove it from source/history as appropriate, and rerun the complete exact-head release gate.

## 12. Release evidence record

For every accepted candidate record at minimum:

- release candidate Git SHA;
- merge/PR identifier;
- timestamp of approval;
- exact-head workflow run IDs and conclusions;
- SBOM artifact identifier/digest;
- dependency-audit artifact identifier/digest;
- liveness/readiness verification result;
- deployed SHA verification;
- previous known-good rollback SHA.

The release is not considered complete until the deployed SHA and release evidence match.
