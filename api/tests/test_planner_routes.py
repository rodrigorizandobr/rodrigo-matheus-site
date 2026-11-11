"""As duas rotas do simulador: GET lê o plano do uid, PUT grava — sempre atrás da
mesma portaria, sem allowlist (qualquer conta Google autenticada)."""
import pytest

from planner import auth, model, routes, store
from tests.fakes import FakeDb

AUTH = {"Authorization": "Bearer t"}


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: fake)
    return fake


@pytest.fixture
def logado(monkeypatch):
    monkeypatch.setattr(routes, "verify_user", lambda h: {"uid": "uid-1", "email": "alguem@gmail.com"})


@pytest.fixture
def anonimo(monkeypatch):
    def recusa(h):
        raise auth.AuthError("sem token")
    monkeypatch.setattr(routes, "verify_user", recusa)


class TestPortaria:
    @pytest.mark.parametrize("metodo,url", [("get", "/api/planner/plan"), ("put", "/api/planner/plan")])
    def test_sem_token_devolve_401(self, client, db, anonimo, metodo, url):
        resposta = getattr(client, metodo)(url)
        assert resposta.status_code == 401


class TestLerPlano:
    def test_uid_novo_recebe_os_padroes(self, client, db, logado):
        resposta = client.get("/api/planner/plan", headers=AUTH)
        assert resposta.status_code == 200
        assert resposta.get_json()["params"] == model.DEFAULT_PARAMS

    def test_so_ve_o_proprio_plano(self, client, db, monkeypatch):
        store.save_plan("uid-outro", {"monthlyAmount": 1})
        monkeypatch.setattr(routes, "verify_user", lambda h: {"uid": "uid-1", "email": "a@a.com"})
        resposta = client.get("/api/planner/plan", headers=AUTH)
        assert resposta.get_json()["params"] == model.DEFAULT_PARAMS


class TestSalvarPlano:
    def test_salva_e_devolve_o_plano_atualizado(self, client, db, logado):
        resposta = client.put("/api/planner/plan", headers=AUTH, json={"monthlyAmount": 20_000, "years": 20})
        assert resposta.status_code == 200
        body = resposta.get_json()
        assert body["params"]["monthlyAmount"] == 20_000
        assert body["updatedAt"]

    def test_campo_fora_da_faixa_devolve_400_e_nao_salva(self, client, db, logado):
        resposta = client.put("/api/planner/plan", headers=AUTH, json={"pctPagoChaves": 999})
        assert resposta.status_code == 400
        assert store.get_plan("uid-1")["params"]["pctPagoChaves"] == model.DEFAULT_PARAMS["pctPagoChaves"]

    def test_salvar_grava_o_email_de_quem_salvou(self, client, db, logado):
        client.put("/api/planner/plan", headers=AUTH, json={"years": 12})
        assert db.cols["planner_plans"].data["uid-1"]["email"] == "alguem@gmail.com"
