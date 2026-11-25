"""Rotas HTTP do simulador, num Blueprint à parte do blog.

Só duas rotas, as duas atrás da MESMA portaria (`user_only`): qualquer conta Google
autenticada, sem allowlist. Vão pelo rewrite `/api/**` do Hosting (mesma origem do
site), então, ao contrário do painel do blog, não precisam de CORS."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
from typing import Any

from flask import Blueprint, jsonify, request

from . import store
from blog.auth import is_admin
from guard.web import account_blocked

from .auth import AuthError, verify_user

bp = Blueprint("planner", __name__)


def _json(value: Any) -> Any:
    """`DatetimeWithNanoseconds` do Firestore não serializa sozinho — vira ISO em UTC."""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {k: _json(v) for k, v in value.items()}
    return value


def user_only(fn):
    """Portaria das duas rotas. 401 sem detalhar o motivo ao cliente."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            request.planner_user = verify_user(request.headers.get("Authorization"))
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401
        if request.method != "GET":  # limite de gravações por conta: uma conta não regrava o plano sem parar
            recusa = account_blocked(request.planner_user["uid"])
            if recusa is not None:
                return recusa
        return fn(*args, **kwargs)
    return wrapper


def admin_only(fn):
    """Só quem está na lista de administradores do painel. Sempre DEPOIS de `user_only`, que já conferiu o login."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_admin(request.planner_user["email"]):
            return jsonify({"error": "só o administrador define os valores padrão"}), 403
        return fn(*args, **kwargs)
    return wrapper


@bp.get("/api/planner/plan")
@user_only
def get_plan():
    plano = store.get_plan(request.planner_user["uid"])
    return jsonify(_json({**plano, "isAdmin": is_admin(request.planner_user["email"])}))


@bp.put("/api/planner/plan")
@user_only
def save_plan():
    body = request.get_json(silent=True) or {}
    try:
        plan = store.save_plan(request.planner_user["uid"], body, email=request.planner_user["email"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_json(plan))


@bp.get("/api/planner/defaults")
def get_defaults():
    """O que o visitante vê ao abrir a página. Pública, sem login e sem prova do navegador (ver `guard/policy.py`).
    A resposta só carrega parâmetros: nada de quem gravou. A borda guarda por um minuto."""
    res = jsonify(_json(store.get_defaults()))
    res.headers["Cache-Control"] = "public, max-age=0, s-maxage=60"
    return res


@bp.put("/api/planner/defaults")
@user_only
@admin_only
def save_defaults():
    body = request.get_json(silent=True) or {}
    try:
        padrao = store.save_defaults(body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_json(padrao))
