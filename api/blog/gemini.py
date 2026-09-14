"""Geração e revisão de posts com o Gemini Flash Lite.

Um post é UM documento bilíngue produzido numa chamada só: pedir português e
inglês em duas chamadas dobra o custo e deixa as duas versões dizendo coisas
diferentes. O retorno é JSON estruturado (`responseSchema`), nunca texto livre —
o corpo do post são seções (título + parágrafos), e não HTML solto, para o site
renderizar sem sanitizar e sem confiar em marcação vinda do modelo.
"""
from __future__ import annotations

import json
import os
from typing import Any

import requests

from . import model

API_KEY = os.environ.get("GEMINI_API_KEY", "")
BASE = "https://generativelanguage.googleapis.com/v1beta"
TEXT_MODEL = os.environ.get("BLOG_TEXT_MODEL", "gemini-3.5-flash-lite")
TIMEOUT = 120

# Teto alto de propósito: post cortado no meio foi o defeito mais comum no
# projeto irmão, e um post de duas línguas gasta o dobro de saída.
MAX_OUTPUT_TOKENS = 16384


class GeminiError(RuntimeError):
    """Falha de chamada, cota ou resposta vazia — nunca vira post pela metade."""


_SECTION = {
    "type": "OBJECT",
    "properties": {
        "heading": {"type": "STRING"},
        "paragraphs": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["heading", "paragraphs"],
}

_BODY = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING"},
        "excerpt": {"type": "STRING"},
        "sections": {"type": "ARRAY", "items": _SECTION},
    },
    "required": ["title", "excerpt", "sections"],
}

POST_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "slugBase": {"type": "STRING"},
        "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
        "imagePrompt": {"type": "STRING"},
        "imageAlt": {"type": "STRING"},
        "pt": _BODY,
        "en": _BODY,
    },
    "required": ["slugBase", "tags", "imagePrompt", "imageAlt", "pt", "en"],
}

# Quem assina o blog. O modelo escreve NA VOZ dele, e não sobre ele.
VOICE = """Você escreve o blog pessoal de Rodrigo Matheus: 22+ anos em engenharia de
software, liderança de times de alta performance (40+ pessoas, 16+ liderando), arquitetura
e IA aplicada, com passagem por Natura&Co, Serviço Federal, Itaú, Santander, Stefanini e
Casas Bahia. Escreve em primeira pessoa, com autoridade de quem executou."""

RULES = """REGRAS DE ESCRITA — leia com atenção, elas são o motivo deste blog existir:

1. TAMANHO, em regra concreta: 4 seções, cada uma com 3 parágrafos, cada parágrafo com
   70 a 110 palavras. Isso dá cerca de 800 a 1.300 palavras por idioma. Parágrafo de duas
   linhas não desenvolve ideia nenhuma — desenvolva o raciocínio até o fim antes de passar
   para a próxima seção.
2. PROFUNDO. Cada parágrafo carrega uma afirmação que possa ser discordada. Se um parágrafo
   pudesse aparecer em qualquer artigo sobre o tema, apague-o e escreva outro.
3. NADA DE SUPERFICIALIDADE. Proibido: "em um mundo cada vez mais digital", "a IA veio
   para ficar", listas de benefícios genéricos, conclusões que repetem a introdução.
4. ESPECIFICIDADE. Traga números, trade-offs, nomes de tecnologias, o que deu errado.
   Prefira "reduzimos o deploy de 40 para 6 minutos movendo X" a "melhoramos a eficiência".
5. TESE. O post defende UMA ideia. O título diz qual é. A primeira seção já entra nela,
   sem aquecimento.
6. ESTRUTURA. Cada `heading` é uma frase com conteúdo, não um rótulo
   ("Por que medimos a coisa errada" e não "Métricas").
7. HONESTIDADE. Se algo é opinião, diga. Se tem contra-argumento, apresente-o.
8. SEM MARCAÇÃO. Texto puro nos parágrafos: nada de HTML, markdown, asteriscos ou emoji.
9. OS DOIS IDIOMAS DIZEM O MESMO. `en` é a versão em inglês do mesmo post, escrita como
   original em inglês — não tradução literal, e jamais um conteúdo diferente.
10. MATERIAL DE APOIO. Quando ele vier junto, o texto se apoia NELE: fatos, números e nomes
   próprios têm de sair do material, não da sua memória. As fontes são listadas no fim do post,
   em ABNT, e ficam visíveis ao leitor — afirmar o que não está no material é criar uma citação
   falsa. Sem material, escreva do seu repertório e evite números específicos.
11. IMAGEM. `imagePrompt` em INGLÊS, descrevendo uma cena para a capa na direção de arte do
   site: laboratório branco extremamente esterilizado, superfícies brancas, elementos
   biomecânicos, vermelho como ÚNICO acento, fotorrealista, sem texto e sem pessoas.
   `imageAlt` em português, descrevendo a imagem para quem não a vê."""


def _call(prompt: str, system: str) -> dict[str, Any]:
    if not API_KEY:
        raise GeminiError("GEMINI_API_KEY não configurada no serviço")

    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": POST_SCHEMA,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "temperature": 0.85,
        },
    }
    res = requests.post(
        f"{BASE}/models/{TEXT_MODEL}:generateContent",
        headers={"x-goog-api-key": API_KEY, "content-type": "application/json"},
        json=body,
        timeout=TIMEOUT,
    )
    if not res.ok:
        raise GeminiError(f"Gemini respondeu {res.status_code}: {res.text[:300]}")

    data = res.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise GeminiError("Gemini devolveu resposta sem conteúdo (candidates vazio)")

    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts)
    if not text.strip():
        raise GeminiError("Gemini devolveu resposta sem conteúdo (texto vazio)")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:  # schema não garante JSON válido se a saída cortar
        raise GeminiError(f"JSON inválido do Gemini: {exc}") from exc


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """Aplica as mesmas regras do núcleo puro — geração e revisão saem idênticas daqui."""
    i18n = {}
    for lang in model.LANGS:
        body = raw.get(lang) or {}
        i18n[lang] = {
            "title": (body.get("title") or "").strip(),
            "excerpt": (body.get("excerpt") or "").strip(),
            "sections": model.clean_sections(body.get("sections") or []),
        }
    return {
        "slugBase": model.slugify(raw.get("slugBase") or i18n["pt"]["title"]),
        "tags": model.clean_tags(raw.get("tags") or []),
        "imagePrompt": (raw.get("imagePrompt") or "").strip(),
        "imageAlt": (raw.get("imageAlt") or "").strip(),
        "i18n": i18n,
        "model": TEXT_MODEL,
    }


def _avoid_block(titles: list[str]) -> str:
    """Os títulos já publicados, para o modelo não reescrever o mesmo post.

    Sem isso, dois posts gerados a partir do mesmo termo de notícia saem quase
    iguais — o modelo não tem memória entre chamadas, então a memória vai no prompt.
    """
    limpos = [t.strip() for t in (titles or []) if (t or "").strip()]
    if not limpos:
        return ""
    lista = "\n".join(f"- {t}" for t in limpos[:20])
    return (
        f"\nJÁ PUBLICADOS (NÃO repita estes assuntos nem reescreva estes textos; "
        f"se o tema for próximo, ataque um ângulo diferente e diga algo novo):\n{lista}\n"
    )


def generate_post(topic: str, context: str = "", avoid_titles: list[str] | None = None) -> dict[str, Any]:
    """Escreve um post inteiro (pt+en) sobre `topic`.

    `context` é o material de apoio (pesquisa na web ou o currículo) e
    `avoid_titles` são os títulos já no ar, para não repetir assunto.
    """
    prompt = f"""TEMA DO POST: {topic}

{f'MATERIAL DE APOIO — apoie os fatos nele, não copie o texto:{chr(10)}{context}{chr(10)}' if context.strip() else ''}{_avoid_block(avoid_titles or [])}
Escreva o post completo em português e em inglês, seguindo as regras."""
    return _normalize(_call(prompt, f"{VOICE}\n\n{RULES}"))


def revise_post(post: dict[str, Any], instruction: str) -> dict[str, Any]:
    """Reescreve um post existente seguindo uma instrução em linguagem natural."""
    atual = json.dumps(
        {"tags": post.get("tags", []), **{l: (post.get("i18n") or {}).get(l, {}) for l in model.LANGS}},
        ensure_ascii=False,
    )
    prompt = f"""POST ATUAL (JSON):
{atual}

INSTRUÇÃO DO AUTOR: {instruction}

Devolva o post inteiro revisado, nos dois idiomas, no mesmo formato. Mantenha o que a
instrução não pediu para mudar — isto é uma edição, não um post novo."""
    return _normalize(_call(prompt, f"{VOICE}\n\n{RULES}"))
