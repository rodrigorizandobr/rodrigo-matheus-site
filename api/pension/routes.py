"""Rotas HTTP do simulador de previdência, num Blueprint à parte do blog e do
planner. Só duas rotas, as duas atrás da MESMA portaria (`user_only`): qualquer
conta Google autenticada, sem allowlist. Vão pelo rewrite `/api/**` do
Hosting (mesma origem do site), então, ao contrário do painel do blog, não
precisam de CORS."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
from typing import Any

from flask import Blueprint, jsonify, request

from . import store
from .auth import AuthError, verify_user

bp = Blueprint("pension", __name__)


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
            request.pension_user = verify_user(request.headers.get("Authorization"))
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401
        return fn(*args, **kwargs)
    return wrapper


@bp.get("/api/pension/plan")
@user_only
def get_plan():
    return jsonify(_json(store.get_plan(request.pension_user["uid"])))


@bp.put("/api/pension/plan")
@user_only
def save_plan():
    body = request.get_json(silent=True) or {}
    try:
        plan = store.save_plan(request.pension_user["uid"], body, email=request.pension_user["email"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(_json(plan))
