"""A prova do navegador (Firebase App Check): só vale token assinado pelo Firebase, para ESTE
projeto, de um app registrado aqui e dentro da validade. Os tokens do teste são assinados de
verdade, com uma chave gerada na hora — só a busca da chave pública do Google é trocada."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from guard import appcheck


@pytest.fixture(scope="module")
def chave():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def chave_publica_do_google(monkeypatch, chave):
    monkeypatch.setattr(appcheck, "_signing_key", lambda token: chave.public_key())


def prova(chave, algoritmo="RS256", cabecalho=None, **troca):
    agora = int(time.time())
    claims = {"iss": appcheck.ISSUER, "aud": [appcheck.AUDIENCE, "projects/rodrigo-matheus"],
              "sub": sorted(appcheck.APP_IDS)[0], "iat": agora, "exp": agora + 600}
    claims.update(troca)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, chave, algorithm=algoritmo, headers=cabecalho or {"typ": "JWT"})


class TestProvaValida:
    def test_token_do_firebase_para_este_projeto_e_este_app_passa(self, chave):
        claims = appcheck.verify(prova(chave))
        assert claims["sub"] in appcheck.APP_IDS

    def test_o_app_registrado_e_o_do_site(self):
        assert "1:394784830589:web:98c642029a8168d5cf2d14" in appcheck.APP_IDS
        assert appcheck.ISSUER == "https://firebaseappcheck.googleapis.com/394784830589"


class TestProvaRecusada:
    @pytest.mark.parametrize("token", [None, "", "   ", "isto-nao-e-um-jwt", "a.b.c"])
    def test_ausente_ou_lixo(self, token):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(token)

    def test_vencida(self, chave):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave, exp=int(time.time()) - 5))

    def test_sem_validade_nenhuma(self, chave):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave, exp=None))

    def test_de_outro_projeto_firebase(self, chave):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave, iss="https://firebaseappcheck.googleapis.com/111111111111",
                                  aud=["projects/111111111111"]))

    def test_emitida_para_outro_destino(self, chave):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave, aud=["projects/111111111111"]))

    def test_emissor_que_nao_e_o_app_check(self, chave):
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave, iss="https://securetoken.google.com/rodrigo-matheus"))

    def test_de_app_que_nao_e_o_site(self, chave):
        """Outro app registrado no MESMO projeto não fala com a API do site."""
        with pytest.raises(appcheck.ProofError, match="app"):
            appcheck.verify(prova(chave, sub="1:394784830589:web:726deab83d4e8e9bcf2d14"))

    def test_assinada_por_outra_chave(self):
        intrusa = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(intrusa))

    def test_assinatura_simetrica_nao_vale(self, chave):
        """Token HS256 "assinado" com um segredo qualquer: o algoritmo aceito é só o RS256."""
        falso = jwt.encode({"iss": appcheck.ISSUER, "aud": [appcheck.AUDIENCE], "sub": sorted(appcheck.APP_IDS)[0],
                            "exp": int(time.time()) + 600}, "segredo-do-atacante-com-32-bytes!!", algorithm="HS256")
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(falso)

    def test_chave_publica_fora_do_ar_recusa_em_vez_de_liberar(self, monkeypatch, chave):
        def sem_rede(token):
            raise OSError("jwks fora do ar")
        monkeypatch.setattr(appcheck, "_signing_key", sem_rede)
        with pytest.raises(appcheck.ProofError):
            appcheck.verify(prova(chave))

    def test_o_motivo_da_recusa_nao_vaza_a_excecao_original(self, chave):
        with pytest.raises(appcheck.ProofError) as recusa:
            appcheck.verify(prova(chave, exp=int(time.time()) - 5))
        assert "Signature" not in str(recusa.value) and "expired" not in str(recusa.value)
