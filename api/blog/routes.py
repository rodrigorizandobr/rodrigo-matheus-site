"""Rotas HTTP do blog, num Blueprint.

Três famílias, com portarias diferentes:

- `/api/blog/...`        público, só leitura, só post publicado;
- `/api/blog/admin/...`  exige ID token do Firebase de um e-mail da allowlist;
- `/api/blog/tick`       o agendador (Cloud Scheduler), com chave secreta.

Nenhuma rota devolve objeto do Firestore cru: `_json` converte datas para ISO,
porque `DatetimeWithNanoseconds` não é serializável e o front espera texto.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from functools import wraps
from typing import Any

from flask import Blueprint, Response, jsonify, request

from . import images, model, service, store
from .auth import AuthError, verify_admin

bp = Blueprint("blog", __name__)

TICK_KEY = os.environ.get("BLOG_TICK_KEY", "")


def _json(value: Any) -> Any:
    """Datas viram ISO-8601 em UTC; o resto passa igual."""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {k: _json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json(v) for v in value]
    return value


def admin_only(fn):
    """Portaria das rotas de escrita. 401 sem detalhar o motivo ao cliente."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            request.admin_email = verify_admin(request.headers.get("Authorization"))
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401
        return fn(*args, **kwargs)
    return wrapper


def _parse_when(raw: str) -> datetime:
    when = datetime.fromisoformat((raw or "").replace("Z", "+00:00"))
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


# ── público ─────────────────────────────────────────────────────────────────

@bp.get("/api/blog/posts")
def public_posts():
    posts = store.list_public_posts()
    for post in posts:
        post["readingMinutes"] = {l: model.reading_minutes((post.get("i18n") or {}).get(l, {}))
                                  for l in model.LANGS}
    res = jsonify({"posts": _json(posts)})
    res.headers["Cache-Control"] = "public, s-maxage=300, max-age=60"
    return res


@bp.get("/api/blog/posts/<slug>")
def public_post(slug: str):
    post = store.get_public_post(slug)
    if not post:
        return jsonify({"error": "not found"}), 404
    post["readingMinutes"] = {l: model.reading_minutes((post.get("i18n") or {}).get(l, {}))
                              for l in model.LANGS}
    res = jsonify({"post": _json(post)})
    res.headers["Cache-Control"] = "public, s-maxage=300, max-age=60"
    return res


@bp.get("/api/blog/image/<digest>.jpg")
def public_image(digest: str):
    data = images.read_image(digest)
    if not data:
        return jsonify({"error": "not found"}), 404
    # O nome do arquivo é o hash do conteúdo: nunca muda, pode cachear para sempre.
    return Response(data, mimetype="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ── painel ──────────────────────────────────────────────────────────────────

@bp.get("/api/blog/admin/posts")
@admin_only
def admin_list():
    return jsonify({"posts": _json(store.list_posts())})


@bp.post("/api/blog/admin/posts")
@admin_only
def admin_create():
    body = request.get_json(silent=True) or {}
    post = store.create_post({
        "slugBase": body.get("slugBase") or (body.get("i18n", {}).get("pt", {}) or {}).get("title", "post"),
        "tags": body.get("tags") or [],
        "i18n": body.get("i18n") or {},
        "imageAlt": body.get("imageAlt", ""),
        "imagePrompt": body.get("imagePrompt", ""),
        "topic": body.get("topic", ""),
    })
    return jsonify({"post": _json(post)}), 201


@bp.patch("/api/blog/admin/posts/<post_id>")
@admin_only
def admin_update(post_id: str):
    post = store.update_post(post_id, request.get_json(silent=True) or {})
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.delete("/api/blog/admin/posts/<post_id>")
@admin_only
def admin_delete(post_id: str):
    store.delete_post(post_id)
    return jsonify({"ok": True})


@bp.post("/api/blog/admin/posts/<post_id>/publish")
@admin_only
def admin_publish(post_id: str):
    try:
        post = store.publish_post(post_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.post("/api/blog/admin/posts/<post_id>/unpublish")
@admin_only
def admin_unpublish(post_id: str):
    post = store.unpublish_post(post_id)
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.post("/api/blog/admin/posts/<post_id>/schedule")
@admin_only
def admin_schedule(post_id: str):
    body = request.get_json(silent=True) or {}
    try:
        when = _parse_when(body.get("when", ""))
    except ValueError:
        return jsonify({"error": "data inválida — use ISO-8601"}), 400
    try:
        post = store.schedule_post(post_id, when)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.post("/api/blog/admin/posts/<post_id>/revise")
@admin_only
def admin_revise(post_id: str):
    instruction = (request.get_json(silent=True) or {}).get("instruction", "").strip()
    if not instruction:
        return jsonify({"error": "instrução vazia"}), 400
    try:
        post = service.revise(post_id, instruction)
    except service.gemini.GeminiError as exc:
        return jsonify({"error": str(exc)}), 502
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.post("/api/blog/admin/posts/<post_id>/cover")
@admin_only
def admin_cover(post_id: str):
    prompt = (request.get_json(silent=True) or {}).get("prompt")
    post = service.regenerate_cover(post_id, prompt)
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


@bp.post("/api/blog/admin/generate")
@admin_only
def admin_generate():
    body = request.get_json(silent=True) or {}
    try:
        post = service.generate(body.get("topic"), context=body.get("context", ""))
    except service.NoTopicError as exc:
        return jsonify({"error": str(exc)}), 409
    except service.gemini.GeminiError as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify({"post": _json(post)}), 201


@bp.get("/api/blog/admin/config")
@admin_only
def admin_get_config():
    return jsonify({"config": _json(store.get_config())})


@bp.patch("/api/blog/admin/config")
@admin_only
def admin_save_config():
    try:
        cfg = store.save_config(request.get_json(silent=True) or {})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"config": _json(cfg)})


# ── agendador ───────────────────────────────────────────────────────────────

@bp.post("/api/blog/tick")
def tick():
    """Cloud Scheduler bate de hora em hora. Chave vazia no servidor não libera nada."""
    key = request.args.get("key", "")
    if not TICK_KEY or not secrets.compare_digest(key.encode(), TICK_KEY.encode()):
        return jsonify({"error": "unauthorized"}), 403
    now = None
    if request.args.get("now"):  # só para teste determinístico
        try:
            now = _parse_when(request.args["now"])
        except ValueError:
            return jsonify({"error": "now inválido"}), 400
    return jsonify(service.tick(now=now))
