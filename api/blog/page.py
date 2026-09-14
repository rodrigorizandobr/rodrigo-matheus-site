"""A página /blog/<slug> servida pelo backend, só para acertar as metatags.

Por que não gerar HTML estático no build, como antes: o post agora pode entrar
no ar SOZINHO (agendamento), horas depois do último deploy. Uma prévia de link
gerada no build mostraria o card genérico do site para todo post novo.

O React continua sendo quem desenha a página; aqui só trocamos `<title>` e as
`og:*` do shell. E o HTML sai com `s-maxage`, então a CDN do Firebase Hosting
responde quase todas as visitas — o Cloud Run só é acionado de tempos em tempos.

O shell é o `index.html` do build, publicado no GCS pelo deploy.sh: o container
da API não tem acesso ao `web/dist`.
"""
from __future__ import annotations

import re
import time
from html import escape

from flask import Blueprint, Response, redirect

from . import store
from .gcs import get_bucket

bp = Blueprint("blog_page", __name__)

SITE = "https://rodrigomatheus.com.br"
SHELL_BLOB = "spa-shell.html"
SHELL_TTL = 300  # o shell só muda em deploy

_cache: dict[str, object] = {"html": None, "at": 0.0}


def _shell() -> str | None:
    """`index.html` do build, guardado no GCS. Memoizado por alguns minutos."""
    if _cache["html"] and time.time() - float(_cache["at"]) < SHELL_TTL:
        return str(_cache["html"])
    try:
        blob = get_bucket().blob(SHELL_BLOB)
        if not blob.exists():
            return None
        html = blob.download_as_bytes().decode("utf-8")
    except Exception:
        return None
    _cache["html"], _cache["at"] = html, time.time()
    return html


def _replace_meta(html: str, prop: str, value: str) -> str:
    pattern = rf'(<meta property="{re.escape(prop)}" content=")[^"]*(")'
    return re.sub(pattern, lambda m: m.group(1) + escape(value, quote=True) + m.group(2), html, count=1)


@bp.get("/sitemap.xml")
def sitemap():
    """Sempre com os posts do momento — um post publicado pelo agendador entra aqui na hora."""
    urls = [
        f"  <url><loc>{SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>",
        f"  <url><loc>{SITE}/blog</loc><changefreq>daily</changefreq><priority>0.7</priority></url>",
    ]
    for post in store.list_public_posts():
        when = post.get("publishedAt")
        lastmod = f"<lastmod>{when.date().isoformat()}</lastmod>" if when else ""
        urls.append(
            f"  <url><loc>{SITE}/blog/{escape(post['slug'])}</loc>{lastmod}"
            f"<changefreq>monthly</changefreq><priority>0.6</priority></url>"
        )
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    return Response(xml, mimetype="application/xml",
                    headers={"Cache-Control": "public, s-maxage=3600, max-age=0"})


@bp.get("/blog/<slug>")
def blog_post_page(slug: str):
    html = _shell()
    if html is None:
        # Sem shell (deploy a meio caminho) o melhor é deixar o Hosting servir o SPA.
        return redirect(f"/blog/#{slug}", code=302)

    post = store.get_public_post(slug)
    if not post:
        # Devolve o app mesmo assim: quem renderiza "LOG NOT FOUND" é o React.
        return Response(html, status=404, mimetype="text/html",
                        headers={"Cache-Control": "public, s-maxage=60, max-age=0"})

    body = (post.get("i18n") or {}).get("pt") or (post.get("i18n") or {}).get("en") or {}
    title = body.get("title") or "Blog"
    excerpt = body.get("excerpt") or ""
    image = post.get("image")
    url = f"{SITE}/blog/{slug}"

    out = re.sub(r"<title>[^<]*</title>", f"<title>{escape(title)} — Rodrigo Matheus</title>", html, count=1)
    out = re.sub(r'(<meta name="description" content=")[^"]*(")',
                 lambda m: m.group(1) + escape(excerpt, quote=True) + m.group(2), out, count=1)
    out = _replace_meta(out, "og:title", title)
    out = _replace_meta(out, "og:description", excerpt)
    out = _replace_meta(out, "og:type", "article")
    if image:
        out = _replace_meta(out, "og:image", f"{SITE}/api/blog/image/{image['hash']}.jpg")

    published = post.get("publishedAt")
    extra = [f'<meta property="og:url" content="{url}" />', f'<link rel="canonical" href="{url}" />']
    if published:
        extra.append(f'<meta property="article:published_time" content="{published.isoformat()}" />')
    out = out.replace("</head>", "    " + "\n    ".join(extra) + "\n  </head>", 1)

    return Response(out, mimetype="text/html",
                    headers={"Cache-Control": "public, s-maxage=600, max-age=0"})
