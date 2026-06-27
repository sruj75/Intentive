#!/usr/bin/env bash
#
# Smoke the production Agent Runtime Session Start path and always try to delete
# the smoke Agent Instance it creates.
#
# Requirements:
#   - gcloud auth that can read Secret Manager values in agentic-accountability
#   - psql on PATH, or workspace dependencies installed for the Node fallback
#
# Optional overrides:
#   GCP_PROJECT=agentic-accountability
#   RUNTIME_BASE_URL=https://runtime.heyintentive.com
#   RUNTIME_RESOLVE_IP=8.232.97.220
#   RUNTIME_VM_NAME=agent-runtime
#   RUNTIME_VM_ZONE=us-west1-a
#   SMOKE_USER_ID=00000000-0000-4000-8000-0000000000ff
#   SMOKE_AUTH_SUBJECT=smoke-session-start

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-agentic-accountability}"
RUNTIME_BASE_URL="${RUNTIME_BASE_URL:-https://runtime.heyintentive.com}"
RUNTIME_RESOLVE_IP="${RUNTIME_RESOLVE_IP:-}"
RUNTIME_VM_NAME="${RUNTIME_VM_NAME:-agent-runtime}"
RUNTIME_VM_ZONE="${RUNTIME_VM_ZONE:-us-west1-a}"
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

teardown_smoke_row_via_runtime_vm() {
  local remote_subject
  remote_subject="$(printf "%q" "$SMOKE_AUTH_SUBJECT")"
  gcloud compute ssh "$RUNTIME_VM_NAME" \
    --zone "$RUNTIME_VM_ZONE" \
    --project "$GCP_PROJECT" \
    --tunnel-through-iap \
    --command "SMOKE_AUTH_SUBJECT=$remote_subject sh -s" <<'REMOTE'
set -euo pipefail
c=$(docker ps -a --filter name=klt-agent-runtime --format '{{.ID}}' | head -1)
if [ -z "$c" ]; then
  echo "runtime container missing" >&2
  exit 1
fi

docker exec -i -e SMOKE_AUTH_SUBJECT="$SMOKE_AUTH_SUBJECT" "$c" sh -s <<'INNER'
set -e
node_pid=""
for p in /proc/[0-9]*; do
  cmd=$(tr "\000" " " < "$p/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *"node dist/main.js"*) node_pid=${p#/proc/}; break ;;
  esac
done
if [ -z "$node_pid" ]; then
  echo "runtime node process missing" >&2
  exit 1
fi

db_url=$(tr "\000" "\n" < "/proc/$node_pid/environ" | sed -n 's/^NEON_DATABASE_URL=//p')
if [ -z "$db_url" ]; then
  echo "runtime node database URL missing" >&2
  exit 1
fi

DB_URL="$db_url" node --input-type=module <<'NODE'
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DB_URL);
const subject = process.env.SMOKE_AUTH_SUBJECT;
await sql`DELETE FROM agent_runtime.agent_instances WHERE auth_subject = ${subject}`;
const rows = await sql`SELECT count(*)::int AS count FROM agent_runtime.agent_instances WHERE auth_subject = ${subject}`;
process.stdout.write(String(rows[0]?.count ?? -1));
NODE
INNER
REMOTE
}

teardown_smoke_row() {
  local db_url
  if [[ ! -s "$db_url_file" ]]; then
    echo "WARN: database URL was not fetched; cannot verify smoke row teardown" >&2
    return
  fi

  db_url="$(cat "$db_url_file")"
  echo "→ deleting smoke Agent Instance rows for auth_subject=$SMOKE_AUTH_SUBJECT"
  if command -v psql >/dev/null 2>&1; then
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
  else
    local attempt
    local cleanup_status
    local cleanup_output_file
    local pg_module_dir
    remaining=""
    cleanup_status=1
    cleanup_error_file="$(mktemp)"
    cleanup_output_file="$(mktemp)"
    pg_module_dir="$(
      find "$PWD/node_modules/.pnpm" -path "*/node_modules/pg/package.json" -print -quit 2>/dev/null | xargs dirname
    )"
    if [[ -z "$pg_module_dir" ]]; then
      echo "ERROR: psql is unavailable and the Node pg fallback is not installed" >&2
      exit 1
    fi
    for attempt in 1 2 3 4 5; do
      if DB_URL="$db_url" SMOKE_AUTH_SUBJECT="$SMOKE_AUTH_SUBJECT" PG_MODULE_DIR="$pg_module_dir" node >"$cleanup_output_file" 2>"$cleanup_error_file" <<'NODE'
const { Client } = require(process.env.PG_MODULE_DIR);

async function main() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: { rejectUnauthorized: true },
  });
  const subject = process.env.SMOKE_AUTH_SUBJECT;
  await client.connect();
  await client.query("DELETE FROM agent_runtime.agent_instances WHERE auth_subject = $1", [subject]);
  const result = await client.query(
    "SELECT count(*)::int AS count FROM agent_runtime.agent_instances WHERE auth_subject = $1",
    [subject],
  );
  await client.end();
  process.stdout.write(String(result.rows[0]?.count ?? -1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
      then
        remaining="$(cat "$cleanup_output_file")"
        cleanup_status=0
        break
      fi
      echo "WARN: Node smoke teardown attempt $attempt failed; retrying" >&2
      sleep 5
    done
    if [[ "$cleanup_status" != "0" ]]; then
      echo "WARN: local Node smoke teardown failed; retrying from Runtime VM" >&2
      if remaining="$(teardown_smoke_row_via_runtime_vm 2>"$cleanup_error_file")"; then
        cleanup_status=0
      else
        cat "$cleanup_error_file" >&2
        echo "ERROR: Runtime VM smoke teardown failed before verification" >&2
        exit 1
      fi
    fi
    rm -f "$cleanup_error_file" "$cleanup_output_file"
  fi

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

curl_resolve_args=()
if [[ -n "$RUNTIME_RESOLVE_IP" ]]; then
  runtime_host="$(
    node -e 'const url = new URL(process.argv[1]); process.stdout.write(url.hostname);' "$RUNTIME_BASE_URL"
  )"
  curl_resolve_args=(--resolve "$runtime_host:443:$RUNTIME_RESOLVE_IP")
fi

echo "→ POST $RUNTIME_BASE_URL/internal/sessions/start"
curl -sS \
  "${curl_resolve_args[@]}" \
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
