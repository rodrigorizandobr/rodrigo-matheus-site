"""Portaria do simulador de previdência: QUALQUER conta Google autenticada
entra — não há allowlist aqui, ao contrário do painel do blog (`blog/auth.py`).
O que protege cada plano é o uid do token servindo de chave do documento
(`store.py`): ninguém lê ou escreve o plano de outra pessoa, mas toda pessoa
com uma conta Google tem o próprio. Cópia de `api/planner/auth.py` — mesma
verificação de `aud`/`iss`, pelo mesmo motivo: sem isso, um ID token de
QUALQUER projeto Firebase do mundo seria aceito aqui."""
from __future__ import annotations

import os
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT") or "rodrigo-matheus"

_request = google_requests.Request()


class AuthError(Exception):
    """Qualquer recusa da portaria. As rotas viram isso em 401 sem detalhar o porquê ao cliente."""


def bearer_token(header: str | None) -> str:
    """Extrai o token de `Authorization: Bearer <jwt>`."""
    parts = (header or "").split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AuthError("token ausente ou malformado")
    return parts[1].strip()


def _verify(token: str) -> dict[str, Any]:
    """Isolado para o teste substituir — aqui mora a chamada de rede às chaves públicas."""
    return id_token.verify_firebase_token(token, _request, audience=PROJECT_ID)


def verify_user(header: str | None) -> dict[str, str]:
    """Devolve `{"uid": ..., "email": ...}` do usuário autenticado, ou levanta AuthError.

    O uid é a chave do documento (`store.py`); o e-mail só acompanha o plano
    para o dono conseguir se identificar — nenhuma das duas rotas compara
    contra allowlist."""
    token = bearer_token(header)
    try:
        claims = _verify(token)
    except Exception as exc:  # assinatura, expiração, formato
        raise AuthError("token inválido") from exc

    if claims.get("aud") != PROJECT_ID:
        raise AuthError("token de outro projeto Firebase")
    if claims.get("iss") != f"https://securetoken.google.com/{PROJECT_ID}":
        raise AuthError("emissor inesperado")
    if not claims.get("email_verified"):
        raise AuthError("e-mail não verificado")

    uid = (claims.get("sub") or claims.get("user_id") or "").strip()
    if not uid:
        raise AuthError("token sem identificador de usuário")
    return {"uid": uid, "email": (claims.get("email") or "").strip().lower()}
