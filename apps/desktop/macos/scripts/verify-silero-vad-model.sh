#!/usr/bin/env bash
set -euo pipefail
export PATH="/bin:/usr/bin:/usr/sbin:/sbin"

EXPECTED_BYTES=2243022
EXPECTED_SHA256="a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808"

fail() {
  echo "Silero VAD model verification failed: $*" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "usage: verify-silero-vad-model.sh PATH"
MODEL_PATH="$1"
[[ -f "$MODEL_PATH" ]] || fail "model file is missing: $MODEL_PATH"

if grep -Fq "version https://git-lfs.github.com/spec/v1" "$MODEL_PATH"; then
  fail "model is a Git LFS pointer; checkout must fetch Git LFS objects"
fi

ACTUAL_BYTES="$(wc -c <"$MODEL_PATH" | tr -d '[:space:]')"
[[ "$ACTUAL_BYTES" == "$EXPECTED_BYTES" ]] \
  || fail "size mismatch: expected $EXPECTED_BYTES bytes, got ${ACTUAL_BYTES:-unknown}"

ACTUAL_SHA256="$(shasum -a 256 "$MODEL_PATH" | awk '{print $1}')"
[[ "$ACTUAL_SHA256" == "$EXPECTED_SHA256" ]] \
  || fail "digest mismatch: expected $EXPECTED_SHA256, got ${ACTUAL_SHA256:-unknown}"

echo "Silero VAD model verified: $MODEL_PATH"
