"""Cliente do LinkedIn: OAuth, token e publicação."""
from datetime import datetime, timedelta, timezone

import pytest

from blog import linkedin
from tests.fakes import FakeDb


class Resp:
    def __init__(self, payload=None, status=200, headers=None, text=""):
        self._payload, self.status_code = payload, status
        self.ok = status < 400
        self.headers = headers or {}
        self.text = text or str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(linkedin, "_db", lambda: fake)
    monkeypatch.setattr(linkedin, "CLIENT_ID", "")
    monkeypatch.setattr(linkedin, "CLIENT_SECRET", "")
    return fake


def utc(y, m, d, h=0):
    return datetime(y, m, d, h, tzinfo=timezone.utc)


class TestCredenciais:
    def test_firestore_primeiro_env_como_reserva(self, db, monkeypatch):
        monkeypatch.setattr(linkedin, "CLIENT_ID", "do-env")
        monkeypatch.setattr(linkedin, "CLIENT_SECRET", "segredo-env")
        assert linkedin.credentials() == ("do-env", "segredo-env")
        linkedin.save_credentials("do-banco", "segredo-banco")
        assert linkedin.credentials() == ("do-banco", "segredo-banco")

    def test_sem_nenhuma_devolve_None(self, db):
        assert linkedin.credentials() is None

    def test_credencial_pela_metade_nao_vale(self, db):
        linkedin.save_credentials("so-id", "")
        assert linkedin.credentials() is None


class TestOAuth:
    def test_url_pede_o_escopo_de_publicar(self, db):
        linkedin.save_credentials("cid", "sec")
        url = linkedin.authorize_url("abc123")
        assert "w_member_social" in url and "client_id=cid" in url and "state=abc123" in url

    def test_sem_credencial_nao_ha_url(self, db):
        assert linkedin.authorize_url("x") is None

    def test_state_e_de_uso_unico(self, db):
        state = linkedin.create_state()
        assert len(state) == 48
        assert linkedin.consume_state(state) is True
        assert linkedin.consume_state(state) is False, "state reaproveitado abriria brecha de CSRF"

    def test_state_desconhecido_ou_torto_e_recusado(self, db):
        assert linkedin.consume_state("nao-existe") is False
        assert linkedin.consume_state("../../x") is False

    def test_state_vencido_e_recusado(self, db, monkeypatch):
        state = linkedin.create_state()
        db.collection(linkedin.COLLECTION_STATE).document(state).set(
            {"createdAt": datetime.now(timezone.utc) - timedelta(minutes=30)})
        assert linkedin.consume_state(state) is False

    def test_troca_code_por_token(self, db, monkeypatch):
        linkedin.save_credentials("cid", "sec")
        monkeypatch.setattr(linkedin.requests, "post",
                            lambda *a, **k: Resp({"access_token": "t0k", "expires_in": 5184000}))
        assert linkedin.exchange_code("code") == ("t0k", 5184000)

    def test_troca_falhando_levanta_erro_legivel(self, db, monkeypatch):
        linkedin.save_credentials("cid", "sec")
        monkeypatch.setattr(linkedin.requests, "post", lambda *a, **k: Resp({}, status=400, text="invalid_grant"))
        with pytest.raises(linkedin.LinkedInError, match="invalid_grant"):
            linkedin.exchange_code("code")


class TestToken:
    def test_salva_com_urn_da_pessoa_e_validade(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "get", lambda *a, **k: Resp({"sub": "fLU9CGFTzT"}))
        linkedin.save_auth("t0k", 5184000, now=utc(2026, 9, 16))
        auth = linkedin.get_auth()
        assert auth["personUrn"] == "urn:li:person:fLU9CGFTzT"
        assert auth["expiresAt"] > utc(2026, 11, 1)

    def test_sem_token_gravado_devolve_None(self, db):
        assert linkedin.get_auth() is None

    def test_desconectar_apaga(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "get", lambda *a, **k: Resp({"sub": "x"}))
        linkedin.save_auth("t0k", 100)
        linkedin.disconnect()
        assert linkedin.get_auth() is None

    def test_resumo_publico_NAO_carrega_o_token(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "get", lambda *a, **k: Resp({"sub": "x"}))
        linkedin.save_auth("token-secreto", 5184000, now=datetime.now(timezone.utc))
        resumo = linkedin.status()
        assert "token-secreto" not in str(resumo)
        assert resumo["connected"] is True and resumo["daysLeft"] == 59

    def test_status_sem_conexao(self, db):
        assert linkedin.status()["connected"] is False


class TestResumoDasCredenciais:
    """O painel precisa VER o app cadastrado (id e URL de retorno), nunca o secret."""

    def test_mostra_o_client_id_e_a_url_de_retorno(self, db):
        linkedin.save_credentials("meu-client-id", "segredo-do-app")
        resumo = linkedin.status()
        assert resumo["clientId"] == "meu-client-id"
        assert resumo["redirectUri"] == linkedin.REDIRECT_URI

    def test_o_secret_nunca_vai_para_o_painel(self, db):
        linkedin.save_credentials("meu-client-id", "segredo-do-app")
        assert "segredo-do-app" not in str(linkedin.status())

    def test_sem_app_ainda_informa_a_url_de_retorno(self, db):
        resumo = linkedin.status()
        assert resumo["hasApp"] is False
        assert resumo["clientId"] == ""
        assert resumo["redirectUri"] == linkedin.REDIRECT_URI

    def test_conectado_tambem_leva_o_resumo_do_app(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "get", lambda *a, **k: Resp({"sub": "x"}))
        linkedin.save_credentials("meu-client-id", "segredo-do-app")
        linkedin.save_auth("t0k", 100, now=datetime.now(timezone.utc))
        assert linkedin.status()["clientId"] == "meu-client-id"


class TestPublicacao:
    def _auth(self):
        return {"accessToken": "t0k", "personUrn": "urn:li:person:x"}

    def test_manda_o_link_como_ARTICLE_para_gerar_previa(self, db, monkeypatch):
        capturado = {}
        def fake_post(url, **kw):
            capturado.update({"url": url, **kw})
            return Resp({}, headers={"x-restli-id": "urn:li:share:123"})
        monkeypatch.setattr(linkedin.requests, "post", fake_post)
        urn = linkedin.publish(self._auth(), "texto do post", "https://rodrigomatheus.com.br/blog/x")
        assert urn == "urn:li:share:123"
        corpo = capturado["json"]
        assert corpo["author"] == "urn:li:person:x"
        conteudo = corpo["specificContent"]["com.linkedin.ugc.ShareContent"]
        assert conteudo["shareMediaCategory"] == "ARTICLE"
        assert conteudo["media"][0]["originalUrl"].endswith("/blog/x")
        assert capturado["headers"]["Authorization"] == "Bearer t0k"

    def test_erro_do_linkedin_vira_LinkedInError_com_o_corpo(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "post", lambda *a, **k: Resp({}, status=422, text="union inválido"))
        with pytest.raises(linkedin.LinkedInError, match="422"):
            linkedin.publish(self._auth(), "t", "u")


class TestTextoDoPost:
    def test_monta_titulo_resumo_e_hashtags(self):
        post = {"tags": ["ia aplicada", "arquitetura"],
                "i18n": {"pt": {"title": "O título", "excerpt": "O resumo do post."}}}
        texto = linkedin.share_text(post)
        assert texto.startswith("O título")
        assert "O resumo do post." in texto
        assert "#iaaplicada" in texto and "#arquitetura" in texto

    def test_sem_tags_nao_sobra_linha_vazia(self):
        post = {"tags": [], "i18n": {"pt": {"title": "T", "excerpt": "R"}}}
        assert not linkedin.share_text(post).endswith("\n")

    def test_texto_longo_e_cortado_no_limite_do_linkedin(self):
        post = {"tags": [], "i18n": {"pt": {"title": "T", "excerpt": "palavra " * 1000}}}
        assert len(linkedin.share_text(post)) <= linkedin.MAX_TEXT

    def test_cai_para_o_ingles_se_faltar_portugues(self):
        post = {"tags": [], "i18n": {"en": {"title": "The title", "excerpt": "Summary."}}}
        assert "The title" in linkedin.share_text(post)
