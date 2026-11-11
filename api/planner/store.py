"""Persistência do simulador em Firestore: um documento por usuário, chaveado
pelo uid do Firebase — nunca por e-mail, que pode mudar de conta para conta."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

from . import model

PLANS = "planner_plans"

_client: firestore.Client | None = None


def _db() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None)
    return _client


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_plan(uid: str) -> dict[str, Any]:
    """Os parâmetros salvos sobre os padrões. Quem nunca salvou recebe o exemplo do simulador."""
    snap = _db().collection(PLANS).document(uid).get()
    saved = snap.to_dict() if snap.exists else None
    return {
        "params": model.merged((saved or {}).get("params")),
        "updatedAt": (saved or {}).get("updatedAt"),
    }


def save_plan(uid: str, patch: dict[str, Any], email: str = "") -> dict[str, Any]:
    """Mescla `patch` sobre o que já estava salvo (ou os padrões) e grava.

    `sanitize` roda duas vezes de propósito: aqui, validando só o que mudou (campo
    ausente no patch não precisa estar na faixa — ele já está salvo); e dentro de
    `merged`, ao reler, validando o documento inteiro contra uma faixa que pode ter
    mudado desde a última gravação."""
    atual = get_plan(uid)["params"]
    novo = {**atual, **model.sanitize(patch)}
    now = _now()
    doc: dict[str, Any] = {"params": novo, "updatedAt": now}
    if email:
        doc["email"] = email
    _db().collection(PLANS).document(uid).set(doc, merge=True)
    return {"params": novo, "updatedAt": now}
