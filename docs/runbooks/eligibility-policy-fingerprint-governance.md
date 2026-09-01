# Eligibility Policy Fingerprint & Re-consent Governance

## Purpose

Sprint 46 binds eligibility consent and manual jurisdiction-review evidence to a deterministic SHA-256 fingerprint of the active eligibility policy. The fingerprint prevents stale evidence from remaining authoritative when policy configuration changes without a corresponding human-readable version bump.

This mechanism is a compliance/readiness control only. It does not add broker credentials, strategy logic, order submission, execution capability, or risk overrides.

## Active policy snapshot

The API constructs one normalized policy snapshot from:

- `ELIGIBILITY_POLICY_VERSION`
- `ELIGIBILITY_ALLOWED_COUNTRY_CODES`
- `ELIGIBILITY_BLOCKED_COUNTRY_CODES`
- `ELIGIBILITY_REVIEW_COUNTRY_CODES`
- every required disclosure key
- every required disclosure version
- the SHA-256 digest of the exact disclosure body

Country lists are normalized to uppercase valid ISO-style two-letter codes, deduplicated, and sorted before hashing. Disclosure entries are sorted by disclosure key before hashing.

The SHA-256 digest of the canonical JSON snapshot is returned as `policyFingerprint`.

## Why both version and fingerprint exist

`policyVersion` remains the human-readable release label used by compliance and operations.

`policyFingerprint` is the machine-verifiable identity of the exact policy snapshot. It changes whenever an effective jurisdiction configuration or required disclosure definition changes, even if `policyVersion` is accidentally left unchanged.

Both values are evidence dimensions. Neither replaces the other.

## Consent evidence

A user-facing eligibility response contains:

- `policyVersion`
- `policyFingerprint`
- the exact current disclosure set

When recording consent, the Web client must return the exact policy version and fingerprint it rendered together with each disclosure key/version/content hash.

The API rejects the submission if the current policy snapshot no longer matches those values. The user must refresh and review the current disclosures before new evidence can be recorded.

Current consent is recognized only when all of the following match:

- user
- policy version
- policy fingerprint
- disclosure key
- disclosure version
- disclosure content SHA-256

A policy change therefore makes prior consent stale without mutating or deleting historical evidence.

## Jurisdiction review evidence

Manual jurisdiction review evidence is stored with:

- user
- country code
- policy version
- policy fingerprint
- decision
- reason code
- reviewer
- timestamp

Only a review matching the current country, version, and fingerprint can affect current eligibility. A configuration change therefore sends a previously reviewed jurisdiction back through the current policy decision path until new review evidence is recorded where required.

Explicitly blocked jurisdictions remain non-overridable.

## Legacy evidence migration

Migration `1752900000000-AddEligibilityPolicyFingerprint.ts` does not rewrite historical evidence.

Existing disclosure consent receives:

- `policy_version = legacy.unbound`
- `policy_fingerprint = 0000000000000000000000000000000000000000000000000000000000000000`

Existing jurisdiction reviews receive the same zero fingerprint sentinel.

These values intentionally do not match an active policy fingerprint. Historical rows therefore remain available for audit but cannot satisfy current readiness.

The migration uses DDL only. It does not UPDATE, DELETE, TRUNCATE, disable, or remove the existing append-only evidence triggers.

After legacy rows are classified, the migration removes the temporary column defaults. New evidence must provide an explicit policy binding.

## Production policy-change procedure

1. Obtain the organisation's required legal/compliance approval for the jurisdiction or disclosure change.
2. Update the relevant eligibility configuration and/or disclosure definition through the normal reviewed deployment process.
3. Prefer incrementing `ELIGIBILITY_POLICY_VERSION` for every approved policy release, even though the fingerprint protects against a missed version bump.
4. Deploy the API and Web/Admin applications together when the browser-safe contract changes.
5. Verify the eligibility endpoint returns a 64-character lowercase hexadecimal `policyFingerprint`.
6. Verify previously accepted disclosure evidence is no longer current when the fingerprint changed.
7. Verify jurisdictions requiring manual review return to the review queue when their prior review fingerprint is stale.
8. Verify explicitly blocked jurisdictions remain blocked.
9. Preserve prior evidence; never edit historical consent or review rows to make them appear current.

## Operational checks

For a policy change, confirm:

- equivalent formatting/order changes produce the same fingerprint;
- effective country-set changes produce a different fingerprint;
- disclosure body/version changes produce a different fingerprint;
- stale consent cannot satisfy `canProceed`;
- stale manual jurisdiction review cannot produce `ADMIN_REVIEW` eligibility;
- KYC approval remains governed by current-DOB immutable KYC evidence independently of the jurisdiction fingerprint;
- browser responses fail closed if the fingerprint is missing, malformed, or inconsistent across returned consent evidence.

## Rollback

Application rollback must not mutate evidence rows.

The database down migration removes Sprint 46 fingerprint columns and restores the prior index shapes. Because Sprint 46 permits multiple immutable consent rows that may differ only by policy binding, a database rollback after new policy-bound evidence has accumulated can conflict with the older uniqueness model. Treat schema rollback after production evidence has been recorded as a controlled database operation requiring a data-impact review rather than an automatic emergency action.

Prefer rolling application code forward with a corrected policy/configuration while retaining the Sprint 46 schema and historical evidence.

## Security and privacy boundary

The fingerprint contains no credentials, identity documents, biometric data, reviewer notes, broker account identifiers, or secrets. It is a digest of normalized policy configuration and disclosure hashes.

Do not use the fingerprint as authorization by itself. Current readiness still requires the complete server-side eligibility, age/KYC, disclosure, account, and other existing readiness gates.
