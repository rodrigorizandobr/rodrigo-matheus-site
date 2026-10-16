"""Rotina de recorte de vídeo — roda no Mac do autor, NÃO no Cloud Run.

O servidor só acha o vídeo no YouTube e marca o post com `clip.status = "pending"`. Esta
rotina pega os pendentes, escolhe o trecho que mostra o que o post discute, corta sem
editar, guarda no bucket e marca `ready` (ou `failed`, com o motivo). Roda no Mac porque o
YouTube bloqueia download de IP de datacenter — mesmo daqui precisou `--impersonate chrome`.

Uso:  ./scripts/clip-worker.sh        (uma rodada; o launchd chama de 15 em 15 min)

Como o trecho é escolhido (lições da prova manual, 2026-10-16):
- o Gemini "assistindo" pela URL inventa tempo; aqui ele marca QUADROS que têm o tempo
  gravado neles (um a cada 5 s, em mosaicos), e o tempo vem do quadro;
- o início é refinado a 1 quadro/s — a 5 s o corte começou numa filmagem aérea sem o carro;
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
from pathlib import Path
from typing import Any

from blog import clips, gemini, media, service, store

PROJECT = "rodrigo-matheus"
#: no máximo isto por rodada: o YouTube dá 429 para quem baixa em rajada
LIMIT = 3
#: erro de rede/YouTube tenta de novo nas rodadas seguintes; desiste depois disto
MAX_ATTEMPTS = 3


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
    return [p for p in store.list_posts()
            if (p.get("clip") or {}).get("status") == "pending" and (p.get("video") or {}).get("url")]


def _post_text(post: dict[str, Any]) -> str:
    pt = (post.get("i18n") or {}).get("pt") or {}
    corpo = " ".join(p for s in pt.get("sections") or [] for p in s.get("paragraphs") or [])
    return f"{pt.get('title', '')}\n{pt.get('excerpt', '')}\n{corpo}"


def _clean_url(url: str) -> str:
    """Tira o lixo de rastreio do Serper (`&xstg=…`): fica só o vídeo."""
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url or "")
    return f"https://www.youtube.com/watch?v={m[1]}" if m else url


def _fail(post: dict[str, Any], reason: str) -> dict[str, Any]:
    clip = {"status": "failed", "reason": reason[:300]}
    store.update_post(post["id"], {"clip": clip})
    return clip


def _retry(post: dict[str, Any], error: str) -> dict[str, Any]:
    """Erro de rede ou do YouTube: medido que o MESMO corte que falhou funcionou na hora seguinte."""
    anteriores = int((post.get("clip") or {}).get("attempts") or 0)
    if "429" in error:
        # limite de uso (teto do Gemini, rajada no YouTube): só esperar — não é falha do post
        clip = {"status": "pending", "lastError": error[:300]}
        if anteriores:
            clip["attempts"] = anteriores
        store.update_post(post["id"], {"clip": clip})
        return clip
    tentativas = anteriores + 1
    if tentativas >= MAX_ATTEMPTS:
        return _fail(post, f"{error} (desisti depois de {tentativas} tentativas)")
    clip = {"status": "pending", "attempts": tentativas, "lastError": error[:300]}
    store.update_post(post["id"], {"clip": clip})
    return clip


def process(post: dict[str, Any], tools: Any) -> dict[str, Any]:
    """Recorta UM post. Nunca levanta: toda falha vira `clip.status = failed` com o motivo."""
    video = post.get("video") or {}
    url = _clean_url(video.get("url", ""))
    texto = _post_text(post)
    etapa = "duration"
    try:
        duracao = tools.duration(url)
        etapa = "frames"
        quadros = tools.frames(url, clips.STEP)
        etapa = "escolha"
        tempos = clips.parse_times(tools.ask_times(quadros, texto, duracao), duration=duracao)
        trecho = clips.choose_segment(clips.group_segments(tempos))
        if not trecho:
            return _fail(post, "nenhum trecho do vídeo mostra o que o post discute")
        inicio, fim = trecho
        etapa = "refino"
        fino = tools.refine_start(url, inicio, texto)
        if isinstance(fino, int) and inicio - clips.STEP <= fino < fim - clips.MIN_CLIP:
            inicio = fino
            fim = min(fim, inicio + clips.MAX_CLIP)  # refino para trás não estoura o máximo
        etapa = "cut"
        mp4, largura, altura = tools.cut(url, inicio, fim)
        etapa = "conferência"
        ok, descricao = tools.verify(mp4, texto)
        if not ok:
            return _fail(post, f"a conferência final recusou o corte: {descricao}")
        etapa = "gravação"
        digest = media.store_video(mp4)
        if not digest:
            return _fail(post, "o corte não saiu como MP4")
    except Exception as exc:  # rede, YouTube, ffmpeg, Gemini — nada derruba a rodada
        return _retry(post, f"{etapa}: {exc}")

    clip = {"status": "ready", "hash": digest, "sourceUrl": url, "title": video.get("title", ""),
            "channel": video.get("channel", ""), "start": inicio, "end": fim,
            "width": largura, "height": altura, "selectedBy": "frames"}
    patch: dict[str, Any] = {"clip": clip}
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
    store.update_post(post["id"], patch)
    return clip


def run_once(tools: Any, limit: int = LIMIT) -> int:
    feitos = 0
    for post in pending_posts()[:limit]:
        clip = process(post, tools)
        motivo = clip.get("reason") or clip.get("lastError") or ""
        print(f"[recorte] {post['id']}: {clip['status']} {motivo}".rstrip(), flush=True)
        feitos += 1
    return feitos


# ── ferramentas de verdade: yt-dlp, ffmpeg, Pillow, Gemini ──────────────────

YTDLP = [sys.executable, "-m", "yt_dlp", "--impersonate", "chrome", "--no-warnings", "-q"]
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini.TEXT_MODEL}:generateContent"

# Medido: a primeira versão ("mostra o acontecimento do post?") recusou o loop da sucção porque o
# texto falava de salto. O papel da conferência é barrar corte SEM o assunto, não cobrar detalhe.
VERIFY_PROMPT = (
    "Quadros de um recorte de vídeo, um a cada 4 segundos. A maior parte do recorte mostra, em ação, "
    "o mesmo assunto do post abaixo (o mesmo produto, máquina, lugar ou acontecimento), mesmo que não "
    "mostre todos os detalhes que o texto cita? Responda false só se o recorte for outra coisa: "
    "pessoas falando, plateia, palco vazio, logotipo, animação gráfica ou outro produto. "
    "Responda só JSON: {\"mostra\": bool, \"descricao\": \"uma frase em português do que se VÊ no recorte\"}")


class Ferramentas:
    def __init__(self, workdir: str | None = None):
        self.dir = Path(workdir or tempfile.mkdtemp(prefix="recorte-"))
        self._lowres: dict[str, Path] = {}

    # vídeo inteiro em baixa, uma vez por URL: quadros e refino saem dele
    def _baixa(self, url: str) -> Path:
        if url not in self._lowres:
            destino = self.dir / f"baixa-{len(self._lowres)}.mp4"
            subprocess.run([*YTDLP, "-f", "bv*[height<=240][ext=mp4]/b[height<=360][ext=mp4]/18",
                            "-o", str(destino), url], check=True, timeout=900)
            self._lowres[url] = destino
        return self._lowres[url]

    def duration(self, url: str) -> int:
        saida = subprocess.run([*YTDLP, "--print", "duration", url], check=True, capture_output=True,
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
        import requests
        partes = [{"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(i).decode()}} for i in imagens]
        res = requests.post(GEMINI_URL, headers={"x-goog-api-key": gemini.API_KEY}, timeout=300, json={
            "contents": [{"parts": [*partes, {"text": pergunta}]}],
            "generationConfig": {"responseMimeType": "application/json"}})
        res.raise_for_status()
        return res.json()["candidates"][0]["content"]["parts"][0]["text"]

    def ask_times(self, frames: list[tuple[int, bytes]], post_text: str, duration: int) -> str:
        return self._gemini(self._mosaicos(frames), (
            "Estes mosaicos são quadros de um vídeo, um a cada 5 segundos; o tempo em segundos está "
            "escrito em amarelo no canto de cada quadro. Abaixo está o post que este vídeo vai "
            "acompanhar. Liste SÓ os tempos (os números amarelos) cujos quadros MOSTRAM na imagem o "
            "acontecimento que o post discute — a coisa em ação, não pessoas falando no palco, "
            "plateia, logotipo ou animação gráfica. Responda só JSON: {\"tempos\": [int, ...]}\n\n"
            f"POST:\n{post_text[:2000]}"))

    def refine_start(self, url: str, start: int, post_text: str) -> int:
        janela = max(0, start - 4)
        quadros = self._quadros(self._baixa(url), janela, janela + 10, "1")
        resposta = self._gemini(self._mosaicos([(janela + i, q) for i, q in enumerate(quadros)]), (
            "Quadros de um vídeo, um por segundo, com o tempo em amarelo. Qual é o PRIMEIRO tempo em "
            "que a imagem já mostra o acontecimento do post abaixo, de perto o bastante para ver? "
            f"Responda só JSON: {{\"tempos\": [int]}}\n\nPOST:\n{post_text[:800]}"))
        tempos = clips.parse_times(resposta)
        return tempos[0] if tempos else start

    def cut(self, url: str, start: int, end: int) -> tuple[bytes, int, int]:
        destino = self.dir / f"corte-{start}-{end}.mp4"
        # H.264: o padrão do YouTube vem AV1, que LinkedIn e Safari do iPhone não tocam bem.
        # --force-keyframes-at-cuts corta no segundo exato (sem isso pula para o keyframe anterior).
        subprocess.run([*YTDLP, "-f", "bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[vcodec^=avc1][height<=720]",
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
    print(f"[recorte] {run_once(Ferramentas())} post(s) processado(s)")
