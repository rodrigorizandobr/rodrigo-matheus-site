"""Publicação automática dos posts no LinkedIn.

Portado do projeto irmão `monster-jobs`, com as mesmas decisões — e pelos mesmos
motivos, medidos lá:

*Credenciais do APP* (`clientId`/`clientSecret`, de developers.linkedin.com) ficam no
Firestore, com variável de ambiente como reserva: assim dá para trocar o app sem deploy.
O *ACCESS TOKEN* é da PESSOA, dura ~60 dias e o LinkedIn NÃO dá refresh token para apps
comuns — perto do fim é preciso reautorizar com um clique. O painel mostra os dias
restantes justamente por isso.

*O state do OAuth é um documento de vida curta*, não um cookie: o Firebase Hosting
descarta todo cookie que não seja `__session`, então o anti-CSRF não sobreviveria à ida
e volta.

*Publicação em `/v2/ugcPosts`*, o endpoint legado, de propósito: é o que o produto
self-serve documenta para apps comuns e não exige o header de versionamento mensal do
`/rest/posts`, que quebra sozinho quando a versão sai do ar. O link vai como ARTICLE
para o LinkedIn montar a prévia.

O token NUNCA sai deste módulo: o painel recebe o resumo de `status()`, montado campo a
campo.
"""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from . import notify
from .store import _db

COLLECTION = "linkedin_auth"
COLLECTION_STATE = "linkedin_state"
DOC_APP = "app"
DOC_TOKEN = "principal"

CLIENT_ID = os.environ.get("LINKEDIN_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
SITE = os.environ.get("SITE_URL", "https://rodrigomatheus.com.br")
REDIRECT_URI = f"{SITE}/api/blog/admin/linkedin/callback"

SCOPE = "openid profile w_member_social"
STATE_TTL = timedelta(minutes=10)
STATE_RE = re.compile(r"^[a-f0-9]{48}$")
TIMEOUT = 30
#: o LinkedIn corta o comentário em 3000 caracteres
MAX_TEXT = 3000


class LinkedInError(RuntimeError):
    """Falha de OAuth ou de publicação, com o corpo da resposta para depurar."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── credenciais do app ──────────────────────────────────────────────────────

def credentials() -> tuple[str, str] | None:
    snap = _db().collection(COLLECTION).document(DOC_APP).get()
    if snap.exists:
        data = snap.to_dict() or {}
        if data.get("clientId") and data.get("clientSecret"):
            return data["clientId"], data["clientSecret"]
    return (CLIENT_ID, CLIENT_SECRET) if CLIENT_ID and CLIENT_SECRET else None


def save_credentials(client_id: str, client_secret: str) -> None:
    _db().collection(COLLECTION).document(DOC_APP).set({
        "clientId": (client_id or "").strip(),
        "clientSecret": (client_secret or "").strip(),
        "updatedAt": _now(),
    })


# ── OAuth ───────────────────────────────────────────────────────────────────

def create_state() -> str:
    state = secrets.token_hex(24)
    _db().collection(COLLECTION_STATE).document(state).set({"createdAt": _now()})
    return state


def consume_state(received: str) -> bool:
    """Valida e QUEIMA o state. Reaproveitar um state abriria brecha de CSRF."""
    if not STATE_RE.match(received or ""):
        return False
    ref = _db().collection(COLLECTION_STATE).document(received)
    snap = ref.get()
    if not snap.exists:
        return False
    created = (snap.to_dict() or {}).get("createdAt")
    ref.delete()
    return bool(created and _now() - created < STATE_TTL)


def authorize_url(state: str) -> str | None:
    cred = credentials()
    if not cred:
        return None
    from urllib.parse import urlencode
    query = urlencode({
        "response_type": "code", "client_id": cred[0],
        "redirect_uri": REDIRECT_URI, "state": state, "scope": SCOPE,
    })
    return f"https://www.linkedin.com/oauth/v2/authorization?{query}"


def exchange_code(code: str) -> tuple[str, int]:
    cred = credentials()
    if not cred:
        raise LinkedInError("credenciais do app do LinkedIn ausentes")
    res = requests.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "authorization_code", "code": code, "client_id": cred[0],
              "client_secret": cred[1], "redirect_uri": REDIRECT_URI},
        timeout=TIMEOUT,
    )
    if not res.ok:
        raise LinkedInError(f"troca de code falhou ({res.status_code}): {res.text[:200]}")
    data = res.json()
    return data["access_token"], int(data.get("expires_in", 0))


def person_urn(access_token: str) -> str:
    res = requests.get("https://api.linkedin.com/v2/userinfo",
                       headers={"Authorization": f"Bearer {access_token}"}, timeout=TIMEOUT)
    if not res.ok:
        raise LinkedInError(f"userinfo falhou ({res.status_code}): {res.text[:200]}")
    return f"urn:li:person:{res.json()['sub']}"


def save_auth(access_token: str, expires_in: int, now: datetime | None = None) -> None:
    now = now or _now()
    _db().collection(COLLECTION).document(DOC_TOKEN).set({
        "accessToken": access_token,
        "personUrn": person_urn(access_token),
        "expiresAt": now + timedelta(seconds=expires_in),
        "updatedAt": now,
    })


def get_auth() -> dict[str, Any] | None:
    snap = _db().collection(COLLECTION).document(DOC_TOKEN).get()
    return snap.to_dict() if snap.exists else None


def days_left(auth: dict[str, Any], now: datetime | None = None) -> int:
    """Dias inteiros até a autorização vencer; negativo se já venceu."""
    delta = auth["expiresAt"] - (now or _now())
    return delta.days if delta.days >= 0 else -((-delta).days + 1)


def notices() -> list[int]:
    """Marcas da régua de avisos já disparadas para ESTA autorização.

    Moram no documento do token de propósito: `save_auth` grava com `set()`, então
    reconectar troca o token e zera a régua no mesmo gesto — sem limpeza esquecida.
    """
    auth = get_auth() or {}
    return [int(m) for m in auth.get("notices", [])]


def mark_notices(marks: list[int], now: datetime | None = None) -> None:
    _db().collection(COLLECTION).document(DOC_TOKEN).update({
        "notices": sorted(set(marks), reverse=True),
        "lastNoticeAt": now or _now(),
    })


def disconnect() -> None:
    _db().collection(COLLECTION).document(DOC_TOKEN).delete()


def status() -> dict[str, Any]:
    """Resumo para o painel — montado campo a campo, sem o token junto."""
    auth = get_auth()
    if not auth:
        return {"connected": False, "hasApp": credentials() is not None}
    days = days_left(auth)
    return {
        "connected": True,
        "hasApp": credentials() is not None,
        "personUrn": auth.get("personUrn", ""),
        "daysLeft": days,
        "expiresAt": auth["expiresAt"],
        "alertsOn": notify.configured(),
        "lastNoticeAt": auth.get("lastNoticeAt"),
    }


# ── publicação ──────────────────────────────────────────────────────────────

def share_text(post: dict[str, Any]) -> str:
    """Comentário do post: título, resumo e as tags como hashtags."""
    i18n = post.get("i18n") or {}
    body = i18n.get("pt") or i18n.get("en") or {}
    title = (body.get("title") or "").strip()
    excerpt = (body.get("excerpt") or "").strip()
    tags = ["#" + re.sub(r"[^0-9a-zA-ZÀ-ÿ]", "", t) for t in (post.get("tags") or [])[:4]]

    partes = [p for p in (title, excerpt, " ".join(tags).strip()) if p]
    return "\n\n".join(partes)[:MAX_TEXT]


def publish(auth: dict[str, Any], text: str, url: str) -> str:
    """Publica no perfil da pessoa e devolve o URN do share."""
    res = requests.post(
        "https://api.linkedin.com/v2/ugcPosts",
        headers={
            "Authorization": f"Bearer {auth['accessToken']}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        json={
            "author": auth["personUrn"],
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text},
                    "shareMediaCategory": "ARTICLE",
                    "media": [{"status": "READY", "originalUrl": url}],
                },
            },
            # A chave é do namespace ugc — o 422 do LinkedIn lista o union exato.
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        },
        timeout=TIMEOUT,
    )
    if not res.ok:
        raise LinkedInError(f"publicação falhou ({res.status_code}): {res.text[:300]}")
    return res.headers.get("x-restli-id") or "publicado"
