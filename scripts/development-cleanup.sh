#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---runtime}"

stop_port() {
  lsof -ti "tcp:$1" 2>/dev/null | xargs kill -9 2>/dev/null || true
}

stop_workspace_dev_processes() {
  local pid cmd cwd
  while read -r pid cmd; do
    [[ -n "$pid" && "$pid" != "$$" && "$pid" != "$PPID" ]] || continue
    case "$cmd" in
      *"turbo run dev"*|*"pnpm dev"*|*"npm run dev"*|*"expo start"*|*"webpack-dev-server"*|*"vite"*) ;;
      *) continue ;;
    esac
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }')"
    case "$cwd" in
      "$REPO_ROOT"|"$REPO_ROOT"/*) kill -TERM "$pid" 2>/dev/null || true ;;
    esac
  done < <(ps -u "$(id -u)" -o pid=,command= 2>/dev/null)
}

runtime_cleanup() {
  "$REPO_ROOT/scripts/local-stack.sh" --down
  stop_port 8082
  stop_workspace_dev_processes
  pkill -x Intentive 2>/dev/null || true

  while IFS= read -r udid; do
    [[ -n "$udid" ]] || continue
    xcrun simctl terminate "$udid" com.heyintentive.expo 2>/dev/null || true
  done < <(xcrun simctl list devices booted -j 2>/dev/null | grep -o '"udid" : "[^"]*"' | cut -d'"' -f4)
  xcrun simctl shutdown all 2>/dev/null || true
  osascript -e 'tell application "Simulator" to quit' 2>/dev/null || true

  if command -v tart >/dev/null 2>&1; then
    TART_HOME="${TART_HOME:-/Volumes/T9/Tart}" \
      bash "$REPO_ROOT/apps/desktop/macos/scripts/tart-internal-build.sh" --delete || true
  fi

  rm -f -- "$REPO_ROOT"/apps/mobile/build-*.tar.gz
  rm -rf -- /tmp/intentive-app /tmp/intentive-sim.png /tmp/intentive-metro.log /tmp/intentive-local-stack
  rm -rf -- "${TMPDIR:-/tmp/}"eas-build-local-nodejs "${TMPDIR:-/tmp/}"eas-cli-nodejs
}

status() {
  "$REPO_ROOT/scripts/development-storage.sh" status
  for port in 8080 8787 8081 8082; do
    if pids="$(lsof -ti "tcp:$port" 2>/dev/null)" && [[ -n "$pids" ]]; then
      printf 'port %s: in use by %s\n' "$port" "$(echo "$pids" | paste -sd, -)"
    else
      printf 'port %s: free\n' "$port"
    fi
  done
  xcrun simctl list devices booted 2>/dev/null || true
}

case "$MODE" in
  --runtime|--kill) runtime_cleanup ;;
  --status) status ;;
  *) echo "usage: $0 [--runtime|--status]" >&2; exit 2 ;;
esac
