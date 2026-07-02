#!/usr/bin/env bash
#
# local-stack.sh — bring up the two server deployables (Control Plane + Agent
# Runtime) together for an end-to-end local smoke. The clients (Mobile sim,
# Desktop) are launched from their own runbooks and pointed at these ports; this
# script owns only the backend half of the stack.
#
#   scripts/local-stack.sh          # build + start both, wait for health, tail logs
#   scripts/local-stack.sh --down   # stop both and free their ports (idempotent)
#
# Self-cleaning: Ctrl-C (or any exit) stops both processes. Reads each service's
# git-ignored .env via Node's --env-file. Full recipe + client wiring:
# docs/DEVELOPMENT.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -n "${NVM_DIR:-}" && -s "$NVM_DIR/nvm.sh" ]]; then
  # Conductor agents can inherit an older captured PATH; pin the repo's CI Node.
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null
fi

# Neon exposes IPv6 and IPv4 addresses. Some local networks (this one included)
# have no usable IPv6 egress, so the dual-stack Neon hosts' AAAA addresses are
# unreachable. `--dns-result-order=ipv4first` only *reorders* the resolved
# addresses; Node's Happy Eyeballs (autoSelectFamily) still races the dead IPv6
# route, which surfaces intermittently as `EHOSTUNREACH`/`ETIMEDOUT` ->
# `AggregateError` -> `NeonDbError` on both the pg (5432) and serverless-HTTP
# paths, aborting turns before the companion reply lands.
# `--no-network-family-autoselection` stops the IPv6 race so both services
# connect over IPv4 only.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first --no-network-family-autoselection"

CP_DIR="services/control-plane"
AR_DIR="services/agent-runtime"
CP_PORT=8080
AR_PUBLIC_PORT=8787
AR_INTERNAL_PORT=8081

RUN_DIR="/tmp/intentive-local-stack"
CP_LOG="$RUN_DIR/control-plane.log"
AR_LOG="$RUN_DIR/agent-runtime.log"

free_ports() {
  for port in "$CP_PORT" "$AR_PUBLIC_PORT" "$AR_INTERNAL_PORT"; do
    lsof -ti "tcp:$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
}

# Reap orphaned launchers + log-tailers left by earlier runs killed uncleanly
# (agent/session teardown or a SIGKILL never fires the EXIT trap). Their node
# services are already gone — the ports are free — so free_ports misses them,
# and the bash launcher + its `tail -f` linger forever as deadweight. Match on
# the script path / run dir; never kill ourselves ($$).
reap_strays() {
  { pgrep -f "tail .*-f .*$RUN_DIR" 2>/dev/null || true; } | grep -vx "$$" | xargs kill -9 2>/dev/null || true
  { pgrep -f "local-stack\.sh"      2>/dev/null || true; } | grep -vx "$$" | xargs kill -9 2>/dev/null || true
}

teardown() {
  echo
  echo "→ stopping local stack…"
  free_ports
  reap_strays
  echo "✓ stopped (ports $CP_PORT / $AR_PUBLIC_PORT / $AR_INTERNAL_PORT free, strays reaped)"
}

if [[ "${1:-}" == "--down" || "${1:-}" == "--kill" ]]; then
  teardown
  rm -rf "$RUN_DIR"
  exit 0
fi

# --- preflight -------------------------------------------------------------
for dir in "$CP_DIR" "$AR_DIR"; do
  if [[ ! -f "$dir/.env" ]]; then
    echo "✗ $dir/.env is missing. Copy $dir/.env.example → $dir/.env first (see docs/DEVELOPMENT.md)." >&2
    exit 1
  fi
done

if grep -q "REPLACE_WITH_YOUR_KEY" "$AR_DIR/.env"; then
  echo "✗ $AR_DIR/.env still has the placeholder OPENROUTER_API_KEY — set a real key before starting." >&2
  exit 1
fi

mkdir -p "$RUN_DIR"
free_ports
trap teardown EXIT INT TERM

# --- build -----------------------------------------------------------------
echo "→ building Control Plane + Agent Runtime (and their workspace deps)…"
pnpm --filter "@intentive/control-plane..." --filter "@intentive/agent-runtime..." run build

# --- start -----------------------------------------------------------------
echo "→ starting Control Plane on :$CP_PORT  (log: $CP_LOG)"
node --env-file="$CP_DIR/.env" "$CP_DIR/dist/main.js" >"$CP_LOG" 2>&1 &
CP_PID=$!

echo "→ starting Agent Runtime — WS :$AR_PUBLIC_PORT, internal :$AR_INTERNAL_PORT  (log: $AR_LOG)"
node --env-file="$AR_DIR/.env" "$AR_DIR/dist/main.js" >"$AR_LOG" 2>&1 &
AR_PID=$!

# --- wait for health -------------------------------------------------------
wait_health() {
  local name="$1" url="$2" pid="$3" tries=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "✗ $name exited during startup. Last log lines:" >&2
      tail -n 30 "$4" >&2
      exit 1
    fi
    tries=$((tries + 1))
    if [[ $tries -gt 240 ]]; then
      echo "✗ $name did not become healthy within ~120s. See $4" >&2
      exit 1
    fi
    sleep 0.5
  done
  echo "✓ $name healthy ($url)"
}

# Control Plane: wait on /ready (not /health) — it returns 503 until the Neon dev
# branch wakes from scale-to-zero, so this both confirms Neon+JWKS and warms the
# branch so the first real journey request isn't slow. Allow extra time for the
# cold start.
wait_health "Control Plane" "http://localhost:$CP_PORT/ready" "$CP_PID" "$CP_LOG"
wait_health "Agent Runtime" "http://localhost:$AR_INTERNAL_PORT/health" "$AR_PID" "$AR_LOG"

cat <<EOF

╭───────────────────────────────────────────────────────────────╮
│  Local stack is up.                                            │
│    Control Plane   http://localhost:$CP_PORT                     │
│    Agent Runtime   ws://localhost:$AR_PUBLIC_PORT/ws  (WS)             │
│                    http://localhost:$AR_INTERNAL_PORT  (internal)        │
│                                                               │
│  Point the clients at the Control Plane and walk the journey: │
│    Mobile  → apps/mobile/.env  EXPO_PUBLIC_CONTROL_PLANE_BASE_URL=http://localhost:$CP_PORT
│    Desktop → INTENTIVE_CONTROL_PLANE_URL=http://localhost:$CP_PORT
│                                                               │
│  Ctrl-C to stop everything.  Tailing logs below…              │
╰───────────────────────────────────────────────────────────────╯

EOF

tail -n +1 -f "$CP_LOG" "$AR_LOG"
