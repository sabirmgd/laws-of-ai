#!/usr/bin/env bash
# Rebuild EVERYTHING from the single source (data/*.json + pdf/assets/ images):
#   - the website (dist/, incl. the expandable digital edition)
#   - the PDF (pdf/Laws-of-AI-Agents.pdf)
# Run this after changing any source. Both outputs stay in sync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node build.mjs
"$ROOT/scripts/render-pdf.sh"
echo "✓ Site + PDF rebuilt from source."
