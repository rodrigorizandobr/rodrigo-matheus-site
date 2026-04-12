"""
Backend API for the portfolio — aggregates all GitHub data in a single call.
Cache persisted on Google Cloud Storage (survives Cloud Run cold starts).
Manual refresh via GET /api/refresh?key=<REFRESH_KEY>.

Local usage:
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
CACHE_FILE = Path(__file__).parent / "github_cache.json"  # local fallback

app = Flask(__name__, static_folder=None)

# Lock to prevent concurrent refresh
_refresh_lock = threading.Lock()

# ── i18n ────────────────────────────────────────────────────────────────
_i18n_dir = Path(__file__).parent / "i18n"

def _load_i18n() -> dict:
    """Load all translation files."""
    translations = {}
    for f in sorted(_i18n_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            lang = data.get("lang", f.stem)
            translations[lang] = data
        except (json.JSONDecodeError, KeyError) as e:
            print(f"[i18n] error reading {f.name}: {e}")
    return translations

_i18n_cache: dict = {}

def _get_i18n() -> dict:
    global _i18n_cache
    if not _i18n_cache:
        _i18n_cache = _load_i18n()
    return _i18n_cache

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
    """GET with automatic retry on rate-limit (403/429)."""
    while True:
        r = _session.get(url, timeout=30, **kwargs)
        if r.status_code in (403, 429):
            wait = int(r.headers.get("Retry-After", 5))
            print(f"[rate-limit] waiting {wait}s …")
            time.sleep(wait)
            continue
        return r


def _fetch_all_repos() -> list[dict]:
    """Fetch all public repos (paginated)."""
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
    """Fetch commits from the last 28 days and group by day for the sparkline."""
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

    # Group by day (28 buckets)
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
    """Fetch the 5 most recent commits."""
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
    """Build the full payload: repos + sparklines + commits."""
    print("[cache] fetching repos …")
    repos = _fetch_all_repos()
    repos.sort(key=lambda r: r.get("pushed_at") or r.get("updated_at") or "", reverse=True)

    result = []
    for i, repo in enumerate(repos):
        name = repo["name"]
        print(f"[cache] ({i + 1}/{len(repos)}) {name} — sparkline + commits")
        sparkline = _fetch_sparkline(name)
        commits = _fetch_commits(name)
        status = f"{sparkline['commits']} commits in 28d" if sparkline else "no data"
        print(f"  → sparkline: {status}, recent commits: {len(commits)}")
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


# ── Cache: GCS (cloud) with local fallback ─────────────────────────────
def _gcs_blob(blob_name: str = GCS_BLOB):
    """Return a GCS blob (lazy import so it works locally without the lib)."""
    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        return bucket.blob(blob_name)
    except Exception as e:
        print(f"[gcs] unavailable: {e}")
        return None


def _read_cache() -> dict | None:
    """Read cache from GCS. Falls back to local disk."""
    # Try GCS first
    blob = _gcs_blob()
    if blob:
        try:
            raw = blob.download_as_text(encoding="utf-8")
            data = json.loads(raw)
            print(f"[cache] read from GCS ({len(data.get('repos', []))} repos)")
            return data
        except Exception as e:
            print(f"[gcs] read error: {e}")
    # Local fallback
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def _write_cache(data: dict) -> None:
    """Save cache to GCS + local disk."""
    payload = json.dumps(data, ensure_ascii=False)
    # GCS (private cache blob)
    blob = _gcs_blob()
    if blob:
        try:
            blob.upload_from_string(payload, content_type="application/json")
            print("[cache] saved to GCS")
        except Exception as e:
            print(f"[gcs] write error: {e}")
    # Local (backup)
    CACHE_FILE.write_text(payload, encoding="utf-8")


def _get_repos_data() -> dict:
    """Return cached data (always available after warm-up)."""
    cached = _read_cache()
    if cached is not None:
        return cached
    # Fallback: rebuild if cache is missing
    with _refresh_lock:
        cached = _read_cache()
        if cached is not None:
            return cached
        data = _build_cache()
        _write_cache(data)
        return data


# ── Routes ──────────────────────────────────────────────────────────────
@app.route("/api/data")
def api_data():
    """Return i18n + repos payload. Served via Firebase rewrite → Cloud Run."""
    cache = _get_repos_data()
    resp = jsonify({"i18n": _get_i18n(), "repos": cache.get("repos", [])})
    resp.headers["Cache-Control"] = "public, s-maxage=600, max-age=60"
    return resp


@app.route("/api/refresh")
def api_refresh():
    """Manual refresh via GET with secret key."""
    key = request.args.get("key", "")
    if key != REFRESH_KEY:
        return jsonify({"error": "unauthorized"}), 403
    print("[refresh] triggered manually …")
    try:
        with _refresh_lock:
            data = _build_cache()
            _write_cache(data)
        return jsonify({"ok": True, "repos": len(data["repos"])})
    except Exception as e:
        print(f"[refresh] error: {e}")
        return jsonify({"error": str(e)}), 500


def warmup():
    """Warm up cache by reading from GCS (non-blocking on import)."""
    print("[server] loading cache …")
    cached = _read_cache()
    if cached:
        print(f"[server] cache ready ({len(cached.get('repos', []))} repos)")
    else:
        print("[server] no cache yet — call /api/refresh to build it")


# Run warmup in a background thread so gunicorn can start immediately
threading.Thread(target=warmup, daemon=True).start()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[server] http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
