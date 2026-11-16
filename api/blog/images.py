"""Origens de imagem para o blog: IA (Runway ou Gemini) e banco de imagens (Pixabay).

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

# Runway (pedido do PO, 2026-11-16): mesma capa, mais barata. O padrão é o Nano Banana 2.1, o modelo
# que gerou as capas com o fio que o PO aprovou: 4 créditos em 1K (US$ 0,04, a US$ 0,01 o crédito),
# contra US$ 0,094 direto no Gemini. No Runway o tamanho é escolhido pelo `ratio` (não há campo de
# resolução neste modelo): 1376:768 é o 16:9 da faixa de 1K, o mesmo tamanho que a capa já tinha.
# Trocar de modelo é trocar a variável — mas cada modelo tem a própria lista de `ratio`: confira na
# documentação antes, e compare a capa (modelo mais barato muda o traço).
RUNWAY_KEY = os.environ.get("RUNWAYML_API_SECRET", "")
RUNWAY_MODEL = os.environ.get("BLOG_RUNWAY_MODEL", "nano_banana_2.1")
RUNWAY_RATIO = os.environ.get("BLOG_RUNWAY_RATIO", "1376:768")
#: o SDK espera dez minutos por padrão; a geração do post inteiro tem que caber numa requisição.
#: Estourar o prazo NÃO cancela a tarefa no Runway (ela pode terminar e ser cobrada mesmo assim).
RUNWAY_WAIT_SECONDS = 180
#: "runway" ou "gemini" força; vazio = Runway se houver chave dele, senão Gemini
PROVIDER_CHOICE = os.environ.get("BLOG_IMAGE_PROVIDER", "").strip().lower()

# A paleta e as proibições do site, coladas em todo prompt de capa. O CENÁRIO não mora
# aqui: descrever "laboratório com detalhes biomecânicos" em todo prompt puxava toda capa
# para o mesmo lugar. Quem decide a cena é o `imagePrompt` de cada post (metáfora da história).
ART_DIRECTION = (
    "Editorial cover photograph, photorealistic, 16:9. Clean, bright, clinical high-tech "
    "research look: white and pale-grey surfaces, soft diffuse light, precise real materials. "
    "The ONLY saturated color is a single red thread (cotton thread or string) that takes "
    "part in the action of the scene; nothing else in the frame is red. No text, "
    "no letters, no logos. The scene below is a visual metaphor: compose "
    "it as described, with one clear subject."
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


def provider() -> str:
    """Quem desenha a capa. Mesmo desenho de `gemini.provider()`: a variável força, a chave decide."""
    if PROVIDER_CHOICE in ("runway", "gemini"):
        return PROVIDER_CHOICE
    return "runway" if RUNWAY_KEY else "gemini"


def _runway_client() -> Any:
    # SDK oficial, importado só aqui: quem roda sem o Runway não precisa dele carregado.
    from runwayml import RunwayML
    return RunwayML(api_key=RUNWAY_KEY)


def _ask_runway(prompt: str) -> bytes | None:
    """Uma tarefa no Runway, esperada pelo próprio SDK. Tarefa que falha (inclusive por moderação) ou
    estoura o prazo levanta `TaskFailedError`/`TaskTimeoutError`: quem chama trata como "sem imagem" e
    NUNCA reenvia sozinho — tarefa falha também é cobrada."""
    tarefa = _runway_client().text_to_image.create(
        model=RUNWAY_MODEL, ratio=RUNWAY_RATIO, prompt_text=f"{ART_DIRECTION}\n\nSCENE: {prompt}",
    ).wait_for_task_output(timeout=RUNWAY_WAIT_SECONDS)
    saida = getattr(tarefa, "output", None) or []
    if not saida:
        return None
    # o link do resultado expira em um ou dois dias: baixa agora, e `media.store_image` guarda no nosso bucket
    baixada = requests.get(saida[0], timeout=TIMEOUT)
    return baixada.content if baixada.ok and baixada.content else None


def _sources() -> list[tuple[str, Any]]:
    """Quem tentar, em ordem. Runway primeiro quando é ele o escolhido; o Gemini fica de reserva:
    post sem capa (ou com foto de banco de imagens) é pior do que uma capa pelo caminho antigo."""
    fontes: list[tuple[str, Any]] = []
    if provider() == "runway" and RUNWAY_KEY:
        fontes.append(("runway", _ask_runway))
    if API_KEY:
        for modelo in (m for m in (IMAGE_MODEL, IMAGE_MODEL_FALLBACK) if m):
            fontes.append(("gemini", lambda p, m=modelo: _ask_model(m, p)))
    return fontes


def generate_image(prompt: str, alt: str = "") -> dict[str, Any] | None:
    """Gera a capa na direção de arte do site e cataloga.

    Sem crédito: a capa é ilustração editorial do site, não citação de terceiro.
    Crédito existe para dar a quem é devido — banco de imagens tem, ilustração
    da casa não tem.
    """
    for nome, pedir in _sources():
        try:
            raw = pedir(prompt)
        except Exception:
            raw = None
        if raw:
            return media.store_image(raw, provider=nome, alt=alt, credit="", prompt=prompt)
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
