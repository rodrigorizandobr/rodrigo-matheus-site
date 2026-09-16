"""Rotas do LinkedIn. O callback chega SEM token — quem o protege é o state."""
from datetime import datetime, timezone

import pytest

import server
from blog import auth, linkedin, routes, service, store
from tests.fakes import FakeDb, FakeFilter

AUTH = {"Authorization": "Bearer t"}


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


@pytest.fixture
def blog(monkeypatch):
    db = FakeDb()
    for mod in (store, linkedin):
        monkeypatch.setattr(mod, "_db", lambda: db)
    monkeypatch.setattr(store, "FieldFilter", FakeFilter)
    monkeypatch.setattr(linkedin, "CLIENT_ID", "")
    monkeypatch.setattr(linkedin, "CLIENT_SECRET", "")
    return db


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setattr(routes, "verify_admin", lambda h: "rodrigorizando@gmail.com")


@pytest.fixture
def anon(monkeypatch):
    def recusa(h):
        raise auth.AuthError("sem token")
    monkeypatch.setattr(routes, "verify_admin", recusa)


class TestPortaria:
    @pytest.mark.parametrize("metodo,url", [
        ("get", "/api/blog/admin/linkedin"),
        ("post", "/api/blog/admin/linkedin/connect"),
        ("post", "/api/blog/admin/linkedin/disconnect"),
        ("post", "/api/blog/admin/linkedin/share"),
    ])
    def test_sem_token_401(self, client, blog, anon, metodo, url):
        assert getattr(client, metodo)(url).status_code == 401


class TestStatus:
    def test_desconectado_diz_que_falta_o_app(self, client, blog, admin):
        dados = client.get("/api/blog/admin/linkedin", headers=AUTH).get_json()
        assert dados["connected"] is False and dados["hasApp"] is False

    def test_nunca_devolve_o_token(self, client, blog, admin, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "get", lambda *a, **k: type("R", (), {
            "ok": True, "status_code": 200, "json": lambda s: {"sub": "x"}})())
        linkedin.save_auth("token-secreto", 5184000)
        assert "token-secreto" not in client.get("/api/blog/admin/linkedin", headers=AUTH).get_data(as_text=True)


class TestConexao:
    def test_connect_devolve_a_url_de_autorizacao(self, client, blog, admin):
        linkedin.save_credentials("cid", "sec")
        dados = client.post("/api/blog/admin/linkedin/connect", headers=AUTH).get_json()
        assert dados["url"].startswith("https://www.linkedin.com/oauth/v2/authorization")
        assert "w_member_social" in dados["url"]

    def test_sem_credencial_do_app_e_409_com_recado(self, client, blog, admin):
        res = client.post("/api/blog/admin/linkedin/connect", headers=AUTH)
        assert res.status_code == 409 and "app" in res.get_json()["error"].lower()

    def test_callback_com_state_valido_grava_o_token(self, client, blog, admin, monkeypatch):
        linkedin.save_credentials("cid", "sec")
        state = linkedin.create_state()
        monkeypatch.setattr(linkedin, "exchange_code", lambda c: ("t0k", 5184000))
        monkeypatch.setattr(linkedin, "person_urn", lambda t: "urn:li:person:x")
        res = client.get(f"/api/blog/admin/linkedin/callback?code=abc&state={state}")
        assert res.status_code == 302 and "/admin" in res.headers["Location"]
        assert linkedin.get_auth()["personUrn"] == "urn:li:person:x"

    def test_callback_com_state_invalido_NAO_grava_nada(self, client, blog, monkeypatch):
        monkeypatch.setattr(linkedin, "exchange_code", lambda c: ("t0k", 5184000))
        res = client.get("/api/blog/admin/linkedin/callback?code=abc&state=" + "f" * 48)
        assert res.status_code == 400
        assert linkedin.get_auth() is None

    def test_callback_sem_code_e_400(self, client, blog):
        assert client.get("/api/blog/admin/linkedin/callback?state=x").status_code == 400

    def test_desconectar(self, client, blog, admin, monkeypatch):
        monkeypatch.setattr(linkedin, "person_urn", lambda t: "urn:li:person:x")
        linkedin.save_auth("t", 100)
        assert client.post("/api/blog/admin/linkedin/disconnect", headers=AUTH).status_code == 200
        assert linkedin.get_auth() is None


class TestCompartilharAgora:
    def _publicado(self):
        post = store.create_post({"slugBase": "p", "i18n": {
            l: {"title": "T", "excerpt": "R", "sections": [{"heading": "h", "paragraphs": ["p"]}]}
            for l in ("pt", "en")}})
        store.publish_post(post["id"])
        return post

    def test_compartilha_o_proximo_da_fila(self, client, blog, admin, monkeypatch):
        post = self._publicado()
        monkeypatch.setattr(linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        monkeypatch.setattr(linkedin, "publish", lambda *a: "urn:li:share:9")
        dados = client.post("/api/blog/admin/linkedin/share", headers=AUTH).get_json()
        assert dados["post"]["linkedinUrn"] == "urn:li:share:9"
        assert store.get_post(post["id"])["linkedinPostedAt"] is not None

    def test_fila_vazia_responde_sem_erro(self, client, blog, admin, monkeypatch):
        monkeypatch.setattr(linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        res = client.post("/api/blog/admin/linkedin/share", headers=AUTH)
        assert res.status_code == 200 and res.get_json()["post"] is None

    def test_sem_conta_conectada_e_409(self, client, blog, admin, monkeypatch):
        self._publicado()
        monkeypatch.setattr(linkedin, "get_auth", lambda: None)
        assert client.post("/api/blog/admin/linkedin/share", headers=AUTH).status_code == 409

    def test_recusa_do_linkedin_vira_502(self, client, blog, admin, monkeypatch):
        self._publicado()
        monkeypatch.setattr(linkedin, "get_auth", lambda: {"accessToken": "t", "personUrn": "p"})
        monkeypatch.setattr(linkedin, "publish", lambda *a: (_ for _ in ()).throw(linkedin.LinkedInError("422")))
        assert client.post("/api/blog/admin/linkedin/share", headers=AUTH).status_code == 502


class TestMarcarPost:
    def test_desligar_o_post_para_o_linkedin(self, client, blog, admin):
        post = store.create_post({"slugBase": "p", "i18n": {}})
        res = client.patch(f"/api/blog/admin/posts/{post['id']}", headers=AUTH,
                           json={"linkedinEnabled": False})
        assert res.get_json()["post"]["linkedinEnabled"] is False

    def test_post_novo_ja_nasce_habilitado(self, client, blog, admin):
        post = store.create_post({"slugBase": "p", "i18n": {}})
        assert post["linkedinEnabled"] is True

    def test_o_site_publico_nao_expoe_o_estado_do_linkedin(self, client, blog, admin):
        post = store.create_post({"slugBase": "p", "i18n": {
            l: {"title": "T", "excerpt": "e", "sections": [{"heading": "h", "paragraphs": ["p"]}]}
            for l in ("pt", "en")}})
        store.publish_post(post["id"])
        bruto = client.get("/api/blog/posts").get_data(as_text=True)
        assert "linkedinEnabled" not in bruto and "linkedinUrn" not in bruto
