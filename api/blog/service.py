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

import random
import time
from datetime import datetime, timezone
from typing import Any

from . import gemini, images, linkedin, media, model, notify, profile, research, store, videos


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


def _pick_reflection_theme(cfg: dict[str, Any]) -> str:
    """Tema da vez, em rodízio entre os temas de reflexão (ver `model.DEFAULT_CONFIG`)."""
    theme = model.pick_rotating(cfg.get("reflection_topics") or [], store.recent_topics())
    if not theme:
        raise NoTopicError("nenhum tema de reflexão cadastrado — configure os temas no painel")
    return theme


def generate(topic: str | None, now: datetime | None = None, context: str = "",
             use_research: bool | None = None, from_topic: bool = False,
             reflection: bool = False, with_image: bool = True) -> dict[str, Any]:
    """Escreve um post inteiro e grava conforme a configuração (agendado ou publicado).

    `use_research` sobrepõe a configuração para esta geração — é o que permite ao
    painel oferecer "escrever com pesquisa" como escolha por post.

    `from_topic` é o modo "escreva sobre ESTE tema": o autor escolheu o assunto, a busca
    é geral (não só notícia da semana) e, sem material, o post NÃO sai — cair no
    currículo daria um texto que não é sobre o que ele pediu.

    `reflection` é o modo "top voice" (ver `gemini.RULES_REFLECTION`): curto, sem
    notícia, sempre ancorado na carreira — nunca pesquisa a internet.

    `with_image` desligado pula a capa de IA — post só texto, como o Ricardo Amorim
    também posta (nem todo post de top voice tem imagem).
    """
    now = now or _now()
    cfg = store.get_config()
    source = "manual"

    if reflection:
        theme = (topic or "").strip() or _pick_reflection_theme(cfg)
        return _save_generated(theme, profile.career_context(), research.Research(), "reflection",
                               now, cfg, reflection=True, with_image=with_image)

    if from_topic:
        topic = (topic or "").strip()
        if not topic:
            raise NoTopicError("escreva o tema do post")
        found = research.search_topic(research.topic_queries(topic))
        if not found.context.strip():
            motivo = ("a chave SERPER_API_KEY não está configurada no servidor" if not research.SERPER_KEY
                      else f"a busca não trouxe material sobre «{topic}»")
            raise NoResearchError(f"Nada escrito: {motivo}. Reformule o tema ou use outro modo.")
        return _save_generated(topic, found.context, found, "tema", now, cfg, author_topic=True, with_image=with_image)

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

    return _save_generated(topic, context, found, source, now, cfg, with_image=with_image)


def _scrub_vocab(draft: dict[str, Any], phrases: list[str],
                 memories: tuple[str, ...] = ()) -> tuple[dict[str, Any], list[str]]:
    """Tira, numa reescrita dirigida, o que entrega texto de IA ou inventa a vida do autor.

    `phrases` é vocabulário (lista do painel); `memories` são memórias em primeira pessoa,
    passadas só quando o material NÃO é o currículo — aí toda memória é invenção. As listas
    ficam fora do prompt de geração (palavra citada como proibida é ecoada); aqui só são
    citadas para quem tem a tarefa de tirá-las. Devolve o rascunho e o que SOBROU — a
    reescrita falhar ou deixar resto nunca derruba o post, só fica registrado.
    """
    def achar(rascunho: dict[str, Any]) -> tuple[list[str], list[str]]:
        corpo = (rascunho.get("i18n") or {}).get("pt") or {}
        return model.banned_found(corpo, phrases), model.banned_found(corpo, memories)

    palavras, lembrancas = achar(draft)
    if not palavras and not lembrancas:
        return draft, []
    pedidos = ["Não mude mais nada do texto além do que se pede abaixo, nos dois idiomas."]
    if palavras:
        pedidos.append("Troque estas palavras e expressões, que não são do vocabulário do autor, por "
                       "palavras simples de conversa (cada item vale para qualquer palavra que comece "
                       "assim): " + "; ".join(f"«{a}…»" for a in palavras) + ".")
    if lembrancas:
        pedidos.append("O material não fala da vida do autor: tire as frases em que ele conta algo que "
                       "teria visto, vivido ou feito — transforme em opinião (acho, aposto, desconfio) "
                       "ou corte. Começam assim: " + "; ".join(f"«{a}…»" for a in lembrancas) + ".")
    try:
        revisado = gemini.revise_post(draft, " ".join(pedidos))
    except Exception:
        return draft, palavras + lembrancas
    draft = {**draft, "i18n": revisado["i18n"], "tags": revisado.get("tags") or draft.get("tags")}
    palavras, lembrancas = achar(draft)
    return draft, palavras + lembrancas


def _save_generated(topic: str, context: str, found: research.Research, source: str,
                    now: datetime, cfg: dict[str, Any], author_topic: bool = False,
                    reflection: bool = False, with_image: bool = True) -> dict[str, Any]:
    """Texto → capa → gravação, igual para os três caminhos de geração."""
    if reflection:
        draft = gemini.generate_reflection(topic, context, avoid_titles=store.recent_titles(),
                                           avoid_covers=store.recent_cover_prompts())
    else:
        draft = gemini.generate_post(topic, context=context, avoid_titles=store.recent_titles(),
                                     avoid_covers=store.recent_cover_prompts(), author_topic=author_topic)
    # Memória só é verdade quando o material é a carreira (reflexão, ou notícia que caiu no
    # currículo por falta de pesquisa); com notícia como material, é sempre invenção.
    sem_curriculo = not reflection and "curriculo" not in source
    draft, sobrou = _scrub_vocab(draft, cfg.get("banned_phrases") or [],
                                 model.MEMORY_CLAIMS if sem_curriculo else ())
    draft["topic"] = topic
    draft["generation"] = {
        "model": draft.get("model", ""), "generatedAt": now, "topic": topic, "source": source,
        "researched": bool(found.context), "pagesRead": found.pages_read, "bannedLeft": sobrou,
    }
    # Referências completas para a citação ABNT no fim do post. A data de acesso é
    # gravada aqui — é quando a página foi de fato lida, e a norma pede essa data.
    draft["references"] = [{**ref, "accessedAt": now.isoformat()} for ref in found.references[:8]]
    draft["sources"] = found.sources[:8]
    draft["image"] = (images.build_cover(draft.get("imagePrompt", ""), draft.get("imageAlt", ""))
                      if with_image else None)

    # Recorte de vídeo sempre que possível (decisão do PO, 2026-10-16). O servidor só ACHA o
    # vídeo; quem corta é o Mac do autor (`clip_worker.py`), porque o YouTube bloqueia download
    # de IP de datacenter. Notícia busca pelo título em inglês (o vídeo oficial costuma estar
    # em inglês) e só na última semana; reflexão busca pelo tema, com âncora de domínio.
    # Vários achados: o primeiro vira o vídeo, os outros ficam de reserva para o Mac.
    if reflection:
        achados = videos.search_candidates(topic, recent=False, anchor=True)
    else:
        titulo_en = ((draft.get("i18n") or {}).get("en") or {}).get("title") or topic
        achados = videos.search_candidates(titulo_en, recent=True, anchor=False, prefer=topic)
    if achados:
        como_dict = [{"title": a.title, "url": a.url, "thumbnail": a.thumbnail, "channel": a.channel} for a in achados]
        draft["video"], draft["videoCandidates"] = como_dict[0], como_dict[1:]
        draft["clip"] = {"status": "pending"}

    post = store.create_post(draft, now=now)

    # Com recorte, fica RASCUNHO, sem agendar: o PO pede autorização ao dono do vídeo antes
    # de publicar — nada com vídeo de terceiro vai ao ar sozinho.
    if draft.get("clip"):
        return post

    if cfg.get("auto_publish"):
        return store.publish_post(post["id"], now=now) or post
    return store.schedule_post(post["id"], model.scheduled_for(now, cfg)) or post


def revise(post_id: str, instruction: str) -> dict[str, Any] | None:
    """Reescreve o conteúdo de um post por instrução. Slug e status ficam como estão."""
    post = store.get_post(post_id)
    if not post:
        return None
    revised = gemini.revise_post(post, instruction)
    revised, _ = _scrub_vocab(revised, store.get_config().get("banned_phrases") or [])
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
    texto = linkedin.share_text(post, f"{linkedin.SITE}/blog/{post['slug']}")
    if linkedin.has_native_clip(post):
        # Recorte pronto vai como vídeo NATIVO, sem capa. Sumiu do bucket → não publica nada:
        # sair sem o vídeo prometido é irreversível, e o próximo tick tenta de novo.
        clip = post["clip"]
        video = media.read_video(clip["hash"])
        if not video:
            raise linkedin.LinkedInError("o recorte do post não está no bucket")
        urn = linkedin.publish(auth, texto, video=video, video_title=clip.get("title") or "")
        return store.mark_shared(post["id"], urn, now=now)
    # Imagem nativa + link que o LinkedIn desenha sozinho nunca foram validados juntos
    # (um post só tem um cartão de prévia); com vídeo, o cartão é o do YouTube.
    cover = {} if post.get("video") else (post.get("image") or {})
    image = media.read_image(cover["hash"]) if cover.get("hash") else None
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


def check_clip_worker(now: datetime | None = None) -> bool:
    """Recorte esperando e a rotina do Mac calada: manda UM e-mail por parada.

    O recorte depende do Mac ligado; sem isto, o post ficaria em rascunho esperando para
    sempre sem ninguém saber. Quem lembra se já avisou é o documento de sinal de vida.
    """
    now = now or _now()
    pendentes = [p for p in store.list_posts() if (p.get("clip") or {}).get("status") == "pending"]
    vida = store.clip_worker_heartbeat()
    if not model.clip_worker_stalled([p["createdAt"] for p in pendentes if p.get("createdAt")],
                                     vida.get("lastRunAt"), vida.get("stallAlertAt"), now):
        return False
    titulos = "\n".join(f"- {((p.get('i18n') or {}).get('pt') or {}).get('title') or p['id']}" for p in pendentes)
    ultima = vida.get("lastRunAt")
    notify.send(
        "Recorte de vídeo parado: a rotina do Mac não está rodando",
        f"{len(pendentes)} post(s) esperando o recorte de vídeo:\n{titulos}\n\n"
        f"A rotina do Mac rodou pela última vez em {ultima.isoformat() if ultima else 'nunca'}.\n"
        "Confira se o Mac está ligado e acordado; para rodar à mão: ./scripts/clip-worker.sh\n"
        "Log: ~/Library/Logs/rodrigo-matheus-recorte.log")
    store.mark_clip_worker_alert(now)
    return True


def _delay_a_few_minutes() -> None:
    """Espera de verdade, de 1 a 15 min, antes de publicar, compartilhar ou gerar.

    O Cloud Scheduler bate de hora em hora: comparar horários não basta para nunca
    agir no minuto exato (ver CLAUDE.md), então o `tick` precisa literalmente esperar
    dentro da própria chamada HTTP — por isso o timeout do Cloud Run é maior que o
    atraso máximo. Uma espera só por batida: as três ações elegíveis no mesmo tick
    não ficam uma esperando a outra.
    """
    time.sleep(random.uniform(model.JITTER_MIN_MINUTES, model.JITTER_MAX_MINUTES) * 60)


def tick(now: datetime | None = None) -> dict[str, Any]:
    """Batida do agendador: publica o que venceu e, se for a hora, gera o próximo."""
    now = now or _now()
    result: dict[str, Any] = {"published": 0, "generated": 0, "shared": 0, "notified": None, "error": ""}

    cfg = store.get_config()
    ha_para_publicar = bool(store.due_posts(now))
    deve_compartilhar = model.should_share(now, cfg, store.last_shared_at())
    deve_gerar = model.should_generate(now, cfg, store.last_generated_at())

    if ha_para_publicar or deve_compartilhar or deve_gerar:
        _delay_a_few_minutes()

    # Primeiro o que tem hora marcada — não pode depender do Gemini estar de pé.
    try:
        result["published"] = len(store.publish_due(now=now))
    except Exception as exc:
        result["error"] = f"publicação: {exc}"

    # LinkedIn antes da geração, pela mesma razão que publicar vem antes: tem hora
    # marcada e não pode depender do Gemini estar de pé.
    if deve_compartilhar:
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

    try:
        check_clip_worker(now=now)
    except Exception as exc:
        result["error"] = (result["error"] + " | " if result["error"] else "") + f"recorte: {exc}"

    if deve_gerar:
        try:
            generate(None, now=now)
            result["generated"] = 1
        except (NoTopicError, gemini.GeminiError, Exception) as exc:
            result["error"] = (result["error"] + " | " if result["error"] else "") + f"geração: {exc}"
    return result
