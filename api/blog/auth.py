"""Portaria do painel do blog.

Verifica o ID token do Firebase Auth (login com Google no navegador) e só deixa
passar quem está na allowlist. Não usa `firebase-admin`: o `google-auth` já vem
junto do `google-cloud-storage` e sabe verificar token do Firebase — uma
dependência a menos para manter num serviço que sobe em cold start.

As checagens de `aud` e `iss` são explícitas de propósito: sem elas um ID token
de QUALQUER projeto Firebase do mundo seria aceito aqui.
"""
from __future__ import annotations

import os
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT") or "rodrigo-matheus"
OWNER_EMAIL = "rodrigorizando@gmail.com"


class AuthError(Exception):
    """Qualquer recusa da portaria. As rotas viram isso em 401/403 sem detalhar o porquê ao cliente."""


def load_admin_emails() -> frozenset[str]:
    raw = os.environ.get("BLOG_ADMIN_EMAILS", "")
    emails = {e.strip().lower() for e in raw.split(",") if e.strip()}
    return frozenset(emails or {OWNER_EMAIL})


ADMIN_EMAILS = load_admin_emails()

_request = google_requests.Request()


def bearer_token(header: str | None) -> str:
    """Extrai o token de `Authorization: Bearer <jwt>`."""
    parts = (header or "").split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AuthError("token ausente ou malformado")
    return parts[1].strip()


def _verify(token: str) -> dict[str, Any]:
    """Isolado para o teste substituir — aqui mora a chamada de rede às chaves públicas."""
    return id_token.verify_firebase_token(token, _request, audience=PROJECT_ID)


def verify_admin(header: str | None) -> str:
    """Devolve o e-mail do admin autenticado, ou levanta AuthError."""
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

    email = (claims.get("email") or "").strip().lower()
    if email not in ADMIN_EMAILS:
        raise AuthError("não autorizado")
    return email
