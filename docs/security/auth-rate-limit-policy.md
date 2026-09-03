# Authentication Rate-Limit Policy

**Sprint:** 48 — Authentication & Operational Security Readiness  
**Scope:** Authentication endpoints only. This document does not alter broker, funding, trading, execution, strategy, model, position-sizing, allocation, or risk behavior.

## Exposed authentication surfaces

| Endpoint | Limit | Purpose |
| --- | ---: | --- |
| `POST /auth/register` | 10 / 15 minutes / IP | Reduce automated account creation and registration abuse. |
| `POST /auth/login` | 10 / minute / IP | Bound password guessing from one source. A separate persistent account lockout protects against distributed guessing. |
| `POST /auth/refresh` | 60 / minute / IP | Bound refresh-endpoint abuse while leaving room for normal retry/multi-tab/mobile bursts. |
| `POST /auth/forgot-password` | 5 / 15 minutes / IP | Reduce reset-message abuse and identifier probing. |
| `POST /auth/reset-password` | 10 / 15 minutes / IP | Bound reset-token/code guessing and repeated reset submissions. |

The controller is protected by `ThrottlerGuard`; each security-sensitive public endpoint above has an explicit override so future changes to the broad module default cannot silently weaken its policy.

## Verification

`auth-rate-limit.e2e.spec.ts` sends real HTTP requests through Nest and `ThrottlerGuard`. For every route it verifies that requests through the configured limit succeed and that the first request above the limit receives HTTP `429 Too Many Requests` without invoking the downstream service.

The normal API CI test suite runs this verification on pull requests.

## MFA and email/phone verification status

The current API does **not** expose MFA challenge/enrolment or email/phone verification endpoints. The `User` entity contains MFA and verification-related fields, but there is no corresponding HTTP authentication surface in the loaded auth/users controllers at this sprint boundary.

Therefore MFA/verification rate limiting cannot truthfully be marked as implemented or tested yet. If those flows are introduced, their public challenge/send/verify endpoints must receive explicit route limits and HTTP-level 429 tests before production activation. This remains a release-readiness follow-up rather than being represented as completed functionality.

## Operational evidence

For a release candidate, retain the exact pull-request head SHA and the API CI run showing this test suite green. Authentication throttle changes must not be promoted based only on decorator review or local assumptions.
