#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly EXPECTED_REPOSITORY="christianagbotah/irexpro"
readonly PNPM_VERSION="10.34.5"
readonly MAX_HEALTH_ATTEMPTS="30"

die() {
  printf 'DEPLOYMENT HOLD: %s\n' "$1" >&2
  exit 1
}

require_value() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "Required configuration is missing: ${name}"
}

safe_curl() {
  curl --fail --silent --show-error --max-time 10 "$1"
}

require_http_status() {
  local url="$1"
  local expected="$2"
  local actual
  actual="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10 "$url")"
  [[ "$actual" == "$expected" ]] || die "Unexpected HTTP status from a smoke-test endpoint."
}

require_health_field() {
  local url="$1"
  local field="$2"
  local expected="$3"
  local payload
  payload="$(safe_curl "$url")"
  HEALTH_PAYLOAD="$payload" node --input-type=module - "$field" "$expected" <<'NODE'
const [field, expected] = process.argv.slice(2);
let payload;
try {
  payload = JSON.parse(process.env.HEALTH_PAYLOAD);
} catch {
  process.exit(2);
}
if (String(payload[field]) !== expected) {
  process.exit(3);
}
NODE
}

wait_for_api() {
  local attempt
  for ((attempt = 1; attempt <= MAX_HEALTH_ATTEMPTS; attempt += 1)); do
    if require_health_field "$LOCAL_API_LIVE_URL" status alive 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  die "API did not become live within the allowed attempts."
}

[[ "$#" -eq 1 ]] || die "Usage: deploy-staging.sh <40-character-commit-sha>"
readonly CANDIDATE_SHA="$1"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Candidate must be a full lowercase commit SHA."

for name in   STAGING_ROOT   API_PM2_NAME   WEB_PM2_NAME   ADMIN_PM2_NAME   LOCAL_API_LIVE_URL   LOCAL_API_READY_URL   LOCAL_API_HEALTH_URL   LOCAL_WEB_URL   LOCAL_ADMIN_URL   PUBLIC_API_LIVE_URL   PUBLIC_API_READY_URL   PUBLIC_WEB_URL   PUBLIC_ADMIN_URL   AI_HEALTH_URL; do
  require_value "$name"
done

cd "$STAGING_ROOT"
[[ "$(git rev-parse --show-toplevel)" == "$STAGING_ROOT" ]] || die "STAGING_ROOT is not the repository root."
[[ -z "$(git status --porcelain)" ]] || die "Working tree is not clean."

remote_url="$(git remote get-url origin)"
[[ "$remote_url" == *"$EXPECTED_REPOSITORY"* ]] || die "Unexpected origin repository."

PREVIOUS_SHA="$(git rev-parse HEAD)"
readonly PREVIOUS_SHA
git fetch --quiet origin main
git cat-file -e "${CANDIDATE_SHA}^{commit}" 2>/dev/null || die "Candidate commit is unavailable."
git merge-base --is-ancestor "$CANDIDATE_SHA" origin/main || die "Candidate is not contained in origin/main."
git switch --quiet --detach "$CANDIDATE_SHA"
[[ "$(git rev-parse HEAD)" == "$CANDIDATE_SHA" ]] || die "Exact candidate checkout failed."

corepack pnpm@"$PNPM_VERSION" install --frozen-lockfile
corepack pnpm@"$PNPM_VERSION" --filter @irexpro/api build
corepack pnpm@"$PNPM_VERSION" --filter @irexpro/web build
corepack pnpm@"$PNPM_VERSION" --filter @irexpro/admin build

pm2 restart "$API_PM2_NAME" --update-env
wait_for_api
require_health_field "$LOCAL_API_READY_URL" status ready
require_health_field "$LOCAL_API_READY_URL" database connected
require_health_field "$LOCAL_API_READY_URL" redis connected
require_health_field "$LOCAL_API_HEALTH_URL" status ok

pm2 restart "$WEB_PM2_NAME" --update-env
pm2 restart "$ADMIN_PM2_NAME" --update-env

require_http_status "$LOCAL_WEB_URL" 200
require_http_status "$LOCAL_ADMIN_URL" 307
require_http_status "$PUBLIC_WEB_URL" 200
require_http_status "$PUBLIC_ADMIN_URL" 307
require_health_field "$PUBLIC_API_LIVE_URL" status alive
require_health_field "$PUBLIC_API_READY_URL" status ready
require_health_field "$AI_HEALTH_URL" signal_mode paper

[[ "$(git rev-parse HEAD)" == "$CANDIDATE_SHA" ]] || die "Final exact-SHA verification failed."

printf 'STAGING DEPLOYMENT VERIFIED\n'
printf 'candidate_sha=%s\n' "$CANDIDATE_SHA"
printf 'previous_sha=%s\n' "$PREVIOUS_SHA"
printf 'paper_mode_verified=true\n'
