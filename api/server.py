"""
Backend API para o portfólio — agrega todos os dados do GitHub em uma única chamada.
Cache persistido no Google Cloud Storage (sobrevive a cold starts do Cloud Run).
Atualização manual via GET /api/refresh?key=<REFRESH_KEY>.

Uso local:
    pip install flask requests google-cloud-storage
    python server.py
"""

import json
import os
import time
import threading
from pathlib import Path

import requests
from flask import Flask, jsonify, request

# ── Config ──────────────────────────────────────────────────────────────
GITHUB_USER = "rodrigorizandobr"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REFRESH_KEY = os.environ.get("REFRESH_KEY", "")
GCS_BUCKET = os.environ.get("GCS_BUCKET", "rodrigo-matheus-cache")
GCS_BLOB = "github_cache.json"
CACHE_FILE = Path(__file__).parent / "github_cache.json"  # fallback local

app = Flask(__name__, static_folder=None)

# Lock para evitar refresh simultâneo
_refresh_lock = threading.Lock()

# ── GitHub helpers ──────────────────────────────────────────────────────
_session = requests.Session()
_session.headers.update(
    {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
)


def _gh_get(url: str, **kwargs) -> requests.Response:
    """GET com retry automático em rate-limit (403/429)."""
    while True:
        r = _session.get(url, timeout=30, **kwargs)
        if r.status_code in (403, 429):
            wait = int(r.headers.get("Retry-After", 5))
            print(f"[rate-limit] aguardando {wait}s …")
            time.sleep(wait)
            continue
        return r


def _fetch_all_repos() -> list[dict]:
    """Busca todos os repos públicos (paginado)."""
    repos: list[dict] = []
    page = 1
    while True:
        r = _gh_get(
            f"https://api.github.com/users/{GITHUB_USER}/repos",
            params={"per_page": 100, "page": page, "type": "owner", "sort": "updated"},
        )
        r.raise_for_status()
        data = r.json()
        repos.extend(data)
        if len(data) < 100:
            break
        page += 1
    return repos


def _fetch_sparkline(repo_name: str) -> dict | None:
    """Busca commits dos últimos 28 dias e agrupa por dia para o sparkline."""
    from datetime import datetime, timedelta, timezone

    since = (datetime.now(timezone.utc) - timedelta(days=28)).strftime("%Y-%m-%dT00:00:00Z")
    commits_raw: list[dict] = []
    page = 1
    while True:
        r = _gh_get(
            f"https://api.github.com/repos/{GITHUB_USER}/{repo_name}/commits",
            params={"since": since, "per_page": 100, "page": page},
        )
        if not r.ok:
            return None
        batch = r.json()
        if not isinstance(batch, list):
            return None
        commits_raw.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    # Agrupar por dia (28 buckets)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    days = [0] * 28
    for c in commits_raw:
        try:
            dt_str = c["commit"]["author"]["date"]
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            delta = (today - dt.replace(hour=0, minute=0, second=0, microsecond=0)).days
            if 0 <= delta < 28:
                days[27 - delta] += 1
        except (KeyError, ValueError):
            continue

    total = sum(days)
    return {"days": days, "commits": total}


def _fetch_commits(repo_name: str) -> list[dict]:
    """Busca os 5 commits mais recentes."""
    r = _gh_get(
        f"https://api.github.com/repos/{GITHUB_USER}/{repo_name}/commits",
        params={"per_page": 5},
    )
    if not r.ok:
        return []
    result = []
    for c in r.json():
        commit_info = c.get("commit", {})
        author_info = commit_info.get("author", {})
        result.append(
            {
                "sha": (c.get("sha") or "")[:7],
                "date": author_info.get("date", ""),
                "message": commit_info.get("message", "").split("\n")[0][:80],
            }
        )
    return result


def _build_cache() -> dict:
    """Constrói o payload completo: repos + sparklines + commits."""
    print("[cache] buscando repos …")
    repos = _fetch_all_repos()
    repos.sort(key=lambda r: r.get("pushed_at") or r.get("updated_at") or "", reverse=True)

    result = []
    for i, repo in enumerate(repos):
        name = repo["name"]
        print(f"[cache] ({i + 1}/{len(repos)}) {name} — sparkline + commits")
        sparkline = _fetch_sparkline(name)
        commits = _fetch_commits(name)
        status = f"{sparkline['commits']} commits em 28d" if sparkline else "sem dados"
        print(f"  → sparkline: {status}, commits recentes: {len(commits)}")
        result.append(
            {
                "name": name,
                "html_url": repo.get("html_url", ""),
                "description": repo.get("description") or "",
                "language": repo.get("language") or "",
                "topics": (repo.get("topics") or [])[:5],
                "stargazers_count": repo.get("stargazers_count", 0),
                "forks_count": repo.get("forks_count", 0),
                "pushed_at": repo.get("pushed_at") or repo.get("updated_at") or "",
                "sparkline": sparkline,
                "commits": commits,
            }
        )

    return {"ts": time.time(), "repos": result}


# ── Cache: GCS (cloud) com fallback local ──────────────────────────────
def _gcs_blob():
    """Retorna o blob do GCS (lazy import para funcionar local sem a lib)."""
    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        return bucket.blob(GCS_BLOB)
    except Exception as e:
        print(f"[gcs] indisponível: {e}")
        return None


def _read_cache() -> dict | None:
    """Lê cache do GCS. Fallback para disco local."""
    # Tentar GCS primeiro
    blob = _gcs_blob()
    if blob:
        try:
            raw = blob.download_as_text(encoding="utf-8")
            data = json.loads(raw)
            print(f"[cache] lido do GCS ({len(data.get('repos', []))} repos)")
            return data
        except Exception as e:
            print(f"[gcs] erro ao ler: {e}")
    # Fallback local
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def _write_cache(data: dict) -> None:
    """Salva cache no GCS + disco local."""
    payload = json.dumps(data, ensure_ascii=False)
    # GCS
    blob = _gcs_blob()
    if blob:
        try:
            blob.upload_from_string(payload, content_type="application/json")
            print(f"[cache] salvo no GCS")
        except Exception as e:
            print(f"[gcs] erro ao salvar: {e}")
    # Local (backup)
    CACHE_FILE.write_text(payload, encoding="utf-8")


def _get_repos_data() -> dict:
    """Retorna dados do cache (sempre disponível após warm-up)."""
    cached = _read_cache()
    if cached is not None:
        return cached
    # Fallback: se por algum motivo o cache sumiu, reconstrói
    with _refresh_lock:
        cached = _read_cache()
        if cached is not None:
            return cached
        data = _build_cache()
        _write_cache(data)
        return data


# ── Rotas ───────────────────────────────────────────────────────────────
@app.route("/api/repos")
def api_repos():
    data = _get_repos_data()
    resp = jsonify(data["repos"])
    resp.headers["Cache-Control"] = "private, max-age=600"
    return resp


@app.route("/api/refresh")
def api_refresh():
    """Refresh manual via GET com chave secreta."""
    key = request.args.get("key", "")
    if key != REFRESH_KEY:
        return jsonify({"error": "unauthorized"}), 403
    print("[refresh] disparado manualmente …")
    try:
        with _refresh_lock:
            data = _build_cache()
            _write_cache(data)
        return jsonify({"ok": True, "repos": len(data["repos"])})
    except Exception as e:
        print(f"[refresh] erro: {e}")
        return jsonify({"error": str(e)}), 500


def warmup():
    """Pré-aquece o cache lendo do GCS. Chamado pelo Dockerfile."""
    print("[server] carregando cache …")
    _get_repos_data()
    print("[server] cache pronto!")


if __name__ == "__main__":
    warmup()
    port = int(os.environ.get("PORT", 5000))
    print(f"[server] http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
