#!/bin/bash
# UMA rodada da rotina de recorte (api/clip_worker.py), à mão. O serviço de verdade fica ligado
# escutando o Firestore (scripts/install-clip-worker.sh).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
# launchd não carrega o perfil do terminal: PATH mínimo, sem ffmpeg nem chaves
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$RAIZ/api"
source .venv/bin/activate
set -a; source "$RAIZ/.env"; set +a
# fixo: sem isto o Firestore cai no projeto padrão do gcloud (já gravou em br51-app)
export GOOGLE_CLOUD_PROJECT=rodrigo-matheus
export GRPC_VERBOSITY=ERROR
exec python clip_worker.py --once
