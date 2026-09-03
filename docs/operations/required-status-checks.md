# Required Status Checks for `main`

## Purpose

The `main` branch must not rely on reviewer convention for CI/security gates. GitHub branch rules should require one stable, always-present status context named **Required CI Gate**.

Do **not** directly require every path-scoped workflow in the branch ruleset. A workflow such as UI E2E or Database Migration Compatibility intentionally does not start for unrelated changes; requiring those contexts directly can leave a valid pull request permanently blocked waiting for a check that will never exist.

## Required gate design

`.github/workflows/required-ci-gate.yml` runs for every pull request targeting `main` and validates the immutable pull-request head SHA.

The gate:

1. checks out `github.event.pull_request.head.sha` explicitly;
2. disables persisted checkout credentials;
3. fails unless `git rev-parse HEAD` equals the candidate SHA;
4. reads the pull request changed-file list using a read-only GitHub token;
5. determines which existing path-scoped workflows are applicable using the same path contract as their triggers;
6. waits for those workflow runs on the exact same candidate SHA;
7. succeeds only when every applicable workflow has completed successfully;
8. fails closed if the PR head moves, a required workflow fails/cancels, the changed-file list cannot be evaluated, or the wait deadline expires.

The gate has no deployment credentials and does not perform repository writes.

## Applicability matrix

| Workflow | Required when |
| --- | --- |
| Release Security | Every pull request to `main` |
| API CI | API source, root package/lock/workspace files, or API workflow changes |
| Risk Execution Concurrency | API source, root package/lock files, or its workflow changes |
| Database Migration Compatibility | Migration/validation scripts, root package/lock files, or its workflow changes |
| Backup Restore Rehearsal | API database paths, restore workflow, or Sprint 48 operational-security runbook changes |
| Deployment Script Safety | Deployment scripts, staging deployment runbook, or deployment-safety workflow changes |
| UI E2E | Web/Admin/API-client/types paths, root package/lock/workspace files, or UI E2E workflow changes |

The concurrency workflow is only observed as a CI result by this gate. This policy does not alter risk or trading behavior.

## GitHub ruleset configuration

After this workflow is merged and has produced a successful check on a pull request, edit the active repository ruleset protecting `refs/heads/main` and add a **Require status checks to pass** rule with this single required context:

- `Required CI Gate`

Keep the existing pull-request requirement, branch deletion protection, and non-fast-forward protection enabled.

Do not mark issue #95 complete until the live ruleset API shows the required-status-check rule and a controlled pull request demonstrates that a failing Required CI Gate prevents merge.

## Verification evidence

For each ruleset change, record only non-sensitive evidence:

- ruleset ID and updated timestamp;
- protected ref (`refs/heads/main`);
- required context name (`Required CI Gate`);
- test pull request number and immutable head SHA;
- failing-gate merge-block result;
- successful-gate merge eligibility result;
- operator/reviewer and timestamp.

Never record tokens, workflow authorization headers, repository secrets, or environment credentials.

## Failure behavior

The required gate is intentionally fail-closed. A missing applicable workflow is not treated as skipped success. If path rules drift between a workflow trigger and `scripts/security/required-ci-gate.mjs`, the gate times out/fails and the mismatch must be corrected rather than bypassed.

Release Security also runs the required-gate path-matrix self-tests and validates exact-head checkout provenance for the Required CI Gate workflow.
