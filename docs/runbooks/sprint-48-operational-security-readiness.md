# Sprint 48 — Operational Security Readiness

This runbook defines the evidence required before iRexPro may be considered for
production promotion. It covers secret rotation, backup restoration, incident
response, rollback verification, and release sign-off. It does not authorize a
production deployment or enable broker, funding, trading, execution, strategy,
model, position-sizing, or risk behavior.

## 1. Promotion status

Production promotion remains **blocked** until every control in this document
has an owner, dated evidence, and an independent reviewer. Staging health alone
is not production approval.

The release record must identify:

- the immutable candidate Git SHA;
- the last known-good rollback SHA;
- the CI and security workflow run identifiers for the candidate;
- the operator and independent reviewer;
- the backup artifact identifier and restoration-rehearsal result;
- each secret-rotation result, without recording secret values;
- the final go/no-go decision and timestamp.

## 2. Secret inventory and ownership

Maintain an out-of-repository secret inventory containing only secret names,
owners, providers, environments, creation dates, expiry dates, and rotation
status. Never record secret values in the inventory or release evidence.

At minimum, classify these secret families:

| Secret family | Required owner | Rotation validation |
|---|---|---|
| Database credentials | Database operator | New credential connects; old credential is rejected |
| Redis credentials | Platform operator | Readiness succeeds; old credential is rejected |
| JWT and cookie signing keys | Identity owner | New sessions validate; retired keys follow the approved grace policy |
| Internal service credentials | Platform operator | Authorized internal health succeeds; old credential is rejected |
| Encryption keys | Security owner | Key version is recorded and a controlled decrypt/re-encrypt test passes |
| Notification/provider keys | Integration owner | Provider test succeeds without exposing message contents or credentials |

Broker, payment, and live-market credentials are outside this runbook's
execution scope. Their rotation requires the appropriately authorized adult
engineering and compliance owners.

## 3. Controlled secret-rotation record

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

Stop the rotation if the backup is unverified, the candidate SHA is unknown,
the new credential cannot be validated, or logs expose secret material.

## 4. Backup acceptance criteria

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

## 5. Non-destructive restoration rehearsal

The restoration rehearsal must use an isolated non-production target with no
route to production services or external providers.

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

Do not restore over a production database as a rehearsal. Do not copy restored
data into developer laptops or attach it to GitHub issues or CI artifacts.

## 6. Incident severity and ownership

| Severity | Examples | Required response |
|---|---|---|
| SEV-1 | Confirmed credential disclosure, unauthorized access, integrity loss | Contain immediately, preserve evidence, notify security owner, block promotion |
| SEV-2 | Persistent readiness failure, repeated crashes, failed security control | Stop promotion, assign incident lead, investigate and retest |
| SEV-3 | Degraded non-critical function with safe fallback | Track, assess impact, and require owner approval before promotion |

Every incident must name an incident lead, communications owner, technical
owner, evidence custodian, and final decision-maker. The incident record must
use sanitized identifiers and must never include tokens, credentials, reset
codes, private keys, full connection strings, or raw sensitive payloads.

## 7. Incident lifecycle

1. **Detect:** record the time, safe symptom, affected environment, and source.
2. **Classify:** assign severity and owners.
3. **Contain:** isolate the affected component and block promotion.
4. **Preserve:** retain sanitized logs, immutable SHAs, workflow identifiers,
   and relevant audit-event identifiers.
5. **Recover:** use the last verified release and approved data-recovery plan.
6. **Validate:** repeat exact-head CI, security, readiness, and smoke gates.
7. **Review:** document root cause, corrective actions, owners, and due dates.

## 8. Rollback verification

Before any promotion, confirm that the last known-good SHA still has retained
release evidence and remains compatible with the current database state.

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

## 9. Authentication release blocker

The current refresh-token model is stateless. Clearing a client cookie does not
revoke an issued refresh token, and password reset does not invalidate existing
refresh tokens. This is a production blocker until an authorized implementation
provides server-side revocation or an equivalent token-version/session control,
with adversarial tests for logout, password reset, replay, rotation, expiry,
account suspension, and concurrent refresh.

No production promotion may be approved while this item remains open.

## 10. Go/no-go decision

The decision is **NO-GO** if any required evidence is missing, any exact-head
gate is non-green, backup restoration has not been demonstrated, a material
incident remains open, secrets appear in evidence, authentication revocation is
unfinished, or the deployed SHA cannot be proven.

The decision may become **GO** only after all gates are green for one immutable
candidate, operational evidence is complete, and the authorized operators and
independent reviewer sign the release record.

## 11. Related runbooks

- `docs/runbooks/sprint-47-production-release-security-health.md`
- `docs/runbooks/production-deployment-vps-webuzo.md`
- `docs/runbooks/secrets-never-committed.md`

