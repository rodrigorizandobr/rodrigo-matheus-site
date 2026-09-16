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

from flask import Blueprint, Response, jsonify, redirect, request

from . import images, linkedin, media, model, notify, service, store
from .auth import AuthError, verify_admin

bp = Blueprint("blog", __name__)

TICK_KEY = os.environ.get("BLOG_TICK_KEY", "")

# 12 MB: acima disso é foto de câmera sem tratamento, e o Cloud Run tem 512 MB de RAM
# para converter a imagem — recusar cedo é melhor do que morrer no meio.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


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
    data = media.read_image(digest)
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
    """Capa do post: `hash` escolhe da biblioteca (ou tira, com null); `prompt` gera uma nova."""
    body = request.get_json(silent=True) or {}

    if "hash" in body:
        digest = body.get("hash")
        if digest is None:
            post = store.update_post(post_id, {"image": None})
            return (jsonify({"post": _json(post)}) if post else (jsonify({"error": "not found"}), 404))
        item = media.get_media(digest)
        if not item:
            return jsonify({"error": "imagem não está na biblioteca"}), 404
        post = store.update_post(post_id, {"image": media.as_cover(item)})
        return (jsonify({"post": _json(post)}) if post else (jsonify({"error": "not found"}), 404))

    post = service.regenerate_cover(post_id, body.get("prompt"))
    if not post:
        return jsonify({"error": "not found"}), 404
    return jsonify({"post": _json(post)})


# ── biblioteca de mídia ─────────────────────────────────────────────────────

@bp.get("/api/blog/admin/media")
@admin_only
def media_list():
    return jsonify({"items": _json(media.list_media())})


@bp.post("/api/blog/admin/media/upload")
@admin_only
def media_upload():
    uploaded = request.files.get("file")
    if not uploaded:
        return jsonify({"error": "nenhum arquivo enviado"}), 400

    raw = uploaded.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        return jsonify({"error": f"arquivo acima de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"}), 413

    item = media.store_image(raw, provider="upload",
                             alt=request.form.get("alt", ""), credit=request.form.get("credit", ""))
    if not item:
        return jsonify({"error": "arquivo não é uma imagem que sabemos ler"}), 400
    return jsonify({"item": _json(item)}), 201


@bp.post("/api/blog/admin/media/generate")
@admin_only
def media_generate():
    body = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "descreva a cena que a IA deve criar"}), 400
    item = images.generate_image(prompt, alt=body.get("alt", ""))
    if not item:
        return jsonify({"error": "a IA não devolveu imagem (cota ou recusa do modelo)"}), 502
    return jsonify({"item": _json(item)}), 201


@bp.get("/api/blog/admin/media/stock")
@admin_only
def media_stock_search():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "informe o que buscar"}), 400
    return jsonify({"results": images.search_stock(query)})


@bp.post("/api/blog/admin/media/stock")
@admin_only
def media_stock_import():
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url da imagem escolhida"}), 400
    item = images.import_stock(url, body.get("credit", ""), body.get("sourceUrl", ""), body.get("alt", ""))
    if not item:
        return jsonify({"error": "não consegui baixar a imagem escolhida"}), 502
    return jsonify({"item": _json(item)}), 201


@bp.patch("/api/blog/admin/media/<digest>")
@admin_only
def media_update(digest: str):
    item = media.update_media(digest, request.get_json(silent=True) or {})
    if not item:
        return jsonify({"error": "not found"}), 404
    return jsonify({"item": _json(item)})


@bp.delete("/api/blog/admin/media/<digest>")
@admin_only
def media_delete(digest: str):
    try:
        media.delete_media(digest)
    except media.InUseError as exc:
        return jsonify({"error": str(exc)}), 409
    return jsonify({"ok": True})


@bp.post("/api/blog/admin/generate")
@admin_only
def admin_generate():
    body = request.get_json(silent=True) or {}
    research_flag = body.get("research")
    try:
        post = service.generate(body.get("topic"), context=body.get("context", ""),
                                use_research=research_flag if isinstance(research_flag, bool) else None)
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


# ── LinkedIn ────────────────────────────────────────────────────────────────

@bp.get("/api/blog/admin/linkedin")
@admin_only
def linkedin_status():
    return jsonify(_json(linkedin.status()))


@bp.post("/api/blog/admin/linkedin/connect")
@admin_only
def linkedin_connect():
    """Devolve a URL de autorização. O `state` é criado AQUI, por um admin logado —
    é o que garante que o callback, que chega sem token, veio de um pedido nosso."""
    url = linkedin.authorize_url(linkedin.create_state())
    if not url:
        return jsonify({"error": "cadastre o app do LinkedIn (client id e secret) antes de conectar"}), 409
    return jsonify({"url": url})


@bp.get("/api/blog/admin/linkedin/callback")
def linkedin_callback():
    """O LinkedIn manda o navegador para cá — sem cabeçalho de autenticação possível.

    Quem autoriza é o `state`: de uso único, com validade curta, e só existe porque um
    admin logado pediu a conexão. Sem ele, nada é gravado.
    """
    code = request.args.get("code", "")
    state = request.args.get("state", "")
    if not code:
        return jsonify({"error": "sem code"}), 400
    if not linkedin.consume_state(state):
        return jsonify({"error": "state inválido ou vencido — peça a conexão de novo pelo painel"}), 400
    try:
        token, expires_in = linkedin.exchange_code(code)
        linkedin.save_auth(token, expires_in)
    except linkedin.LinkedInError as exc:
        return jsonify({"error": str(exc)}), 502
    return redirect("/admin?linkedin=ok", code=302)


@bp.post("/api/blog/admin/linkedin/test-alert")
@admin_only
def linkedin_test_alert():
    """Dispara um aviso de mentira pelo mesmo caminho do de verdade.

    É o único jeito de saber que o e-mail sai ANTES de a autorização vencer — e é
    justamente quando ela vence que ninguém está olhando.
    """
    assunto, corpo = notify.expiry_message(7, 7)
    saiu, motivo = notify.send_with_reason(f"[teste] {assunto}", corpo)
    return jsonify({"sent": saiu, "configured": notify.configured(), "reason": motivo})


@bp.post("/api/blog/admin/linkedin/disconnect")
@admin_only
def linkedin_disconnect():
    linkedin.disconnect()
    return jsonify({"ok": True})


@bp.post("/api/blog/admin/linkedin/app")
@admin_only
def linkedin_save_app():
    body = request.get_json(silent=True) or {}
    client_id = (body.get("clientId") or "").strip()
    client_secret = (body.get("clientSecret") or "").strip()
    if not client_id or not client_secret:
        return jsonify({"error": "client id e secret são obrigatórios"}), 400
    linkedin.save_credentials(client_id, client_secret)
    return jsonify(_json(linkedin.status()))


@bp.post("/api/blog/admin/linkedin/share")
@admin_only
def linkedin_share_now():
    """Manda o próximo da fila agora, sem esperar o agendador."""
    try:
        post = service.share_next()
    except service.NotConnectedError as exc:
        return jsonify({"error": str(exc)}), 409
    except linkedin.LinkedInError as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify({"post": _json(post)})


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
