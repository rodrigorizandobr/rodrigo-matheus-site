"""Capa do post: gerada por IA, com banco de imagens como reserva.

Ordem: Gemini (imagem na direção de arte do site) → Pixabay → nenhuma. O post
sai SEM capa em vez de não sair — imagem é enfeite, texto é o produto.

Duas decisões que valem explicação:

*Sempre regravar no nosso Storage.* A URL do Pixabay pode sumir ou virar 403 e
o post ficaria com imagem quebrada para sempre. O arquivo é nosso, servido pela
nossa rota, com cache de um ano.

*Nome pelo hash do conteúdo.* `blog-images/<sha256>.jpg`: gerar duas vezes a
mesma imagem não duplica o objeto, e a URL é imutável — pode ser cacheada para
sempre sem risco de servir conteúdo velho.
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import random
import re
from typing import Any

import requests
from PIL import Image

from .gcs import get_bucket

API_KEY = os.environ.get("GEMINI_API_KEY", "")
PIXABAY_KEY = os.environ.get("PIXABAY_API_KEY", "")
IMAGE_MODEL = os.environ.get("BLOG_IMAGE_MODEL", "gemini-3.1-flash-image")
BASE = "https://generativelanguage.googleapis.com/v1beta"

PREFIX = "blog-images"
MAX_SIDE = 1600
JPEG_QUALITY = 82
TIMEOUT = 90
HASH_RE = re.compile(r"^[0-9a-f]{64}$")

# A direção de arte do site inteiro, colada em todo prompt de capa: sem isso o
# modelo devolve stock genérico colorido, que destoa do laboratório branco.
ART_DIRECTION = (
    "Editorial cover image, photorealistic, 16:9. Extremely sterile white high-tech "
    "laboratory: white surfaces, soft diffuse light, biomechanical details in white and "
    "pale bone, red glow as the ONLY saturated accent. No text, no letters, no logos, "
    "no people, no faces. Cinematic, shallow depth of field, calm and clinical."
)


def _bucket():
    return get_bucket()


def _store_jpeg(raw: bytes) -> str | None:
    """Converte para JPEG, reduz ao lado máximo e grava pelo hash. Devolve o hash."""
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
    except Exception:
        return None

    if max(img.size) > MAX_SIDE:
        scale = MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    data = buf.getvalue()

    digest = hashlib.sha256(data).hexdigest()
    blob = _bucket().blob(f"{PREFIX}/{digest}.jpg")
    if not blob.exists():
        blob.cache_control = "public, max-age=31536000, immutable"
        blob.upload_from_string(data, content_type="image/jpeg")
    return digest


def _from_gemini(prompt: str) -> bytes | None:
    if not API_KEY:
        return None
    try:
        res = requests.post(
            f"{BASE}/models/{IMAGE_MODEL}:generateContent",
            headers={"x-goog-api-key": API_KEY, "content-type": "application/json"},
            json={"contents": [{"role": "user", "parts": [{"text": f"{ART_DIRECTION}\n\nSCENE: {prompt}"}]}]},
            timeout=TIMEOUT,
        )
        if not res.ok:
            return None
        for part in res.json().get("candidates", [{}])[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    except Exception:
        return None
    return None


def _from_pixabay(keywords: list[str]) -> dict[str, Any] | None:
    """Reserva. Só paisagem: vertical fica horrível esticada na largura toda do cabeçalho."""
    if not PIXABAY_KEY:
        return None
    for keyword in keywords or []:
        try:
            res = requests.get(
                "https://pixabay.com/api/",
                params={"key": PIXABAY_KEY, "q": keyword, "image_type": "photo",
                        "per_page": 20, "safesearch": "true"},
                timeout=TIMEOUT,
            )
            if not res.ok:
                continue
            hits = [h for h in (res.json().get("hits") or [])
                    if h.get("imageWidth", 0) > h.get("imageHeight", 0)]
            if not hits:
                continue
            hit = random.choice(hits[:5])
            img = requests.get(hit["largeImageURL"], timeout=TIMEOUT)
            if not img.ok or not img.content:
                continue
            return {"raw": img.content,
                    "credit": f"{hit.get('user', 'Pixabay')} / Pixabay",
                    "sourceUrl": hit.get("pageURL", "")}
        except Exception:
            continue
    return None


def build_cover(prompt: str, alt: str, keywords: list[str] | None = None) -> dict[str, Any] | None:
    """Capa do post. `keywords` (inglês) só são usadas se a IA falhar."""
    raw = _from_gemini(prompt)
    if raw:
        digest = _store_jpeg(raw)
        if digest:
            return {"hash": digest, "provider": "gemini", "credit": "Gerada com IA (Gemini)",
                    "sourceUrl": "", "alt": alt}

    fallback = _from_pixabay(keywords or [prompt])
    if fallback:
        digest = _store_jpeg(fallback["raw"])
        if digest:
            return {"hash": digest, "provider": "pixabay", "credit": fallback["credit"],
                    "sourceUrl": fallback["sourceUrl"], "alt": alt}
    return None


def read_image(digest: str) -> bytes | None:
    """Bytes do JPEG. Hash malformado nunca vira caminho — evita travessia no bucket."""
    if not HASH_RE.match(digest or ""):
        return None
    blob = _bucket().blob(f"{PREFIX}/{digest}.jpg")
    if not blob.exists():
        return None
    try:
        return blob.download_as_bytes()
    except Exception:
        return None
