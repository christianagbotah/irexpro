# Authentication Rate-Limit Policy

**Sprint:** 48 — Authentication & Operational Security Readiness

**Scope:** Authentication endpoints only. This document does not alter broker, funding, trading, execution, strategy, model, position-sizing, allocation, or risk behavior.

## Exposed authentication surfaces

| Endpoint | Limit | Authentication | Purpose |
| --- | ---: | --- | --- |
| `POST /auth/register` | 10 / 15 minutes / IP | Public | Reduce automated account creation and registration abuse. |
| `POST /auth/login` | 10 / minute / IP | Public | Bound password/TOTP guessing from one source. Persistent account lockout separately protects password authentication. |
| `POST /auth/refresh` | 60 / minute / IP | Public + refresh token | Bound refresh-endpoint abuse while leaving room for normal retry/multi-tab/mobile bursts. |
| `POST /auth/mfa/setup` | 5 / 15 minutes / IP | Access token | Bound repeated TOTP seed generation. Setup responses are `no-store`. |
| `POST /auth/mfa/enable` | 10 / 15 minutes / IP | Access token | Bound TOTP enrolment verification attempts. |
| `POST /auth/mfa/disable` | 5 / 15 minutes / IP | Access token | Bound password + TOTP attempts to remove MFA. |
| `POST /auth/verification/email/request` | 5 / 15 minutes / IP | Access token | Bound verification-message abuse. |
| `POST /auth/verification/email/confirm` | 10 / 15 minutes / IP | Public single-use token | Bound verification-token guessing/replay attempts. |
| `POST /auth/verification/phone/request` | 5 / 15 minutes / IP | Access token | Bound SMS send abuse for the authenticated account. |
| `POST /auth/verification/phone/confirm` | 10 / 15 minutes / IP | Access token | Bound phone-code guesses; the stored challenge independently burns after five invalid attempts. |
| `POST /auth/forgot-password` | 5 / 15 minutes / IP | Public | Reduce reset-message abuse and identifier probing. |
| `POST /auth/reset-password` | 10 / 15 minutes / IP | Public reset proof | Bound reset-token/code guessing and repeated reset submissions. |

The controller is protected by `ThrottlerGuard`; each security-sensitive endpoint above has an explicit override so future changes to the broad module default cannot silently weaken its policy.

## Verification

`auth-rate-limit.e2e.spec.ts` sends real HTTP requests through Nest and `ThrottlerGuard`. Authenticated routes replace only `JwtAuthGuard` with a deterministic test principal; throttling remains the real runtime guard. For every listed route the test proves requests through the configured limit succeed and that the first request above the limit receives HTTP `429 Too Many Requests` without invoking the downstream service.

The normal API CI test suite runs this verification on pull requests.

## MFA and verification status

TOTP MFA and email verification were implemented and merged in PR #91. The phone-verification candidate in PR #92 adds authenticated send/confirm routes, keyed digest storage, 10-minute expiry, a five-invalid-attempt challenge ceiling, and fail-closed SMS delivery. Phone confirmation is account-bound and therefore is not exposed as a public code-verification endpoint.

Rate limiting is one layer rather than the only abuse control. Password authentication retains persistent account lockout; MFA challenges require password success before login token issuance; email verification tokens are high entropy and single use; phone verification codes are HMAC-protected at rest and have their own persisted attempt counter.

## Operational evidence

For a release candidate, retain the exact pull-request head SHA and the API CI run showing this test suite green. Authentication throttle changes must not be promoted based only on decorator review or local assumptions. Production activation also requires the applicable provider/secrets configuration and operator evidence defined in `docs/runbooks/sprint-48-operational-security-readiness.md`.
