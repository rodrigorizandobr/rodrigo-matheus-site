# rodrigo-matheus.com.br

Portfólio pessoal com estética cyberpunk, integração com GitHub em tempo real e backend Python — servido via **Firebase Hosting** + **Cloud Run** no Google Cloud.

> **Live:** [rodrigomatheus.com.br](https://rodrigomatheus.com.br)

---

## Arquitetura

```
site/                ← Frontend estático (Firebase Hosting CDN)
│  index.html        ← Single-page com Canvas Matrix rain, cards 3D flip, sparklines SVG
│  rodrigo.png       ← Foto de perfil
│  cv-pt-br.pdf      ← CV para download
│  favicon.ico + PNGs + site.webmanifest
│
api/                 ← Backend Python (Cloud Run — southamerica-east1)
│  server.py         ← Flask API: agrega repos, commits e sparklines do GitHub
│  Dockerfile        ← Imagem de produção com gunicorn
│  requirements.txt  ← flask, requests, gunicorn, google-cloud-storage
│
firebase.json        ← Hosting config: serve site/, proxy /api/** → Cloud Run
deploy.sh            ← Script único de deploy (Cloud Run + Firebase)
.env.example         ← Template das variáveis de ambiente
```

### Fluxo de dados

```
Navegador → Firebase Hosting CDN (HTML/CSS/imagens)
         → /api/repos (rewrite) → Cloud Run (Flask)
                                      ↕
                               Google Cloud Storage
                            (cache JSON persistente)
                                      ↑
                          Cloud Scheduler (4 AM BRT, refresh diário)
```

O frontend faz **uma única chamada** `GET /api/repos` que retorna todos os repositórios com sparklines (28 dias de commits) e últimos 5 commits já prontos.

---

## Pré-requisitos

- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm install -g firebase-tools`
- Python 3.12+
- Projeto GCP com Cloud Run, Cloud Storage e Cloud Scheduler habilitados

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
# → http://localhost:5000/api/repos

# 5. Para servir o frontend localmente
cd ../site
python -m http.server 8080
# → http://localhost:8080
```

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

O script faz dois passos:
1. **Cloud Run** — build e deploy do backend (`api/`)
2. **Firebase Hosting** — deploy do frontend (`site/`)

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
firebase deploy --only hosting --project rodrigo-matheus
```

---

## Atualização do cache GitHub

O cache dos repositórios é persistido no **Google Cloud Storage** e atualizado de três formas:

| Método | Como | Quando |
|---|---|---|
| **Automático** | Cloud Scheduler dispara `GET /api/refresh` | Todos os dias às 4h (BRT) |
| **Manual (URL)** | Acesse `/api/refresh?key=SUA_REFRESH_KEY` no navegador | Quando quiser forçar |
| **Cold start** | Cloud Run lê o cache do GCS ao iniciar | Automático |

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `GITHUB_TOKEN` | Personal Access Token do GitHub para evitar rate-limit (scope: `public_repo`) |
| `REFRESH_KEY` | Chave secreta usada no endpoint `/api/refresh?key=` |
| `GCS_BUCKET` | Nome do bucket GCS onde o cache JSON é armazenado |

> **Importante:** O `.env` está no `.gitignore` e nunca é commitado. Use `.env.example` como referência.

---

## Endpoints da API

| Rota | Método | Descrição |
|---|---|---|
| `/api/repos` | GET | Retorna todos os repos com sparklines e commits recentes (cache 1h no CDN) |
| `/api/refresh?key=` | GET | Força rebuild do cache (requer chave ou header do Cloud Scheduler) |

---

## Stack

- **Frontend:** HTML/CSS/JS vanilla, Canvas API (Matrix rain), SVG sparklines, CSS 3D transforms
- **Backend:** Python 3.12, Flask, Gunicorn
- **Hosting:** Firebase Hosting (CDN global)
- **API:** Google Cloud Run (São Paulo — `southamerica-east1`)
- **Cache:** Google Cloud Storage
- **Scheduler:** Google Cloud Scheduler
- **Fontes:** Fira Code + Inter (Google Fonts)

---

## Licença

Este projeto é de código aberto para fins educacionais e de referência. Sinta-se livre para explorar a arquitetura e se inspirar.
