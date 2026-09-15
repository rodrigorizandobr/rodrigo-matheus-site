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

from . import gemini, images, model, profile, research, store


class NoTopicError(RuntimeError):
    """Não há termo vigiado cadastrado — sem assunto, não há post."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pick_subject(cfg: dict[str, Any]) -> str:
    """Termo da vez, em rodízio entre os termos vigiados."""
    term = model.pick_rotating(cfg.get("news_terms") or [], store.recent_topics())
    if not term:
        raise NoTopicError("nenhum termo vigiado cadastrado — configure os assuntos no painel")
    return term


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
        topic = _pick_subject(cfg)
        source = "news"

    wants_research = cfg.get("research_enabled", True) if use_research is None else use_research
    found = research.Research()
    if wants_research and not context.strip():
        if research.is_url(topic):
            # o autor colou o link da matéria: ela é a fonte, e só ela
            found = research.from_url(topic)
            topic = (found.references[0]["title"] if found.references else topic) or topic
            source = "link"
        else:
            found = research.search_web(research.news_queries(topic))
        context = found.context

    if not context.strip():
        # Sem notícia, o lastro é a CARREIRA: melhor um post ancorado em 22 anos de
        # experiência real do que um texto genérico escrito de memória.
        context = profile.career_context()
        source = f"{source}+curriculo"

    draft = gemini.generate_post(topic, context=context, avoid_titles=store.recent_titles())
    draft["topic"] = topic
    draft["generation"] = {
        "model": draft.get("model", ""), "generatedAt": now, "topic": topic, "source": source,
        "researched": bool(found.context), "pagesRead": found.pages_read,
    }
    # Referências completas para a citação ABNT no fim do post. A data de acesso é
    # gravada aqui — é quando a página foi de fato lida, e a norma pede essa data.
    draft["references"] = [{**ref, "accessedAt": now.isoformat()} for ref in found.references[:8]]
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
