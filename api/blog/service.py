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

from . import gemini, images, linkedin, media, model, notify, profile, research, store


class NoTopicError(RuntimeError):
    """Não há termo vigiado cadastrado — sem assunto, não há post."""


class NoResearchError(RuntimeError):
    """O tema do autor não trouxe material da internet — melhor não escrever que escrever do nada."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pick_subject(cfg: dict[str, Any]) -> str:
    """Termo da vez, em rodízio entre os termos vigiados."""
    term = model.pick_rotating(cfg.get("news_terms") or [], store.recent_topics())
    if not term:
        raise NoTopicError("nenhum termo vigiado cadastrado — configure os assuntos no painel")
    return term


def generate(topic: str | None, now: datetime | None = None, context: str = "",
             use_research: bool | None = None, from_topic: bool = False) -> dict[str, Any]:
    """Escreve um post inteiro e grava conforme a configuração (agendado ou publicado).

    `use_research` sobrepõe a configuração para esta geração — é o que permite ao
    painel oferecer "escrever com pesquisa" como escolha por post.

    `from_topic` é o modo "escreva sobre ESTE tema": o autor escolheu o assunto, a busca
    é geral (não só notícia da semana) e, sem material, o post NÃO sai — cair no
    currículo daria um texto que não é sobre o que ele pediu.
    """
    now = now or _now()
    cfg = store.get_config()
    source = "manual"

    if from_topic:
        topic = (topic or "").strip()
        if not topic:
            raise NoTopicError("escreva o tema do post")
        found = research.search_topic(research.topic_queries(topic))
        if not found.context.strip():
            motivo = ("a chave SERPER_API_KEY não está configurada no servidor" if not research.SERPER_KEY
                      else f"a busca não trouxe material sobre «{topic}»")
            raise NoResearchError(f"Nada escrito: {motivo}. Reformule o tema ou use outro modo.")
        return _save_generated(topic, found.context, found, "tema", now, cfg, author_topic=True)

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

    return _save_generated(topic, context, found, source, now, cfg)


def _save_generated(topic: str, context: str, found: research.Research, source: str,
                    now: datetime, cfg: dict[str, Any], author_topic: bool = False) -> dict[str, Any]:
    """Texto → capa → gravação, igual para os dois caminhos de geração."""
    draft = gemini.generate_post(topic, context=context, avoid_titles=store.recent_titles(),
                                 avoid_covers=store.recent_cover_prompts(), author_topic=author_topic)
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


class NotConnectedError(RuntimeError):
    """Sem token do LinkedIn — o autor precisa conectar a conta no painel."""


class PostNotFoundError(RuntimeError):
    """Não existe post com esse id."""


def _send_to_linkedin(auth: dict[str, Any], post: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    cover = post.get("image") or {}
    image = media.read_image(cover["hash"]) if cover.get("hash") else None
    texto = linkedin.share_text(post, f"{linkedin.SITE}/blog/{post['slug']}")
    urn = linkedin.publish(auth, texto, image, alt=cover.get("alt") or post.get("imageAlt") or "")
    return store.mark_shared(post["id"], urn, now=now)


def share_next(now: datetime | None = None) -> dict[str, Any] | None:
    """Manda para o LinkedIn o post mais antigo que ainda não foi.

    Devolve o post compartilhado, ou None quando a fila está vazia. Só marca como
    compartilhado DEPOIS que o LinkedIn confirma — falhar e marcar perderia o post
    para sempre.
    """
    now = now or _now()
    auth = linkedin.get_auth()
    if not auth:
        raise NotConnectedError("conecte a conta do LinkedIn no painel")

    fila = model.linkedin_queue(store.list_posts())
    if not fila:
        return None
    return _send_to_linkedin(auth, fila[0], now)


def share_post(post_id: str, now: datetime | None = None) -> dict[str, Any] | None:
    """Manda ESTE post ao LinkedIn, por decisão do autor.

    Ignora a fila, o interruptor `linkedinEnabled`, o status e o `linkedinPostedAt`:
    o clique é a decisão, inclusive repetir um post ou mandar um rascunho.
    """
    now = now or _now()
    auth = linkedin.get_auth()
    if not auth:
        raise NotConnectedError("conecte a conta do LinkedIn no painel")

    post = store.get_post(post_id)
    if not post:
        raise PostNotFoundError("post não encontrado")
    return _send_to_linkedin(auth, post, now)


def check_expiry(now: datetime | None = None) -> int | None:
    """Régua de avisos: manda e-mail quando a autorização do LinkedIn cruza uma marca.

    Devolve a marca avisada, ou None. Quem lembra o que já foi dito é o próprio
    documento do token, então reconectar recomeça a régua do zero.
    """
    auth = linkedin.get_auth()
    if not auth:
        return None
    # O prazo é medido com o `now` da batida, não com o relógio: é o mesmo instante
    # que decide publicação e compartilhamento, e é o que os testes conseguem fixar.
    dias = linkedin.days_left(auth, now)
    marca = model.expiry_step(dias, linkedin.notices())
    if marca is None:
        return None
    assunto, corpo = notify.expiry_message(marca, dias)
    notify.send(assunto, corpo)
    linkedin.mark_notices(model.expiry_marks(dias), now=now)
    return marca


def tick(now: datetime | None = None) -> dict[str, Any]:
    """Batida do agendador: publica o que venceu e, se for a hora, gera o próximo."""
    now = now or _now()
    result: dict[str, Any] = {"published": 0, "generated": 0, "shared": 0, "notified": None, "error": ""}

    # Primeiro o que tem hora marcada — não pode depender do Gemini estar de pé.
    try:
        result["published"] = len(store.publish_due(now=now))
    except Exception as exc:
        result["error"] = f"publicação: {exc}"

    cfg = store.get_config()

    # LinkedIn antes da geração, pela mesma razão que publicar vem antes: tem hora
    # marcada e não pode depender do Gemini estar de pé.
    if model.should_share(now, cfg, store.last_shared_at()):
        try:
            compartilhado = share_next(now=now)
            result["shared"] = 1 if compartilhado else 0
        except Exception as exc:
            result["error"] = (result["error"] + " | " if result["error"] else "") + f"linkedin: {exc}"

    # A régua avisa que a autorização vai vencer. Um e-mail não pode derrubar a batida.
    try:
        result["notified"] = check_expiry(now=now)
    except Exception as exc:
        result["error"] = (result["error"] + " | " if result["error"] else "") + f"aviso: {exc}"

    if model.should_generate(now, cfg, store.last_generated_at()):
        try:
            generate(None, now=now)
            result["generated"] = 1
        except (NoTopicError, gemini.GeminiError, Exception) as exc:
            result["error"] = (result["error"] + " | " if result["error"] else "") + f"geração: {exc}"
    return result
