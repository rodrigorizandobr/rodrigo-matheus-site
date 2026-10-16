#!/bin/bash
# Instala (ou atualiza) a rotina de recorte no launchd, de 15 em 15 min.
#
# Por que copia em vez de rodar daqui: o macOS NÃO deixa processo em segundo plano ler a pasta do
# Google Drive (~/Library/CloudStorage) — o launchd morreu com "Operation not permitted". Dar
# "Acesso Total ao Disco" ao bash abriria um buraco grande demais. Então a rotina vive numa cópia
# em ~/Library/Application Support, com ambiente Python próprio e só as chaves que usa.
#
# MUDOU api/clip_worker.py ou api/blog/? Rode este script de novo — a cópia não se atualiza sozinha.
# Desinstalar: launchctl bootout gui/$(id -u)/br.com.rodrigomatheus.recorte; rm -rf "$HOME/Library/Application Support/rodrigo-matheus-recorte" ~/Library/LaunchAgents/br.com.rodrigomatheus.recorte.plist
# Log:         tail -f ~/Library/Logs/rodrigo-matheus-recorte.log
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/rodrigo-matheus-recorte"
ROTULO="br.com.rodrigomatheus.recorte"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
LOG="$HOME/Library/Logs/rodrigo-matheus-recorte.log"
mkdir -p "$DEST/app" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

# 1. código (só o que a rotina importa)
rsync -a --delete --exclude __pycache__ "$RAIZ/api/blog" "$RAIZ/api/i18n" "$RAIZ/api/clip_worker.py" \
      "$RAIZ/api/requirements.txt" "$RAIZ/api/requirements-worker.txt" "$DEST/app/"

# 2. ambiente Python próprio
[ -x "$DEST/venv/bin/python" ] || python3 -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install -q --upgrade -r "$DEST/app/requirements-worker.txt"

# 3. só as chaves que a rotina usa, legíveis só por você
( umask 077; grep -E '^(export )?(GEMINI_API_KEY|GCS_BUCKET)=' "$RAIZ/.env" > "$DEST/env" )

# 4. o que o launchd chama
cat > "$DEST/run.sh" <<RUN
#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
set -a; source "$DEST/env"; set +a
# fixo: sem isto o Firestore cai no projeto padrão do gcloud (já gravou em br51-app)
export GOOGLE_CLOUD_PROJECT=rodrigo-matheus GRPC_VERBOSITY=ERROR
cd "$DEST/app"
exec "$DEST/venv/bin/python" clip_worker.py
RUN
chmod +x "$DEST/run.sh"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DEST/run.sh</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <!-- Standard, não Background: com Background o macOS dá prioridade mínima e o corte que leva
       40 s à mão levou 20 min (medido). Roda poucos minutos a cada 15. -->
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "instalado: $ROTULO (a cada 15 min), código copiado para $DEST"
echo "log: $LOG — mudou a rotina? rode este script de novo."
