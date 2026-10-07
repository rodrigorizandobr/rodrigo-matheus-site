"""Busca de vídeo no YouTube via Serper — só busca, nunca baixa.

"Vídeo nativo" de verdade (upload direto no LinkedIn) exigiria baixar o arquivo do
YouTube, e isso viola os Termos de Uso deles — não é só questão de direito autoral.
Por isso este módulo devolve só o LINK: quem desenha o cartão de prévia é o próprio
LinkedIn, lendo a página pública do YouTube, igual a qualquer post que cola um link.
Opcional em todo lugar, igual à pesquisa de notícia: sem `SERPER_API_KEY`, ou sem
resultado do YouTube, a reflexão sai sem vídeo — nunca trava a geração do post.
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


def search_youtube(query: str) -> VideoResult:
    """Um vídeo real do YouTube sobre `query`, ou um resultado vazio.

    Filtra pro YouTube no próprio termo de busca (`site:youtube.com`) e de novo no
    link devolvido — o Serper às vezes mistura resultado de outro site na mesma lista.
    """
    if not SERPER_KEY:
        return VideoResult()
    try:
        res = requests.post(
            SERPER_VIDEO_URL,
            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            json={"q": f"{query} site:youtube.com"},
            timeout=SEARCH_TIMEOUT,
        )
        if not res.ok:
            return VideoResult()
        itens: list[dict[str, Any]] = (res.json() or {}).get("videos") or []
    except Exception:
        return VideoResult()

    for item in itens:
        link = (item or {}).get("link") or ""
        if not _e_do_youtube(link):
            continue
        return VideoResult(
            title=(item.get("title") or "").strip(),
            url=link,
            thumbnail=item.get("imageUrl") or "",
            channel=item.get("channel") or "",
        )
    return VideoResult()
