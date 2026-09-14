"""Portaria do painel: só o dono entra, e nenhuma rota de escrita roda sem token válido."""
import pytest

from blog import auth


@pytest.fixture(autouse=True)
def allowlist(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_EMAILS", frozenset({"rodrigorizando@gmail.com"}))
    monkeypatch.setattr(auth, "PROJECT_ID", "rodrigo-matheus")


def _token_valido(**over):
    base = {"email": "rodrigorizando@gmail.com", "email_verified": True,
            "aud": "rodrigo-matheus", "iss": "https://securetoken.google.com/rodrigo-matheus"}
    return {**base, **over}


class TestExtracaoDoHeader:
    @pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer", "Bearer   "])
    def test_header_ausente_ou_malformado_nao_autentica(self, header):
        with pytest.raises(auth.AuthError, match="token"):
            auth.bearer_token(header)

    def test_aceita_bearer_com_qualquer_caixa(self):
        assert auth.bearer_token("bearer abc.def.ghi") == "abc.def.ghi"
        assert auth.bearer_token("Bearer  abc.def.ghi ") == "abc.def.ghi"


class TestAutorizacao:
    def test_email_da_allowlist_com_email_verificado_passa(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido())
        assert auth.verify_admin("Bearer t") == "rodrigorizando@gmail.com"

    def test_outro_email_e_recusado_mesmo_com_token_legitimo(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email="alguem@gmail.com"))
        with pytest.raises(auth.AuthError, match="não autorizado"):
            auth.verify_admin("Bearer t")

    def test_email_nao_verificado_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email_verified=False))
        with pytest.raises(auth.AuthError, match="verificado"):
            auth.verify_admin("Bearer t")

    def test_token_de_outro_projeto_firebase_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(aud="outro-projeto"))
        with pytest.raises(auth.AuthError, match="projeto"):
            auth.verify_admin("Bearer t")

    def test_emissor_errado_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(iss="https://evil.example/x"))
        with pytest.raises(auth.AuthError, match="emissor"):
            auth.verify_admin("Bearer t")

    def test_assinatura_invalida_vira_AuthError_e_nao_vaza_a_excecao_original(self, monkeypatch):
        def explode(_):
            raise ValueError("Token expired, iat 123")
        monkeypatch.setattr(auth, "_verify", explode)
        with pytest.raises(auth.AuthError, match="inválido"):
            auth.verify_admin("Bearer t")

    def test_comparacao_de_email_ignora_caixa(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email="RodrigoRizando@Gmail.com"))
        assert auth.verify_admin("Bearer t") == "rodrigorizando@gmail.com"


class TestConfiguracao:
    def test_allowlist_vem_da_env_separada_por_virgula(self, monkeypatch):
        monkeypatch.setenv("BLOG_ADMIN_EMAILS", "a@x.com, B@X.com ")
        assert auth.load_admin_emails() == frozenset({"a@x.com", "b@x.com"})

    def test_sem_env_cai_no_dono_do_site(self, monkeypatch):
        monkeypatch.delenv("BLOG_ADMIN_EMAILS", raising=False)
        assert auth.load_admin_emails() == frozenset({"rodrigorizando@gmail.com"})
