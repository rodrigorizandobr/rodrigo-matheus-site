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
from urllib.parse import urlparse

import requests

SERPER_KEY = os.environ.get("SERPER_API_KEY", "")
#: Endpoint de NOTÍCIAS, não a busca geral: o blog fala do que é novidade, e a busca
#: web devolveria páginas institucionais e conteúdo antigo bem posicionado em SEO.
SERPER_URL = "https://google.serper.dev/news"
#: Brasil, em português — o leitor é daqui e a pauta é o mercado brasileiro.
COUNTRY = "br"
LOCALE = "pt-br"

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

# Termo técnico em português é também NOME DE PROFISSÃO, então a busca de notícias
# devolve anúncio de vaga, curso e concurso junto. Medido: "arquitetura de software"
# trouxe 3 em 10; "vazamento de dados", 0 em 10. Filtrar pelo TÍTULO (não pelo trecho,
# que gera falso positivo) tira o que sobra — e impede que um anúncio de emprego seja
# citado como fonte no fim do post.
_NOISE = re.compile(
    r"\b("
    r"vagas?|concursos?|editais?|edital|inscri\w+|cursos?|bolsas?|sal[áa]rios?|"
    r"contrat(a|am|ando|a[çc][ãa]o)|est[áa]gios?|trainee|processo seletivo|"
    r"seleç[ãa]o p[úu]blica|carreira e sal[áa]rio"
    r")\b",
    re.I,
)


def is_noise(title: str) -> bool:
    """Anúncio de vaga, curso ou concurso — não é notícia e não serve de fonte."""
    return bool(_NOISE.search(title or ""))


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
    #: {url, title, site} de cada fonte — é o que permite citar em ABNT no fim do post
    references: list[dict[str, str]] = field(default_factory=list)
    pages_read: int = 0
    snippets: int = 0


def site_of(url: str) -> str:
    """Nome do site a partir da URL, sem `www`/`www1` — vira o autor na citação ABNT."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""
    return re.sub(r"^www\d*\.", "", host)


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
            json={"q": query, "num": RESULTS_PER_QUERY, "gl": COUNTRY, "hl": LOCALE},
            timeout=SEARCH_TIMEOUT,
        )
        if not res.ok:
            return []
        payload = res.json() or {}
        # `news` é o campo do endpoint de notícias; `organic` fica como tolerância
        # caso a chave caia para a busca comum.
        results = payload.get("news") or payload.get("organic") or []
    except Exception:
        return []

    out = []
    for item in results:
        link = (item or {}).get("link")
        if not isinstance(link, str) or not link:
            continue
        if is_noise(str(item.get("title") or "")):
            continue
        out.append({
            "link": link,
            "title": str(item.get("title") or ""),
            "snippet": str(item.get("snippet") or ""),
            # o endpoint de notícias traz veículo e data; ambos entram na citação
            "source": str(item.get("source") or ""),
            "date": str(item.get("date") or ""),
        })
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
    candidatos = items[:PAGES_TO_READ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        lidas = list(pool.map(_read_page, [i["link"] for i in candidatos]))
    pages = [p for p in lidas if p]
    # só quem foi lido de fato vira referência: o texto se apoiou nesta página
    lidos = [item for item, texto in zip(candidatos, lidas) if texto]

    snippets = [f"{i['title']}. {i['snippet']}" for i in items
                if len(f"{i['title']}. {i['snippet']}") > MIN_SNIPPET_CHARS]

    context = "\n\n---\n\n".join([*pages, *snippets])[:MAX_CONTEXT_CHARS]
    references = [{"url": i["link"], "title": i["title"],
                   "site": i.get("source") or site_of(i["link"]),
                   "published": i.get("date", "")} for i in lidos]
    return Research(context=context, sources=[i["link"] for i in items], references=references,
                    pages_read=len(pages), snippets=len(snippets))


def news_queries(term: str, year: int | None = None) -> list[str]:
    """Consultas de notícia para um termo.

    Curtas de propósito: o endpoint já é de notícias e já está restrito ao Brasil,
    então o termo puro traz o que saiu; acrescentar palavras só estrangula o buscador.
    """
    term = (term or "").strip()
    if not term:
        return []
    year = year or datetime.now(timezone.utc).year
    return [term, f"{term} {year}"]
