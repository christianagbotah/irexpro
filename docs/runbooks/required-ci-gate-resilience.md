# Required CI Gate resilience

The Required CI Gate remains fail-closed, but transient GitHub API/network failures are retried by `scripts/security/required-ci-gate-runner.mjs`.

## Retry policy

The runner retries only transient failures:

- HTTP 408, 425, 429
- HTTP 5xx
- recognized fetch/socket/DNS/connect timeout failures

It does **not** retry ordinary 4xx responses such as 403/404, pull-request head changes, failed required workflows, invalid configuration, or other application errors.

Defaults:

- 5 attempts
- 2 second initial delay
- exponential backoff capped at 20 seconds
- one shared 2400 second overall polling deadline

Environment overrides:

- `REQUIRED_GATE_API_RETRY_ATTEMPTS`
- `REQUIRED_GATE_API_RETRY_BASE_SECONDS`
- `REQUIRED_GATE_API_RETRY_MAX_SECONDS`
- `REQUIRED_WORKFLOW_TIMEOUT_SECONDS`

The runner shortens the underlying gate timeout on every retry so retries never reset the overall deadline.

## Verification

`required-ci-gate-runner.mjs --self-test` proves the retry classifier and delay cap deterministically. The original `required-ci-gate.mjs --self-test` remains authoritative for required-workflow path selection.

A persistent API failure still fails the gate after the bounded retries. A real required-workflow failure fails immediately without retry.