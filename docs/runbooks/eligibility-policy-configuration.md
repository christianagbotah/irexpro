# Eligibility Policy Configuration Runbook

## Purpose

Sprint 44 adds a fail-closed eligibility and disclosure gate before onboarding can proceed to later readiness steps. This runbook documents the runtime jurisdiction policy inputs and the operational rules for changing them safely.

This configuration controls eligibility/readiness evidence only. It does not configure broker credentials, order submission, strategy logic, risk overrides, or execution permissions.

## Runtime variables

Configure these variables in the API environment:

```env
ELIGIBILITY_POLICY_VERSION=eligibility.v1
ELIGIBILITY_ALLOWED_COUNTRY_CODES=
ELIGIBILITY_BLOCKED_COUNTRY_CODES=
ELIGIBILITY_REVIEW_COUNTRY_CODES=
```

Country lists are comma-separated ISO 3166-1 alpha-2 codes. Use uppercase two-letter codes in operational configuration, for example `GH,GB`. Do not copy example values into production without an approved jurisdiction decision.

### `ELIGIBILITY_POLICY_VERSION`

Identifies the active jurisdiction-policy revision. Change this value whenever the approved policy classification changes. Admin review evidence is scoped to the exact user, country, and policy version, so changing the policy version intentionally prevents an older manual review from silently carrying forward.

If the variable is absent, the application uses `eligibility.v1`. Production deployments should set an explicit version rather than rely on the fallback.

### `ELIGIBILITY_ALLOWED_COUNTRY_CODES`

Countries explicitly allowed by the active policy. A matching account receives `ELIGIBLE` with reason `POLICY_ALLOWED`, subject to completing all current required disclosure consents.

### `ELIGIBILITY_BLOCKED_COUNTRY_CODES`

Countries explicitly blocked by the active policy. A matching account receives `INELIGIBLE` with reason `POLICY_BLOCKED`.

Blocked policy decisions cannot be overridden by an admin review.

### `ELIGIBILITY_REVIEW_COUNTRY_CODES`

Countries deliberately routed to manual compliance review. A matching account receives `REVIEW_REQUIRED` with reason `POLICY_REVIEW_REQUIRED` until an authorised admin records a decision for the exact country and policy version.

Countries not present in any list also fail closed as `REVIEW_REQUIRED`, with reason `UNCLASSIFIED_JURISDICTION`.

## Decision precedence

The API evaluates jurisdiction policy in this order:

1. **Blocked** — `INELIGIBLE`; cannot be overridden.
2. **Allowed** — `ELIGIBLE`, provided all current disclosures are accepted.
3. **Review list** — `REVIEW_REQUIRED` until an authorised review exists.
4. **Unclassified country** — `REVIEW_REQUIRED`.
5. **Missing country** — `MISSING_PROFILE`.

An empty or incomplete policy therefore does not grant access by default. Populated countries that are not explicitly allowed fail closed into review.

## Disclosure evidence

The current required disclosure set includes:

- automated trading risk;
- no profit guarantee;
- broker execution authority;
- an explicit age and legal-eligibility attestation confirming the account holder is at least 18 years old and legally permitted to use the service in the recorded jurisdiction.

Consent is recorded against the exact disclosure key, version, and SHA-256 content digest. Changing disclosure copy changes its digest and requires fresh evidence before the eligibility gate can become complete.

Disclosure consent and admin jurisdiction-review records are append-only evidence. PostgreSQL rejects update, delete, and truncate operations on the Sprint 44 evidence tables.

## Production change procedure

Before changing the jurisdiction policy:

1. Obtain the approved legal/compliance classification for the affected jurisdictions. Do not infer legal availability from product demand, broker availability, or prior user activity.
2. Choose a new `ELIGIBILITY_POLICY_VERSION` for any classification change.
3. Set the approved allowed, blocked, and review country-code lists in the API environment.
4. Confirm no country is accidentally present in conflicting lists. The application gives blocked status precedence, but configuration should still be internally consistent.
5. Deploy/restart the API with the new environment.
6. Verify representative accounts through the eligibility status endpoint and the Admin eligibility-review queue.
7. Confirm unclassified and missing-profile cases remain blocked from proceeding.
8. Confirm explicitly blocked jurisdictions cannot be approved through the Admin review endpoint.
9. Review audit events for disclosure acceptance and jurisdiction-review decisions after deployment.

## Rollback

If a policy deployment is incorrect, restore the last approved environment configuration and policy version, then restart the API. Do not edit or delete historical consent or review evidence. Historical records remain immutable and the active decision is derived from the currently configured policy version.

## Security boundary

Eligibility configuration must never contain secrets, broker tokens, user credentials, account identifiers, order instructions, or execution parameters. Those concerns remain outside the Sprint 44 eligibility/disclosure boundary.
