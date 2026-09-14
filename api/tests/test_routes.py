"""Rotas HTTP: /api/data e /api/refresh."""

import json

import pytest

import server


class TestApiData:
    def test_devolve_i18n_e_repos_numa_unica_chamada(self, client, cached):
        r = client.get("/api/data")
        assert r.status_code == 200
        body = r.get_json()
        assert set(body) == {"i18n", "repos"}
        assert body["repos"] == cached["repos"]

    def test_expoe_os_dois_idiomas_do_site(self, client, cached):
        body = client.get("/api/data").get_json()
        assert set(body["i18n"]) == {"pt", "en"}

    def test_cdn_cacheia_por_10min_e_o_browser_por_1min(self, client, cached):
        r = client.get("/api/data")
        assert r.headers["Cache-Control"] == "public, s-maxage=600, max-age=60"

    def test_nunca_chama_o_github__serve_so_o_cache(self, client, cached, monkeypatch):
        def explode():
            raise AssertionError("/api/data nao pode reconstruir o cache no request")

        monkeypatch.setattr(server, "_build_cache", explode)
        assert client.get("/api/data").status_code == 200


class TestApiRefresh:
    def test_sem_chave_e_negado(self, client):
        r = client.get("/api/refresh")
        assert r.status_code == 403
        assert r.get_json() == {"error": "unauthorized"}

    def test_chave_errada_e_negada(self, client):
        assert client.get("/api/refresh?key=errada").status_code == 403

    def test_chave_errada_nao_reconstroi_o_cache(self, client, monkeypatch):
        def explode():
            raise AssertionError("rebuild disparado sem autorizacao")

        monkeypatch.setattr(server, "_build_cache", explode)
        client.get("/api/refresh?key=errada")

    def test_chave_certa_reconstroi_e_persiste(self, client, monkeypatch):
        payload = {"ts": 1.0, "repos": [{"name": "a"}, {"name": "b"}]}
        monkeypatch.setattr(server, "_build_cache", lambda: payload)

        r = client.get("/api/refresh?key=test-refresh-key")

        assert r.status_code == 200
        assert r.get_json() == {"ok": True, "repos": 2}
        assert json.loads(server.CACHE_FILE.read_text(encoding="utf-8")) == payload

    def test_falha_no_github_vira_500_e_nao_derruba_o_processo(self, client, monkeypatch):
        def boom():
            raise RuntimeError("GitHub 502")

        monkeypatch.setattr(server, "_build_cache", boom)

        r = client.get("/api/refresh?key=test-refresh-key")

        assert r.status_code == 500
        assert "GitHub 502" in r.get_json()["error"]
