"""Persistência do blog em Firestore.

Duas coleções: `blog_posts` (um documento por post) e `blog_config` (um único
documento `settings`). O cliente é criado sob demanda para não pagar conexão no
cold start de quem só pede `/api/data`.

A regra que não pode vazar daqui: o site público NUNCA enxerga rascunho,
agendado nem metadado de geração. Por isso existem `list_public_posts` e
`get_public_post` separados do par administrativo — em vez de um filtro
opcional que um dia alguém esquece de passar.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from . import model

POSTS = "blog_posts"
CONFIG = "blog_config"
CONFIG_DOC = "settings"

# Campos que só o painel vê.
INTERNAL_FIELDS = ("generation", "imagePrompt", "scheduledFor", "topic")

_client: firestore.Client | None = None


def _db() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None)
    return _client


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── configuração ────────────────────────────────────────────────────────────

_LIMITS = {
    "publish_hour": (0, 23),
    "generate_hour": (0, 23),
    "delay_days": (0, 60),
}


def get_config() -> dict[str, Any]:
    snap = _db().collection(CONFIG).document(CONFIG_DOC).get()
    saved = snap.to_dict() if snap.exists else {}
    return {**model.DEFAULT_CONFIG, **(saved or {})}


def save_config(patch: dict[str, Any]) -> dict[str, Any]:
    """Grava só as chaves conhecidas, validadas. Chave estranha é ignorada, não gravada."""
    clean: dict[str, Any] = {}
    for key, value in (patch or {}).items():
        if key not in model.DEFAULT_CONFIG:
            continue
        if key in _LIMITS:
            low, high = _LIMITS[key]
            if not isinstance(value, int) or not low <= value <= high:
                raise ValueError(f"{key} deve ser um inteiro entre {low} e {high}")
        if key == "generate_weekdays":
            if not isinstance(value, list) or any(not isinstance(d, int) or not 0 <= d <= 6 for d in value):
                raise ValueError("generate_weekdays deve ser uma lista de 0 (segunda) a 6 (domingo)")
            value = sorted(set(value))
        if key == "auto_publish" and not isinstance(value, bool):
            raise ValueError("auto_publish deve ser booleano")
        if key == "topics":
            if not isinstance(value, list) or any(not isinstance(t, str) for t in value):
                raise ValueError("topics deve ser uma lista de textos")
            value = [t.strip() for t in value if t.strip()]
        clean[key] = value

    if clean:
        _db().collection(CONFIG).document(CONFIG_DOC).set(clean, merge=True)
    return get_config()


# ── posts ───────────────────────────────────────────────────────────────────

def _doc_to_post(snap) -> dict[str, Any] | None:
    data = snap.to_dict()
    if not data:
        return None
    return {"id": snap.id, **data}


def create_post(draft: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    """Cria um post em RASCUNHO. `draft` vem do Gemini (normalizado) ou do formulário."""
    now = now or _now()
    post_id = uuid.uuid4().hex
    # Sufixo do próprio id: dois posts sobre o mesmo tema gerariam o mesmo slug,
    # e a página pública espera um post por slug.
    slug = f"{model.slugify(draft.get('slugBase') or '')}-{post_id[:8]}"

    post = {
        "slug": slug,
        "status": "draft",
        "tags": model.clean_tags(draft.get("tags") or []),
        "i18n": draft.get("i18n") or {},
        "image": draft.get("image"),
        "imageAlt": draft.get("imageAlt", ""),
        "imagePrompt": draft.get("imagePrompt", ""),
        "topic": draft.get("topic", ""),
        "generation": draft.get("generation"),
        "createdAt": now,
        "updatedAt": now,
        "scheduledFor": None,
        "publishedAt": None,
    }
    _db().collection(POSTS).document(post_id).set(post)
    return {"id": post_id, **post}


def get_post(post_id: str) -> dict[str, Any] | None:
    return _doc_to_post(_db().collection(POSTS).document(post_id).get())


def update_post(post_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    """Atualiza campos editáveis. Status e datas mudam pelas funções próprias."""
    editable = {k: v for k, v in (patch or {}).items()
                if k in ("i18n", "tags", "imageAlt", "imagePrompt", "image", "topic")}
    if "tags" in editable:
        editable["tags"] = model.clean_tags(editable["tags"])
    editable["updatedAt"] = _now()
    _db().collection(POSTS).document(post_id).update(editable)
    return get_post(post_id)


def list_posts() -> list[dict[str, Any]]:
    """Tudo, para o painel — inclusive rascunho e agendado."""
    rows = [_doc_to_post(s) for s in _db().collection(POSTS).stream()]
    return sorted((r for r in rows if r), key=lambda p: p.get("createdAt") or _now(), reverse=True)


def _public_view(post: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in post.items() if k not in INTERNAL_FIELDS}


def list_public_posts() -> list[dict[str, Any]]:
    rows = _db().collection(POSTS).where(filter=FieldFilter("status", "==", "published")).stream()
    posts = [p for p in (_doc_to_post(s) for s in rows) if p]
    posts.sort(key=lambda p: p.get("publishedAt") or p.get("createdAt"), reverse=True)
    return [_public_view(p) for p in posts]


def get_public_post(slug: str) -> dict[str, Any] | None:
    for post in list_public_posts():
        if post.get("slug") == slug:
            return post
    return None


def publish_post(post_id: str, now: datetime | None = None) -> dict[str, Any] | None:
    post = get_post(post_id)
    if not post:
        return None
    model.assert_publishable(post)
    now = now or _now()
    _db().collection(POSTS).document(post_id).update(
        {"status": "published", "publishedAt": now, "scheduledFor": None, "updatedAt": now}
    )
    return get_post(post_id)


def unpublish_post(post_id: str) -> dict[str, Any] | None:
    _db().collection(POSTS).document(post_id).update(
        {"status": "draft", "publishedAt": None, "scheduledFor": None, "updatedAt": _now()}
    )
    return get_post(post_id)


def schedule_post(post_id: str, when: datetime) -> dict[str, Any] | None:
    post = get_post(post_id)
    if not post:
        return None
    model.assert_publishable(post)
    _db().collection(POSTS).document(post_id).update(
        {"status": "scheduled", "scheduledFor": when, "updatedAt": _now()}
    )
    return get_post(post_id)


def delete_post(post_id: str) -> None:
    _db().collection(POSTS).document(post_id).delete()


def publish_due(now: datetime | None = None) -> list[dict[str, Any]]:
    """Publica o que venceu. Chamado pelo agendador, de hora em hora."""
    now = now or _now()
    scheduled = _db().collection(POSTS).where(filter=FieldFilter("status", "==", "scheduled")).stream()
    posts = [p for p in (_doc_to_post(s) for s in scheduled) if p]
    published = []
    for post in model.due_for_publishing(posts, now):
        try:
            published.append(publish_post(post["id"], now=now))
        except ValueError:
            # post agendado que perdeu um idioma no meio do caminho: volta a rascunho
            # em vez de travar a fila inteira toda hora.
            unpublish_post(post["id"])
    return [p for p in published if p]


def last_generated_at() -> datetime | None:
    """Quando o robô gerou o último post. Posts criados na mão não contam."""
    latest = None
    for post in list_posts():
        generation = post.get("generation") or {}
        when = generation.get("generatedAt")
        if when and (latest is None or when > latest):
            latest = when
    return latest
