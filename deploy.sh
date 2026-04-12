#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
PROJECT_ID="rodrigo-matheus"
REGION="southamerica-east1"           # São Paulo
SERVICE_NAME="portfolio-api"
DOMAIN="rodrigomatheus.com.br"

echo "══════════════════════════════════════════════"
echo "  Deploy: Firebase Hosting + Cloud Run"
echo "══════════════════════════════════════════════"

# ── 1. Cloud Run (Python API) ─────────────────────────────────────
echo ""
echo "▸ [1/3] Deploying backend to Cloud Run …"
gcloud run deploy "$SERVICE_NAME" \
  --source api \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 300 \
  --quiet

# Set env vars separately (--source deploy resets them; special chars like @ break inline)
if [[ -n "${REFRESH_KEY:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  gcloud run services update "$SERVICE_NAME" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --set-env-vars "REFRESH_KEY=${REFRESH_KEY}" \
    --set-env-vars "GITHUB_TOKEN=${GITHUB_TOKEN}" \
    --set-env-vars "GCS_BUCKET=${GCS_BUCKET:-rodrigo-matheus-cache}" \
    --quiet
else
  echo "⚠ Env vars not loaded — run 'source .env' first. Skipping env update."
fi

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format="value(status.url)")
echo "✔ Cloud Run deployed → $SERVICE_URL"

# ── 2. Firebase Hosting (serves site/) ─────────────────────────────
echo ""
echo "▸ [2/2] Deploying Firebase Hosting …"
firebase deploy --only hosting --project "$PROJECT_ID"

echo ""
echo "══════════════════════════════════════════════"
echo "  ✔ Deploy complete!"
echo "  Site: https://$DOMAIN"
echo "══════════════════════════════════════════════"
