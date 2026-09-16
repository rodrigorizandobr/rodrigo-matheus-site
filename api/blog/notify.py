"""Régua de comunicação: e-mail quando a autorização do LinkedIn está para vencer.

O LinkedIn não dá `refresh_token` para apps self-serve, então a autorização morre
sozinha em ~60 dias e o compartilhamento para **em silêncio**. O painel mostra os
dias restantes, mas ninguém abre o painel para ver que está tudo bem — por isso o
aviso vai atrás da pessoa, por e-mail, nas marcas de `model.EXPIRY_MARKS`.

Transporte: **AWS SES** pela API HTTPS (`sesv2:SendEmail`). Não é SMTP de propósito
— o Cloud Run bloqueia a porta 25 e trata as outras de forma que não vale apostar
um aviso raro; HTTPS sempre sai. As credenciais são de um usuário IAM que só pode
enviar por UMA identidade (`blog-ses-sender`), então vazar a chave não vira spam.

Nada aqui levanta exceção: um e-mail não pode derrubar a batida do agendador.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache

log = logging.getLogger(__name__)

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
#: remetente — precisa ser identidade verificada no SES
ALERT_FROM = os.environ.get("ALERT_FROM", "")
ALERT_TO = [e.strip() for e in (
    os.environ.get("ALERT_EMAILS") or os.environ.get("BLOG_ADMIN_EMAILS") or ""
).split(",") if e.strip()]

SITE = os.environ.get("SITE_URL", "https://rodrigomatheus.com.br")


@lru_cache(maxsize=1)
def _ses():
    import boto3  # importado tarde: o agendador não paga por ele em toda batida

    return boto3.client("sesv2", region_name=AWS_REGION)


def configured() -> bool:
    return bool(ALERT_FROM and ALERT_TO)


def expiry_message(mark: int, days_left: int) -> tuple[str, str]:
    """Assunto e corpo do aviso. O assunto sozinho já dá o prazo."""
    painel = f"{SITE}/admin"
    if mark == 0:
        assunto = "LinkedIn: a autorização venceu — o compartilhamento parou"
        corpo = (
            "A autorização do LinkedIn venceu e o compartilhamento automático está parado.\n\n"
            f"Nenhum post novo vai para o LinkedIn até você reconectar em {painel}\n"
            "(configuração → 4. LinkedIn → reconectar). A fila não se perde: ela continua\n"
            "de onde parou, do post mais antigo para o mais novo.\n"
        )
        return assunto, corpo

    dias = "1 dia" if days_left == 1 else f"{days_left} dias"
    assunto = f"LinkedIn: a autorização vence em {dias}"
    corpo = (
        f"A autorização do LinkedIn vence em {dias}. Ela não se renova sozinha:\n"
        "quando vencer, o compartilhamento automático para sem erro visível.\n\n"
        f"Para renovar, leva um clique: {painel}\n"
        "(configuração → 4. LinkedIn → reconectar)\n"
    )
    return assunto, corpo


def send(subject: str, body: str) -> bool:
    """True se o SES aceitou a mensagem. Nunca levanta."""
    return send_with_reason(subject, body)[0]


def send_with_reason(subject: str, body: str) -> tuple[bool, str]:
    """Igual a `send`, mas devolve o motivo da falha.

    O botão de teste do painel mostra esse motivo: "não saiu" sem explicação
    obrigaria a abrir o log do Cloud Run justamente para o caso mais comum —
    identidade ainda não verificada no SES.
    """
    if not configured():
        log.warning("aviso não enviado (SES sem remetente/destinatário): %s", subject)
        return False, "falta o remetente verificado ou o destinatário no servidor"
    try:
        _ses().send_email(
            FromEmailAddress=ALERT_FROM,
            Destination={"ToAddresses": ALERT_TO},
            Content={"Simple": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            }},
        )
        return True, ""
    except Exception as exc:
        log.warning("falha ao enviar aviso (%s): %s", subject, exc)
        return False, str(exc)
