"""A portaria contra robôs e os valores padrão: a leitura é pública, a gravação não.

Quem só quer brincar com o simulador nem carrega o Firebase, então não tem como mandar a prova do
navegador. Gravar o padrão, ao contrário, passa por tudo: prova, login Google e lista de admins."""
import pytest

from blog import auth as blog_auth
from guard import appcheck, policy
from planner import routes as planner_routes, store as planner_store
from pension import routes as pension_routes, store as pension_store
from tests.fakes import FakeDb


class TestQuemPedeAProva:
    @pytest.mark.parametrize("caminho", ["/api/planner/defaults", "/api/pension/defaults"])
    def test_ler_o_padrao_nao_pede(self, caminho):
        assert policy.needs_proof(caminho, "GET") is False

    @pytest.mark.parametrize("caminho", ["/api/planner/defaults", "/api/pension/defaults"])
    @pytest.mark.parametrize("metodo", ["PUT", "POST", "DELETE", "PATCH"])
    def test_gravar_o_padrao_pede(self, caminho, metodo):
        assert policy.needs_proof(caminho, metodo) is True

    @pytest.mark.parametrize("caminho", ["/api/planner/plan", "/api/pension/plan"])
    def test_o_plano_pessoal_continua_pedindo(self, caminho):
        assert policy.needs_proof(caminho, "GET") is True
        assert policy.needs_proof(caminho, "PUT") is True

    def test_so_o_caminho_exato_e_publico(self):
        """Rota nova sob o mesmo prefixo nasce protegida; a exceção não vaza por prefixo."""
        assert policy.needs_proof("/api/planner/defaults/outra-coisa", "GET") is True
        assert policy.needs_proof("/api/planner/defaultsx", "GET") is True


class TestNaPortaria:
    @pytest.fixture(autouse=True)
    def exigindo(self, monkeypatch):
        monkeypatch.setattr(appcheck, "MODE", "enforce")
        monkeypatch.setattr(appcheck, "verify", lambda token: (_ for _ in ()).throw(appcheck.ProofError("sem prova")))
        db = FakeDb()
        for loja in (planner_store, pension_store):
            monkeypatch.setattr(loja, "_db", lambda db=db: db)
        monkeypatch.setattr(blog_auth, "ADMIN_EMAILS", frozenset({"dono@gmail.com"}))
        for rotas in (planner_routes, pension_routes):
            monkeypatch.setattr(rotas, "verify_user", lambda h: {"uid": "uid-dono", "email": "dono@gmail.com"})

    @pytest.mark.parametrize("url", ["/api/planner/defaults", "/api/pension/defaults"])
    def test_visitante_sem_prova_le_o_padrao(self, client, url):
        assert client.get(url).status_code == 200

    @pytest.mark.parametrize("url", ["/api/planner/defaults", "/api/pension/defaults"])
    def test_gravar_sem_prova_e_recusado_mesmo_sendo_o_admin(self, client, url):
        resposta = client.put(url, headers={"Authorization": "Bearer t"}, json={})
        assert resposta.status_code == 403
        assert resposta.get_json()["code"] == "app_check"

    @pytest.mark.parametrize("url", ["/api/planner/plan", "/api/pension/plan"])
    def test_plano_pessoal_sem_prova_continua_recusado(self, client, url):
        assert client.get(url, headers={"Authorization": "Bearer t"}).status_code == 403
