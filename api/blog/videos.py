"""Busca de vídeo no YouTube via Serper — só busca, nunca baixa.

Quem baixa e recorta é a rotina do Mac (`clip_worker.py`): o YouTube bloqueia download vindo de IP
de datacenter. O post com vídeo achado nasce rascunho com `clip.status = "pending"` — o PO pede
autorização ao dono do vídeo antes de publicar. Opcional em todo lugar: sem `SERPER_API_KEY`, ou
sem resultado do YouTube, o post sai sem vídeo — nunca trava a geração.
"""
from __future__ import annotations

import os
from typing import Any

import requests

SERPER_KEY = os.environ.get("SERPER_API_KEY", "")
SERPER_VIDEO_URL = "https://google.serper.dev/videos"
SEARCH_TIMEOUT = 10


class VideoResult:
    """Um vídeo achado (ou nenhum — `bool(resultado)` diz qual)."""

    def __init__(self, title: str = "", url: str = "", thumbnail: str = "", channel: str = ""):
        self.title = title
        self.url = url
        self.thumbnail = thumbnail
        self.channel = channel

    def __bool__(self) -> bool:
        return bool(self.url)


def _e_do_youtube(link: str) -> bool:
    return "youtube.com/watch" in link or "youtu.be/" in link


def _plain(text: str) -> str:
    import unicodedata
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _official(channel: str, prefer: str) -> bool:
    """O canal leva o nome do protagonista? Palavra curta ("de", "IA") não conta."""
    canal = _plain(channel)
    return any(len(p) >= 4 and p in canal for p in _plain(prefer).split())


def search_youtube(query: str, recent: bool = False, anchor: bool = True, prefer: str = "") -> VideoResult:
    """Um vídeo real do YouTube sobre `query`, ou um resultado vazio.

    Filtra pro YouTube no próprio termo de busca (`site:youtube.com`) e de novo no
    link devolvido — o Serper às vezes mistura resultado de outro site na mesma lista.
    """
    if not SERPER_KEY:
        return VideoResult()
    # Âncora de domínio (`anchor`): medido que "arquitetura" sozinho trazia vídeo de construção
    # civil, não de software — tema de REFLEXÃO é curto e vive de palavra ambígua. Notícia não
    # leva âncora: "engenharia de software" afastaria o vídeo do evento da Tesla. `recent` pede
    # só a última semana — o vídeo da notícia é da semana da notícia.
    corpo: dict[str, Any] = {"q": f"{query}{' engenharia de software' if anchor else ''} site:youtube.com"}
    if recent:
        corpo["tbs"] = "qdr:w"
    try:
        res = requests.post(
            SERPER_VIDEO_URL,
            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            json=corpo,
            timeout=SEARCH_TIMEOUT,
        )
        if not res.ok:
            return VideoResult()
        itens: list[dict[str, Any]] = (res.json() or {}).get("videos") or []
    except Exception:
        return VideoResult()

    candidatos = [i for i in itens if _e_do_youtube((i or {}).get("link") or "")]
    if not candidatos:
        return VideoResult()
    # Canal oficial primeiro: medido que a ABC News vinha antes do canal da Tesla, com faixa de
    # reportagem e "LIVE views" por cima do vídeo inteiro — a fonte original é mais limpa.
    item = next((i for i in candidatos if prefer and _official(i.get("channel") or "", prefer)), candidatos[0])
    return VideoResult(
        title=(item.get("title") or "").strip(),
        url=item.get("link") or "",
        thumbnail=item.get("imageUrl") or "",
        channel=item.get("channel") or "",
    )
