# rodrigo-matheus.com.br

Portfólio pessoal com estética cyberpunk, integração com GitHub em tempo real e backend Python — servido via **Firebase Hosting** + **Cloud Run** no Google Cloud.

> **Live:** [rodrigomatheus.com.br](https://rodrigomatheus.com.br)

---

## Arquitetura

```
web/                 ← Frontend v3 (Vite 8 + React 19 + TS) → build em web/dist (Firebase Hosting)
│  src/components/   ← HUD, seções ("telas"), layout
│  src/stage/        ← palco persistente: uma parte do androide por seção (desktop) / faixa (mobile)
│  src/pages/        ← /blog e /blog/<slug> (roteamento mínimo, sem dependência)
│  src/i18n/         ← pt.json + en.json embutidos no build
│  public/hero/      ← busto (webp) + idle loop (mp4/webm)
│  public/scenes/    ← close-ups por seção (webp) + loops (mp4/webm)
│  scripts/          ← gen-image (Gemini) · gen-video (Veo) · pack-hero · pack-scenes
│
api/                 ← Backend Python (Cloud Run — southamerica-east1)
│  server.py         ← Flask API: agrega repos, commits e sparklines do GitHub
│  i18n/             ← cópia legada dos textos (o front v3 não depende mais dela)
│  tests/            ← pytest
│
firebase.json        ← Hosting: serve web/dist, proxy /api/** → Cloud Run, headers de cache + CSP
deploy.sh            ← build+testes do front → Cloud Run → Hosting → refresh do cache
```

### Fluxo de dados

```
Navegador → Firebase Hosting CDN (web/dist: HTML/JS/CSS, webp, mp4/webm)
         → /api/data (rewrite) → Cloud Run (Flask) ↔ Google Cloud Storage (cache JSON)
```

O hero renderiza **sem esperar a API** (i18n vem no bundle). `/api/data` só enriquece: a barra
superior (REPOS / COMMITS·28D / LINK), o carimbo `LAST COMMIT` e a ARENA.

### Personagem

O androide é uma **imagem gerada** (Gemini `gemini-3-pro-image`), animada com **Veo 3.1**
(image-to-video a partir do mesmo still) e transformada em loop sem emenda por palíndromo no ffmpeg.
Cada seção examina uma parte dele (olhos, pescoço, núcleo, cérebro, boca, mão). Não há WebGL.

## Pré-requisitos

- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm install -g firebase-tools`
- Python 3.12+
- Projeto GCP com Cloud Run e Cloud Storage habilitados

---

## Setup local

```bash
# 1. Clone o repo
git clone https://github.com/rodrigorizandobr/rodrigo-matheus-site.git
cd rodrigo-matheus-site

# 2. Crie o .env a partir do exemplo
cp .env.example .env
# Edite com seus valores:
#   GITHUB_TOKEN  → Personal Access Token do GitHub (scope: public_repo)
#   REFRESH_KEY   → Chave secreta para refresh manual do cache
#   GCS_BUCKET    → Nome do bucket GCS para persistir o cache

# 3. Instale as dependências do backend
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Rode o backend localmente
python server.py
# → http://localhost:5000/api/data

# 5. Frontend v3 (proxy /api → produção; não precisa do Flask local)
cd ../web
npm install --legacy-peer-deps
npm run dev
# → http://localhost:5173
```

---

## Testes

```bash
# Frontend
cd web && npm install --legacy-peer-deps && npm test        # vitest (jsdom)
npm run typecheck                                          # tsc app + testes

# Backend
cd api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && pytest
```

23 testes cobrindo as rotas (`/api/data`, `/api/refresh`), a autorizacao do refresh,
o agrupamento da sparkline em 28 buckets diarios, o truncamento de commits e o i18n.
Nenhum deles toca a rede, o GCS ou o cache real — tudo isolado em `conftest.py`.

Os testes nao vao para a imagem do Cloud Run (ver `.dockerignore`).

---

## Deploy

### Deploy completo (recomendado)

```bash
# Carrega variáveis do .env
source .env

# Executa o script de deploy
chmod +x deploy.sh
./deploy.sh
```

O script faz quatro passos e **aborta se qualquer teste falhar**:
0. **web/** — `npm ci`, typecheck, vitest, `vite build` → `web/dist`
1. **Cloud Run** — build e deploy do backend (`api/`)
2. **Firebase Hosting** — deploy de `web/dist`
3. **Cache** — `GET /api/refresh?key=…` para os números do hero ficarem frescos

### Deploy individual

```bash
# Só o backend (Cloud Run)
gcloud run deploy portfolio-api \
  --source api \
  --region southamerica-east1 \
  --project rodrigo-matheus \
  --allow-unauthenticated \
  --set-env-vars "GITHUB_TOKEN=$GITHUB_TOKEN,REFRESH_KEY=$REFRESH_KEY,GCS_BUCKET=$GCS_BUCKET" \
  --quiet

# Só o frontend (Firebase Hosting)
(cd web && npm run build) && firebase deploy --only hosting --project rodrigo-matheus
```

---

## Atualização do cache GitHub

O cache dos repositórios é persistido no **Google Cloud Storage** e atualizado de duas formas:

| Método | Como | Quando |
|---|---|---|
| **Manual (URL)** | Acesse `/api/refresh?key=SUA_REFRESH_KEY` no navegador | Quando quiser atualizar |
| **Cold start** | Cloud Run lê o cache do GCS ao iniciar | Automático |

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `GITHUB_TOKEN` | Personal Access Token do GitHub para evitar rate-limit (scope: `public_repo`) |
| `REFRESH_KEY` | Chave secreta usada no endpoint `/api/refresh?key=`. **Se ausente, `/api/refresh` fica desabilitado (403)** — o servidor avisa no boot. |
| `GCS_BUCKET` | Nome do bucket GCS onde o cache JSON é armazenado |

> **Importante:** O `.env` está no `.gitignore` e nunca é commitado. Use `.env.example` como referência.

---

## Endpoints da API

| Rota | Método | Descrição |
|---|---|---|
| `/api/data` | GET | Retorna `{i18n, repos}` — traduções + repos com sparklines e commits recentes (`s-maxage=600` no CDN, `max-age=60` no browser) |
| `/api/refresh?key=` | GET | Força rebuild do cache (requer chave secreta) |

---

## Stack

- **Frontend:** Vite 8, React 19, TypeScript, Tailwind v4, GSAP + Lenis; personagem em imagem/vídeo gerados (Gemini + Veo)
- **Backend:** Python 3.12, Flask, Gunicorn
- **Hosting:** Firebase Hosting (CDN global)
- **API:** Google Cloud Run (São Paulo — `southamerica-east1`)
- **Cache:** Google Cloud Storage
- **Fontes:** Chakra Petch + Inter + Fira Code (Google Fonts)

---

## Licença

Este projeto é de código aberto para fins educacionais e de referência. Sinta-se livre para explorar a arquitetura e se inspirar.
