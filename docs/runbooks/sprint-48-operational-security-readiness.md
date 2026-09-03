# Sprint 48 — Operational Security Readiness

This runbook defines the evidence required before iRexPro may be considered for
production promotion. It covers authentication security evidence, secret
rotation, backup restoration, incident response, rollback verification, and
release sign-off. It does not authorize a production deployment or enable
broker, funding, trading, execution, strategy, model, position-sizing,
allocation, or risk behavior.

## 1. Promotion status

Production promotion remains **NO-GO** until every operational control in this
document has an accountable owner, dated evidence, and an independent reviewer.
Staging health or merged code alone is not production approval.

The previous Sprint 48 server-side authentication-revocation blocker is now
closed at the application layer. The following controls are merged to `main`:

| Control | Evidence | Merge SHA |
| --- | --- | --- |
| Refresh rotation, replay rejection, server-side session revocation, logout/reset invalidation, HTTP/WebSocket enforcement | PR #84 | `bd58601de864fe6015ad7c360932332dfb553b8e` |
| Login abuse protection and temporary account lockout | PR #85 | `799f95c9f19d87de2da263d3951fe0a9d4690355` |
| Server-owned request correlation and centralized audit metadata redaction | PR #86 | `e9b3836d49053b1db14d034df234069cf9df55e5` |
| Runtime HTTP rate-limit verification for every currently exposed public auth route | PR #87 | `3f5a88dc10461965e2cedf9d91e34b07deccdd99` |

These merges do **not** complete operational readiness. Secret rotation and
backup-restoration evidence still require execution by the authorized operators
in the target environment. MFA challenge/enrolment and email/phone verification
HTTP endpoints are not currently exposed; if production policy requires those
features, they remain a separate release prerequisite and must receive explicit
rate limits and adversarial tests before activation.

The release record must identify:

- the immutable candidate Git SHA;
- the last known-good rollback SHA;
- exact-head CI/security workflow run identifiers for the candidate;
- the operator and independent reviewer;
- the backup artifact identifier and restoration-rehearsal result;
- each secret-rotation result, without recording secret values;
- unresolved security exceptions and their approving owner, if exceptions are
  permitted by organizational policy;
- the final go/no-go decision and timestamp.

## 2. Exact-head release verification

Never promote a candidate using workflow results from a superseded commit.
Before a go/no-go decision:

1. record the exact candidate SHA;
2. verify the pull request/release branch still points to that SHA;
3. verify required API CI, migration/database compatibility, concurrency,
   Release Security, dependency, secret-scan, SBOM, and CodeQL checks that are
   applicable to the candidate are green on that exact SHA;
4. record the run IDs or immutable evidence links in the release record;
5. verify no commit was pushed after the evidence was collected;
6. if the SHA moves, discard the prior gate decision and repeat verification.

A green check belonging to an older head is not release evidence for a newer
candidate.

## 3. Authentication security evidence

### 3.1 Implemented controls

The current authentication design uses a persisted `session_version` on the
user record. Access and refresh JWTs carry the version and token type.
Server-side validation rejects stale generations and incorrect token types.

Verified behaviors include:

- refresh advances the server-side generation atomically;
- replay/concurrent reuse of an old refresh generation is rejected;
- logout advances the generation and invalidates previously issued tokens;
- password reset advances the generation in the same transaction as the
  password change;
- stale access tokens are rejected by HTTP authentication;
- refresh JWTs cannot be used as bearer access tokens;
- WebSocket handshakes enforce token type, account status, and session version;
- repeated invalid passwords trigger persistent temporary lockout;
- login failures return generic responses and avoid raw identifier/password
  values in audit metadata;
- public auth endpoints have explicit per-route throttles and HTTP-level tests
  prove the first request over each limit returns `429`;
- request and audit records use server-generated correlation IDs;
- audit metadata is recursively passed through the shared sensitive-field
  redaction policy before persistence.

### 3.2 Current public authentication rate limits

| Endpoint | Limit |
| --- | ---: |
| `POST /auth/register` | 10 / 15 minutes / IP |
| `POST /auth/login` | 10 / minute / IP |
| `POST /auth/refresh` | 60 / minute / IP |
| `POST /auth/forgot-password` | 5 / 15 minutes / IP |
| `POST /auth/reset-password` | 10 / 15 minutes / IP |

See `docs/security/auth-rate-limit-policy.md` for the runtime-test contract.

### 3.3 Remaining authentication prerequisite

The data model contains MFA/verification-related fields, but the current loaded
API does not expose MFA challenge/enrolment or email/phone verification HTTP
flows. Do not mark those controls complete based on dormant fields.

If production policy requires MFA or verification, the release remains NO-GO
until the required flows are implemented and independently verified with:

- secret-safe storage and lifecycle rules;
- send/challenge/verify rate limits;
- replay/expiry/attempt-limit tests;
- account-recovery interactions;
- audit events with correlation IDs and no secret values.

## 4. Secret inventory and ownership

Maintain an out-of-repository secret inventory containing only secret names,
owners, providers, environments, creation dates, expiry dates, and rotation
status. Never record secret values in the inventory or release evidence.

At minimum, classify these secret families:

| Secret family | Required owner | Rotation validation |
| --- | --- | --- |
| Database credentials | Database operator | New credential connects; old credential is rejected |
| Redis credentials | Platform operator | Readiness succeeds; old credential is rejected |
| JWT and cookie signing keys | Identity owner | New sessions validate; retired keys follow the approved grace policy |
| Internal service credentials | Platform operator | Authorized internal health succeeds; old credential is rejected |
| Encryption keys | Security owner | Key version is recorded and a controlled decrypt/re-encrypt test passes |
| Notification/provider keys | Integration owner | Provider test succeeds without exposing message contents or credentials |

Broker, payment, and live-market credentials are outside this runbook's
execution scope. Their rotation requires the appropriately authorized
engineering and compliance owners.

## 5. Controlled secret-rotation procedure

### Prerequisites

- immutable candidate SHA recorded;
- current backup and restore evidence accepted;
- maintenance window approved;
- accountable operator and independent reviewer assigned;
- old and new secret version identifiers available without exposing values;
- service-specific rollback route confirmed before rotation begins.

### Execution record

Use a separate record for each secret family. The record must contain:

1. change identifier and approved maintenance window;
2. accountable operator and independent reviewer;
3. affected services and expected user impact;
4. pre-change health and backup evidence;
5. new secret version identifier (never the value);
6. validation result for the new version;
7. confirmation that the previous version was revoked or an approved grace
   period was documented;
8. post-change health, log-redaction, and alerting evidence;
9. rollback decision and final status.

### Verification

Verify only the minimum behavior required for the rotated family. Examples:

- identity signing keys: new login/refresh succeeds and stale/revoked sessions
  behave according to the approved key/session policy;
- database/Redis credentials: readiness succeeds with the new credential and
  the retired credential is rejected after the approved cutover;
- internal API credentials: authorized health succeeds and the previous
  credential is rejected after cutover.

Review logs and audit records to ensure secret values were not emitted.

### Rollback

Rollback is service-specific. Restore the previously approved secret version
only if it remains safe to do so; otherwise invoke the incident-response path
and issue a new replacement secret. Record the rollback decision and the health
checks performed afterwards.

Stop the rotation if the backup is unverified, the candidate SHA is unknown,
the new credential cannot be validated, or logs expose secret material.

## 6. Backup acceptance criteria

A backup is acceptable only when it is:

- encrypted at rest and in transit;
- stored outside the application checkout;
- access-controlled and retained under an approved policy;
- tied to an environment, creation time, database version, and schema state;
- accompanied by an integrity digest;
- restorable into an isolated non-production environment;
- free of credentials in filenames, command output, screenshots, and tickets.

A successful backup command is not proof of recoverability. Only a completed
restore rehearsal satisfies this gate.

## 7. Non-destructive restoration rehearsal

The restoration rehearsal must use an isolated non-production target with no
route to production services or external providers.

### Prerequisites

- approved backup artifact and digest;
- source database/version identified;
- isolated target with outbound side effects disabled;
- restore operator and independent reviewer assigned;
- application candidate SHA and migration state recorded;
- cleanup plan for the restored copy approved.

### Rehearsal

Record the following evidence:

1. backup identifier, digest, creation time, and source database version;
2. isolated target identifier and responsible operator;
3. restoration start and completion times;
4. schema/migration compatibility result;
5. safe record-count and referential-integrity checks;
6. application liveness and readiness results using disabled external
   integrations;
7. confirmation that no email, SMS, payment, broker, or execution side effect
   was possible;
8. measured recovery time and comparison with the approved recovery objective;
9. cleanup confirmation for the isolated restored copy;
10. reviewer sign-off.

### Verification and rollback

A rehearsal passes only if the restored database is usable by the expected
application version, integrity checks pass, no external side effect is possible,
and the isolated copy is cleaned up according to policy. A failed rehearsal is
itself release evidence: classify the failure, preserve sanitized diagnostics,
and keep production promotion blocked until a later rehearsal succeeds.

Do not restore over a production database as a rehearsal. Do not copy restored
data into developer laptops or attach it to GitHub issues or CI artifacts.

A synthetic CI restore using disposable data is useful for testing the restore
procedure, but it does **not** replace a rehearsal using an approved target-
environment backup artifact.

## 8. Incident severity and ownership

| Severity | Examples | Required response |
| --- | --- | --- |
| SEV-1 | Confirmed credential disclosure, unauthorized access, integrity loss | Contain immediately, preserve evidence, notify security owner, block promotion |
| SEV-2 | Persistent readiness failure, repeated crashes, failed security control | Stop promotion, assign incident lead, investigate and retest |
| SEV-3 | Degraded non-critical function with safe fallback | Track, assess impact, and require owner approval before promotion |

Every incident must name an incident lead, communications owner, technical
owner, evidence custodian, and final decision-maker. The incident record must
use sanitized identifiers and must never include tokens, credentials, reset
codes, private keys, full connection strings, or raw sensitive payloads.

## 9. Incident lifecycle

1. **Detect:** record the time, safe symptom, affected environment, correlation
   ID where available, and source.
2. **Classify:** assign severity and owners.
3. **Contain:** isolate the affected component and block promotion.
4. **Preserve:** retain sanitized logs, correlation/audit identifiers, immutable
   SHAs, workflow identifiers, and relevant audit-event identifiers.
5. **Recover:** use the last verified release and approved data-recovery plan.
6. **Validate:** repeat exact-head CI, security, readiness, and smoke gates.
7. **Review:** document root cause, corrective actions, owners, and due dates.

## 10. Rollback verification

Before any promotion, confirm that the last known-good SHA still has retained
release evidence and remains compatible with the current database state.

### Prerequisites

- candidate and rollback SHAs recorded;
- database compatibility decision recorded;
- required secrets/key versions available under the rollback policy;
- rollback operator and independent reviewer assigned.

### Verification evidence

Rollback evidence must include:

- candidate SHA and last known-good SHA;
- reason for rollback;
- database compatibility decision;
- affected services;
- liveness/readiness results after recovery;
- confirmation that secret and dependency scans correspond to the restored
  code SHA;
- start/end timestamps and operator/reviewer sign-off.

Database reversal is a separate, explicitly approved decision. Application
rollback must never automatically trigger a destructive database rollback.

## 11. Evidence location and retention

Keep release evidence in the approved operations/security evidence store, not
inside the application repository when it contains environment-specific data.
The repository may contain templates and sanitized runbook references only.

For every evidence item record a stable identifier or link in the release
record. Required categories are:

- exact-head CI/security runs;
- secret-rotation records;
- backup artifact metadata and integrity digest;
- restoration-rehearsal record;
- incident/exception records, if any;
- rollback rehearsal or validation evidence;
- final operator/reviewer sign-off.

Never upload database backups, private logs containing customer data, secret
values, provider payloads, or raw production environment files to GitHub.

## 12. Go/no-go decision

The decision is **NO-GO** if any required evidence is missing, any exact-head
gate is non-green, backup restoration has not been demonstrated, a material
incident remains open, secrets appear in evidence, the deployed SHA cannot be
proven, or any production-required MFA/verification control remains absent.

The authentication session-revocation blocker described in the original Sprint
48 runbook is closed by PR #84 and its subsequent security slices; it is no
longer a reason by itself to hold promotion.

The decision may become **GO** only after all applicable gates are green for one
immutable candidate, operational evidence is complete, and the authorized
operators and independent reviewer sign the release record.

## 13. Related runbooks and evidence contracts

- `docs/security/auth-rate-limit-policy.md`
- `docs/runbooks/sprint-47-production-release-security-health.md`
- `docs/runbooks/production-deployment-vps-webuzo.md`
- `docs/runbooks/secrets-never-committed.md`
