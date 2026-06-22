#!/usr/bin/env bash
# Rebuild the public site and paid skills bundle from the single source:
#   - the website (dist/, incl. the expandable digital edition)
#   - the paid audit skill bundle (no PDF distribution)
# Run this after changing any source. Both outputs stay in sync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f ".env.local" ]]; then
  while IFS= read -r raw; do
    line="${raw#"${raw%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    case "$key" in
      PRODUCT_PUBLIC_ENABLED|FREE_EDITION_ENABLED|PAYMENT_TEST_ENABLED|PRODUCT_PRICE|PRODUCT_CURRENCY)
        export "$key=$value"
        ;;
    esac
  done < ".env.local"
fi

: "${PRODUCT_PUBLIC_ENABLED:=false}"
: "${FREE_EDITION_ENABLED:=true}"
: "${PAYMENT_TEST_ENABLED:=true}"
export PRODUCT_PUBLIC_ENABLED FREE_EDITION_ENABLED PAYMENT_TEST_ENABLED

node build.mjs
node scripts/build-product-kit.mjs
echo "✓ Site + product skill bundle rebuilt from source."
