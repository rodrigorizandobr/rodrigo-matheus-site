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

import requests
from flask import Blueprint, Response, redirect

from . import store
from .gcs import get_bucket

bp = Blueprint("blog_page", __name__)

SITE = "https://rodrigomatheus.com.br"
SHELL_BLOB = "spa-shell.html"
# Curto de propósito: é o atraso máximo entre um deploy e a página do post passar a
# apontar para o bundle novo. Com 5 minutos, uma requisição que chegasse no meio do
# deploy congelava o shell ANTIGO por todo esse tempo.
SHELL_TTL = 60
SHELL_TIMEOUT = 5
#: marca que prova que veio o shell do app, e não uma página de erro de CDN
SHELL_MARKER = 'id="root"'

_shell_cache: dict[str, object] = {}


def _shell_from_gcs() -> str | None:
    """Cópia gravada pelo deploy. Rede de segurança para quando o site não responde."""
    try:
        blob = get_bucket().blob(SHELL_BLOB)
        if not blob.exists():
            return None
        return blob.download_as_bytes().decode("utf-8")
    except Exception:
        return None


def _shell_from_site() -> str | None:
    """O index.html que o Hosting está servindo AGORA.

    Buscar do próprio site, e não de uma cópia, é o que garante que o shell e os
    assets nunca discordem: é literalmente o mesmo documento que o visitante da home
    recebe. Não há laço — `/` casa com um arquivo estático no Hosting e não volta
    para o Cloud Run.
    """
    try:
        res = requests.get(f"{SITE}/index.html", timeout=SHELL_TIMEOUT,
                           headers={"User-Agent": "rodrigomatheus-blog-shell"})
        if res.ok and SHELL_MARKER in res.text:
            return res.text
    except Exception:
        pass
    return None


def _shell() -> str | None:
    cached = _shell_cache.get("html")
    if cached and time.time() - float(_shell_cache.get("at", 0)) < SHELL_TTL:
        return str(cached)

    html = _shell_from_site() or _shell_from_gcs()
    if html:
        _shell_cache["html"], _shell_cache["at"] = html, time.time()
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
    extra = [f'<meta property="og:url" content="{url}" />', f'<link rel="canonical" href="{url}" />',
             '<meta name="twitter:card" content="summary_large_image" />']
    if image:
        # LinkedIn e WhatsApp só desenham o cartão grande quando o tamanho vem declarado;
        # sem isso eles baixam a imagem, desistem no tempo limite e caem no cartão pequeno.
        if image.get("width") and image.get("height"):
            extra.append(f'<meta property="og:image:width" content="{int(image["width"])}" />')
            extra.append(f'<meta property="og:image:height" content="{int(image["height"])}" />')
        if image.get("alt"):
            extra.append(f'<meta property="og:image:alt" content="{escape(image["alt"], quote=True)}" />')
    if published:
        extra.append(f'<meta property="article:published_time" content="{published.isoformat()}" />')
    out = out.replace("</head>", "    " + "\n    ".join(extra) + "\n  </head>", 1)

    return Response(out, mimetype="text/html",
                    headers={"Cache-Control": "public, s-maxage=120, max-age=0"})
