"""As duas rotas do simulador: GET lê o plano do uid, PUT grava — sempre atrás da
mesma portaria, sem allowlist (qualquer conta Google autenticada)."""
import pytest

from pension import auth, model, routes, store
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
    @pytest.mark.parametrize("metodo,url", [("get", "/api/pension/plan"), ("put", "/api/pension/plan")])
    def test_sem_token_devolve_401(self, client, db, anonimo, metodo, url):
        resposta = getattr(client, metodo)(url)
        assert resposta.status_code == 401


class TestLerPlano:
    def test_uid_novo_recebe_os_padroes(self, client, db, logado):
        resposta = client.get("/api/pension/plan", headers=AUTH)
        assert resposta.status_code == 200
        assert resposta.get_json()["params"] == model.DEFAULT_PARAMS

    def test_so_ve_o_proprio_plano(self, client, db, monkeypatch):
        store.save_plan("uid-outro", {"monthlyAmount": 1})
        monkeypatch.setattr(routes, "verify_user", lambda h: {"uid": "uid-1", "email": "a@a.com"})
        resposta = client.get("/api/pension/plan", headers=AUTH)
        assert resposta.get_json()["params"] == model.DEFAULT_PARAMS


class TestSalvarPlano:
    def test_salva_e_devolve_o_plano_atualizado(self, client, db, logado):
        resposta = client.put("/api/pension/plan", headers=AUTH, json={"monthlyAmount": 20_000, "vehicle": "VGBL"})
        assert resposta.status_code == 200
        body = resposta.get_json()
        assert body["params"]["monthlyAmount"] == 20_000
        assert body["params"]["vehicle"] == "VGBL"
        assert body["updatedAt"]

    def test_campo_fora_da_faixa_devolve_400_e_nao_salva(self, client, db, logado):
        resposta = client.put("/api/pension/plan", headers=AUTH, json={"years": 999})
        assert resposta.status_code == 400
        assert store.get_plan("uid-1")["params"]["years"] == model.DEFAULT_PARAMS["years"]

    def test_campo_categorico_invalido_devolve_400_e_nao_salva(self, client, db, logado):
        resposta = client.put("/api/pension/plan", headers=AUTH, json={"vehicle": "CDB"})
        assert resposta.status_code == 400
        assert store.get_plan("uid-1")["params"]["vehicle"] == model.DEFAULT_PARAMS["vehicle"]

    def test_salvar_grava_o_email_de_quem_salvou(self, client, db, logado):
        client.put("/api/pension/plan", headers=AUTH, json={"years": 12})
        assert db.cols["pension_plans"].data["uid-1"]["email"] == "alguem@gmail.com"
