"""Pesquisa na web para alimentar o post: Serper (busca do Google) + leitura das páginas.

É OPCIONAL em todo lugar. Sem `SERPER_API_KEY`, ou com a pesquisa desligada na
configuração, a geração segue normalmente escrevendo do próprio repertório — o
post não deixa de sair porque a internet não colaborou.

Duas lições herdadas dos projetos irmãos (monster-jobs e br51, mesma conta Serper):

1. VÁRIAS CONSULTAS CURTAS, não uma longa. Consulta com muitos termos estrangula
   o buscador e volta pobre.
2. OS TRECHOS DA PRÓPRIA BUSCA valem tanto quanto o crawler. O Cloud Run sai de IP
   de datacenter e boa parte dos sites recusa a leitura direta; sem os `snippet`,
   a pesquisa voltaria vazia na maioria das vezes.
"""
from __future__ import annotations

import html as html_lib
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

SERPER_KEY = os.environ.get("SERPER_API_KEY", "")
SERPER_URL = "https://google.serper.dev/search"

SEARCH_TIMEOUT = 10
PAGE_TIMEOUT = 8
RESULTS_PER_QUERY = 6
PAGES_TO_READ = 4
MAX_PAGE_CHARS = 3000
MAX_CONTEXT_CHARS = 12000
MIN_SNIPPET_CHARS = 50

# User-Agent de navegador: com o padrão do `requests` a recusa é quase certa.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

_DROP_BLOCKS = re.compile(
    r"<(script|style|noscript|svg|iframe|form|nav|header|footer)\b[^>]*>.*?</\1>",
    re.S | re.I,
)
_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


@dataclass
class Research:
    context: str = ""
    sources: list[str] = field(default_factory=list)
    pages_read: int = 0
    snippets: int = 0


def extract_text(raw_html: str) -> str:
    """Texto legível de uma página. Regex e não um parser de DOM de propósito:
    o destino é um LLM, não um navegador, e é uma dependência a menos no cold start."""
    without_blocks = _DROP_BLOCKS.sub(" ", raw_html or "")
    text = _TAGS.sub(" ", without_blocks)
    return _SPACES.sub(" ", html_lib.unescape(text)).strip()


def _search(query: str) -> list[dict[str, str]]:
    try:
        res = requests.post(
            SERPER_URL,
            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            json={"q": query, "num": RESULTS_PER_QUERY, "gl": "br", "hl": "pt-br"},
            timeout=SEARCH_TIMEOUT,
        )
        if not res.ok:
            return []
        organic = (res.json() or {}).get("organic") or []
    except Exception:
        return []

    out = []
    for item in organic:
        link = (item or {}).get("link")
        if isinstance(link, str) and link:
            out.append({"link": link, "title": str(item.get("title") or ""),
                        "snippet": str(item.get("snippet") or "")})
    return out


def _read_page(url: str) -> str | None:
    try:
        res = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=PAGE_TIMEOUT)
        if not res.ok or "html" not in (res.headers.get("content-type") or ""):
            return None
        text = extract_text(res.text)
        return text[:MAX_PAGE_CHARS] if text else None
    except Exception:
        return None  # bloqueado, fora do ar ou não é HTML — segue com os outros


def search_web(queries: list[str]) -> Research:
    """Contexto de pesquisa para as consultas dadas. Nunca levanta exceção."""
    if not SERPER_KEY:
        return Research()

    found: dict[str, dict[str, str]] = {}
    for query in queries:
        for item in _search(query):
            found.setdefault(item["link"], item)

    if not found:
        return Research()

    items = list(found.values())
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = [p for p in pool.map(_read_page, [i["link"] for i in items[:PAGES_TO_READ]]) if p]

    snippets = [f"{i['title']}. {i['snippet']}" for i in items
                if len(f"{i['title']}. {i['snippet']}") > MIN_SNIPPET_CHARS]

    context = "\n\n---\n\n".join([*pages, *snippets])[:MAX_CONTEXT_CHARS]
    return Research(context=context, sources=[i["link"] for i in items],
                    pages_read=len(pages), snippets=len(snippets))


def news_queries(term: str, year: int | None = None) -> list[str]:
    """Consultas para achar o que é notícia sobre um termo agora."""
    term = (term or "").strip()
    if not term:
        return []
    year = year or datetime.now(timezone.utc).year
    return [f"notícias {term}", f"{term} {year} tendências", f"{term} novidades recentes"]


def topic_queries(topic: str) -> list[str]:
    """Consultas para dar lastro a um tema da pauta."""
    topic = (topic or "").strip()
    return [topic, f"{topic} na prática"] if topic else []
