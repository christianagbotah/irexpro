# Sprint 48 — Operational Security Readiness

This runbook defines the evidence required before iRexPro may be considered for
production promotion. It covers authentication security evidence, notification
provider readiness, CI provenance, secret rotation, backup restoration,
incident response, rollback verification, and release sign-off. It does not
authorize production deployment or enable broker, funding, trading, execution,
strategy, model, position-sizing, allocation, or risk behavior.

## 1. Promotion status

Production promotion remains **NO-GO** until every applicable operational
control has an accountable owner, dated evidence, and an independent reviewer.
Merged code, staging health, or synthetic CI evidence is not by itself
production approval.

The following Sprint 48 repository controls are merged to `main`:

| Control | Evidence | Merge SHA |
| --- | --- | --- |
| Refresh rotation, replay rejection, server-side session revocation, logout/reset invalidation, HTTP/WebSocket enforcement | PR #84 | `bd58601de864fe6015ad7c360932332dfb553b8e` |
| Login abuse protection and temporary account lockout | PR #85 | `799f95c9f19d87de2da263d3951fe0a9d4690355` |
| Server-owned request correlation and centralized audit metadata redaction | PR #86 | `e9b3836d49053b1db14d034df234069cf9df55e5` |
| Runtime HTTP rate-limit verification for exposed authentication routes | PR #87 | `3f5a88dc10461965e2cedf9d91e34b07deccdd99` |
| Operational secret/incident/rollback/restore rehearsal controls | PR #88 | repository merge evidence |
| Server-owned audit correlation provenance follow-up | PR #89 | repository merge evidence |
| Deterministic staging deployment and rollback controls | PR #90 | `31f9386dfe995c385153bc4752fd772310cc47db` |
| TOTP MFA and email verification hardening | PR #91 | `446c15c01c984d9b06696321aef02875ad2fa64d` |
| Bounded phone verification and fail-closed SMS delivery | PR #92 | `4871687e15a19202e35a1c19250bb36eb39351ef` |

Issue #93 tracks CI provenance hardening so future release evidence proves the
immutable pull-request head SHA it claims to validate. This repository change
does not replace any target-environment operational evidence.

The release record must identify:

- the immutable candidate Git SHA;
- the last known-good rollback SHA;
- exact-head CI/security workflow run identifiers for the candidate;
- the operator and independent reviewer;
- the backup artifact identifier and restoration-rehearsal result;
- each secret/provider-credential rotation or activation result without secret
  values;
- unresolved security exceptions and their approving owner, if permitted by
  organizational policy;
- the final go/no-go decision and timestamp.

## 2. Exact-head release verification

For a `pull_request` workflow, **exact-head** means
`github.event.pull_request.head.sha`. GitHub's `github.sha` for that event is
normally the synthetic `pull/<n>/merge` commit. The synthetic merge commit can
be useful integration evidence, but it is not the immutable PR-head candidate
and must never be labeled as exact-head evidence.

Critical release workflows must therefore:

1. derive `CANDIDATE_SHA` from `github.event.pull_request.head.sha` for
   `pull_request`, otherwise from `github.sha`;
2. checkout `ref: ${{ env.CANDIDATE_SHA }}` explicitly;
3. disable persisted checkout credentials unless a reviewed write requirement
   exists;
4. verify `git rev-parse HEAD` equals `CANDIDATE_SHA` before dependency
   installation, build, test, scan, or evidence generation;
5. fail closed when provenance differs;
6. keep PR mergeability/base-integration review as a separate gate rather than
   silently substituting a synthetic merge ref for exact-head evidence.

Before a go/no-go decision:

1. record the exact candidate SHA;
2. verify the pull request/release branch still points to that SHA;
3. verify required API CI, migration/database compatibility, concurrency,
   Release Security, dependency, secret-scan, SBOM, CodeQL, UI, restore, and
   deployment-safety checks applicable to the candidate are green on that SHA;
4. record run IDs or immutable evidence links;
5. verify no commit was pushed after evidence was collected;
6. if the SHA moves, discard the prior gate decision and repeat verification.

A green check belonging to an older head, or evidence generated from a
synthetic merge SHA while labeled as the PR head, is not valid exact-head
release evidence.

## 3. Authentication security evidence

### 3.1 Implemented repository controls

The authentication design uses a persisted `session_version` on the user
record. Access and refresh JWTs carry the version and token type. Server-side
validation rejects stale generations and incorrect token types.

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
- request/audit records use server-generated correlation IDs and recursively
  redact sensitive metadata;
- TOTP MFA seeds are encrypted at rest with dedicated authentication-domain key
  material;
- enabling or disabling MFA advances `session_version`, revoking sessions
  issued before the MFA state change;
- MFA-enabled login issues tokens only after both password and TOTP succeed;
- email verification uses high-entropy, single-use tokens and persists only a
  SHA-256 digest;
- phone verification uses a six-digit challenge with a 10-minute expiry,
  HMAC-SHA-256 persistence keyed by an independent verification pepper,
  account/current-phone binding, transactional single-use consumption, and a
  persisted five-invalid-attempt ceiling;
- provider delivery failures invalidate the associated phone challenge;
- phone confirmation requires an authenticated account and is bound to that
  account rather than being a public code endpoint.

### 3.2 Authentication rate limits

| Endpoint | Limit |
| --- | ---: |
| `POST /auth/register` | 10 / 15 minutes / IP |
| `POST /auth/login` | 10 / minute / IP |
| `POST /auth/refresh` | 60 / minute / IP |
| `POST /auth/mfa/setup` | 5 / 15 minutes / IP |
| `POST /auth/mfa/enable` | 10 / 15 minutes / IP |
| `POST /auth/mfa/disable` | 5 / 15 minutes / IP |
| `POST /auth/verification/email/request` | 5 / 15 minutes / IP |
| `POST /auth/verification/email/confirm` | 10 / 15 minutes / IP |
| `POST /auth/verification/phone/request` | 5 / 15 minutes / IP |
| `POST /auth/verification/phone/confirm` | 10 / 15 minutes / IP |
| `POST /auth/forgot-password` | 5 / 15 minutes / IP |
| `POST /auth/reset-password` | 10 / 15 minutes / IP |

See `docs/security/auth-rate-limit-policy.md` for the runtime-test contract.
These are merged repository controls; production readiness still depends on the
applicable provider, secret, recovery, and target-environment evidence below.

### 3.3 Remaining authentication operational prerequisites

Repository implementation does not make the release production-ready. Before
production activation, authorized operators must provide evidence that:

- `MFA_ENCRYPTION_KEY` and `AUTH_VERIFICATION_PEPPER` are supplied from the
  approved secret-management path and are independent from JWT, cookie,
  database, payment, broker, and provider credentials;
- email SMTP configuration, if required, is tested using an approved
  non-sensitive destination without exposing message contents or credentials;
- the SMS provider has real approved credentials/sender configuration and a
  controlled verification message can be delivered without logging code,
  recipient, provider secret, or provider response body;
- recovery/support procedures account for MFA and verified-contact state;
- secret rotation and target-environment restore evidence described below is
  complete.

If an applicable production-required control or provider cannot be validated,
promotion remains **NO-GO**.

## 4. Secret inventory and ownership

Maintain an out-of-repository secret inventory containing only secret names,
owners, providers, environments, creation dates, expiry dates, and rotation
status. Never record secret values in the inventory or release evidence.

At minimum, classify these secret families:

| Secret family | Required owner | Rotation/activation validation |
| --- | --- | --- |
| Database credentials | Database operator | New credential connects; old credential is rejected |
| Redis credentials | Platform operator | Readiness succeeds; old credential is rejected |
| JWT and cookie signing keys | Identity owner | New sessions validate; retired keys follow approved grace policy |
| Internal service credentials | Platform operator | Authorized internal health succeeds; old credential is rejected |
| `MFA_ENCRYPTION_KEY` | Identity/security owner | Key-version and controlled migration/decrypt validation recorded without plaintext seeds |
| `AUTH_VERIFICATION_PEPPER` | Identity/security owner | New challenge lifecycle validates; outstanding challenges follow documented invalidation policy |
| SMTP credentials | Integration owner | Controlled email delivery succeeds without exposing credentials/content |
| Twilio/API notification credentials and sender identity | Integration owner | Controlled SMS delivery succeeds; retired credential is rejected where provider capabilities allow |

Broker, payment, and live-market credentials are outside this runbook's
execution scope. Their rotation requires appropriately authorized engineering
and compliance owners.

## 5. Controlled secret-rotation procedure

### Prerequisites

- immutable candidate SHA recorded;
- current backup and restore evidence accepted;
- maintenance window approved;
- accountable operator and independent reviewer assigned;
- old and new secret version identifiers available without exposing values;
- service-specific rollback route confirmed before rotation begins.

### Execution record

Use a separate record for each secret family. Record:

1. change identifier and approved maintenance window;
2. accountable operator and independent reviewer;
3. affected services and expected user impact;
4. pre-change health and backup evidence;
5. new secret version identifier, never the value;
6. validation result for the new version;
7. confirmation that the previous version was revoked or an approved grace
   period was documented;
8. post-change health, log-redaction, and alerting evidence;
9. rollback decision and final status.

### Authentication-specific cautions

`MFA_ENCRYPTION_KEY` protects persisted MFA seeds. Replacing it without an
approved key-version/migration procedure can make existing MFA enrolments
undecryptable. Treat rotation as a controlled identity-data migration, not a
blind environment-variable replacement.

`AUTH_VERIFICATION_PEPPER` protects low-entropy phone challenges. Changing it
makes outstanding phone challenges unverifiable. Rotation must intentionally
expire/reissue outstanding challenges under documented policy rather than
attempting to preserve raw codes.

Notification-provider credentials may be rotated independently of challenge
storage. Validate only through an approved controlled destination; evidence
must not contain recipient, verification code, Authorization header, provider
token, or provider response body.

### Verification

Verify only the minimum behavior required for the rotated family. Examples:

- identity signing keys: new login/refresh succeeds and stale/revoked sessions
  follow approved key/session policy;
- database/Redis credentials: readiness succeeds with the new credential and
  the retired credential is rejected after cutover;
- internal API credentials: authorized health succeeds and the previous
  credential is rejected after cutover;
- verification pepper: a newly issued controlled phone challenge completes and
  a pre-rotation challenge follows the documented invalidation policy;
- SMS/SMTP credentials: one controlled delivery succeeds with secret-safe
  logs/evidence.

Review logs and audit records to ensure secret values or verification material
were not emitted.

### Rollback

Rollback is service-specific. Restore a previously approved secret version only
if it remains safe; otherwise invoke incident response and issue a replacement
secret. Record the rollback decision and post-change health checks.

Stop rotation if the backup is unverified, candidate SHA is unknown, new
credential cannot be validated, MFA key-version compatibility is uncertain, or
logs expose secret/verification material.

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
restore rehearsal using approved target-environment backup evidence satisfies
this operational gate.

## 7. Non-destructive restoration rehearsal

The restoration rehearsal must use an isolated non-production target with no
route to production services or external providers.

Record:

1. backup identifier, digest, creation time, and source database version;
2. isolated target identifier and responsible operator;
3. restoration start and completion times;
4. schema/migration compatibility result;
5. safe record-count and referential-integrity checks;
6. application liveness/readiness results with external integrations disabled;
7. confirmation that no email, SMS, payment, broker, or execution side effect
   was possible;
8. measured recovery time versus approved recovery objective;
9. cleanup confirmation for the isolated restored copy;
10. reviewer sign-off.

A rehearsal passes only if the restored database is usable by the expected
application version, integrity checks pass, no external side effect is
possible, and the isolated copy is cleaned up according to policy. A failed
rehearsal blocks promotion until a later rehearsal succeeds.

Do not restore over a production database as a rehearsal. Do not copy restored
data to developer laptops or attach it to GitHub issues/CI artifacts.

The disposable PostgreSQL CI restore validates procedure mechanics only. Its
sanitized evidence must record `candidate_sha` and `checked_out_sha` as equal.
The separate `trigger_sha` may be a synthetic GitHub merge SHA on pull requests
and must not be mislabeled as the exact candidate. Synthetic CI still **does
not** replace target-environment restoration evidence using an approved backup
artifact.

## 8. Incident severity and ownership

| Severity | Examples | Required response |
| --- | --- | --- |
| SEV-1 | Confirmed credential/code disclosure, unauthorized access, integrity loss | Contain immediately, preserve evidence, notify security owner, block promotion |
| SEV-2 | Persistent readiness/provider failure, repeated crashes, failed security control | Stop promotion, assign incident lead, investigate and retest |
| SEV-3 | Degraded non-critical function with safe fallback | Track, assess impact, require owner approval before promotion |

Every incident must name an incident lead, communications owner, technical
owner, evidence custodian, and final decision-maker. Never include tokens,
credentials, reset/verification codes, MFA seeds, private keys, full connection
strings, provider Authorization headers, or raw sensitive payloads in incident
evidence.

## 9. Incident lifecycle

1. **Detect:** record time, safe symptom, affected environment, correlation ID
   where available, and source.
2. **Classify:** assign severity and owners.
3. **Contain:** isolate the affected component and block promotion.
4. **Preserve:** retain sanitized logs, correlation/audit identifiers, immutable
   SHAs, workflow identifiers, and relevant audit-event identifiers.
5. **Recover:** use the last verified release and approved recovery plan.
6. **Validate:** repeat exact-head CI, security, readiness, provider, and smoke
   gates applicable to the incident.
7. **Review:** document root cause, corrective actions, owners, and due dates.

## 10. Rollback verification

Before promotion, confirm the last known-good SHA has retained release evidence
and remains compatible with current database and required secret/key versions.

Rollback evidence must include:

- candidate SHA and last known-good SHA;
- reason for rollback;
- database compatibility decision;
- affected services;
- required secret/key/provider version compatibility decision;
- liveness/readiness results after recovery;
- confirmation that security scans correspond to the restored code SHA;
- start/end timestamps and operator/reviewer sign-off.

Database reversal is a separate explicitly approved decision. Application
rollback must never automatically trigger destructive database rollback.

## 11. Evidence location and retention

Keep release evidence in the approved operations/security evidence store, not
inside the application repository when it contains environment-specific data.
The repository may contain templates and sanitized runbook references only.

Required evidence categories include:

- exact-head CI/security runs whose checkout SHA is independently verified;
- secret-rotation/activation records;
- provider readiness evidence when email/SMS verification is enabled;
- backup artifact metadata and integrity digest;
- restoration-rehearsal record;
- incident/exception records, if any;
- rollback validation evidence;
- final operator/reviewer sign-off.

Never upload database backups, private logs containing customer data, secret
values, provider payloads, raw production environment files, phone numbers,
verification codes, or MFA seeds to GitHub.

## 12. Go/no-go decision

The decision is **NO-GO** if any required evidence is missing, any exact-head
gate is non-green, checkout provenance cannot be proven, backup restoration has
not been demonstrated, a material incident remains open, secrets/verification
material appear in evidence, deployed SHA cannot be proven, or a required
authentication/provider control cannot be validated.

Repository implementation of session revocation, login abuse protection, TOTP
MFA, email verification, and phone verification does not by itself convert the
release to GO.

The decision may become **GO** only after all applicable gates are green for one
immutable candidate, operational evidence is complete, and authorized operators
plus an independent reviewer sign the release record.

## 13. Related runbooks and evidence contracts

- `docs/security/auth-rate-limit-policy.md`
- `docs/runbooks/sprint-47-production-release-security-health.md`
- `docs/runbooks/production-deployment-vps-webuzo.md`
- `docs/runbooks/secrets-never-committed.md`
- `docs/operations/staging-deployment.md`
- `scripts/security/check-workflow-candidate-provenance.mjs`
