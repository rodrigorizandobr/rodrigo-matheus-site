"""
/api/refresh e o unico endpoint que gasta cota da API do GitHub (varre todos os
repos, commits e sparklines). Ele precisa continuar fechado mesmo quando o
REFRESH_KEY nao chega ao ambiente.

Cenario real: `gcloud run deploy --source` reseta as env vars, e o deploy.sh so
as reaplica se o `source .env` tiver sido rodado — senao ele apenas imprime um
aviso e segue. Nesse caminho a producao sobe com REFRESH_KEY ausente.
"""

import pytest

import server


@pytest.fixture
def sem_refresh_key(monkeypatch):
    """Reproduz o default de os.environ.get('REFRESH_KEY', '') com a env var ausente."""
    monkeypatch.setattr(server, "REFRESH_KEY", "")


@pytest.fixture
def rebuild_proibido(monkeypatch):
    def explode():
        raise AssertionError("rebuild nao autorizado disparado — cota do GitHub exposta")

    monkeypatch.setattr(server, "_build_cache", explode)


class TestRefreshSemChaveConfigurada:
    def test_requisicao_sem_key_e_negada(self, client, sem_refresh_key, rebuild_proibido):
        r = client.get("/api/refresh")
        assert r.status_code == 403

    def test_key_vazia_e_negada(self, client, sem_refresh_key, rebuild_proibido):
        r = client.get("/api/refresh?key=")
        assert r.status_code == 403

    def test_qualquer_chave_e_negada(self, client, sem_refresh_key, rebuild_proibido):
        r = client.get("/api/refresh?key=chute")
        assert r.status_code == 403


class TestChaveNaoAscii:
    """secrets.compare_digest levanta TypeError com str non-ASCII — nao pode virar 500."""

    def test_key_com_acento_e_negada_sem_explodir(self, client, rebuild_proibido):
        r = client.get("/api/refresh?key=cha%C3%A7a")
        assert r.status_code == 403

    def test_refresh_key_com_acento_ainda_autentica(self, client, monkeypatch):
        monkeypatch.setattr(server, "REFRESH_KEY", "seçã-key")
        monkeypatch.setattr(server, "_build_cache", lambda: {"ts": 1.0, "repos": []})

        assert client.get("/api/refresh?key=se%C3%A7%C3%A3-key").status_code == 200
