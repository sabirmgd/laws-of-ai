#!/usr/bin/env bash
# Rebuild the public site and paid skills bundle from the single source:
#   - the website (dist/, incl. the expandable digital edition)
#   - the paid audit skill bundle (no PDF distribution)
# Run this after changing any source. Both outputs stay in sync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node build.mjs
node scripts/build-product-kit.mjs
echo "✓ Site + product skill bundle rebuilt from source."
