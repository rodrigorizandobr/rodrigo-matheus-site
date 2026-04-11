#!/usr/bin/env bash
set -euo pipefail

# ── Configurações ────────────────────────────────────────────────────
PROJECT_ID="rodrigo-matheus"
REGION="southamerica-east1"           # São Paulo
SERVICE_NAME="portfolio-api"
DOMAIN="rodrigomatheus.com.br"

echo "══════════════════════════════════════════════"
echo "  Deploy: Firebase Hosting + Cloud Run"
echo "══════════════════════════════════════════════"

# ── 1. Cloud Run (API Python) ─────────────────────────────────
echo ""
echo "▸ [1/2] Deploy do backend no Cloud Run …"
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
  --set-env-vars "GITHUB_TOKEN=${GITHUB_TOKEN:-}" \
  --quiet

echo "✔ Cloud Run deployed"

# ── 2. Firebase Hosting (serve site/) ─────────────────────────
echo ""
echo "▸ [2/2] Deploy do Firebase Hosting …"
firebase deploy --only hosting --project "$PROJECT_ID"

echo ""
echo "══════════════════════════════════════════════"
echo "  ✔ Deploy completo!"
echo "  Site: https://$DOMAIN"
echo "══════════════════════════════════════════════"
