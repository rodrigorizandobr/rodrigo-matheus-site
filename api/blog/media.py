"""Biblioteca de mídia do blog.

Tudo que entra — upload, geração por IA ou banco de imagens — é **regravado como
JPEG nosso** e catalogado. Nunca se linka o arquivo de terceiro: a URL de origem
pode sumir ou virar 403 e o post ficaria com imagem quebrada para sempre.

O nome do arquivo é o sha256 do JPEG final (`blog-images/<hash>.jpg`): a mesma
imagem duas vezes não duplica objeto nem entrada no catálogo, e a URL é imutável,
então pode ser cacheada para sempre.

`blog_media` no Firestore é só o índice — o arquivo mora no GCS.
"""
from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime, timezone
from typing import Any

from PIL import Image

from .gcs import get_bucket
from .store import POSTS, _db

COLLECTION = "blog_media"
PREFIX = "blog-images"
MAX_SIDE = 1920
JPEG_QUALITY = 86
#: 4:4:4 — sem subamostragem de croma. O acento do site é vermelho puro sobre
#: branco, e é exatamente essa borda que 4:2:0 borra.
JPEG_SUBSAMPLING = 0
HASH_RE = re.compile(r"^[0-9a-f]{64}$")

EDITABLE = ("alt", "credit", "sourceUrl")


class InUseError(RuntimeError):
    """Imagem em uso por algum post. Apagar deixaria o post sem capa sem avisar ninguém."""


def _bucket():
    return get_bucket()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jpeg(raw: bytes) -> tuple[bytes, int, int] | None:
    """Normaliza qualquer entrada para um JPEG dentro do lado máximo.

    O arquivo final é remontado **só a partir dos pixels**: EXIF, XMP, IPTC,
    perfil de cor, comentário e qualquer bloco de proveniência da origem ficam
    para trás. A capa é material editorial do site — não carrega ficha técnica de
    quem a produziu, nem para imagem de IA, nem para foto de banco de imagens.
    """
    try:
        origem = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return None

    if max(origem.size) > MAX_SIDE:
        scale = MAX_SIDE / max(origem.size)
        origem = origem.resize((round(origem.width * scale), round(origem.height * scale)), Image.LANCZOS)

    # imagem nova a partir dos bytes de pixel: nada do `info` da origem viaja junto
    img = Image.frombytes("RGB", origem.size, origem.tobytes())

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True,
             progressive=True, subsampling=JPEG_SUBSAMPLING)
    return buf.getvalue(), img.width, img.height


def store_image(raw: bytes, provider: str, alt: str = "", credit: str = "",
                source_url: str = "", prompt: str = "") -> dict[str, Any] | None:
    """Grava e cataloga. Devolve o item da biblioteca, ou None se não for imagem."""
    normalized = _jpeg(raw)
    if not normalized:
        return None
    data, width, height = normalized

    digest = hashlib.sha256(data).hexdigest()
    blob = _bucket().blob(f"{PREFIX}/{digest}.jpg")
    if not blob.exists():
        blob.cache_control = "public, max-age=31536000, immutable"
        blob.upload_from_string(data, content_type="image/jpeg")

    existing = get_media(digest)
    if existing:
        return existing

    item = {
        "hash": digest, "provider": provider, "alt": alt, "credit": credit,
        "sourceUrl": source_url, "prompt": prompt,
        "width": width, "height": height, "bytes": len(data),
        "createdAt": _now(),
    }
    _db().collection(COLLECTION).document(digest).set(item)
    return item


def get_media(digest: str) -> dict[str, Any] | None:
    if not HASH_RE.match(digest or ""):
        return None
    snap = _db().collection(COLLECTION).document(digest).get()
    return snap.to_dict() if snap.exists else None


def list_media() -> list[dict[str, Any]]:
    rows = [s.to_dict() for s in _db().collection(COLLECTION).stream()]
    items = [r for r in rows if r]
    items.sort(key=lambda m: m.get("createdAt") or _now(), reverse=True)
    return items


def update_media(digest: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    """Só legenda, crédito e origem mudam. Hash, tamanho e provedor descrevem o arquivo."""
    if not get_media(digest):
        return None
    clean = {k: v for k, v in (patch or {}).items() if k in EDITABLE}
    if clean:
        _db().collection(COLLECTION).document(digest).update(clean)
    return get_media(digest)


def posts_using(digest: str) -> list[str]:
    """Slugs dos posts que usam esta imagem."""
    using = []
    for snap in _db().collection(POSTS).stream():
        post = snap.to_dict() or {}
        if (post.get("image") or {}).get("hash") == digest:
            using.append(post.get("slug", snap.id))
    return using


def delete_media(digest: str) -> None:
    using = posts_using(digest)
    if using:
        raise InUseError(f"imagem em uso por {len(using)} post(s): {', '.join(using[:3])}")
    if not HASH_RE.match(digest or ""):
        return
    _db().collection(COLLECTION).document(digest).delete()
    blob = _bucket().blob(f"{PREFIX}/{digest}.jpg")
    if blob.exists():
        blob.delete()


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


def as_cover(item: dict[str, Any] | None) -> dict[str, Any] | None:
    """Recorte que vai gravado no post — o post não guarda o catálogo inteiro."""
    if not item:
        return None
    recorte = {k: item.get(k, "") for k in ("hash", "provider", "credit", "sourceUrl", "alt")}
    # dimensões viajam junto: o og:image declarado dá cartão grande no LinkedIn
    recorte["width"] = item.get("width", 0)
    recorte["height"] = item.get("height", 0)
    return recorte
