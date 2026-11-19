"""A cola da portaria com o Flask: um `before_request` do app, na frente de TODAS as rotas.

Ordem, por chamada: (1) tamanho do corpo; (2) prova do navegador, onde `policy` pede; (3) limite
por navegador verificado. O login vem depois, em cada rota; o limite por CONTA é chamado pelas
rotas dos utilitários, porque só elas sabem quem é a pessoa.

O limite NÃO é por IP, de propósito. O servidor é alcançado por dois caminhos (pelo Hosting e
direto no Cloud Run, que o painel usa nas operações longas): por um deles quem chama escreve o
que quiser no `X-Forwarded-For`, e pelo outro o endereço que chega é o do próprio Hosting,
dividido por todo mundo. Limite por IP ou seria burlado, ou barraria gente de verdade. As duas
chaves usadas aqui não se forjam: o token do App Check (um navegador que passou pelo reCAPTCHA)
e o uid (uma conta Google).
"""
from __future__ import annotations

import hashlib

from flask import jsonify, request

from . import appcheck, policy
from .ratelimit import Limiter

PROOF_HEADER = "X-Firebase-AppCheck"

#: (chamadas, segundos). Uma pessoa usando o painel fica muito abaixo disso.
BROWSER_LIMIT = (240, 60)
#: gravações de plano por conta. O simulador salva sozinho 0,9 s depois da última mudança.
ACCOUNT_LIMIT = (60, 60)

_browser = Limiter(*BROWSER_LIMIT)
_account = Limiter(*ACCOUNT_LIMIT)

NO_PROOF = ("Não deu para confirmar que este acesso vem do site. Recarregue a página; "
            "se continuar, desative o bloqueador de anúncios para este site.")
TOO_MANY = "Muitas chamadas em pouco tempo. Espere um instante e tente de novo."
TOO_BIG = "Conteúdo grande demais para esta rota."


def _too_many(limiter: Limiter, key: str):
    res = jsonify({"error": TOO_MANY, "code": "rate_limit"})
    res.status_code = 429
    res.headers["Retry-After"] = str(max(1, limiter.retry_after(key)))
    return res


def check():
    """`before_request`: devolve a recusa, ou `None` para a chamada seguir."""
    cap = policy.max_body(request.path)
    request.max_content_length = cap  # vale para corpo sem Content-Length (chunked)
    if (request.content_length or 0) > cap:
        return jsonify({"error": TOO_BIG}), 413

    if appcheck.MODE == "off" or not policy.needs_proof(request.path, request.method):
        return None
    token = (request.headers.get(PROOF_HEADER) or "").strip()
    try:
        appcheck.verify(token)
    except appcheck.ProofError as exc:
        if appcheck.MODE == "monitor":
            print(f"[appcheck] passaria a recusar ({exc}): {request.method} {request.path}", flush=True)
            return None
        return jsonify({"error": NO_PROOF, "code": "app_check"}), 403

    key = hashlib.sha256(token.encode()).hexdigest()
    if not _browser.allow(key):
        return _too_many(_browser, key)
    return None


def account_blocked(uid: str):
    """Para a rota chamar depois do login, nas gravações: a recusa 429, ou `None` se a conta pode gravar."""
    if _account.allow(uid):
        return None
    return _too_many(_account, uid)


def install(app) -> None:
    app.before_request(check)
