"""Orquestração do blog: tema → texto → capa → gravação com o destino certo.

É a única camada que sabe a ordem das coisas. Tudo que ela usa (`model`,
`store`, `gemini`, `images`) é testável sozinho; aqui o que se testa é a
COREOGRAFIA: o que acontece quando a capa falha, quando a pauta acaba, quando
o agendador bate duas vezes no mesmo dia.

Regra de ouro do `tick`: publicar o que venceu NUNCA pode ser impedido por uma
falha ao gerar o post novo. São duas responsabilidades independentes e a
primeira é a que tem hora marcada.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import gemini, images, model, research, store


class NoTopicError(RuntimeError):
    """A pauta acabou. Repetir tema produz post quase igual — melhor não publicar."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pick_subject(cfg: dict[str, Any]) -> tuple[str, str]:
    """Assunto do próximo post e de onde ele veio ("news" ou "topics")."""
    if cfg.get("auto_source") == "news":
        term = model.pick_rotating(cfg.get("news_terms") or [], store.recent_topics())
        if term:
            return term, "news"
        # sem termos cadastrados, a pauta ainda pode salvar o dia
    usados = [p.get("topic", "") for p in store.list_posts() if p.get("topic")]
    topic = model.pick_topic(cfg.get("topics") or [], usados)
    if not topic:
        raise NoTopicError("a pauta acabou e não há termos de notícia — cadastre no painel")
    return topic, "topics"


def generate(topic: str | None, now: datetime | None = None, context: str = "",
             use_research: bool | None = None) -> dict[str, Any]:
    """Escreve um post inteiro e grava conforme a configuração (agendado ou publicado).

    `use_research` sobrepõe a configuração para esta geração — é o que permite ao
    painel oferecer "escrever com pesquisa" como escolha por post.
    """
    now = now or _now()
    cfg = store.get_config()
    source = "manual"

    if not (topic or "").strip():
        topic, source = _pick_subject(cfg)

    wants_research = cfg.get("research_enabled", True) if use_research is None else use_research
    found = research.Research()
    if wants_research and not context.strip():
        queries = research.news_queries(topic) if source == "news" else research.topic_queries(topic)
        found = research.search_web(queries)
        context = found.context

    draft = gemini.generate_post(topic, context=context)
    draft["topic"] = topic
    draft["generation"] = {
        "model": draft.get("model", ""), "generatedAt": now, "topic": topic, "source": source,
        "researched": bool(found.context), "pagesRead": found.pages_read,
    }
    draft["sources"] = found.sources[:8]
    draft["image"] = images.build_cover(draft.get("imagePrompt", ""), draft.get("imageAlt", ""))

    post = store.create_post(draft, now=now)

    if cfg.get("auto_publish"):
        return store.publish_post(post["id"], now=now) or post
    return store.schedule_post(post["id"], model.scheduled_for(now, cfg)) or post


def revise(post_id: str, instruction: str) -> dict[str, Any] | None:
    """Reescreve o conteúdo de um post por instrução. Slug e status ficam como estão."""
    post = store.get_post(post_id)
    if not post:
        return None
    revised = gemini.revise_post(post, instruction)
    return store.update_post(post_id, {"i18n": revised["i18n"], "tags": revised["tags"]})


def regenerate_cover(post_id: str, prompt: str | None = None) -> dict[str, Any] | None:
    """Nova capa para um post — mesmo prompt ou um novo escrito pelo autor."""
    post = store.get_post(post_id)
    if not post:
        return None
    usado = (prompt or post.get("imagePrompt") or "").strip()
    cover = images.build_cover(usado, post.get("imageAlt", ""))
    return store.update_post(post_id, {"image": cover, "imagePrompt": usado})


def tick(now: datetime | None = None) -> dict[str, Any]:
    """Batida do agendador: publica o que venceu e, se for a hora, gera o próximo."""
    now = now or _now()
    result: dict[str, Any] = {"published": 0, "generated": 0, "error": ""}

    # Primeiro o que tem hora marcada — não pode depender do Gemini estar de pé.
    try:
        result["published"] = len(store.publish_due(now=now))
    except Exception as exc:
        result["error"] = f"publicação: {exc}"

    cfg = store.get_config()
    if model.should_generate(now, cfg, store.last_generated_at()):
        try:
            generate(None, now=now)
            result["generated"] = 1
        except (NoTopicError, gemini.GeminiError, Exception) as exc:
            result["error"] = (result["error"] + " | " if result["error"] else "") + f"geração: {exc}"
    return result
