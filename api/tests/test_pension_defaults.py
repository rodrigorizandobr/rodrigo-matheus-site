"""Os valores padrão do simulador de previdência: o que um visitante vê ao abrir a página.

Mesmo desenho do simulador de imóveis (`test_planner_defaults.py`): documento próprio, só o admin grava,
e o plano pessoal dele nunca vira padrão."""
import pytest

from blog import auth as blog_auth
from pension import model, routes, store
from planner import store as planner_store
from tests.fakes import FakeDb

AUTH = {"Authorization": "Bearer t"}
DONO = "dono@gmail.com"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: fake)
    monkeypatch.setattr(planner_store, "_db", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def lista_de_admins(monkeypatch):
    monkeypatch.setattr(blog_auth, "ADMIN_EMAILS", frozenset({DONO}))


def entra_como(monkeypatch, email, uid="uid-1"):
    monkeypatch.setattr(routes, "verify_user", lambda h: {"uid": uid, "email": email})


@pytest.fixture
def admin(monkeypatch):
    entra_como(monkeypatch, DONO, uid="uid-dono")


@pytest.fixture
def comum(monkeypatch):
    entra_como(monkeypatch, "alguem@gmail.com")


class TestArmazenamento:
    def test_sem_nada_gravado_o_padrao_e_o_de_fabrica(self, db):
        padrao = store.get_defaults()
        assert padrao["params"] == model.DEFAULT_PARAMS
        assert padrao["custom"] is False
        assert padrao["updatedAt"] is None

    def test_o_que_o_admin_grava_vira_o_padrao(self, db):
        store.save_defaults({"salarioBruto": 9_000, "idadeAtual": 30})
        padrao = store.get_defaults()
        assert padrao["params"]["salarioBruto"] == 9_000
        assert padrao["params"]["idadeAtual"] == 30
        assert padrao["custom"] is True

    def test_as_faixas_da_empresa_tambem_viram_padrao(self, db):
        faixas = [{"idadeMin": 0, "idadeMax": 120, "percentual": 50}]
        store.save_defaults({"faixasEmpresa": faixas})
        assert store.get_defaults()["params"]["faixasEmpresa"] == faixas

    def test_gravar_substitui_o_padrao_inteiro_em_vez_de_somar(self, db):
        store.save_defaults({"salarioBruto": 9_000, "idadeAtual": 30})
        store.save_defaults({"aporteBasicoPct": 8})
        padrao = store.get_defaults()["params"]
        assert padrao["aporteBasicoPct"] == 8
        assert padrao["salarioBruto"] == model.DEFAULT_PARAMS["salarioBruto"]

    def test_campo_fora_da_faixa_nao_grava_nada(self, db):
        with pytest.raises(ValueError):
            store.save_defaults({"idadeAtual": 5})
        assert store.get_defaults()["custom"] is False

    def test_o_padrao_mora_fora_da_colecao_dos_planos(self, db):
        store.save_defaults({"salarioBruto": 9_000})
        assert db.collection(store.PLANS).data == {}

    def test_o_padrao_da_previdencia_e_o_dos_imoveis_nao_se_misturam(self, db):
        store.save_defaults({"salarioBruto": 9_000})
        planner_store.save_defaults({"salarioBrutoCasal": 12_000})
        assert store.get_defaults()["params"]["salarioBruto"] == 9_000
        assert planner_store.get_defaults()["params"]["salarioBrutoCasal"] == 12_000

    def test_mexer_nas_faixas_devolvidas_nao_altera_o_padrao_de_fabrica(self, db):
        store.get_defaults()["params"]["faixasEmpresa"][0]["percentual"] = 999
        assert model.DEFAULT_PARAMS["faixasEmpresa"][0]["percentual"] != 999


class TestPlanoPessoal:
    def test_conta_nova_comeca_do_padrao_do_admin(self, db):
        store.save_defaults({"salarioBruto": 9_000})
        plano = store.get_plan("uid-novo")
        assert plano["params"]["salarioBruto"] == 9_000
        assert plano["saved"] is False

    def test_plano_salvo_nao_muda_quando_o_padrao_muda(self, db):
        store.save_plan("uid-1", {"salarioBruto": 50_000})
        store.save_defaults({"salarioBruto": 9_000})
        plano = store.get_plan("uid-1")
        assert plano["params"]["salarioBruto"] == 50_000
        assert plano["saved"] is True

    def test_gravar_o_plano_nunca_mexe_no_padrao(self, db):
        store.save_plan("uid-dono", {"salarioBruto": 99_000})
        assert store.get_defaults()["params"]["salarioBruto"] == model.DEFAULT_PARAMS["salarioBruto"]

    def test_gravar_o_padrao_nunca_mexe_no_plano_pessoal(self, db):
        store.save_plan("uid-dono", {"salarioBruto": 99_000})
        store.save_defaults({"salarioBruto": 9_000})
        assert store.get_plan("uid-dono")["params"]["salarioBruto"] == 99_000


class TestRotas:
    def test_leitura_publica_sem_login(self, client, db):
        resposta = client.get("/api/pension/defaults")
        assert resposta.status_code == 200
        assert resposta.get_json()["params"] == model.DEFAULT_PARAMS
        assert "s-maxage=60" in resposta.headers["Cache-Control"]

    def test_a_resposta_so_traz_parametros(self, client, db, admin):
        client.put("/api/pension/defaults", headers=AUTH, json={"salarioBruto": 9_000})
        corpo = client.get("/api/pension/defaults").get_json()
        assert set(corpo) == {"params", "updatedAt", "custom"}
        assert DONO not in str(corpo) and "uid-dono" not in str(corpo)

    def test_sem_login_nao_grava(self, client, db, monkeypatch):
        def recusa(h):
            raise routes.AuthError("sem token")
        monkeypatch.setattr(routes, "verify_user", recusa)
        assert client.put("/api/pension/defaults", json={"salarioBruto": 9_000}).status_code == 401

    def test_conta_comum_devolve_403_e_nada_e_gravado(self, client, db, comum):
        assert client.put("/api/pension/defaults", headers=AUTH, json={"salarioBruto": 9_000}).status_code == 403
        assert store.get_defaults()["custom"] is False

    def test_admin_grava_e_a_leitura_publica_ve(self, client, db, admin):
        resposta = client.put("/api/pension/defaults", headers=AUTH, json={"salarioBruto": 9_000})
        assert resposta.status_code == 200 and resposta.get_json()["custom"] is True
        assert client.get("/api/pension/defaults").get_json()["params"]["salarioBruto"] == 9_000

    def test_campo_fora_da_faixa_devolve_400(self, client, db, admin):
        assert client.put("/api/pension/defaults", headers=AUTH, json={"idadeAtual": 5}).status_code == 400

    def test_o_plano_diz_se_e_admin_e_se_ja_esta_salvo(self, client, db, admin):
        corpo = client.get("/api/pension/plan", headers=AUTH).get_json()
        assert corpo["isAdmin"] is True and corpo["saved"] is False
        client.put("/api/pension/plan", headers=AUTH, json={"years": 3})
        assert client.get("/api/pension/plan", headers=AUTH).get_json()["saved"] is True

    def test_conta_comum_nao_e_admin(self, client, db, comum):
        assert client.get("/api/pension/plan", headers=AUTH).get_json()["isAdmin"] is False

    def test_o_plano_do_admin_nunca_vira_o_padrao_do_visitante(self, client, db, admin):
        client.put("/api/pension/plan", headers=AUTH, json={"salarioBruto": 99_000})
        publico = client.get("/api/pension/defaults").get_json()["params"]
        assert publico["salarioBruto"] == model.DEFAULT_PARAMS["salarioBruto"]
