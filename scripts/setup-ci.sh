#!/usr/bin/env bash
#
# One-time: create a deployer service account on deleg8-dev, grant the roles the
# GitHub Actions workflow needs, mint a key, and store it as the GCP_SA_KEY repo
# secret. Requires gcloud (deleg8-dev owner) and gh (repo admin) authed.
#
set -euo pipefail

PROJECT_ID="deleg8-dev"
SA_NAME="laws-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="sabirmgd/laws-of-ai"
KEY_FILE="$(mktemp -t laws-sa-key).json"

echo "==> Creating service account $SA_EMAIL (if absent)"
gcloud iam service-accounts create "$SA_NAME" \
  --project "$PROJECT_ID" \
  --display-name "Laws of AI — Cloud Run deployer" 2>/dev/null || echo "    (already exists)"

for ROLE in \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/storage.admin \
  roles/iam.serviceAccountUser; do
  echo "==> Granting $ROLE"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$SA_EMAIL" \
    --role "$ROLE" --condition=None --quiet >/dev/null
done

echo "==> Minting key and storing as GitHub secret GCP_SA_KEY"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account "$SA_EMAIL" --project "$PROJECT_ID" --quiet
gh secret set GCP_SA_KEY --repo "$REPO" < "$KEY_FILE"
rm -f "$KEY_FILE"

echo "==> CI is wired. Pushes to main now auto-deploy to Cloud Run."
