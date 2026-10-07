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

    def _rede(self, monkeypatch, upload_status=201):
        """Grava as chamadas em ordem; responde como o LinkedIn responderia."""
        chamadas = []
        mecanismo = "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"

        def fake_post(url, **kw):
            chamadas.append(("POST", url, kw))
            if "registerUpload" in url:
                return Resp({"value": {"asset": "urn:li:digitalmediaAsset:ABC",
                                       "uploadMechanism": {mecanismo: {"uploadUrl": "https://upload.li/x"}}}})
            return Resp({}, headers={"x-restli-id": "urn:li:share:123"})

        def fake_put(url, **kw):
            chamadas.append(("PUT", url, kw))
            return Resp({}, status=upload_status)

        monkeypatch.setattr(linkedin.requests, "post", fake_post)
        monkeypatch.setattr(linkedin.requests, "put", fake_put)
        return chamadas

    def _conteudo(self, chamadas):
        post = [c for c in chamadas if c[0] == "POST" and "ugcPosts" in c[1]][0]
        return post[2]["json"], post[2]["json"]["specificContent"]["com.linkedin.ugc.ShareContent"], post[2]

    def test_com_imagem_registra_envia_os_bytes_e_publica_como_IMAGE(self, db, monkeypatch):
        chamadas = self._rede(monkeypatch)
        urn = linkedin.publish(self._auth(), "texto completo", b"JPEGBYTES", alt="a capa")
        assert urn == "urn:li:share:123"
        assert [c[0] for c in chamadas] == ["POST", "PUT", "POST"], "registrar → enviar → publicar"

        registro = chamadas[0][2]["json"]["registerUploadRequest"]
        assert registro["owner"] == "urn:li:person:x"
        assert "feedshare-image" in registro["recipes"][0]

        envio = chamadas[1]
        assert envio[1] == "https://upload.li/x"
        assert envio[2]["data"] == b"JPEGBYTES"
        assert envio[2]["headers"]["Authorization"] == "Bearer t0k"

        corpo, conteudo, kw = self._conteudo(chamadas)
        assert corpo["author"] == "urn:li:person:x"
        assert conteudo["shareMediaCategory"] == "IMAGE"
        assert conteudo["shareCommentary"]["text"] == "texto completo"
        media = conteudo["media"][0]
        assert media["media"] == "urn:li:digitalmediaAsset:ABC" and media["status"] == "READY"
        assert media["description"]["text"] == "a capa"
        assert kw["headers"]["Authorization"] == "Bearer t0k"

    def test_sem_imagem_publica_so_o_texto(self, db, monkeypatch):
        chamadas = self._rede(monkeypatch)
        linkedin.publish(self._auth(), "só texto")
        assert [c[0] for c in chamadas] == ["POST"]
        _, conteudo, _ = self._conteudo(chamadas)
        assert conteudo["shareMediaCategory"] == "NONE"
        assert "media" not in conteudo

    def test_falha_no_envio_da_imagem_NAO_publica_o_post(self, db, monkeypatch):
        chamadas = self._rede(monkeypatch, upload_status=500)
        with pytest.raises(linkedin.LinkedInError, match="imagem"):
            linkedin.publish(self._auth(), "t", b"JPEG")
        assert not [c for c in chamadas if "ugcPosts" in c[1]], "post sem a imagem prometida seria pior que nenhum"

    def test_erro_do_linkedin_vira_LinkedInError_com_o_corpo(self, db, monkeypatch):
        monkeypatch.setattr(linkedin.requests, "post", lambda *a, **k: Resp({}, status=422, text="union inválido"))
        with pytest.raises(linkedin.LinkedInError, match="422"):
            linkedin.publish(self._auth(), "t")


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


class TestPostCompleto:
    URL = "https://rodrigomatheus.com.br/blog/o-post"

    def _post(self, paragrafos=("Primeiro parágrafo.", "Segundo parágrafo."), secoes=2):
        return {"tags": ["ia"], "i18n": {"pt": {
            "title": "O título", "excerpt": "O gancho.",
            "sections": [{"heading": f"Seção {i}", "paragraphs": list(paragrafos)} for i in range(1, secoes + 1)]}}}

    def test_leva_o_texto_inteiro_nao_so_o_resumo(self):
        texto = linkedin.share_text(self._post(), self.URL)
        assert texto.startswith("O título")
        assert "O gancho." in texto
        assert "Seção 1" in texto and "Seção 2" in texto
        assert texto.count("Primeiro parágrafo.") == 2

    def test_termina_com_hashtags_e_o_link_do_post(self):
        texto = linkedin.share_text(self._post(), self.URL)
        assert "#ia" in texto
        assert texto.rstrip().endswith(self.URL)

    def test_cabendo_tudo_nao_promete_continuacao(self):
        assert "continua" not in linkedin.share_text(self._post(), self.URL).lower()

    def test_longo_demais_corta_em_paragrafo_inteiro_e_avisa_que_continua(self):
        longo = self._post(paragrafos=("palavra " * 120,) * 3, secoes=4)
        texto = linkedin.share_text(longo, self.URL)
        assert len(texto) <= linkedin.MAX_TEXT
        assert texto.rstrip().endswith(self.URL), "o link nunca pode ser o que se corta"
        assert "continua" in texto.lower()
        assert "Seção 4" not in texto
        assert not any(p.rstrip().endswith("palavr") for p in texto.split("\n\n")), "não corta no meio de palavra"

    def test_sem_secoes_ainda_monta_titulo_e_resumo(self):
        post = {"tags": [], "i18n": {"pt": {"title": "T", "excerpt": "R", "sections": []}}}
        assert linkedin.share_text(post, self.URL).startswith("T\n\nR")


class TestVideoNoTexto:
    """O vídeo é só um LINK no texto — o LinkedIn desenha o cartão lendo a página do
    YouTube; nunca baixamos nem subimos o arquivo (ver blog/videos.py)."""

    def _post_com_video(self):
        return {"tags": [], "i18n": {"pt": {"title": "T", "excerpt": "R", "sections": [
            {"heading": "S", "paragraphs": ["P."]}]}},
            "video": {"title": "Vídeo", "url": "https://youtu.be/abc", "channel": "Canal"}}

    def test_o_link_do_video_entra_no_texto(self):
        texto = linkedin.share_text(self._post_com_video())
        assert "https://youtu.be/abc" in texto

    def test_vem_logo_no_comeco_para_o_linkedin_desenhar_o_cartao(self):
        texto = linkedin.share_text(self._post_com_video())
        assert texto.index("https://youtu.be/abc") < texto.index("P.")

    def test_sem_video_nao_sobra_linha_vazia_nem_quebra_nada(self):
        post = {"tags": [], "i18n": {"pt": {"title": "T", "excerpt": "R", "sections": []}}}
        assert linkedin.share_text(post).startswith("T\n\nR")
