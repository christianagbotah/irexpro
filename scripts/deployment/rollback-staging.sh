#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

die() {
  printf 'ROLLBACK HOLD: %s\n' "$1" >&2
  exit 1
}

[[ "$#" -eq 2 ]] || die "Usage: rollback-staging.sh <failed-sha> <rollback-sha>"
readonly FAILED_SHA="$1"
readonly ROLLBACK_SHA="$2"

[[ "$FAILED_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Failed candidate must be a full lowercase commit SHA."
[[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Rollback target must be a full lowercase commit SHA."
[[ "$FAILED_SHA" != "$ROLLBACK_SHA" ]] || die "Rollback target must differ from the failed candidate."
[[ -n "${STAGING_ROOT:-}" ]] || die "STAGING_ROOT is required."

cd "$STAGING_ROOT"
[[ -z "$(git status --porcelain)" ]] || die "Working tree is not clean."
[[ "$(git rev-parse HEAD)" == "$FAILED_SHA" ]] || die "Current checkout does not match the declared failed candidate."

git cat-file -e "${ROLLBACK_SHA}^{commit}" 2>/dev/null || die "Rollback commit is unavailable."
git merge-base --is-ancestor "$ROLLBACK_SHA" "$FAILED_SHA" || die "Rollback target is not an ancestor of the failed candidate."

script_path="$(mktemp)"
trap 'rm -f "$script_path"' EXIT
git show "${FAILED_SHA}:scripts/deployment/deploy-staging.sh" > "$script_path"
chmod 700 "$script_path"

"$script_path" "$ROLLBACK_SHA"
[[ "$(git rev-parse HEAD)" == "$ROLLBACK_SHA" ]] || die "Rollback exact-SHA verification failed."

printf 'STAGING ROLLBACK VERIFIED\n'
printf 'failed_sha=%s\n' "$FAILED_SHA"
printf 'rollback_sha=%s\n' "$ROLLBACK_SHA"
