"""Núcleo puro do blog — sem Firestore, sem rede, sem Flask.

Aqui moram as duas decisões que erram em silêncio na produção: QUANDO um post
agendado vence e QUANDO o robô deve gerar o próximo. As duas dependem do fuso
local (America/Sao_Paulo), não de UTC: "publicar às 8h" é 8h para quem lê o
site, e um post gerado 23h de sábado em SP não pode contar como domingo.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

DEFAULT_TZ = "America/Sao_Paulo"
LANGS = ("pt", "en")
MAX_TAGS = 6
WORDS_PER_MINUTE = 200

# Valores usados quando o documento de configuração ainda não existe.
DEFAULT_CONFIG: dict[str, Any] = {
    "timezone": DEFAULT_TZ,
    "auto_publish": False,
    "delay_days": 2,
    "publish_hour": 8,
    "generate_hour": 6,
    # segunda e quinta; lista vazia desliga a geração automática
    "generate_weekdays": [0, 3],
    # Pesquisa na web (Serper + leitura das páginas) ao escrever. Opcional.
    "research_enabled": True,
    # Termos vigiados para virar post a partir de notícia. Editáveis no painel.
    "news_terms": [
        "inteligência artificial",
        "desenvolvimento de software",
        "arquitetura de software",
        "segurança da informação",
        "infraestrutura em nuvem",
        "inovação em tecnologia",
    ],
}


def _tz(cfg: dict[str, Any]) -> ZoneInfo:
    return ZoneInfo(cfg.get("timezone") or DEFAULT_TZ)


def slugify(text: str) -> str:
    """Slug ASCII, estável e nunca vazio (o slug é a URL pública do post)."""
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return slug or "post"


def scheduled_for(generated_at: datetime, cfg: dict[str, Any]) -> datetime:
    """Quando um post gerado agora deve entrar no ar, em UTC.

    Conta os dias no calendário LOCAL: o dia de referência é o dia em São Paulo,
    não em UTC. Com `delay_days: 0` publica hoje se ainda não passou da hora, e
    no dia seguinte se já passou — nunca no passado.
    """
    tz = _tz(cfg)
    local = generated_at.astimezone(tz)
    hour = int(cfg.get("publish_hour", DEFAULT_CONFIG["publish_hour"]))
    days = int(cfg.get("delay_days", DEFAULT_CONFIG["delay_days"]))

    target = (local + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= local:
        target += timedelta(days=1)
    return target.astimezone(timezone.utc)


def due_for_publishing(posts: Iterable[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """Posts agendados cuja hora chegou. Ignora rascunho, publicado e sem data."""
    due = []
    for post in posts:
        when = post.get("scheduledFor")
        if post.get("status") == "scheduled" and when is not None and when <= now:
            due.append(post)
    return due


def should_generate(now: datetime, cfg: dict[str, Any], last_generated_at: datetime | None) -> bool:
    """O robô deve gerar um post agora?

    Verdadeiro só no dia da semana escolhido, depois da hora escolhida e no
    máximo uma vez por dia local — o agendador bate de hora em hora, então a
    guarda "já gerei hoje" é o que evita uma enxurrada de posts.
    """
    weekdays = cfg.get("generate_weekdays", DEFAULT_CONFIG["generate_weekdays"]) or []
    if not weekdays:
        return False

    tz = _tz(cfg)
    local = now.astimezone(tz)
    if local.weekday() not in weekdays:
        return False
    if local.hour < int(cfg.get("generate_hour", DEFAULT_CONFIG["generate_hour"])):
        return False
    if last_generated_at is not None and last_generated_at.astimezone(tz).date() == local.date():
        return False
    return True


def pick_rotating(terms: list[str], history: list[str]) -> str | None:
    """Termo da vez, em rodízio: o que está há mais tempo sem virar post.

    Diferente da pauta, termo de notícia REPETE de propósito — o que muda é a
    notícia. Sortear puro faria o mesmo termo sair duas vezes seguidas; o rodízio
    garante que os seis assuntos apareçam antes de qualquer um repetir.
    """
    livres = [t for t in (terms or []) if t.strip()]
    if not livres:
        return None
    recentes = [slugify(h) for h in (history or [])]

    def ultima_vez(term: str) -> int:
        key = slugify(term)
        return recentes.index(key) if key in recentes else len(recentes) + 1

    # `history` vem do mais recente para o mais antigo: índice maior = usado há mais tempo
    return max(livres, key=ultima_vez)


def clean_tags(tags: Iterable[str]) -> list[str]:
    """Minúsculas, sem repetir, no máximo MAX_TAGS.

    A deduplicação ignora acento ("Liderança" e "lideranca" são a MESMA tag), mas a
    grafia guardada é a primeira que apareceu, com acento — a URL /blog/tag/<tag>
    compara igualdade exata, e duas grafias partiriam os posts do mesmo assunto em dois.
    """
    seen: list[str] = []
    keys: set[str] = set()
    for tag in tags or []:
        t = (tag or "").strip().lower()
        if not t:
            continue
        key = slugify(t)
        if key not in keys:
            keys.add(key)
            seen.append(t)
    return seen[:MAX_TAGS]


def clean_sections(sections: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Seções sem nenhum parágrafo com texto são descartadas; título vazio é aceito."""
    out = []
    for section in sections or []:
        paragraphs = [p.strip() for p in (section.get("paragraphs") or []) if (p or "").strip()]
        if paragraphs:
            out.append({"heading": (section.get("heading") or "").strip(), "paragraphs": paragraphs})
    return out


def reading_minutes(body: dict[str, Any]) -> int:
    """Minutos de leitura de UM idioma (o outro tem contagem própria)."""
    words = 0
    for section in body.get("sections") or []:
        words += len((section.get("heading") or "").split())
        for paragraph in section.get("paragraphs") or []:
            words += len(paragraph.split())
    return max(1, round(words / WORDS_PER_MINUTE))


def assert_publishable(post: dict[str, Any]) -> None:
    """O site é bilíngue: publicar sem um dos idiomas deixa metade dos leitores sem post."""
    i18n = post.get("i18n") or {}
    for lang in LANGS:
        body = i18n.get(lang)
        if not body or not (body.get("title") or "").strip():
            raise ValueError(f"post sem título em '{lang}' — os dois idiomas são obrigatórios")
        if not clean_sections(body.get("sections") or []):
            raise ValueError(f"post sem conteúdo em '{lang}'")
