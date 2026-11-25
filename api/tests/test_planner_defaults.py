"""Os valores padrão do simulador de imóveis: o que um visitante vê ao abrir a página.

Quem define é o administrador, num documento PRÓPRIO. O plano pessoal dele (salário, apê) mora no
documento da conta dele, como o de qualquer pessoa, e nunca vira padrão — esse é o ponto de tudo isto."""
import pytest

from blog import auth as blog_auth
from planner import model, routes, store
from tests.fakes import FakeDb

AUTH = {"Authorization": "Bearer t"}
DONO = "dono@gmail.com"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: fake)
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
        store.save_defaults({"salarioBrutoCasal": 12_000, "years": 20})
        padrao = store.get_defaults()
        assert padrao["params"]["salarioBrutoCasal"] == 12_000
        assert padrao["params"]["years"] == 20
        assert padrao["custom"] is True
        assert padrao["updatedAt"] is not None

    def test_campo_que_nao_veio_fica_no_valor_de_fabrica(self, db):
        store.save_defaults({"years": 20})
        assert store.get_defaults()["params"]["salarioBrutoCasal"] == model.DEFAULT_PARAMS["salarioBrutoCasal"]

    def test_gravar_substitui_o_padrao_inteiro_em_vez_de_somar(self, db):
        """O que o admin vê no formulário é o que o visitante recebe: sobra do padrão antigo não fica escondida."""
        store.save_defaults({"years": 20, "salarioBrutoCasal": 12_000})
        store.save_defaults({"monthlyAmount": 500})
        padrao = store.get_defaults()["params"]
        assert padrao["monthlyAmount"] == 500
        assert padrao["years"] == model.DEFAULT_PARAMS["years"]
        assert padrao["salarioBrutoCasal"] == model.DEFAULT_PARAMS["salarioBrutoCasal"]

    def test_campo_fora_da_faixa_nao_grava_nada(self, db):
        with pytest.raises(ValueError):
            store.save_defaults({"pctPagoChaves": 999})
        assert store.get_defaults()["custom"] is False

    def test_contrato_que_passa_de_100_por_cento_nao_grava(self, db):
        with pytest.raises(ValueError):
            store.save_defaults({"entradaPct": 50, "mensaisPct": 40, "reforcoPct": 30, "chavesPct": 20})
        assert store.get_defaults()["custom"] is False

    def test_o_padrao_mora_fora_da_colecao_dos_planos(self, db):
        store.save_defaults({"years": 20})
        assert db.collection(store.PLANS).data == {}

    def test_o_padrao_devolvido_nao_e_o_objeto_do_modulo(self, db):
        """Quem mexe no que recebeu não pode alterar o padrão de fábrica de todo mundo."""
        store.get_defaults()["params"]["years"] = 999
        assert model.DEFAULT_PARAMS["years"] != 999


class TestPlanoPessoal:
    def test_conta_nova_comeca_do_padrao_do_admin(self, db):
        store.save_defaults({"salarioBrutoCasal": 12_000})
        plano = store.get_plan("uid-novo")
        assert plano["params"]["salarioBrutoCasal"] == 12_000
        assert plano["saved"] is False

    def test_plano_salvo_nao_muda_quando_o_padrao_muda(self, db):
        store.save_plan("uid-1", {"salarioBrutoCasal": 50_000})
        store.save_defaults({"salarioBrutoCasal": 12_000})
        plano = store.get_plan("uid-1")
        assert plano["params"]["salarioBrutoCasal"] == 50_000
        assert plano["saved"] is True

    def test_primeira_gravacao_parte_do_padrao_do_admin(self, db):
        store.save_defaults({"salarioBrutoCasal": 12_000})
        plano = store.save_plan("uid-novo", {"years": 3})
        assert plano["params"]["years"] == 3
        assert plano["params"]["salarioBrutoCasal"] == 12_000

    def test_gravar_o_plano_nunca_mexe_no_padrao(self, db):
        store.save_plan("uid-dono", {"salarioBrutoCasal": 99_000})
        assert store.get_defaults()["params"]["salarioBrutoCasal"] == model.DEFAULT_PARAMS["salarioBrutoCasal"]

    def test_gravar_o_padrao_nunca_mexe_no_plano_pessoal(self, db):
        store.save_plan("uid-dono", {"salarioBrutoCasal": 99_000})
        store.save_defaults({"salarioBrutoCasal": 12_000})
        assert store.get_plan("uid-dono")["params"]["salarioBrutoCasal"] == 99_000


class TestLeituraPublica:
    def test_qualquer_um_le_sem_login(self, client, db):
        resposta = client.get("/api/planner/defaults")
        assert resposta.status_code == 200
        corpo = resposta.get_json()
        assert corpo["params"] == model.DEFAULT_PARAMS
        assert corpo["custom"] is False

    def test_a_resposta_so_traz_parametros__nada_de_quem_gravou(self, client, db, admin):
        client.put("/api/planner/defaults", headers=AUTH, json={"years": 20})
        corpo = client.get("/api/planner/defaults").get_json()
        assert set(corpo) == {"params", "updatedAt", "custom"}
        assert DONO not in str(corpo) and "uid-dono" not in str(corpo)

    def test_a_borda_guarda_so_por_um_minuto(self, client, db):
        cache = client.get("/api/planner/defaults").headers["Cache-Control"]
        assert "public" in cache and "s-maxage=60" in cache

    def test_o_que_o_admin_gravou_aparece_na_leitura_publica(self, client, db, admin):
        client.put("/api/planner/defaults", headers=AUTH, json={"salarioBrutoCasal": 12_000})
        assert client.get("/api/planner/defaults").get_json()["params"]["salarioBrutoCasal"] == 12_000


class TestGravarPadrao:
    def test_sem_login_devolve_401(self, client, db, monkeypatch):
        def recusa(h):
            raise routes.AuthError("sem token")
        monkeypatch.setattr(routes, "verify_user", recusa)
        assert client.put("/api/planner/defaults", json={"years": 20}).status_code == 401

    def test_conta_comum_devolve_403_e_nada_e_gravado(self, client, db, comum):
        resposta = client.put("/api/planner/defaults", headers=AUTH, json={"years": 20})
        assert resposta.status_code == 403
        assert store.get_defaults()["custom"] is False

    def test_admin_grava_e_recebe_o_padrao_de_volta(self, client, db, admin):
        resposta = client.put("/api/planner/defaults", headers=AUTH, json={"years": 20})
        assert resposta.status_code == 200
        corpo = resposta.get_json()
        assert corpo["params"]["years"] == 20 and corpo["custom"] is True and corpo["updatedAt"]

    def test_campo_fora_da_faixa_devolve_400(self, client, db, admin):
        assert client.put("/api/planner/defaults", headers=AUTH, json={"pctPagoChaves": 999}).status_code == 400

    def test_a_lista_de_admins_e_a_mesma_do_painel__caixa_nao_importa(self, client, db, monkeypatch):
        entra_como(monkeypatch, "Dono@Gmail.com")
        assert client.put("/api/planner/defaults", headers=AUTH, json={"years": 20}).status_code == 200


class TestPlanoDiz:
    def test_informa_que_e_admin(self, client, db, admin):
        assert client.get("/api/planner/plan", headers=AUTH).get_json()["isAdmin"] is True

    def test_conta_comum_nao_e_admin(self, client, db, comum):
        assert client.get("/api/planner/plan", headers=AUTH).get_json()["isAdmin"] is False

    def test_informa_se_ja_existe_plano_salvo(self, client, db, comum):
        assert client.get("/api/planner/plan", headers=AUTH).get_json()["saved"] is False
        client.put("/api/planner/plan", headers=AUTH, json={"years": 3})
        assert client.get("/api/planner/plan", headers=AUTH).get_json()["saved"] is True

    def test_o_plano_do_admin_nunca_vira_o_padrao_do_visitante(self, client, db, admin):
        client.put("/api/planner/plan", headers=AUTH, json={"salarioBrutoCasal": 99_000})
        publico = client.get("/api/planner/defaults").get_json()["params"]
        assert publico["salarioBrutoCasal"] == model.DEFAULT_PARAMS["salarioBrutoCasal"]

    def test_gravar_o_plano_devolve_que_ja_esta_salvo(self, client, db, comum):
        resposta = client.put("/api/planner/plan", headers=AUTH, json={"years": 3})
        assert resposta.get_json()["saved"] is True
