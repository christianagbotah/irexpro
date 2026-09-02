#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

expect_failure() {
  local expected="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    printf 'Expected command to fail: %s\n' "$*" >&2
    exit 1
  fi
  [[ "$output" == *"$expected"* ]] || {
    printf 'Failure did not contain expected safe message: %s\n' "$expected" >&2
    exit 1
  }
}

bash -n "$SCRIPT_DIR/deploy-staging.sh"
bash -n "$SCRIPT_DIR/rollback-staging.sh"

expect_failure "Usage:" "$SCRIPT_DIR/deploy-staging.sh"
expect_failure "full lowercase commit SHA" "$SCRIPT_DIR/deploy-staging.sh" main
expect_failure "Usage:" "$SCRIPT_DIR/rollback-staging.sh"
expect_failure "must differ" "$SCRIPT_DIR/rollback-staging.sh"   1111111111111111111111111111111111111111   1111111111111111111111111111111111111111

printf 'Deployment script safety tests passed.\n'
