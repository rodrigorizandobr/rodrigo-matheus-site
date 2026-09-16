"""Origens de imagem para o blog: IA (Gemini) e banco de imagens (Pixabay).

Este módulo só SABE BUSCAR. Quem grava e cataloga é `blog/media.py` — assim toda
imagem, venha de onde vier, cai na mesma biblioteca com o mesmo tratamento
(JPEG, lado máximo, nome pelo hash).

`build_cover` é o caminho automático da geração: tenta a IA, cai no banco de
imagens, e devolve `None` sem reclamar se nenhum dos dois der certo — o post sai
sem capa em vez de não sair. Imagem é enfeite, texto é o produto.
"""
from __future__ import annotations

import base64
import os
import random
from typing import Any

import requests

from . import media

API_KEY = os.environ.get("GEMINI_API_KEY", "")
PIXABAY_KEY = os.environ.get("PIXABAY_API_KEY", "")
#: o flash é o modelo da capa. **Medido**: com `imageSize: 2K` ele devolve os mesmos
#: 2752x1536 do pro, na mesma direção de arte — o pro custa várias vezes mais por
#: imagem sem diferença que apareça numa capa de post. Não troque sem comparar de novo.
IMAGE_MODEL = os.environ.get("BLOG_IMAGE_MODEL", "gemini-3.1-flash-image")
#: reserva opcional; vazia de propósito, para um erro raro não virar conta mais cara
IMAGE_MODEL_FALLBACK = os.environ.get("BLOG_IMAGE_MODEL_FALLBACK", "")
#: tamanho pedido ao modelo. **Medido** no flash, em 16:9, com o preço de US$ 60 por
#: 1M de tokens de imagem: 1K = 1557 tokens ≈ US$ 0,093 e devolve 1376x768; 2K = 2151
#: tokens ≈ US$ 0,129 e devolve 2752x1536. Os 1376 px já passam dos 1200 que o cartão
#: do LinkedIn pede, então 1K é o padrão — 2K é bonito, não é necessário.
IMAGE_SIZE = os.environ.get("BLOG_IMAGE_SIZE", "1K")
#: o aspecto não custa nada e é o que impede o modelo de devolver quadrado
IMAGE_CONFIG = {"aspectRatio": "16:9", "imageSize": IMAGE_SIZE}
BASE = "https://generativelanguage.googleapis.com/v1beta"
TIMEOUT = 90

# A direção de arte do site inteiro, colada em todo prompt de capa: sem isso o
# modelo devolve stock genérico colorido, que destoa do laboratório branco.
ART_DIRECTION = (
    "Editorial cover image, photorealistic, 16:9. Extremely sterile white high-tech "
    "laboratory: white surfaces, soft diffuse light, biomechanical details in white and "
    "pale bone, red glow as the ONLY saturated accent. No text, no letters, no logos, "
    "no people, no faces. Cinematic, shallow depth of field, calm and clinical."
)


def _ask_model(model: str, prompt: str) -> bytes | None:
    res = requests.post(
        f"{BASE}/models/{model}:generateContent",
        headers={"x-goog-api-key": API_KEY, "content-type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": f"{ART_DIRECTION}\n\nSCENE: {prompt}"}]}],
            "generationConfig": {"imageConfig": dict(IMAGE_CONFIG)},
        },
        timeout=TIMEOUT,
    )
    if not res.ok:
        return None
    for part in res.json().get("candidates", [{}])[0].get("content", {}).get("parts", []):
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])
    return None


def generate_image(prompt: str, alt: str = "") -> dict[str, Any] | None:
    """Gera a capa na direção de arte do site e cataloga.

    Sem crédito: a capa é ilustração editorial do site, não citação de terceiro.
    Crédito existe para dar a quem é devido — banco de imagens tem, ilustração
    da casa não tem.
    """
    if not API_KEY:
        return None
    for modelo in (m for m in (IMAGE_MODEL, IMAGE_MODEL_FALLBACK) if m):
        try:
            raw = _ask_model(modelo, prompt)
        except Exception:
            raw = None
        if raw:
            return media.store_image(raw, provider="gemini", alt=alt, credit="", prompt=prompt)
    return None


def search_stock(query: str, per_page: int = 24) -> list[dict[str, Any]]:
    """Candidatas do banco de imagens, para o autor escolher no painel.

    Só paisagem: vertical fica horrível esticada na largura toda do cabeçalho do post.
    """
    if not PIXABAY_KEY or not (query or "").strip():
        return []
    try:
        res = requests.get(
            "https://pixabay.com/api/",
            params={"key": PIXABAY_KEY, "q": query, "image_type": "photo",
                    "per_page": per_page, "safesearch": "true"},
            timeout=TIMEOUT,
        )
        if not res.ok:
            return []
        hits = res.json().get("hits") or []
    except Exception:
        return []

    return [
        {
            "id": str(h.get("id")),
            "thumb": h.get("webformatURL", ""),
            "url": h.get("largeImageURL", ""),
            "credit": f"{h.get('user', 'Pixabay')} / Pixabay",
            "sourceUrl": h.get("pageURL", ""),
            "width": h.get("imageWidth", 0),
            "height": h.get("imageHeight", 0),
        }
        for h in hits
        if h.get("imageWidth", 0) > h.get("imageHeight", 0) and h.get("largeImageURL")
    ]


def import_stock(url: str, credit: str = "", source_url: str = "", alt: str = "") -> dict[str, Any] | None:
    """Baixa uma candidata escolhida e cataloga como nossa."""
    try:
        res = requests.get(url, timeout=TIMEOUT)
        if not res.ok or not res.content:
            return None
    except Exception:
        return None
    return media.store_image(res.content, provider="pixabay", alt=alt,
                             credit=credit or "Pixabay", source_url=source_url)


def build_cover(prompt: str, alt: str, keywords: list[str] | None = None) -> dict[str, Any] | None:
    """Capa automática: IA primeiro, banco de imagens como reserva, nenhuma em último caso."""
    item = generate_image(prompt, alt=alt)
    if item:
        return media.as_cover(item)

    for keyword in (keywords or [prompt]):
        candidatas = search_stock(keyword, per_page=20)
        if not candidatas:
            continue
        escolhida = random.choice(candidatas[:5])
        item = import_stock(escolhida["url"], escolhida["credit"], escolhida["sourceUrl"], alt=alt)
        if item:
            return media.as_cover(item)
    return None


def read_image(digest: str) -> bytes | None:
    """Mantido para a rota pública de imagem — delega para a biblioteca."""
    return media.read_image(digest)
