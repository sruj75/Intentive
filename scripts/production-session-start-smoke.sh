#!/usr/bin/env bash
#
# Smoke the production Agent Runtime Session Start path and always try to delete
# the smoke Agent Instance it creates.
#
# Requirements:
#   - gcloud auth that can read Secret Manager values in agentic-accountability
#   - psql on PATH
#
# Optional overrides:
#   GCP_PROJECT=agentic-accountability
#   RUNTIME_BASE_URL=https://runtime.heyintentive.com
#   SMOKE_USER_ID=00000000-0000-4000-8000-0000000000ff
#   SMOKE_AUTH_SUBJECT=smoke-session-start

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-agentic-accountability}"
RUNTIME_BASE_URL="${RUNTIME_BASE_URL:-https://runtime.heyintentive.com}"
SMOKE_USER_ID="${SMOKE_USER_ID:-00000000-0000-4000-8000-0000000000ff}"
SMOKE_AUTH_SUBJECT="${SMOKE_AUTH_SUBJECT:-smoke-session-start}"

secret_file="$(mktemp)"
db_url_file="$(mktemp)"
body_file="$(mktemp)"
response_file="$(mktemp)"
status_file="$(mktemp)"

cleanup_files() {
  rm -f "$secret_file" "$db_url_file" "$body_file" "$response_file" "$status_file"
}

teardown_smoke_row() {
  local db_url
  if [[ ! -s "$db_url_file" ]]; then
    echo "WARN: database URL was not fetched; cannot verify smoke row teardown" >&2
    return
  fi

  db_url="$(cat "$db_url_file")"
  echo "→ deleting smoke Agent Instance rows for auth_subject=$SMOKE_AUTH_SUBJECT"
  psql "$db_url" \
    -v ON_ERROR_STOP=1 \
    -v smoke_auth_subject="$SMOKE_AUTH_SUBJECT" \
    -c "DELETE FROM agent_runtime.agent_instances WHERE auth_subject = :'smoke_auth_subject';" \
    >/dev/null

  local remaining
  remaining="$(
    psql "$db_url" \
      -v ON_ERROR_STOP=1 \
      -v smoke_auth_subject="$SMOKE_AUTH_SUBJECT" \
      -tAc "SELECT count(*) FROM agent_runtime.agent_instances WHERE auth_subject = :'smoke_auth_subject';"
  )"
  if [[ "$remaining" != "0" ]]; then
    echo "ERROR: smoke teardown incomplete; $remaining matching rows remain" >&2
    exit 1
  fi
  echo "✓ smoke row teardown verified"
}

cleanup() {
  local exit_code=$?
  set +e
  teardown_smoke_row
  cleanup_files
  exit "$exit_code"
}

trap cleanup EXIT

echo "→ fetching production smoke secrets"
gcloud secrets versions access latest \
  --secret=INTERNAL_SECRET_TO_RUNTIME \
  --project="$GCP_PROJECT" >"$secret_file"

gcloud secrets versions access latest \
  --secret=AGENT_RUNTIME_NEON_DATABASE_URL \
  --project="$GCP_PROJECT" >"$db_url_file"

cat >"$body_file" <<JSON
{"user_id":"$SMOKE_USER_ID","auth_subject":"$SMOKE_AUTH_SUBJECT"}
JSON

echo "→ POST $RUNTIME_BASE_URL/internal/sessions/start"
curl -sS \
  -o "$response_file" \
  -w '%{http_code}\n' \
  -X POST "$RUNTIME_BASE_URL/internal/sessions/start" \
  -H "authorization: Bearer $(cat "$secret_file")" \
  -H 'content-type: application/json' \
  --data-binary "@$body_file" \
  --connect-timeout 8 \
  --max-time 20 >"$status_file"

status="$(cat "$status_file")"
cat "$response_file"
echo

if [[ "$status" != "200" ]]; then
  echo "ERROR: Session Start smoke returned HTTP $status" >&2
  exit 1
fi

echo "✓ Session Start returned 200"
