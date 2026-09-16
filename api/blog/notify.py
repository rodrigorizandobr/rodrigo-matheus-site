"""Régua de comunicação: e-mail quando a autorização do LinkedIn está para vencer.

O LinkedIn não dá `refresh_token` para apps self-serve, então a autorização morre
sozinha em ~60 dias e o compartilhamento para **em silêncio**. O painel mostra os
dias restantes, mas ninguém abre o painel para ver que está tudo bem — por isso o
aviso vai atrás da pessoa, por e-mail, nas marcas de `model.EXPIRY_MARKS`.

Envio por SMTP porque não exige conta nova em serviço de e-mail: o Gmail aceita
uma *senha de app* dedicada, que só serve para enviar e pode ser revogada sozinha.
Sem SMTP configurado nada quebra — `send` devolve False e a batida segue.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or SMTP_USER
SMTP_TO = [e.strip() for e in (
    os.environ.get("ALERT_EMAILS") or os.environ.get("BLOG_ADMIN_EMAILS") or ""
).split(",") if e.strip()]

SITE = os.environ.get("SITE_URL", "https://rodrigomatheus.com.br")
TIMEOUT = 20


def configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD and SMTP_TO)


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
    """True se saiu. Nunca levanta: um e-mail não pode derrubar o agendador."""
    if not configured():
        log.warning("aviso não enviado (SMTP não configurado): %s", subject)
        return False

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(SMTP_TO)
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=TIMEOUT) as smtp:
            smtp.login(SMTP_USER, SMTP_PASSWORD.replace(" ", ""))
            smtp.send_message(msg)
        return True
    except Exception as exc:
        log.warning("falha ao enviar aviso (%s): %s", subject, exc)
        return False
