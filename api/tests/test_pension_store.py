"""Um documento por uid — nunca por e-mail, nunca compartilhado entre contas."""
import pytest

from pension import model, store
from tests.fakes import FakeDb


@pytest.fixture
def env(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(store, "_db", lambda: db)
    return db


class TestGetPlan:
    def test_uid_novo_recebe_os_padroes_do_simulador(self, env):
        plano = store.get_plan("uid-1")
        assert plano["params"] == model.DEFAULT_PARAMS
        assert plano["updatedAt"] is None

    def test_cada_uid_tem_o_proprio_documento(self, env):
        store.save_plan("uid-1", {"monthlyAmount": 20_000})
        store.save_plan("uid-2", {"monthlyAmount": 5_000})
        assert store.get_plan("uid-1")["params"]["monthlyAmount"] == 20_000
        assert store.get_plan("uid-2")["params"]["monthlyAmount"] == 5_000


class TestSavePlan:
    def test_salva_e_grava_data(self, env):
        plano = store.save_plan("uid-1", {"years": 20})
        assert plano["params"]["years"] == 20
        assert plano["updatedAt"] is not None

    def test_patch_parcial_mantem_o_resto_do_que_ja_estava_salvo(self, env):
        store.save_plan("uid-1", {"monthlyAmount": 20_000, "vehicle": "VGBL"})
        plano = store.save_plan("uid-1", {"years": 8})
        assert plano["params"]["monthlyAmount"] == 20_000
        assert plano["params"]["vehicle"] == "VGBL"
        assert plano["params"]["years"] == 8

    def test_campo_fora_da_faixa_nao_salva_nada(self, env):
        with pytest.raises(ValueError):
            store.save_plan("uid-1", {"years": 999})
        assert store.get_plan("uid-1")["params"]["years"] == model.DEFAULT_PARAMS["years"]

    def test_campo_categorico_invalido_nao_salva_nada(self, env):
        with pytest.raises(ValueError):
            store.save_plan("uid-1", {"vehicle": "CDB"})
        assert store.get_plan("uid-1")["params"]["vehicle"] == model.DEFAULT_PARAMS["vehicle"]

    def test_email_e_guardado_so_para_identificacao_nunca_para_autorizar(self, env):
        store.save_plan("uid-1", {}, email="alguem@gmail.com")
        assert env.cols["pension_plans"].data["uid-1"]["email"] == "alguem@gmail.com"
