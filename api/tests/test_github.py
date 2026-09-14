"""Logica de agregacao do GitHub: buckets da sparkline e formatacao de commits."""

from datetime import datetime, timedelta, timezone

import pytest

import server


class FakeResponse:
    def __init__(self, payload, ok=True, status_code=200):
        self._payload = payload
        self.ok = ok
        self.status_code = status_code
        self.headers = {}

    def json(self):
        return self._payload


def commit_em(dias_atras, sha="abcdef1234567890", mensagem="fix"):
    dt = datetime.now(timezone.utc) - timedelta(days=dias_atras)
    return {"sha": sha, "commit": {"message": mensagem, "author": {"date": dt.strftime("%Y-%m-%dT%H:%M:%SZ")}}}


class TestSparkline:
    def test_agrupa_commits_em_28_buckets_diarios(self, monkeypatch):
        monkeypatch.setattr(
            server, "_gh_get",
            lambda *a, **kw: FakeResponse([commit_em(0), commit_em(0), commit_em(3)]),
        )

        resultado = server._fetch_sparkline("repo")

        assert len(resultado["days"]) == 28
        assert resultado["commits"] == 3
        assert resultado["days"][27] == 2   # hoje fica na ultima posicao
        assert resultado["days"][24] == 1   # 3 dias atras
        assert sum(resultado["days"]) == 3

    def test_descarta_commits_fora_da_janela_de_28_dias(self, monkeypatch):
        monkeypatch.setattr(
            server, "_gh_get",
            lambda *a, **kw: FakeResponse([commit_em(0), commit_em(40)]),
        )

        resultado = server._fetch_sparkline("repo")

        # o commit de 40 dias atras nao entra em nenhum bucket
        assert resultado["commits"] == 1
        assert sum(resultado["days"]) == 1

    def test_repo_vazio_devolve_sparkline_zerada_e_nao_none(self, monkeypatch):
        monkeypatch.setattr(server, "_gh_get", lambda *a, **kw: FakeResponse([]))

        resultado = server._fetch_sparkline("repo")

        assert resultado == {"days": [0] * 28, "commits": 0}

    def test_erro_do_github_devolve_none(self, monkeypatch):
        monkeypatch.setattr(server, "_gh_get", lambda *a, **kw: FakeResponse(None, ok=False, status_code=404))

        assert server._fetch_sparkline("repo-privado") is None

    def test_data_malformada_nao_derruba_a_agregacao(self, monkeypatch):
        ruim = {"sha": "x", "commit": {"message": "m", "author": {"date": "nao-e-data"}}}
        monkeypatch.setattr(server, "_gh_get", lambda *a, **kw: FakeResponse([commit_em(0), ruim]))

        resultado = server._fetch_sparkline("repo")

        assert resultado["commits"] == 1


class TestCommits:
    def test_encurta_sha_para_7_e_pega_so_a_primeira_linha(self, monkeypatch):
        monkeypatch.setattr(
            server, "_gh_get",
            lambda *a, **kw: FakeResponse([
                commit_em(0, sha="bc22b09ffffffffff", mensagem="page blog\n\ndetalhe longo ignorado")
            ]),
        )

        (commit,) = server._fetch_commits("repo")

        assert commit["sha"] == "bc22b09"
        assert commit["message"] == "page blog"

    def test_trunca_mensagem_em_80_caracteres(self, monkeypatch):
        monkeypatch.setattr(
            server, "_gh_get",
            lambda *a, **kw: FakeResponse([commit_em(0, mensagem="x" * 200)]),
        )

        (commit,) = server._fetch_commits("repo")

        assert len(commit["message"]) == 80

    def test_erro_do_github_devolve_lista_vazia(self, monkeypatch):
        monkeypatch.setattr(server, "_gh_get", lambda *a, **kw: FakeResponse(None, ok=False))

        assert server._fetch_commits("repo") == []


class TestI18n:
    def test_carrega_pt_e_en_do_disco(self):
        traducoes = server._load_i18n()

        assert set(traducoes) == {"pt", "en"}
        assert traducoes["pt"]["lang"] == "pt"
