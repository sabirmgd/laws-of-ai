#!/usr/bin/env bash
#
# Deploy Laws of AI Agents to Cloud Run and wire up laws.deleg8.dev.
# Idempotent: safe to re-run.
#
# Requires: gcloud (authed as a deleg8-dev editor), and CF creds in env:
#   CF_API_EMAIL   Cloudflare account email
#   CF_API_KEY     Cloudflare Global API Key
# Optional .env.local:
#   KIT_V4_API_KEY  Kit V4 key for server-side newsletter signup
#   KIT_FORM_ID     Kit form id to attach subscribers to
#   PAYPAL_CLIENT_ID      PayPal REST app client id
#   PAYPAL_CLIENT_SECRET  PayPal REST app secret
#   PAYPAL_MODE           sandbox or live
#   PAYPAL_WEBHOOK_ID     optional; created/reused automatically if missing
#
set -euo pipefail

PROJECT_ID="deleg8-dev"
REGION="us-central1"
SERVICE="laws-of-ai"
DOMAIN="laws.deleg8.dev"
CF_ZONE="deleg8.dev"
KIT_SECRET_NAME="laws-kit-v4-api-key"
PAYPAL_SECRET_NAME="laws-paypal-client-secret"
FIRESTORE_DATABASE="(default)"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-}"
PROTECTED_BUCKET="${PROTECTED_BUCKET:-}"

read_env_value() {
  local key="$1"
  if [[ ! -f ".env.local" ]]; then
    return 0
  fi
  python3 - "$key" <<'PY'
import sys
from pathlib import Path

key = sys.argv[1]
path = Path(".env.local")
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k.strip() != key:
        continue
    v = v.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    print(v)
    break
PY
}

CF_API_EMAIL="${CF_API_EMAIL:-}"
CF_API_KEY="${CF_API_KEY:-}"
KIT_V4_API_KEY="${KIT_V4_API_KEY:-${KIT_API_KEY:-$(read_env_value KIT_V4_API_KEY)}}"
if [[ -z "$KIT_V4_API_KEY" ]]; then
  KIT_V4_API_KEY="$(read_env_value KIT_API_KEY)"
fi
KIT_FORM_ID="${KIT_FORM_ID:-$(read_env_value KIT_FORM_ID)}"
PAYPAL_CLIENT_ID="${PAYPAL_CLIENT_ID:-$(read_env_value PAYPAL_CLIENT_ID)}"
PAYPAL_CLIENT_SECRET="${PAYPAL_CLIENT_SECRET:-$(read_env_value PAYPAL_CLIENT_SECRET)}"
PAYPAL_MODE="${PAYPAL_MODE:-$(read_env_value PAYPAL_MODE)}"
PAYPAL_MODE="${PAYPAL_MODE:-sandbox}"
PAYPAL_WEBHOOK_ID="${PAYPAL_WEBHOOK_ID:-$(read_env_value PAYPAL_WEBHOOK_ID)}"
PRODUCT_PRICE="${PRODUCT_PRICE:-$(read_env_value PRODUCT_PRICE)}"
PRODUCT_PRICE="${PRODUCT_PRICE:-14.90}"
PRODUCT_CURRENCY="${PRODUCT_CURRENCY:-$(read_env_value PRODUCT_CURRENCY)}"
PRODUCT_CURRENCY="${PRODUCT_CURRENCY:-USD}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-$(read_env_value FIRESTORE_LOCATION)}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"
PROTECTED_BUCKET="${PROTECTED_BUCKET:-$(read_env_value PROTECTED_BUCKET)}"
PROTECTED_BUCKET="${PROTECTED_BUCKET:-deleg8-dev-laws-of-ai-protected}"
RUN_ENV_VARS=(
  "SITE_URL=https://${DOMAIN}/"
  "FIRESTORE_PROJECT_ID=${PROJECT_ID}"
  "FIRESTORE_DATABASE=${FIRESTORE_DATABASE}"
  "PROTECTED_BUCKET=${PROTECTED_BUCKET}"
  "PRODUCT_NAME=AI Agent Audit Kit: 50 Laws Edition"
  "PRODUCT_PRICE=${PRODUCT_PRICE}"
  "PRODUCT_CURRENCY=${PRODUCT_CURRENCY}"
)
RUN_SECRET_BINDINGS=()

join_by_comma() {
  local IFS=","
  echo "$*"
}

upsert_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project "$PROJECT_ID" \
      --data-file=- \
      --quiet >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --project "$PROJECT_ID" \
      --replication-policy=automatic \
      --data-file=- \
      --quiet >/dev/null
  fi
}

grant_secret_access() {
  local name="$1"
  local runtime_sa="$2"
  gcloud secrets add-iam-policy-binding "$name" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${runtime_sa}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
}

echo "==> Ensuring required APIs are enabled"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  datastore.googleapis.com storage.googleapis.com --project "$PROJECT_ID" --quiet

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "==> Ensuring Firestore native database exists"
if gcloud firestore databases describe --database="$FIRESTORE_DATABASE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Firestore database already exists"
else
  echo "    Creating Firestore database in ${FIRESTORE_LOCATION} (location is permanent)"
  gcloud firestore databases create \
    --database="$FIRESTORE_DATABASE" \
    --location="$FIRESTORE_LOCATION" \
    --type=firestore-native \
    --project "$PROJECT_ID" \
    --quiet
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/datastore.user" \
  --quiet >/dev/null

echo "==> Ensuring private protected-edition bucket exists"
if gcloud storage buckets describe "gs://${PROTECTED_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Bucket already exists: gs://${PROTECTED_BUCKET}"
else
  gcloud storage buckets create "gs://${PROTECTED_BUCKET}" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --quiet
fi

gcloud storage buckets add-iam-policy-binding "gs://${PROTECTED_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectViewer" \
  --quiet >/dev/null

echo "==> Applying local offer config and rebuilding site"
node scripts/apply-offer-config.mjs
node build.mjs
node scripts/build-product-kit.mjs

echo "==> Uploading protected digital edition assets"
PROTECTED_STAGE="$(mktemp -d)"
trap 'rm -rf "$PROTECTED_STAGE"' EXIT
cp dist/edition.html dist/edition.css dist/nav.css "$PROTECTED_STAGE/"
mkdir -p "$PROTECTED_STAGE/assets/edition"
cp -R dist/assets/edition/. "$PROTECTED_STAGE/assets/edition/"
mkdir -p "$PROTECTED_STAGE/kit"
cp -R product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition/. "$PROTECTED_STAGE/kit/"
gcloud storage rsync "$PROTECTED_STAGE" "gs://${PROTECTED_BUCKET}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --project "$PROJECT_ID" \
  --quiet

if [[ -n "$KIT_V4_API_KEY" && -n "$KIT_FORM_ID" ]]; then
  echo "==> Updating Secret Manager secret for Kit API key"
  upsert_secret "$KIT_SECRET_NAME" "$KIT_V4_API_KEY"
  grant_secret_access "$KIT_SECRET_NAME" "$RUNTIME_SA"
  RUN_ENV_VARS+=("KIT_FORM_ID=${KIT_FORM_ID}")
  RUN_SECRET_BINDINGS+=("KIT_V4_API_KEY=${KIT_SECRET_NAME}:latest")
else
  echo "!! KIT_V4_API_KEY or KIT_FORM_ID missing — deploying without live newsletter API credentials."
fi

if [[ -n "$PAYPAL_CLIENT_ID" && -n "$PAYPAL_CLIENT_SECRET" ]]; then
  echo "==> Creating or reusing PayPal webhook"
  DISCOVERED_PAYPAL_WEBHOOK_ID="$(PAYPAL_CLIENT_ID="$PAYPAL_CLIENT_ID" PAYPAL_CLIENT_SECRET="$PAYPAL_CLIENT_SECRET" PAYPAL_MODE="$PAYPAL_MODE" node scripts/paypal-webhook.mjs "https://${DOMAIN}/api/paypal/webhook")"
  if [[ -n "$PAYPAL_WEBHOOK_ID" && "$PAYPAL_WEBHOOK_ID" != "$DISCOVERED_PAYPAL_WEBHOOK_ID" ]]; then
    echo "    Replacing configured PAYPAL_WEBHOOK_ID with the webhook for https://${DOMAIN}/api/paypal/webhook"
  fi
  PAYPAL_WEBHOOK_ID="$DISCOVERED_PAYPAL_WEBHOOK_ID"

  echo "==> Updating Secret Manager secret for PayPal client secret"
  upsert_secret "$PAYPAL_SECRET_NAME" "$PAYPAL_CLIENT_SECRET"
  grant_secret_access "$PAYPAL_SECRET_NAME" "$RUNTIME_SA"
  RUN_ENV_VARS+=("PAYPAL_CLIENT_ID=${PAYPAL_CLIENT_ID}")
  RUN_ENV_VARS+=("PAYPAL_MODE=${PAYPAL_MODE}")
  RUN_ENV_VARS+=("PAYPAL_WEBHOOK_ID=${PAYPAL_WEBHOOK_ID}")
  RUN_SECRET_BINDINGS+=("PAYPAL_CLIENT_SECRET=${PAYPAL_SECRET_NAME}:latest")
else
  echo "!! PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing — PayPal checkout will be disabled until configured."
fi

RUN_DEPLOY_ARGS=(--set-env-vars "$(join_by_comma "${RUN_ENV_VARS[@]}")")
if [[ ${#RUN_SECRET_BINDINGS[@]} -gt 0 ]]; then
  RUN_DEPLOY_ARGS+=(--set-secrets "$(join_by_comma "${RUN_SECRET_BINDINGS[@]}")")
fi

echo "==> Deploying $SERVICE to Cloud Run ($PROJECT_ID / $REGION)"
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --port 8080 \
  --min-instances 0 \
  --max-instances 1 \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 256Mi \
  "${RUN_DEPLOY_ARGS[@]}" \
  --quiet

RUN_URL=$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format='value(status.url)')
echo "==> Service URL: $RUN_URL"

echo "==> Creating Cloud Run domain mapping for $DOMAIN"
gcloud beta run domain-mappings create \
  --service "$SERVICE" \
  --domain "$DOMAIN" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet 2>/dev/null || echo "    (mapping already exists)"

echo "==> Fetching DNS records required by the mapping"
gcloud beta run domain-mappings describe \
  --domain "$DOMAIN" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.resourceRecords[].rrdata)' || true

if [[ -z "$CF_API_EMAIL" || -z "$CF_API_KEY" ]]; then
  echo "!! CF_API_EMAIL / CF_API_KEY not set — skipping Cloudflare DNS step."
  echo "   Add a CNAME 'laws' -> ghs.googlehosted.com (DNS only) manually."
  exit 0
fi

echo "==> Upserting Cloudflare CNAME laws -> ghs.googlehosted.com (DNS only)"
CF_API="https://api.cloudflare.com/client/v4"
ZONE_ID=$(curl -s "$CF_API/zones?name=$CF_ZONE" \
  -H "X-Auth-Email: $CF_API_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")

REC_ID=$(curl -s "$CF_API/zones/$ZONE_ID/dns_records?name=$DOMAIN" \
  -H "X-Auth-Email: $CF_API_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" | python3 -c "import sys,json;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else '')")

BODY='{"type":"CNAME","name":"'$DOMAIN'","content":"ghs.googlehosted.com","ttl":1,"proxied":false}'
if [[ -n "$REC_ID" ]]; then
  curl -s -X PUT "$CF_API/zones/$ZONE_ID/dns_records/$REC_ID" \
    -H "X-Auth-Email: $CF_API_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
    -H "Content-Type: application/json" --data "$BODY" >/dev/null
  echo "    updated existing record"
else
  curl -s -X POST "$CF_API/zones/$ZONE_ID/dns_records" \
    -H "X-Auth-Email: $CF_API_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
    -H "Content-Type: application/json" --data "$BODY" >/dev/null
  echo "    created new record"
fi

echo "==> Done. https://$DOMAIN (cert provisioning can take a few minutes)"
