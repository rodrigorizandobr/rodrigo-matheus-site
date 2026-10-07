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
#: usado só para ordenar: post sem data de publicação vai para o fim da fila
_FAR_FUTURE = datetime(9999, 1, 1, tzinfo=timezone.utc)
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
    # segunda e quinta; lista vazia desliga a geração automática E o compartilhamento no
    # LinkedIn, que usa a MESMA agenda — não há mais horário separado para o LinkedIn.
    "generate_weekdays": [0, 3],
    # Pesquisa na web (Serper + leitura das páginas) ao escrever. Opcional.
    "research_enabled": True,
    # Compartilhamento automático no LinkedIn. Desligado até o autor conectar a conta.
    "linkedin_enabled": False,
    # Assuntos vigiados. Medido contra o Serper: termo que é NOME PRÓPRIO (empresa,
    # produto, bicho) devolve a novidade da semana; termo que é CATEGORIA ("inteligência
    # artificial generativa", "regulação de IA") devolve curso de prefeitura e artigo de
    # opinião, e o post sai como ensaio. Termos curtos: o buscador estrangula frase longa.
    "news_terms": [
        "OpenAI",
        "Anthropic Claude",
        "Google Gemini",
        "Nvidia",
        "hackers inteligência artificial",
        "SpaceX",
        "foguete China",
        "robô humanoide",
        "Tesla Optimus",
        "computador quântico",
    ],
    # Temas do modo "reflexão" (gemini.generate_reflection) — sem notícia, a partir da
    # carreira real de Rodrigo. Em rodízio, igual aos assuntos vigiados; lista vazia
    # desliga o modo (sem tema explícito, não há sobre o que refletir).
    "reflection_topics": [
        "o que muda na arquitetura quando o time passa de 10 para 40 pessoas",
        "onde IA generativa realmente reduz custo em engenharia, e onde só parece",
        "por que a maioria das métricas de produtividade de dev mede a coisa errada",
        "migrar para Cloud Run: o que compensou e o que eu faria diferente",
        "liderar quem sabe mais do que você sobre o assunto",
        "o custo escondido de manter dois provedores de nuvem",
        "code review que encontra defeito de verdade, não estilo",
        "quando reescrever um sistema é a decisão barata",
        "contratar sênior em mercado aquecido sem baixar a régua",
        "observabilidade que paga a conta: o mínimo que todo time precisa",
    ],
}


def _tz(cfg: dict[str, Any]) -> ZoneInfo:
    return ZoneInfo(cfg.get("timezone") or DEFAULT_TZ)


#: Atraso de 1 a 15 min que o `service.tick()` espera antes de publicar, compartilhar
#: ou gerar — um robô que age no minuto exato da hora configurada, toda vez, denuncia
#: que é robô. Mora aqui (não em `service`) por ser o mesmo número que rege as três
#: ações, mas o sorteio em si é responsabilidade do `service` (`should_*` daqui são
#: funções puras: decidem SE é hora, não QUANTO esperar antes de agir).
JITTER_MIN_MINUTES = 1
JITTER_MAX_MINUTES = 15


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

    A hora aqui é só o ALVO que `due_for_publishing` compara contra `now`; o atraso
    de 1 a 15 min que faz a publicação de verdade não cair na hora cheia é aplicado
    ao vivo pelo `service.tick()`, não neste cálculo (ver `JITTER_MIN_MINUTES`).
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
    guarda "já gerei hoje" é o que evita uma enxurrada de posts. O atraso de 1
    a 15 min que evita gerar bem no minuto exato é aplicado pelo `service.tick()`
    ao redor da chamada, não aqui.
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


def linkedin_queue(posts: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Posts esperando para ir ao LinkedIn, DO MAIS ANTIGO para o mais novo.

    Começar pelos antigos é intencional (pedido do autor): o arquivo já escrito é o
    que nunca foi divulgado, então ele sai na frente do que acabou de ser publicado.

    `linkedinEnabled` ausente conta como HABILITADO — o padrão é compartilhar, e os
    posts que existiam antes desta funcionalidade não têm o campo gravado.
    """
    espera = [
        p for p in posts or []
        if p.get("status") == "published"
        and p.get("linkedinEnabled", True)
        and not p.get("linkedinPostedAt")
    ]
    # Sem data de publicação vai para o fim, em vez de derrubar a ordenação.
    return sorted(espera, key=lambda p: (p.get("publishedAt") is None, p.get("publishedAt") or _FAR_FUTURE))


def should_share(now: datetime, cfg: dict[str, Any], last_shared_at: datetime | None) -> bool:
    """É hora de mandar um post para o LinkedIn?

    MESMA agenda de `should_generate` — `generate_weekdays`/`generate_hour`, sem
    configuração própria para o LinkedIn (pedido do PO: um horário só).
    """
    if not cfg.get("linkedin_enabled"):
        return False
    weekdays = cfg.get("generate_weekdays", DEFAULT_CONFIG["generate_weekdays"]) or []
    if not weekdays:
        return False

    tz = _tz(cfg)
    local = now.astimezone(tz)
    if local.weekday() not in weekdays:
        return False
    if local.hour < int(cfg.get("generate_hour", DEFAULT_CONFIG["generate_hour"])):
        return False
    if last_shared_at is not None and last_shared_at.astimezone(tz).date() == local.date():
        return False
    return True


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


# ── régua de avisos da autorização do LinkedIn ──────────────────────────────

#: marcas, do mais folgado ao mais apertado; 0 é "já venceu"
EXPIRY_MARKS = (30, 15, 7, 3, 1, 0)


def expiry_marks(days_left: int) -> list[int]:
    """Marcas já cruzadas por este prazo — todas contam como gastas.

    Sem isso, um Cloud Run que ficou dias sem bater acordaria disparando um e-mail
    por marca de uma vez só.
    """
    return [m for m in EXPIRY_MARKS if days_left <= m]


def expiry_step(days_left: int, sent: list[int] | None = None) -> int | None:
    """A marca que deve virar aviso agora, ou None se não há o que dizer.

    Dispara a marca MAIS APERTADA entre as cruzadas e ainda não avisadas: quem
    chega atrasado recebe um aviso certo, não cinco atrasados.
    """
    gastas = set(sent or [])
    devidas = [m for m in expiry_marks(days_left) if m not in gastas]
    return min(devidas) if devidas else None
