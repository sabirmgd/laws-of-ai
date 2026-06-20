#!/usr/bin/env bash
#
# Deploy Laws of AI Agents to Cloud Run and wire up laws.deleg8.dev.
# Idempotent: safe to re-run.
#
# Requires: gcloud (authed as a deleg8-dev editor), and CF creds in env:
#   CF_API_EMAIL   Cloudflare account email
#   CF_API_KEY     Cloudflare Global API Key
#
set -euo pipefail

PROJECT_ID="deleg8-dev"
REGION="us-central1"
SERVICE="laws-of-ai"
DOMAIN="laws.deleg8.dev"
CF_ZONE="deleg8.dev"

CF_API_EMAIL="${CF_API_EMAIL:-}"
CF_API_KEY="${CF_API_KEY:-}"

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
