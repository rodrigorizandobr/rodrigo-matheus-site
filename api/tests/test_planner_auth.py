"""Portaria do simulador: qualquer conta Google autenticada entra — sem allowlist."""
import pytest

from planner import auth


@pytest.fixture(autouse=True)
def projeto(monkeypatch):
    monkeypatch.setattr(auth, "PROJECT_ID", "rodrigo-matheus")


def _token_valido(**over):
    base = {"sub": "uid-abc123", "email": "qualquer@gmail.com", "email_verified": True,
            "aud": "rodrigo-matheus", "iss": "https://securetoken.google.com/rodrigo-matheus"}
    return {**base, **over}


class TestExtracaoDoHeader:
    @pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer", "Bearer   "])
    def test_header_ausente_ou_malformado_nao_autentica(self, header):
        with pytest.raises(auth.AuthError, match="token"):
            auth.bearer_token(header)


class TestVerificacao:
    def test_qualquer_conta_google_com_email_verificado_passa(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido())
        resultado = auth.verify_user("Bearer t")
        assert resultado == {"uid": "uid-abc123", "email": "qualquer@gmail.com"}

    def test_nao_existe_allowlist__qualquer_email_passa(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email="outra-pessoa@exemplo.com", sub="uid-999"))
        assert auth.verify_user("Bearer t")["uid"] == "uid-999"

    def test_email_nao_verificado_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email_verified=False))
        with pytest.raises(auth.AuthError, match="verificado"):
            auth.verify_user("Bearer t")

    def test_token_de_outro_projeto_firebase_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(aud="outro-projeto"))
        with pytest.raises(auth.AuthError, match="projeto"):
            auth.verify_user("Bearer t")

    def test_emissor_errado_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(iss="https://evil.example/x"))
        with pytest.raises(auth.AuthError, match="emissor"):
            auth.verify_user("Bearer t")

    def test_assinatura_invalida_vira_AuthError_e_nao_vaza_a_excecao_original(self, monkeypatch):
        def explode(_):
            raise ValueError("Token expired, iat 123")
        monkeypatch.setattr(auth, "_verify", explode)
        with pytest.raises(auth.AuthError, match="inválido"):
            auth.verify_user("Bearer t")

    def test_token_sem_sub_e_recusado(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: {**_token_valido(), "sub": ""})
        with pytest.raises(auth.AuthError, match="identificador"):
            auth.verify_user("Bearer t")

    def test_email_do_resultado_vem_em_minusculas(self, monkeypatch):
        monkeypatch.setattr(auth, "_verify", lambda t: _token_valido(email="Fulano@Gmail.COM"))
        assert auth.verify_user("Bearer t")["email"] == "fulano@gmail.com"
