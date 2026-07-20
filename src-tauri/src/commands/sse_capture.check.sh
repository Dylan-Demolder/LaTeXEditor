#!/usr/bin/env bash
# Capture a REAL streaming response so the SSE decoder can be checked against
# what the provider actually sends, not what the docs claim.
#
# The key is read from the environment and never written to disk or argv:
#   export OPENCODE_API_KEY=...        # or: read -rs OPENCODE_API_KEY; export OPENCODE_API_KEY
#   ./src-tauri/src/commands/sse_capture.check.sh
set -euo pipefail

: "${OPENCODE_API_KEY:?Set OPENCODE_API_KEY in your shell first (it is deliberately not stored anywhere)}"

MODEL="${1:-deepseek-v4-flash}"
OUT="${2:-/tmp/opencode-sse.txt}"

echo "Requesting a streamed completion from $MODEL ..."

curl -sS --fail-with-body \
  -X POST https://opencode.ai/zen/go/v1/chat/completions \
  -H "Authorization: Bearer ${OPENCODE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<JSON > "$OUT"
{
  "model": "${MODEL}",
  "messages": [
    {"role": "system", "content": "You are a LaTeX assistant. Return only LaTeX, no commentary."},
    {"role": "user", "content": "Rewrite more concisely: The experiments that we ran showed good results."}
  ],
  "temperature": 0.2,
  "max_tokens": 120,
  "stream": true
}
JSON

echo
echo "Raw SSE written to $OUT ($(wc -l < "$OUT") lines)."
echo "First frames:"
head -5 "$OUT"
echo
echo "Now verify the decoder against it:  cargo test --lib -- --ignored real_sse"
