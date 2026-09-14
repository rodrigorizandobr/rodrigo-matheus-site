"""Shared fixtures. Keeps every test off the network, off GCS and off the real cache file."""

import os
import sys
from pathlib import Path

import pytest

# server.py reads REFRESH_KEY into a module-level constant at import time,
# so it has to be set before the import below.
os.environ.setdefault("REFRESH_KEY", "test-refresh-key")
os.environ.setdefault("GITHUB_TOKEN", "test-token")

sys.path.insert(0, str(Path(__file__).parent))

import server  # noqa: E402


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    """No GCS, no shared cache file, no leaked i18n memo between tests."""
    monkeypatch.setattr(server, "_gcs_blob", lambda *a, **kw: None)
    monkeypatch.setattr(server, "CACHE_FILE", tmp_path / "github_cache.json")
    monkeypatch.setattr(server, "REFRESH_KEY", "test-refresh-key")
    monkeypatch.setattr(server, "_i18n_cache", {})


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


@pytest.fixture
def cached(monkeypatch):
    """Install a known cache payload so /api/data never rebuilds."""
    payload = {
        "ts": 1_700_000_000.0,
        "repos": [
            {
                "name": "rodrigo-matheus-site",
                "html_url": "https://github.com/rodrigorizandobr/rodrigo-matheus-site",
                "description": "portfolio",
                "language": "Python",
                "topics": ["portfolio"],
                "stargazers_count": 3,
                "forks_count": 0,
                "pushed_at": "2026-04-16T08:34:00Z",
                "sparkline": {"days": [0] * 27 + [2], "commits": 2},
                "commits": [{"sha": "bc22b09", "date": "2026-04-16T08:34:00Z", "message": "page blog"}],
            }
        ],
    }
    monkeypatch.setattr(server, "_read_cache", lambda: payload)
    return payload
