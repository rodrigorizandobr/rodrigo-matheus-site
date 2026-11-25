"""Persistência do simulador de previdência em Firestore: um documento por
usuário, chaveado pelo uid do Firebase — nunca por e-mail, que pode mudar de
conta para conta. Mesmo desenho de `api/planner/store.py`, coleção própria.

Os valores PADRÃO (o que um visitante vê ao abrir a página) moram num documento próprio, que só o
administrador grava. O plano pessoal do administrador nunca vira padrão: são duas coleções, e nenhuma
função aqui copia uma para a outra."""
from __future__ import annotations

import os
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

from . import model

PLANS = "pension_plans"
DEFAULTS = "app_defaults"
DEFAULTS_DOC = "pension"

_client: firestore.Client | None = None


def _db() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT") or None)
    return _client


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_defaults() -> dict[str, Any]:
    """O que o visitante vê ao abrir a página: o que o administrador gravou, ou o exemplo de fábrica."""
    snap = _db().collection(DEFAULTS).document(DEFAULTS_DOC).get()
    saved = snap.to_dict() if snap.exists else None
    return {
        "params": model.merged((saved or {}).get("params")),
        "updatedAt": (saved or {}).get("updatedAt"),
        "custom": saved is not None,
    }


def save_defaults(params: dict[str, Any]) -> dict[str, Any]:
    """Grava o padrão dos visitantes. SUBSTITUI o anterior inteiro (o que o administrador vê no formulário é
    o que o visitante recebe; sobra do padrão antigo não fica escondida) e valida tudo antes de gravar."""
    novo = {**deepcopy(model.DEFAULT_PARAMS), **model.sanitize(params)}
    now = _now()
    _db().collection(DEFAULTS).document(DEFAULTS_DOC).set({"params": novo, "updatedAt": now})
    return {"params": novo, "updatedAt": now, "custom": True}


def get_plan(uid: str) -> dict[str, Any]:
    """Os parâmetros salvos sobre os padrões de fábrica. Quem nunca salvou recebe o padrão dos visitantes
    (`saved: False`): é assim que a tela sabe se há um plano da pessoa para não sobrescrever."""
    snap = _db().collection(PLANS).document(uid).get()
    if not snap.exists:
        return {"params": get_defaults()["params"], "updatedAt": None, "saved": False}
    saved = snap.to_dict() or {}
    return {"params": model.merged(saved.get("params")), "updatedAt": saved.get("updatedAt"), "saved": True}


def save_plan(uid: str, patch: dict[str, Any], email: str = "") -> dict[str, Any]:
    """Mescla `patch` sobre o que já estava salvo (ou os padrões) e grava.

    `sanitize` roda duas vezes de propósito: aqui, validando só o que mudou
    (campo ausente no patch não precisa estar na faixa — ele já está salvo); e
    dentro de `merged`, ao reler, validando o documento inteiro contra uma
    faixa que pode ter mudado desde a última gravação."""
    atual = get_plan(uid)["params"]
    novo = {**atual, **model.sanitize(patch)}
    now = _now()
    doc: dict[str, Any] = {"params": novo, "updatedAt": now}
    if email:
        doc["email"] = email
    _db().collection(PLANS).document(uid).set(doc, merge=True)
    return {"params": novo, "updatedAt": now, "saved": True}
