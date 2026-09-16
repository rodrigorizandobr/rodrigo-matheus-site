#!/usr/bin/env bash
set -euo pipefail

# ── Segredos ──────────────────────────────────────────────────────────
# Carregado AQUI, e não por `source .env` antes de chamar o script: o .env usa
# `KEY=valor` sem `export`, então as variáveis não atravessavam para este
# subshell e o passo de env vars era pulado em silêncio (o Cloud Run subia sem
# GITHUB_TOKEN/REFRESH_KEY). `set -a` exporta tudo que o arquivo definir.
if [[ -f .env ]]; then
  set -a; source .env; set +a
  echo "✔ .env carregado"
else
  echo "⚠ .env não encontrado — o deploy segue, mas sem env vars"
fi

# ── Config ────────────────────────────────────────────────────────────
PROJECT_ID="rodrigo-matheus"
REGION="southamerica-east1"           # São Paulo
SERVICE_NAME="portfolio-api"
DOMAIN="rodrigomatheus.com.br"

echo "══════════════════════════════════════════════"
echo "  Deploy: Firebase Hosting + Cloud Run"
echo "══════════════════════════════════════════════"

# ── 0. Frontend build (web/) — tests gate the deploy ────────────────
echo ""
echo "▸ [0/4] Building frontend (web/) …"
( cd web \
  && npm ci --legacy-peer-deps \
  && npm run typecheck \
  && npx vitest run \
  && npm run build )
echo "✔ web/dist ready"

# ── 1. Shell do SPA no GCS (antes do Cloud Run) ────────────────────
# `api/blog/page.py` serve /blog/<slug> com as metatags do post. Em condições normais
# ele busca o shell do próprio site, sempre igual ao que o Hosting entrega; esta cópia
# é a rede de segurança para quando o site não responde. Vai ANTES do Cloud Run para a
# revisão nova já subir com o arquivo certo disponível.
echo ""
echo "▸ [1/4] Publicando o shell do SPA …"
gcloud storage cp web/dist/index.html "gs://${GCS_BUCKET:-rodrigo-matheus-cache}/spa-shell.html" \
  --project "$PROJECT_ID" --quiet && echo "✔ spa-shell.html atualizado"

# ── 2. Cloud Run (Python API) ─────────────────────────────────────
echo ""
echo "▸ [2/4] Deploying backend to Cloud Run …"
gcloud run deploy "$SERVICE_NAME" \
  --source api \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --memory 512Mi \
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
    --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:-}" \
    --set-env-vars "BLOG_TICK_KEY=${BLOG_TICK_KEY:-}" \
    --set-env-vars "PIXABAY_API_KEY=${PIXABAY_API_KEY:-}" \
    --set-env-vars "SERPER_API_KEY=${SERPER_API_KEY:-}" \
    --set-env-vars "BLOG_ADMIN_EMAILS=${BLOG_ADMIN_EMAILS:-rodrigorizando@gmail.com}" \
    --set-env-vars "SITE_URL=${SITE_URL:-https://rodrigomatheus.com.br}" \
    --quiet
else
  echo "⚠ REFRESH_KEY/GITHUB_TOKEN ausentes no .env — pulando atualização de env vars."
fi

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format="value(status.url)")
echo "✔ Cloud Run deployed → $SERVICE_URL"

# ── 3. Firebase Hosting (serves web/dist) ──────────────────────────
echo ""
echo "▸ [3/4] Deploying Firebase Hosting (web/dist) …"
# firebase-tools is not installed globally on this machine; npx fetches a pinned major.
FIREBASE="${FIREBASE_BIN:-npx --yes firebase-tools@14}"
$FIREBASE deploy --only hosting --project "$PROJECT_ID"

# ── 4. Warm the GitHub cache so the hero's live numbers are fresh ────
echo ""
echo "▸ [4/4] Refreshing GitHub cache …"
if [[ -n "${REFRESH_KEY:-}" ]]; then
  curl -fsS "https://$DOMAIN/api/refresh?key=${REFRESH_KEY}" && echo "" && echo "✔ cache refreshed" || echo "⚠ refresh failed (site is up; numbers may be stale)"
else
  echo "⚠ REFRESH_KEY not loaded — skipping cache refresh"
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  ✔ Deploy complete!"
echo "  Site: https://$DOMAIN"
echo "══════════════════════════════════════════════"
