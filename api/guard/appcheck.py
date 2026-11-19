"""Prova de que a chamada saiu do site, num navegador de verdade (Firebase App Check).

O navegador passa pelo reCAPTCHA invisível, troca o resultado por um token do App Check e o
manda no cabeçalho `X-Firebase-AppCheck`. Aqui o token é conferido como o Firebase documenta
para servidor próprio: assinatura RS256 pelas chaves públicas do App Check, emissor e destino
DESTE projeto, dentro da validade, e emitido para o app do site (há outro app registrado no
mesmo projeto Firebase; ele não fala com esta API).

Robô que chama a API direto, sem navegador, não tem como produzir esse token: é isso que o
reCAPTCHA protege aqui, já que o site não tem formulário de senha nem de cadastro.

`MODE` (variável `APP_CHECK_MODE`): vazio = exige. `monitor` deixa passar e registra o que seria
recusado; `off` desliga. Servem para ligar sem derrubar o site (o servidor sobe antes do
navegador mandar a prova) e como saída de emergência se o reCAPTCHA cair. Valor desconhecido
EXIGE: erro de digitação não pode abrir a porta.
"""
from __future__ import annotations

import os
from typing import Any

import jwt

#: número (não o id) do projeto Firebase: é ele que aparece no emissor e no destino do token
PROJECT_NUMBER = os.environ.get("FIREBASE_PROJECT_NUMBER") or "394784830589"
#: apps que podem falar com esta API. Só o do site (`web/src/lib/firebase.ts`)
APP_IDS = frozenset(a.strip() for a in (os.environ.get("FIREBASE_APP_IDS")
                                         or "1:394784830589:web:98c642029a8168d5cf2d14").split(",") if a.strip())

JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks"
ISSUER = f"https://firebaseappcheck.googleapis.com/{PROJECT_NUMBER}"
AUDIENCE = f"projects/{PROJECT_NUMBER}"

MODE = (os.environ.get("APP_CHECK_MODE") or "enforce").strip().lower()

#: o Firebase pede para não buscar as chaves mais de uma vez a cada 6 horas
_jwks = jwt.PyJWKClient(JWKS_URL, cache_jwk_set=True, lifespan=6 * 3600, timeout=10)


class ProofError(Exception):
    """Sem prova, ou prova que não vale. A rota vira isso em 403 sem detalhar o motivo."""


def _signing_key(token: str) -> Any:
    """Isolado para o teste substituir: aqui mora a chamada de rede às chaves públicas."""
    return _jwks.get_signing_key_from_jwt(token).key


def verify(token: str | None) -> dict[str, Any]:
    """Devolve as claims da prova, ou levanta ProofError."""
    token = (token or "").strip()
    if not token:
        raise ProofError("prova ausente")
    try:
        if jwt.get_unverified_header(token).get("typ") != "JWT":
            raise ValueError("tipo inesperado")
        claims = jwt.decode(token, _signing_key(token), algorithms=["RS256"], audience=AUDIENCE, issuer=ISSUER,
                            options={"require": ["exp", "iss", "aud", "sub"]})
    except Exception as exc:  # assinatura, validade, formato, chave pública fora do ar
        raise ProofError("prova inválida") from exc
    if claims.get("sub") not in APP_IDS:
        raise ProofError("prova de outro app")
    return claims
