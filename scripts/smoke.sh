#!/usr/bin/env bash
# Post-deploy smoke test for rodrigomatheus.com.br. Exit 1 on the first failure.
set -uo pipefail
BASE="${1:-https://rodrigomatheus.com.br}"
fail=0
check() { # check <label> <url> <expected-status> [grep-pattern]
  local label=$1 url=$2 want=$3 pat=${4:-}
  local body code
  body=$(curl -sS -L -m 20 "$url" -w '\n%{http_code}') || { echo "✗ $label — curl falhou"; fail=1; return; }
  code=${body##*$'\n'}; body=${body%$'\n'*}
  if [[ "$code" != "$want" ]]; then echo "✗ $label — HTTP $code (esperado $want)"; fail=1; return; fi
  if [[ -n "$pat" ]] && ! grep -qE "$pat" <<<"$body"; then echo "✗ $label — corpo sem /$pat/"; fail=1; return; fi
  echo "✔ $label"
}
hdr() { # hdr <label> <url> <header-regex>
  local h; h=$(curl -sSI -L -m 20 "$2" | tr -d '\r')
  if grep -qiE "$3" <<<"$h"; then echo "✔ $1"; else echo "✗ $1 — header ausente: $3"; fail=1; fi
}
check "home HTML"            "$BASE/"                        200 'id="root"'
check "blog"                 "$BASE/blog"                    200 'id="root"'
check "post (SPA fallback)"  "$BASE/blog/why-i-moved-to-cloud-run" 200 'id="root"'
check "posts.json"           "$BASE/blog/posts.json"         200 '"slug"'
check "api/data"             "$BASE/api/data"                200 '"repos"'
check "hero poster"          "$BASE/hero/hero-wide-1280.webp" 200
check "hero video"           "$BASE/hero/idle.mp4"           200
check "scene poster"         "$BASE/scenes/core-1280.webp"   200
check "robots"               "$BASE/robots.txt"              200 'Sitemap'
check "sitemap"              "$BASE/sitemap.xml"             200 '<urlset'
check "llms.txt"             "$BASE/llms.txt"                200 '^# '
check "refresh sem chave → 403" "$BASE/api/refresh"          403
hdr   "CSP presente"         "$BASE/"                        '^content-security-policy:'
hdr   "assets immutable"     "$BASE/$(curl -s "$BASE/" | grep -oE 'assets/index-[^"]+\.js' | head -1)" 'cache-control:.*immutable'
hdr   "nosniff"              "$BASE/"                        '^x-content-type-options: nosniff'
exit $fail
