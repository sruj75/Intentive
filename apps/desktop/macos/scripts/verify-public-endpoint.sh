#!/usr/bin/env bash
set -euo pipefail
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

fail() {
  echo "Public release endpoint verification failed: $*" >&2
  exit 1
}

[[ $# -eq 2 ]] || fail "usage: verify-public-endpoint.sh NAME URL"
ENDPOINT_NAME="$1"
ENDPOINT="$2"

if ! host="$(
  python3 - "$ENDPOINT" <<'PY'
import sys
from urllib.parse import urlsplit

value = sys.argv[1]
try:
    parsed = urlsplit(value)
    port = parsed.port
except ValueError:
    raise SystemExit(1)

if (
    parsed.scheme.lower() != "https"
    or not parsed.netloc
    or not parsed.hostname
    or parsed.username is not None
    or parsed.password is not None
    or any(character.isspace() for character in value)
    or (port is not None and not 1 <= port <= 65535)
):
    raise SystemExit(1)

print(parsed.hostname.lower())
PY
)"; then
  fail "$ENDPOINT_NAME must be a complete HTTPS URL with a valid host and port"
fi

case "$host" in
  localhost|*.localhost|127.*|0.0.0.0|::1|::)
    fail "$ENDPOINT_NAME must not use a loopback or unspecified host"
    ;;
esac
