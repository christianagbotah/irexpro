# Age & KYC Readiness Gate Runbook

## Purpose

Sprint 45 makes adult age and KYC status server-authoritative readiness inputs. It reuses the existing `identity.user_profiles.date_of_birth` and KYC state columns and adds an append-only reviewer evidence ledger.

This sprint does **not** implement identity-document upload, document storage, biometric processing, or a third-party KYC vendor integration. The Admin KYC workspace records the outcome of an organisation-approved verification process; it is not the verification process itself.

## Fail-closed rules

A user cannot complete the eligibility/readiness gate unless all of the following are true:

- a valid date of birth is stored;
- the server evaluates the account holder as at least 18 years old;
- KYC state is `APPROVED`;
- the jurisdiction gate is `ELIGIBLE`;
- every current required disclosure has exact version/hash consent evidence.

Missing DOB, invalid DOB, under-18 age, KYC `NONE`, `PENDING`, or `REJECTED` all keep readiness blocked.

## DOB changes

A date-of-birth change is treated as an identity-evidence change. When DOB changes, the API resets:

- `kyc_status` to `NONE`;
- `kyc_submitted_at` to `NULL`;
- `kyc_approved_at` to `NULL`.

Previous immutable KYC review rows remain in the evidence ledger for audit but no longer establish the current mutable KYC state.

## Admin review procedure

1. Complete identity verification using the organisation's approved compliance procedure outside this screen.
2. Open **Admin → KYC Reviews**.
3. Confirm the account is shown as `ADULT`; the API excludes non-adult accounts from this queue.
4. Select `APPROVED` or `REJECTED`.
5. Enter a concise reason code and optional internal note.
6. Check the explicit confirmation that the approved compliance process was completed.
7. Submit the decision.

The API independently refuses KYC approval unless the current stored DOB satisfies the adult-age rule.

## Evidence immutability

`identity.user_kyc_reviews` is append-only. PostgreSQL blocks `UPDATE`, `DELETE`, and `TRUNCATE` with SQLSTATE `55000`. Corrections are made by appending a new review after the underlying current profile information is valid; prior evidence is never rewritten.

## Data minimisation

The browser-safe KYC queue contains only the fields needed for compliance review context: user ID, contact email when present, country, DOB, adult-age status, KYC state, and reason code. It does not expose passwords, session tokens, broker credentials, provider account identifiers, or reviewer evidence from previous decisions.

No identity-document bytes are accepted or stored by Sprint 45.

## Rollback

Rolling back the Sprint 45 migration removes only the append-only `identity.user_kyc_reviews` ledger and its mutation-rejection function. It does not drop or alter the pre-existing `identity.user_profiles` DOB/KYC columns.

Before any production rollback, preserve required audit evidence according to the organisation's retention and legal obligations. Do not use rollback as a way to erase review history.
