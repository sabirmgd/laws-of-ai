#!/usr/bin/env bash
# Build the PDF HTML and render it to pdf/Laws-of-AI-Agents.pdf via headless Chrome.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d /tmp/chrome-laws-pdf.XXXXXX)"
OUT="$ROOT/pdf/Laws-of-AI-Agents.pdf"
cd "$ROOT"

# Kill any stale headless render holding a profile lock, then use a fresh throwaway profile.
pkill -f "user-data-dir=/tmp/chrome-laws-pdf" 2>/dev/null || true
trap 'rm -rf "$PROFILE"' EXIT

node build-pdf.mjs

# Chrome's --print-to-pdf writes the file but then sometimes hangs on exit
# (background networking/telemetry). Run it detached, wait for the PDF to be
# written and stable, then kill it — so this script always exits cleanly.
rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --no-first-run --disable-background-networking --disable-component-update \
  --user-data-dir="$PROFILE" \
  --virtual-time-budget=30000 \
  --run-all-compositor-stages-before-draw \
  --print-to-pdf="$OUT" \
  "file://$ROOT/pdf/laws-of-ai.html" >/dev/null 2>&1 &
CHROME_PID=$!

prev=-1
for _ in $(seq 1 60); do
  sleep 1
  [ -f "$OUT" ] || continue
  size=$(stat -f%z "$OUT" 2>/dev/null || echo 0)
  if [ "$size" -gt 0 ] && [ "$size" = "$prev" ]; then break; fi
  prev=$size
done

kill "$CHROME_PID" 2>/dev/null || true
pkill -P "$CHROME_PID" 2>/dev/null || true

[ -f "$OUT" ] || { echo "✗ render failed: no PDF produced" >&2; exit 1; }
echo "✓ rendered -> pdf/Laws-of-AI-Agents.pdf ($(du -h "$OUT" | cut -f1))"
