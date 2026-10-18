"""Rotina de recorte de vídeo — roda no Mac do autor, NÃO no Cloud Run.

O servidor só acha o vídeo no YouTube e marca o post com `clip.status = "pending"`. Esta
rotina pega os pendentes, escolhe o trecho que mostra o que o post discute, corta sem
editar, guarda no bucket e marca `ready` (ou `failed`, com o motivo). Roda no Mac porque o
YouTube bloqueia download de IP de datacenter — mesmo daqui precisou `--impersonate chrome`.

Uso:  ./scripts/clip-worker.sh        (uma rodada, à mão)
      python clip_worker.py           (serviço: escuta o Firestore, o launchd mantém ligado)

Como o trecho é escolhido (lições da prova manual, 2026-10-16):
- o Gemini "assistindo" pela URL inventa tempo; aqui ele marca QUADROS que têm o tempo
  gravado neles (um a cada 5 s, em mosaicos), e o tempo vem do quadro;
- cada tempo marcado ganha nota 1 a 3 e vence o trecho que soma mais nota, não o mais longo
  (o mais longo era o carro só passando; o loop e o salto do post eram um trecho mais curto);
- a janela final é escolhida a 1 quadro/s numa região com folga em volta do trecho — a 5 s o
  corte começou com o carro parado no palco e terminou numa filmagem aérea;
- as decisões por imagem usam `VISION_MODEL`, não o flash-lite do texto;
- o corte final é conferido de novo pelo Gemini antes de ir para o bucket.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from datetime import datetime, timezone

from blog import clips, gemini, media, notify, photos, service, store, videos

PROJECT = "rodrigo-matheus"
#: no máximo isto por rodada: o YouTube dá 429 para quem baixa em rajada
LIMIT = 3
#: folga em volta do trecho grosso para a janela fina (a 1 quadro/s). Depois é maior: no Roadster
#: um quadro escuro entre a manobra e o salto quebrou o trecho, e o salto ficou de fora.
MARGIN_BEFORE = 10
MARGIN_AFTER = 60
#: escolher o momento por imagem é demais para o flash-lite (janelas de 3 s, "viu" salto onde não
#: havia); o 3.8-flash acertou a janela do Roadster nas duas tentativas. Poucas imagens por post.
VISION_MODEL = "gemini-3.8-flash"
#: rodadas (de 15 em 15 min) com TODOS os modos de download falhando antes de trocar de vídeo
MAX_ATTEMPTS = 5
#: vídeos tentados por post, contando os da busca nova; depois disso, e-mail e desiste
MAX_VIDEOS = 6
#: vídeos tentados numa rodada só — a rodada não pode virar a tarde inteira
VIDEOS_PER_RUN = 3
#: conferência recusou o corte? tenta a próxima janela antes de trocar de vídeo
WINDOWS_TO_TRY = 2


# ── projeto: nunca mais gravar no projeto errado ────────────────────────────

def _project() -> str:
    return store._db().project


def check_project() -> None:
    """Já aconteceu: sem projeto fixo, o cliente caiu no padrão do gcloud (br51-app)."""
    atual = _project()
    if atual != PROJECT:
        raise SystemExit(f"Firestore apontando para {atual!r}, não para {PROJECT!r} — nada foi feito.")


# ── fila e coreografia ──────────────────────────────────────────────────────

def pending_posts() -> list[dict[str, Any]]:
    return [p for p in store.list_pending_clips() if (p.get("video") or {}).get("url")]


def _post_text(post: dict[str, Any]) -> str:
    pt = (post.get("i18n") or {}).get("pt") or {}
    corpo = " ".join(p for s in pt.get("sections") or [] for p in s.get("paragraphs") or [])
    return f"{pt.get('title', '')}\n{pt.get('excerpt', '')}\n{corpo}"


def _clean_url(url: str) -> str:
    """Tira o lixo de rastreio do Serper (`&xstg=…`): fica só o vídeo."""
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url or "")
    return f"https://www.youtube.com/watch?v={m[1]}" if m else url


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _editor_link(post: dict[str, Any]) -> str:
    return f"{notify.SITE}/admin/editar/{post['id']}"


def _title(post: dict[str, Any]) -> str:
    return ((post.get("i18n") or {}).get("pt") or {}).get("title") or post["id"]


def _valid_window(janela: Any, regiao: tuple[int, int]) -> bool:
    if not (isinstance(janela, (tuple, list)) and len(janela) == 2
            and all(isinstance(t, int) and not isinstance(t, bool) for t in janela)):
        return False
    inicio, fim = janela
    return regiao[0] <= inicio and fim <= regiao[1] and fim - inicio >= clips.MIN_CLIP


class _ContentError(Exception):
    """O vídeo não serve (nenhum trecho com o assunto, conferência recusou): trocar de vídeo."""


def _stage(nome: str, fn: Any, *args: Any) -> Any:
    try:
        return fn(*args)
    except _ContentError:
        raise
    except Exception as exc:
        raise RuntimeError(f"{nome}: {exc}") from exc


def _speech(url: str, tools: Any) -> list[tuple[float, float, str]]:
    """A fala do vídeo é ajuda, nunca exigência: sem legenda (ou com erro) o recorte segue só pelos quadros."""
    try:
        return tools.transcript(url)
    except Exception as exc:  # noqa: BLE001
        print(f"[recorte] sem legenda ({exc}); seguindo só pelos quadros", flush=True)
        return []


def _attempt(url: str, texto: str, tools: Any) -> dict[str, Any]:
    """Uma tentativa completa num vídeo. Erro de rede levanta; vídeo que não serve, `_ContentError`."""
    duracao = _stage("duration", tools.duration, url)
    quadros = _stage("frames", tools.frames, url, clips.STEP)
    falas = _speech(url, tools)
    notas = clips.parse_scores(_stage("escolha", tools.ask_times, quadros, texto, duracao, falas), duration=duracao)
    janelas = clips.rank_segments(clips.group_segments(list(notas)), scores=notas)[:WINDOWS_TO_TRY]
    if not janelas:
        raise _ContentError("nenhum trecho do vídeo mostra o que o post discute")
    recusas = []
    for inicio, fim in janelas:
        regiao = (max(0, inicio - MARGIN_BEFORE), min(duracao, fim + MARGIN_AFTER))
        janela = _stage("refino", tools.refine_window, url, *regiao, texto, falas)
        if _valid_window(janela, regiao):
            inicio, fim = janela[0], min(janela[1], janela[0] + clips.MAX_CLIP)
        inicio, fim = clips.snap_to_sentences(inicio, fim, falas)
        mp4, largura, altura = _stage("cut", tools.cut, url, inicio, fim)
        ok, descricao = _stage("conferência", tools.verify, mp4, texto)
        if not ok:
            recusas.append(descricao)
            continue
        digest = _stage("gravação", media.store_video, mp4)
        if not digest:
            raise _ContentError("o corte não saiu como MP4")
        return {"hash": digest, "start": inicio, "end": fim, "width": largura, "height": altura,
                "descricao": descricao}
    raise _ContentError("a conferência final recusou o corte: " + "; ".join(recusas))


def _ready(post: dict[str, Any], video: dict[str, Any], url: str, achado: dict[str, Any],
           tried: list[dict[str, Any]]) -> dict[str, Any]:
    descricao = achado.pop("descricao")
    clip = {"status": "ready", "sourceUrl": url, "title": video.get("title", ""),
            "channel": video.get("channel", ""), "selectedBy": "frames", **achado}
    if tried:
        clip["tried"] = tried
    patch: dict[str, Any] = {"clip": clip, "video": video}
    try:
        # Medido: com a descrição colada, saiu "O vídeo do evento mostra Elon Musk apresenta o
        # esportivo…" — por isso a ordem de escrever com as próprias palavras.
        revisado = gemini.revise_post(post, (
            "Acrescente, no ponto mais natural do texto, UMA frase curta que convide o leitor a ver o "
            "vídeo que acompanha o post. Para você saber o que aparece nele: " + descricao + ". "
            "Escreva a frase com suas palavras — não copie essa descrição e não repita o que o texto "
            "já disse; gramática correta. Não mude mais nada, nos dois idiomas."))
        revisado, _ = service._scrub_vocab(revisado, store.get_config().get("banned_phrases") or [])
        patch["i18n"] = revisado["i18n"]
    except Exception:
        pass  # sem a frase, o clipe aparece do mesmo jeito; não vale perder o corte
    if not post.get("image"):
        capa = _poster_cover(post, url)
        if capa:
            patch["image"] = capa
    store.update_post(post["id"], patch)
    # o post espera a autorização do dono do vídeo: o e-mail já leva o que é preciso para pedir
    notify.send(f"Recorte pronto: {_title(post)}", (
        f"O recorte do post “{_title(post)}” está pronto e o post continua em RASCUNHO.\n\n"
        f"Vídeo de origem: {video.get('title', '')} — canal {video.get('channel') or 'desconhecido'}\n"
        f"Trecho usado ({clips.hms(clip['start'])}–{clips.hms(clip['end'])}): {url}&t={clip['start']}s\n\n"
        f"Peça a autorização ao dono do vídeo e publique pelo painel: {_editor_link(post)}"))
    return clip


def _poster_cover(post: dict[str, Any], url: str) -> dict[str, Any] | None:
    """Post de notícia com vídeo nasce sem capa; pronto o recorte, o quadro do vídeo faz esse papel."""
    try:
        raw = photos.youtube_poster(url)
        item = media.store_image(raw, provider="youtube", alt=_title(post)) if raw else None
        return media.as_cover(item)
    except Exception:
        return None


def _cover_line(post: dict[str, Any]) -> str:
    """Desistiu do vídeo: o post não pode ficar sem capa. Foto real primeiro, imagem criada por último."""
    try:
        gravado = service.ensure_cover(post["id"])
    except Exception:
        return "Capa: não consegui definir uma; ajuste pelo painel."
    capa = (gravado or {}).get("image") or {}
    if capa.get("provider") == "web":
        return f"Capa: {capa.get('credit') or 'foto real'} ({capa.get('sourceUrl', '')})."
    if capa:
        return "Capa: imagem criada por IA (não achei foto real)."
    return "Capa: não consegui definir uma; ajuste pelo painel."


def _give_up(post: dict[str, Any], tried: list[dict[str, Any]]) -> dict[str, Any]:
    """Nada deu certo: falha com o motivo, e o post só fica com link de vídeo se algum mostrava o assunto."""
    motivo = f"{tried[-1]['reason']} — tentei {len(tried)} vídeo{'s' if len(tried) > 1 else ''}"
    clip = {"status": "failed", "reason": motivo[:300], "tried": tried}
    # vídeo que caiu por rede mostrava o assunto; o que caiu por conteúdo, não — link dele seria pior que nada
    por_rede = next((t for t in tried if t["kind"] == "rede"), None)
    video = {k: por_rede[k] for k in ("url", "title", "channel") if por_rede.get(k)} if por_rede else None
    store.update_post(post["id"], {"clip": clip, "video": video})
    capa = _cover_line(post)
    linhas = "\n".join(f"- {t['url']} ({t.get('title') or 'sem título'}): {t['reason']}" for t in tried)
    notify.send(f"Recorte não deu: {_title(post)}", (
        f"Nenhum vídeo serviu para o recorte do post “{_title(post)}”. Tentei:\n{linhas}\n\n"
        "O post continua em rascunho, " + ("com o link do vídeo no texto." if video else "sem vídeo.") + "\n"
        f"{capa}\n"
        f"Abra no painel para decidir: {_editor_link(post)}"))
    return clip


def _next_video(post: dict[str, Any], tools: Any, reason: str, kind: str, depth: int) -> dict[str, Any]:
    """Este vídeo não deu: passa para a reserva, depois para uma busca nova; esgotou, desiste com e-mail."""
    video = post.get("video") or {}
    clip = post.get("clip") or {}
    tried = [*(clip.get("tried") or []), {"url": _clean_url(video.get("url", "")), "title": video.get("title", ""),
                                         "channel": video.get("channel", ""), "reason": reason[:200], "kind": kind}]
    tentados = {t["url"] for t in tried}
    fila = [c for c in post.get("videoCandidates") or [] if _clean_url(c.get("url", "")) not in tentados]
    if not fila and len(tried) < MAX_VIDEOS:
        try:
            novos = tools.search_more(post, tentados)
        except Exception:
            novos = []
        fila = [c for c in novos if c.get("url") and _clean_url(c["url"]) not in tentados]
    if not fila or len(tried) >= MAX_VIDEOS:
        return _give_up(post, tried)
    store.update_post(post["id"], {"video": fila[0], "videoCandidates": fila[1:],
                                   "clip": {"status": "pending", "tried": tried, "lastTriedAt": _now()}})
    seguinte = store.get_post(post["id"]) or {**post, "video": fila[0], "videoCandidates": fila[1:]}
    if depth + 1 >= VIDEOS_PER_RUN:
        return seguinte["clip"]
    return process(seguinte, tools, depth + 1)


def process(post: dict[str, Any], tools: Any, depth: int = 0) -> dict[str, Any]:
    """Recorta UM post. Nunca levanta. Antes de desistir: outro modo de baixar, outra janela,
    outro vídeo da reserva, uma busca nova — e só então e-mail."""
    video = post.get("video") or {}
    clip = post.get("clip") or {}
    if clip.get("status") != "pending" or not video.get("url"):
        return clip  # pronto, desistido ou sem vídeo: nada a fazer
    url = _clean_url(video["url"])
    texto = _post_text(post)
    tried = clip.get("tried") or []
    erro = ""
    # Download falhou? Outro modo de acesso NA MESMA rodada (medido: o mesmo corte que falhou
    # funcionou logo depois), com uma pausa crescente entre eles.
    for i in range(tools.estrategias):
        tools.use_strategy(i)
        try:
            return _ready(post, video, url, _attempt(url, texto, tools), tried)
        except _ContentError as exc:
            return _next_video(post, tools, str(exc), "conteudo", depth)
        except Exception as exc:  # rede, YouTube, ffmpeg, Gemini — nada derruba a rodada
            erro = str(exc)
            if "429" in erro:
                break  # limite de uso: insistir agora só piora
            if i + 1 < tools.estrategias:
                tools.pause(i)

    agora = _now()
    if "429" in erro:
        # teto do Gemini, rajada no YouTube: só esperar — não é falha do vídeo nem do post
        novo = {**clip, "status": "pending", "lastError": erro[:300], "lastTriedAt": agora}
        store.update_post(post["id"], {"clip": novo})
        return novo
    tentativas = int(clip.get("attempts") or 0) + 1
    if tentativas >= MAX_ATTEMPTS:
        return _next_video(post, tools, f"{erro} (desisti depois de {tentativas} rodadas)", "rede", depth)
    novo = {"status": "pending", "attempts": tentativas, "lastError": erro[:300], "lastTriedAt": agora}
    if tried:
        novo["tried"] = tried
    store.update_post(post["id"], {"clip": novo})
    return novo


def run_once(tools: Any, limit: int = LIMIT) -> int:
    store.touch_clip_worker(_now())  # sinal de vida: o servidor avisa se ele sumir
    feitos = 0
    for post in pending_posts()[:limit]:
        clip = process(post, tools)
        motivo = clip.get("reason") or clip.get("lastError") or ""
        print(f"[recorte] {post['id']}: {clip['status']} {motivo}".rstrip(), flush=True)
        feitos += 1
    return feitos


# ── serviço sempre ligado: escuta o Firestore em vez de bater de tempos em tempos ──────────

#: sem aviso nenhum, ainda assim roda uma rodada: grava o sinal de vida (o servidor reclama por e-mail
#: se o Mac calar 2 h) e serve de rede de segurança se o ouvinte cair em silêncio
HEARTBEAT_SECONDS = 30 * 60
#: pendente que não saiu (download falhou) volta a ser tentado neste ritmo, como antes
RETRY_SECONDS = 15 * 60


class PendingWatcher:
    """Só pendente NOVO acorda a rotina. A rodada regrava o post a cada tentativa; reagir a isso queimaria
    todas as tentativas de uma vez."""

    def __init__(self) -> None:
        self._known: set[str] = set()

    def has_news(self, ids: set[str]) -> bool:
        novos = ids - self._known
        self._known = set(ids)
        return bool(novos)


def serve(tools: Any, wake: Any, stop: Any = lambda: False, limit: int = LIMIT) -> None:
    """Uma rodada a cada aviso do ouvinte; sem aviso, a rodada vem pelo sinal de vida (ou pela nova tentativa)."""
    while not stop():
        wake.clear()  # antes da rodada: aviso que chegar durante ela vira outra rodada logo em seguida
        feitos = run_once(tools, limit)
        print(f"[recorte] {feitos} post(s) processado(s)", flush=True)
        if stop():
            break
        wake.wait(RETRY_SECONDS if pending_posts() else HEARTBEAT_SECONDS)


# ── ferramentas de verdade: yt-dlp, ffmpeg, Pillow, Gemini ──────────────────

YTDLP = [sys.executable, "-m", "yt_dlp", "--no-warnings", "-q"]
#: modos de acesso ao YouTube, um depois do outro quando o download falha. O do meio vem depois de
#: atualizar o yt-dlp: quando o YouTube muda, a correção sai no yt-dlp em horas.
ESTRATEGIAS: list[list[str]] = [
    ["--impersonate", "chrome"],
    ["--impersonate", "safari"],
    ["--impersonate", "chrome"],                    # de novo, com o yt-dlp atualizado
    ["--impersonate", "edge", "--force-ipv4"],
]
# Medido em 2026-10-16 contra o vídeo da Tesla: os clientes web_safari, mweb, web_embedded e tv
# do YouTube NÃO entregam o formato H.264 que o corte pede — não entram na lista.
UPGRADE_AT = 2

# Medido: a primeira versão ("mostra o acontecimento do post?") recusou o loop da sucção porque o
# texto falava de salto. O papel da conferência é barrar corte SEM o assunto, não cobrar detalhe.
VERIFY_PROMPT = (
    "Quadros de um recorte de vídeo, um a cada 4 segundos. A maior parte do recorte mostra, em ação, "
    "o mesmo assunto do post abaixo (o mesmo produto, máquina, lugar ou acontecimento), mesmo que não "
    "mostre todos os detalhes que o texto cita? Responda false só se o recorte for outra coisa: "
    "pessoas falando, plateia, palco vazio, logotipo, animação gráfica ou outro produto. "
    "Responda só JSON: {\"mostra\": bool, \"descricao\": \"uma frase em português do que se VÊ no recorte\"}")


def times_prompt(post_text: str, falas: list[tuple[float, float, str]]) -> str:
    fala = ""
    if falas:
        fala = (" A FALA do vídeo (transcrição, com o tempo de cada frase) está depois do post: o quadro também "
                "vale quando a fala, naquele momento, trata do assunto do post — mesmo que a imagem seja "
                "gráfico, animação, tela de site ou a pessoa falando; nesse caso a exclusão de pessoas "
                "falando e animação gráfica não vale.")
    corpo = (
        "Estes mosaicos são quadros de um vídeo, um a cada 5 segundos; o tempo em segundos está "
        "escrito em amarelo no canto de cada quadro. Abaixo está o post que este vídeo vai "
        "acompanhar. Liste TODOS os tempos (os números amarelos) cujos quadros mostram o assunto "
        "do post — mesmo escuro, com fumaça, de longe ou em movimento borrado; deixe de fora só "
        "pessoas falando no palco, plateia, logotipo, animação gráfica e outro produto." + fala +
        " Depois dê a cada tempo uma nota: 3 = mostra exatamente o que o texto destaca acontecendo; "
        "2 = o assunto em ação; 1 = o assunto aparece, mas parado ou distante. Na dúvida, liste "
        "com nota 1 — a nota escolhe, a lista não pode ter buracos. "
        "Responda só JSON: {\"tempos\": [{\"t\": int, \"nota\": int}, ...]}\n\n"
        f"POST:\n{post_text[:2000]}")
    if falas:
        corpo += f"\n\nFALA DO VÍDEO:\n{clips.transcript_text(falas)}"
    return corpo


def refine_prompt(post_text: str, falas: list[tuple[float, float, str]],
                  start: float | None = None, end: float | None = None) -> str:
    corpo = (
        "Quadros de um trecho de vídeo, um por segundo, com o tempo em amarelo. Escolha o trecho "
        f"CONTÍNUO, de no mínimo {clips.MIN_CLIP} segundos e sem limite de tempo, que mostra por inteiro "
        "o que o post abaixo destaca — pegue o tempo que o assunto precisa para ser entendido, nem "
        "um trecho curto que deixe a explicação pela metade, nem enchimento. Comece no primeiro "
        "quadro em que o assunto já aparece e termine no último; corte o que é só o produto "
        "parado, filmagem distante sem ação, palco ou plateia. ")
    if falas:
        corpo += ("O assunto pode estar só na FALA (transcrição abaixo, com o tempo de cada frase), com gráfico ou "
                  "animação na tela: vale o trecho em que ele é explicado por inteiro. Comece no início de uma "
                  "frase e termine no fim de uma frase, nunca no meio. ")
    corpo += ("Use os números amarelos. Responda só JSON: {\"inicio\": int, \"fim\": int}\n\n"
              f"POST:\n{post_text[:1500]}")
    if falas:
        corpo += f"\n\nFALA DO TRECHO:\n{clips.transcript_text(falas, start, end)}"
    return corpo


class Ferramentas:
    estrategias = len(ESTRATEGIAS)

    def __init__(self, workdir: str | None = None):
        self._modo: list[str] = ESTRATEGIAS[0]
        self._atualizado = False
        self.dir = Path(workdir or tempfile.mkdtemp(prefix="recorte-"))
        self._lowres: dict[str, Path] = {}

    def use_strategy(self, i: int) -> None:
        if i == UPGRADE_AT and not self._atualizado:
            self._atualizado = True
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "yt-dlp"],
                           check=False, timeout=300, capture_output=True)
        self._modo = ESTRATEGIAS[i]

    def pause(self, i: int) -> None:
        time.sleep(min(60, 5 * 2 ** i))  # 5, 10, 20 s: dá tempo de um soluço de rede passar

    def search_more(self, post: dict[str, Any], tried: set[str]) -> list[dict[str, Any]]:
        """Reserva acabou: busca de novo com outros termos (título em português, tema), sem repetir."""
        i18n = post.get("i18n") or {}
        buscas = [((i18n.get("pt") or {}).get("title"), {"anchor": False}),
                  (post.get("topic"), {"anchor": False}),
                  ((i18n.get("en") or {}).get("title"), {"anchor": False, "recent": False})]
        achados: list[dict[str, Any]] = []
        for termo, opcoes in buscas:
            if not termo:
                continue
            for a in videos.search_candidates(termo, prefer=post.get("topic") or "", **opcoes):
                if _clean_url(a.url) not in tried and all(_clean_url(a.url) != _clean_url(x["url"]) for x in achados):
                    achados.append({"url": a.url, "title": a.title, "channel": a.channel, "thumbnail": a.thumbnail})
            if achados:
                break
        return achados

    # vídeo inteiro em baixa, uma vez por URL: quadros e refino saem dele
    def _baixa(self, url: str) -> Path:
        if url not in self._lowres:
            destino = self.dir / f"baixa-{len(self._lowres)}.mp4"
            subprocess.run([*YTDLP, *self._modo, "-f", "bv*[height<=240][ext=mp4]/b[height<=360][ext=mp4]/18",
                            "-o", str(destino), url], check=True, timeout=900)
            self._lowres[url] = destino
        return self._lowres[url]

    def duration(self, url: str) -> int:
        saida = subprocess.run([*YTDLP, *self._modo, "--print", "duration", url], check=True, capture_output=True,
                               text=True, timeout=120).stdout.strip()
        return int(float(saida))

    def _quadros(self, video: Path, inicio: float, fim: float | None, fps: str) -> list[bytes]:
        pasta = Path(tempfile.mkdtemp(dir=self.dir))
        cmd = ["ffmpeg", "-v", "error", "-y", "-ss", str(inicio)]
        if fim is not None:
            cmd += ["-to", str(fim)]
        subprocess.run([*cmd, "-i", str(video), "-vf", f"fps={fps},scale=320:-1", str(pasta / "q%05d.jpg")],
                       check=True, timeout=900)
        return [f.read_bytes() for f in sorted(pasta.glob("q*.jpg"))]

    def frames(self, url: str, step: int) -> list[tuple[int, bytes]]:
        return [(i * step, jpg) for i, jpg in enumerate(self._quadros(self._baixa(url), 0, None, f"1/{step}"))]

    @staticmethod
    def _mosaicos(frames: list[tuple[int, bytes]], por_mosaico: int = 20) -> list[bytes]:
        from PIL import Image, ImageDraw, ImageFont
        try:
            fonte = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 26)
        except OSError:
            fonte = ImageFont.load_default()
        saida = []
        for i in range(0, len(frames), por_mosaico):
            grupo = frames[i:i + por_mosaico]
            primeiro = Image.open(io.BytesIO(grupo[0][1]))
            w, h = primeiro.size
            tela = Image.new("RGB", (w * 5, h * ((len(grupo) + 4) // 5)), "black")
            for j, (t, jpg) in enumerate(grupo):
                im = Image.open(io.BytesIO(jpg)).convert("RGB")
                d = ImageDraw.Draw(im)
                d.rectangle([0, 0, 104, 32], fill="black")
                d.text((6, 3), f"{t}s", fill="yellow", font=fonte)
                tela.paste(im, ((j % 5) * w, (j // 5) * h))
            buf = io.BytesIO()
            tela.save(buf, format="JPEG", quality=80)
            saida.append(buf.getvalue())
        return saida

    @staticmethod
    def _gemini(imagens: list[bytes], pergunta: str) -> str:
        """Decisão por imagem: vai pelo motor escolhido em `gemini.provider()` (Claude ou Gemini)."""
        return json.dumps(gemini._call(pergunta, "", schema=gemini.FREE_JSON, model_name=VISION_MODEL,
                                       temperature=0, images=imagens, timeout=300))

    def transcript(self, url: str) -> list[tuple[float, float, str]]:
        """Legenda do vídeo em frases: a automática do idioma original; sem ela, a feita à mão. Nunca a
        tradução automática (o YouTube responde 429). Sem legenda ou com erro, lista vazia."""
        for auto, langs in ((True, ".*-orig"), (False, "en.*,pt.*")):
            pasta = Path(tempfile.mkdtemp(dir=self.dir))
            try:
                # o yt-dlp sai com erro se UMA faixa falha, mesmo com as outras já no disco: lê o que baixou
                subprocess.run([*YTDLP, *self._modo, "--skip-download",
                                "--write-auto-subs" if auto else "--write-subs", "--sub-langs", langs,
                                "--sub-format", "json3", "-o", str(pasta / "v.%(ext)s"), url],
                               capture_output=True, timeout=180)
            except (subprocess.SubprocessError, OSError):
                pass
            for arquivo in sorted(pasta.glob("v.*.json3")):
                try:
                    falas = clips.parse_captions(json.loads(arquivo.read_text(encoding="utf-8")))
                except (OSError, ValueError):
                    continue
                if falas:
                    return falas
        return []

    def ask_times(self, frames: list[tuple[int, bytes]], post_text: str, duration: int,
                  falas: list[tuple[float, float, str]] = ()) -> str:  # type: ignore[assignment]
        return self._gemini(self._mosaicos(frames), times_prompt(post_text, list(falas)))

    def refine_window(self, url: str, start: int, end: int, post_text: str,
                      falas: list[tuple[float, float, str]] = ()) -> tuple[int, int] | None:  # type: ignore[assignment]
        quadros = self._quadros(self._baixa(url), start, end, "1")
        resposta = json.loads(self._gemini(self._mosaicos([(start + i, q) for i, q in enumerate(quadros)]),
                                           refine_prompt(post_text, list(falas), start, end)))
        inicio, fim = resposta.get("inicio"), resposta.get("fim")
        return (inicio, fim) if isinstance(inicio, int) and isinstance(fim, int) else None

    def cut(self, url: str, start: int, end: int) -> tuple[bytes, int, int]:
        destino = self.dir / f"corte-{start}-{end}.mp4"
        # H.264: o padrão do YouTube vem AV1, que LinkedIn e Safari do iPhone não tocam bem.
        # --force-keyframes-at-cuts corta no segundo exato (sem isso pula para o keyframe anterior).
        subprocess.run([*YTDLP, *self._modo, "-f", "bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[vcodec^=avc1][height<=720]",
                        "--download-sections", f"*{clips.hms(start)}-{clips.hms(end)}",
                        "--force-keyframes-at-cuts", "--remux-video", "mp4",
                        "--postprocessor-args", "ffmpeg:-movflags +faststart",
                        "-o", str(destino), url], check=True, timeout=900)
        info = json.loads(subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
             "-of", "json", str(destino)], check=True, capture_output=True, text=True).stdout)
        s = info["streams"][0]
        return destino.read_bytes(), int(s["width"]), int(s["height"])

    def verify(self, mp4: bytes, post_text: str) -> tuple[bool, str]:
        arquivo = self.dir / "conferir.mp4"
        arquivo.write_bytes(mp4)
        quadros = self._quadros(arquivo, 0, None, "1/4")
        resposta = json.loads(self._gemini(self._mosaicos([(i * 4, q) for i, q in enumerate(quadros)]),
                                           VERIFY_PROMPT + f"\n\nPOST:\n{post_text[:800]}"))
        return bool(resposta.get("mostra")), str(resposta.get("descricao") or "")


if __name__ == "__main__":
    os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT
    check_project()
    if "--once" in sys.argv:
        print(f"[recorte] {run_once(Ferramentas())} post(s) processado(s)")
    else:
        acordar = threading.Event()
        vigia = PendingWatcher()
        assinante = store.watch_pending_clips(lambda ids: vigia.has_news(ids) and acordar.set())
        print("[recorte] escutando o Firestore", flush=True)
        try:
            serve(Ferramentas(), acordar)
        finally:
            assinante.unsubscribe()
