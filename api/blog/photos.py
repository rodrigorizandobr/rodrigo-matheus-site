"""Foto REAL para a capa: a da própria matéria e, depois, a busca de imagens.

É o meio da escada de mídia de um post de notícia: recorte de vídeo → foto real → imagem de IA.
Este módulo só ACHA, confere com visão e grava na biblioteca (`media.store_image`: nunca se linka
arquivo de terceiro, a URL pode virar 403). Opcional em tudo: sem chave, sem achado ou com o
buscador fora do ar devolve `None` e a escada segue para a IA.

A foto é de terceiro, com crédito e link da página de origem; por isso o post que a usa espera
a revisão do autor, como o que tem recorte de vídeo.
"""
from __future__ import annotations

import html as html_lib
import io
import os
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

from . import gemini, media

SERPER_KEY = os.environ.get("SERPER_API_KEY", "")
SERPER_IMAGES_URL = "https://google.serper.dev/images"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
TIMEOUT = 10
MIN_WIDTH = 900
#: o cabeçalho do post é 16:9; abaixo disso a foto é cortada demais, acima vira faixa
MIN_RATIO, MAX_RATIO = 1.25, 2.4
#: quantas candidatas baixar e mostrar à visão no máximo — cada olhada custa uma chamada
MAX_TRIES = 6
MAX_PAGES = 6
#: banco de imagens vende a foto e põe marca d'água na amostra
STOCK = ("shutterstock", "gettyimages", "istockphoto", "alamy", "depositphotos",
         "dreamstime", "123rf", "adobe.com", "pixelsquid", "freepik", "vecteezy")
#: miniatura de vídeo (letreiro por cima; o recorte já cobre vídeo) e rede social (nega o download)
SKIP = ("ytimg.com", "youtube.com", "youtu.be", "instagram.com", "cdninstagram", "facebook.com", "fbcdn.net",
        "tiktok.com", "pinterest")

_META = re.compile(r"<meta\b[^>]*>", re.I)
_ATTR = re.compile(r'([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')
_WANTED = ("og:image", "og:image:url", "twitter:image", "twitter:image:src")


def extract_image_url(page_html: str, base_url: str) -> str:
    """URL da imagem de compartilhamento da página (og:image, depois twitter:image), absoluta."""
    found: dict[str, str] = {}
    for tag in _META.findall(page_html or ""):
        attrs = {m.group(1).lower(): m.group(2) if m.group(2) is not None else m.group(3)
                 for m in _ATTR.finditer(tag)}
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key in _WANTED and attrs.get("content"):
            found.setdefault(key, attrs["content"])
    for key in _WANTED:
        if found.get(key):
            return urljoin(base_url, html_lib.unescape(found[key].strip()))
    return ""


def page_image(url: str) -> str:
    """A imagem que a própria matéria escolheu para si. Vazio se a página recusa ou não tem."""
    try:
        res = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=TIMEOUT)
        if not res.ok or "html" not in (res.headers.get("content-type") or ""):
            return ""
        return extract_image_url(res.text, url)
    except Exception:
        return ""


def usable(raw: bytes) -> bool:
    """Paisagem e grande o bastante para ocupar a largura do cabeçalho do post."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            width, height = img.size
    except Exception:
        return False
    return width >= MIN_WIDTH and height > 0 and MIN_RATIO <= width / height <= MAX_RATIO


def _is_stock(*urls: str) -> bool:
    return any(s in (u or "").lower() for u in urls for s in STOCK + SKIP)


def search_images(query: str) -> list[dict[str, str]]:
    """Candidatas da busca de imagens do Google (Serper), Brasil, sem banco de imagens."""
    if not SERPER_KEY or not (query or "").strip():
        return []
    try:
        res = requests.post(SERPER_IMAGES_URL,
                            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
                            json={"q": query, "num": 10, "gl": "br", "hl": "pt-br"}, timeout=TIMEOUT)
        if not res.ok:
            return []
        itens = (res.json() or {}).get("images") or []
    except Exception:
        return []

    out = []
    for item in itens:
        url, page = item.get("imageUrl"), item.get("link") or ""
        if not isinstance(url, str) or not url or _is_stock(url, page, str(item.get("source") or "")):
            continue
        width = item.get("imageWidth")
        if isinstance(width, int) and width and width < MIN_WIDTH:
            continue
        out.append({"url": url, "page": page,
                    "source": str(item.get("source") or urlparse(page).hostname or "")})
    return out


def _download(url: str) -> bytes | None:
    try:
        res = requests.get(url, headers={"User-Agent": UA, "Accept": "image/*"}, timeout=TIMEOUT)
        if res.ok and res.content and "image" in (res.headers.get("content-type") or "image"):
            return res.content
    except Exception:
        pass
    return None


def _site(url: str) -> str:
    return re.sub(r"^www\d*\.", "", (urlparse(url).hostname or "").lower())


def _candidates(queries: list[str], page_urls: list[str]) -> list[dict[str, str]]:
    """Primeiro a foto das matérias que fundamentaram o texto; depois a busca de imagens."""
    pages = [u for u in page_urls if u][:MAX_PAGES]
    with ThreadPoolExecutor(max_workers=4) as pool:
        da_materia = list(pool.map(page_image, pages))
    out = [{"url": img, "page": page, "source": _site(page)} for page, img in zip(pages, da_materia) if img]
    for query in queries:
        out.extend(search_images(query))
    vistos: set[str] = set()
    unicas = []
    for c in out:
        if c["url"] not in vistos:
            vistos.add(c["url"])
            unicas.append(c)
    return unicas


_YT_ID = re.compile(r"(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/)|youtu\.be/)([\w-]{11})")


def youtube_poster(video_url: str) -> bytes | None:
    """Quadro de abertura do próprio vídeo recortado (maior versão), ou None. Só a miniatura grande
    serve: as menores ficam serrilhadas esticadas na largura do cabeçalho."""
    found = _YT_ID.search(video_url or "")
    if not found:
        return None
    raw = _download(f"https://i.ytimg.com/vi/{found.group(1)}/maxresdefault.jpg")
    return raw if raw and usable(raw) else None


def find(subject: str, queries: list[str], page_urls: list[str], alt: str = "") -> dict[str, Any] | None:
    """Capa com foto real do assunto, já gravada na biblioteca, ou None. Nunca levanta."""
    try:
        tried = 0
        for cand in _candidates(queries, page_urls):
            if tried >= MAX_TRIES:
                break
            raw = _download(cand["url"])
            if not raw or not usable(raw):
                continue
            tried += 1
            if not gemini.photo_fits(raw, subject):
                continue
            item = media.store_image(raw, provider="web", alt=alt, credit=f"Foto: {cand['source']}",
                                     source_url=cand["page"])
            if item:
                return media.as_cover(item)
    except Exception:
        return None
    return None
