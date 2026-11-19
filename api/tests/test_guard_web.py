"""A portaria na frente das rotas: prova do navegador, limite de requisições e tamanho do corpo.

O `conftest` deixa a prova DESLIGADA para o resto da suíte; aqui a fixture `exigindo` a liga,
com uma conferência de mentira (a de verdade é testada em `test_guard_appcheck.py`)."""
import json

import pytest

from blog import routes as blog_routes
from guard import appcheck, web
from guard.ratelimit import Limiter
from pension import routes as pension_routes, store as pension_store
from planner import routes as planner_routes, store as planner_store
from tests.fakes import FakeDb

AUTH = {"Authorization": "Bearer t"}
PROVA = {"X-Firebase-AppCheck": "prova-boa"}
SITE = "https://rodrigomatheus.com.br"


@pytest.fixture
def exigindo(monkeypatch):
    def confere(token):
        if not token or not token.startswith("prova-boa"):
            raise appcheck.ProofError("prova inválida")
        return {"sub": "app"}
    monkeypatch.setattr(appcheck, "MODE", "enforce")
    monkeypatch.setattr(appcheck, "verify", confere)


@pytest.fixture
def logado(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(planner_store, "_db", lambda: fake)
    monkeypatch.setattr(pension_store, "_db", lambda: fake)
    usuario = {"uid": "uid-1", "email": "alguem@gmail.com"}
    monkeypatch.setattr(planner_routes, "verify_user", lambda h: usuario)
    monkeypatch.setattr(pension_routes, "verify_user", lambda h: usuario)


class TestProvaDoNavegador:
    @pytest.mark.parametrize("metodo,url", [
        ("get", "/api/planner/plan"), ("put", "/api/planner/plan"),
        ("get", "/api/pension/plan"), ("put", "/api/pension/plan"),
        ("get", "/api/blog/admin/posts"), ("post", "/api/blog/admin/generate"),
        ("post", "/api/blog/admin/media/upload"), ("delete", "/api/blog/admin/posts/abc"),
    ])
    def test_sem_prova_e_recusado_mesmo_com_login(self, client, exigindo, logado, metodo, url):
        resposta = getattr(client, metodo)(url, headers=AUTH)
        assert resposta.status_code == 403
        assert resposta.get_json()["code"] == "app_check"

    def test_a_recusa_explica_o_que_a_pessoa_pode_fazer(self, client, exigindo):
        texto = client.get("/api/planner/plan").get_json()["error"]
        assert "Recarregue" in texto and "bloqueador" in texto

    def test_prova_invalida_e_recusada(self, client, exigindo, logado):
        resposta = client.get("/api/planner/plan", headers={**AUTH, "X-Firebase-AppCheck": "forjada"})
        assert resposta.status_code == 403

    def test_com_prova_a_chamada_segue_para_o_login(self, client, exigindo, logado):
        assert client.get("/api/planner/plan", headers={**AUTH, **PROVA}).status_code == 200

    def test_prova_nao_dispensa_o_login(self, client, exigindo, monkeypatch):
        def recusa(h):
            raise planner_routes.AuthError("token ausente ou malformado")
        monkeypatch.setattr(planner_routes, "verify_user", recusa)
        assert client.get("/api/planner/plan", headers=PROVA).status_code == 401

    def test_painel_com_prova_ainda_passa_pela_allowlist(self, client, exigindo, monkeypatch):
        def recusa(h):
            raise blog_routes.AuthError("não autorizado")
        monkeypatch.setattr(blog_routes, "verify_admin", recusa)
        assert client.get("/api/blog/admin/posts", headers={**AUTH, **PROVA}).status_code == 401

    def test_leitura_publica_nao_pede_prova(self, client, exigindo, cached):
        assert client.get("/api/data").status_code == 200

    def test_o_agendador_nao_pede_prova__continua_valendo_a_chave_dele(self, client, exigindo):
        resposta = client.post("/api/blog/tick")
        assert resposta.status_code == 403
        assert resposta.get_json() == {"error": "unauthorized"}

    def test_a_volta_do_linkedin_nao_pede_prova(self, client, exigindo):
        resposta = client.get("/api/blog/admin/linkedin/callback")
        assert resposta.status_code == 400
        assert resposta.get_json() == {"error": "sem code"}


class TestChamadaDiretaDoPainel:
    """Gerar post e revisar vão direto ao Cloud Run, de outra origem: o navegador faz preflight."""

    def test_preflight_passa_e_libera_o_cabecalho_da_prova(self, client, exigindo):
        resposta = client.options("/api/blog/admin/generate", headers={
            "Origin": SITE, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,x-firebase-appcheck"})
        assert resposta.status_code < 400
        liberados = resposta.headers["Access-Control-Allow-Headers"].lower()
        assert "x-firebase-appcheck" in liberados and "authorization" in liberados

    def test_a_recusa_chega_legivel_ao_painel(self, client, exigindo):
        """Sem o cabeçalho de CORS na recusa, o navegador esconde o 403 e o painel só vê "falha de rede"."""
        resposta = client.post("/api/blog/admin/generate", headers={"Origin": SITE, **AUTH}, json={})
        assert resposta.status_code == 403
        assert resposta.headers["Access-Control-Allow-Origin"] == SITE


class TestModos:
    def test_observando__deixa_passar_e_registra(self, client, exigindo, logado, monkeypatch, capsys):
        monkeypatch.setattr(appcheck, "MODE", "monitor")
        assert client.get("/api/planner/plan", headers=AUTH).status_code == 200
        registro = capsys.readouterr().out
        assert "[appcheck]" in registro and "/api/planner/plan" in registro

    def test_observando__prova_boa_nao_gera_registro(self, client, exigindo, logado, monkeypatch, capsys):
        monkeypatch.setattr(appcheck, "MODE", "monitor")
        client.get("/api/planner/plan", headers={**AUTH, **PROVA})
        assert "[appcheck]" not in capsys.readouterr().out

    def test_desligada__nem_confere(self, client, exigindo, logado, monkeypatch):
        monkeypatch.setattr(appcheck, "MODE", "off")
        assert client.get("/api/planner/plan", headers=AUTH).status_code == 200

    @pytest.mark.parametrize("valor", ["", "ligado", "ENFORCE", "monitorar"])
    def test_valor_desconhecido_exige__erro_de_digitacao_nao_abre_a_porta(self, client, exigindo, logado, monkeypatch, valor):
        monkeypatch.setattr(appcheck, "MODE", valor)
        assert client.get("/api/planner/plan", headers=AUTH).status_code == 403


class TestLimiteDeRequisicoes:
    def test_mesmo_navegador_acima_do_limite_recebe_429(self, client, exigindo, logado, monkeypatch):
        monkeypatch.setattr(web, "_browser", Limiter(3, 60))
        respostas = [client.get("/api/planner/plan", headers={**AUTH, **PROVA}) for _ in range(4)]
        assert [r.status_code for r in respostas] == [200, 200, 200, 429]
        assert int(respostas[-1].headers["Retry-After"]) >= 1
        assert respostas[-1].get_json()["code"] == "rate_limit"

    def test_outro_navegador_nao_paga_pelo_primeiro(self, client, exigindo, logado, monkeypatch):
        monkeypatch.setattr(web, "_browser", Limiter(1, 60))
        assert client.get("/api/planner/plan", headers={**AUTH, **PROVA}).status_code == 200
        assert client.get("/api/planner/plan", headers={**AUTH, **PROVA}).status_code == 429
        outro = {**AUTH, "X-Firebase-AppCheck": "prova-boa-de-outro-navegador"}
        assert client.get("/api/planner/plan", headers=outro).status_code == 200

    def test_chamada_sem_prova_nao_gasta_o_limite_de_ninguem(self, client, exigindo, logado, monkeypatch):
        monkeypatch.setattr(web, "_browser", Limiter(1, 60))
        for _ in range(5):
            assert client.get("/api/planner/plan", headers=AUTH).status_code == 403
        assert client.get("/api/planner/plan", headers={**AUTH, **PROVA}).status_code == 200

    @pytest.mark.parametrize("url", ["/api/planner/plan", "/api/pension/plan"])
    def test_conta_acima_do_limite_de_gravacoes_recebe_429(self, client, logado, monkeypatch, url):
        monkeypatch.setattr(web, "_account", Limiter(2, 60))
        respostas = [client.put(url, headers=AUTH, json={}) for _ in range(3)]
        assert [r.status_code for r in respostas] == [200, 200, 429]
        assert int(respostas[-1].headers["Retry-After"]) >= 1

    def test_o_limite_da_conta_e_so_de_gravacao(self, client, logado, monkeypatch):
        monkeypatch.setattr(web, "_account", Limiter(1, 60))
        assert client.put("/api/planner/plan", headers=AUTH, json={}).status_code == 200
        assert client.put("/api/planner/plan", headers=AUTH, json={}).status_code == 429
        assert client.get("/api/planner/plan", headers=AUTH).status_code == 200

    def test_o_limite_e_por_conta(self, client, logado, monkeypatch):
        monkeypatch.setattr(web, "_account", Limiter(1, 60))
        assert client.put("/api/planner/plan", headers=AUTH, json={}).status_code == 200
        monkeypatch.setattr(planner_routes, "verify_user", lambda h: {"uid": "uid-2", "email": "outra@gmail.com"})
        assert client.put("/api/planner/plan", headers=AUTH, json={}).status_code == 200


class TestTamanhoDoCorpo:
    @pytest.mark.parametrize("url", ["/api/planner/plan", "/api/pension/plan"])
    def test_plano_gigante_e_recusado_antes_de_ser_lido(self, client, logado, url):
        enorme = json.dumps({"lixo": "x" * (40 * 1024)})
        resposta = client.put(url, headers={**AUTH, "content-type": "application/json"}, data=enorme)
        assert resposta.status_code == 413

    def test_plano_normal_passa(self, client, logado):
        assert client.put("/api/planner/plan", headers=AUTH, json={"years": 20}).status_code == 200

    def test_corpo_gigante_numa_rota_qualquer_do_painel_e_recusado(self, client, monkeypatch):
        monkeypatch.setattr(blog_routes, "verify_admin", lambda h: "dono@gmail.com")
        enorme = json.dumps({"topic": "x" * (2 * 1024 * 1024)})
        resposta = client.post("/api/blog/admin/generate", headers={**AUTH, "content-type": "application/json"}, data=enorme)
        assert resposta.status_code == 413
