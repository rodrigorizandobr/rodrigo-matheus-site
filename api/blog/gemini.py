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

# O post tem que caber INTEIRO num post do LinkedIn (linkedin.POST_BUDGET). O modelo
# executa estrutura, não orçamento de palavras: por isso o tamanho é mandado em seções ×
# parágrafos × palavras, e o pior caso destas constantes é medido em test_blog_gemini.py.
SECTIONS = 3
PARAGRAPHS = 2
MIN_PARAGRAPH_WORDS = 40
MAX_PARAGRAPH_WORDS = 50
MAX_TITLE_CHARS = 80
MAX_EXCERPT_CHARS = 200
MAX_HEADING_CHARS = 60

# Quem assina o blog. O modelo escreve NA VOZ dele, e não sobre ele.
VOICE = """Você escreve o blog pessoal de Rodrigo Matheus: 22+ anos em engenharia de
software, liderança de times (40+ pessoas), arquitetura e IA aplicada, com passagem por
Natura&Co, Serviço Federal, Itaú, Santander, Stefanini e Casas Bahia.

O blog é onde ele conta a novidade de tecnologia da semana, em primeira pessoa, do jeito
que contaria para um colega no café: curioso, bem-humorado, com opinião de quem já
tocou time e produção de verdade. Não é um ensaio, não é palestra e não é press release.
O leitor tem que terminar o texto sabendo o que aconteceu, achando graça e com uma opinião
na cabeça — ou, no mínimo, com uma história boa para repetir."""

RULES = f"""REGRAS DE ESCRITA — elas são o motivo deste blog existir:

1. A NOTÍCIA PRIMEIRO. O post conta UMA história concreta: quem fez o quê, quando, com que
   número. O primeiro parágrafo já diz o que aconteceu, em português simples, para quem
   nunca ouviu falar do assunto. Só depois vêm a graça e a opinião.
2. TÍTULO é manchete, não tese. A fórmula: o nome de quem protagonizou (empresa, produto,
   foguete, robô) + um verbo concreto + o detalhe que estranha, em até {MAX_TITLE_CHARS} caracteres, de
   modo que dê vontade de clicar. PROIBIDO o molde de ensaio: "A ilusão de…", "O mito de…",
   "Por que X exige Y", "X revela Y", "O fim de…", "O paradoxo…", "A verdade sobre…", e
   título feito só de substantivos abstratos (soberania, maturidade, arquitetura,
   conformidade). PROIBIDO também o clichê de manchete: "mudou o jogo", "revoluciona",
   "o futuro de…", "gigante". Se o título coubesse em qualquer notícia do ano, reescreva-o
   com o nome da coisa. Escreva o título só a partir da história, sem moldes.
3. `excerpt` é o gancho: uma ou duas frases, em até {MAX_EXCERPT_CHARS} caracteres, que contam o que
   aconteceu e deixam a curiosidade aberta. Nunca um resumo de tese.
4. HUMOR. Seco, observador, com ironia leve e comparações do dia a dia de quem trabalha com
   software, inventadas para ESTA história. No máximo uma ou duas tiradas por seção, sempre
   ligadas ao fato — nada de piada de manual, meme forçado ou
   exclamação em excesso. O humor não inventa fato: a graça está em relatar com
   precisão algo que já é estranho. Assunto sério (vazamento, morte, demissão em massa)
   pede tom sério. COMPARAÇÕES BATIDAS estão proibidas por já terem virado carimbo do
   blog: subir para produção na sexta-feira, o estagiário que apaga os logs ou refatora o
   monolito, o café, "férias coletivas" do servidor, "chorar abraçado ao monitor". Se a
   piada já caberia em outro post, troque-a por uma que só serve a este.
5. LINGUAGEM. Frases curtas, voz ativa, palavra de conversa. Explique sigla ou termo
   técnico em meia frase na primeira vez. Proibido jargão de consultoria: "paradigma",
   "robusto", "sinergia", "ecossistema", "alavancar", "cenário", "player", "disruptivo",
   "jornada", "em um mundo cada vez mais…", "a IA veio para ficar".
6. ESTRUTURA, em regra concreta: {SECTIONS} seções, cada uma com {PARAGRAPHS} parágrafos de
   {MIN_PARAGRAPH_WORDS} a {MAX_PARAGRAPH_WORDS} palavras. O post inteiro vai de uma vez para o LinkedIn, que não aceita
   texto longo: passar dessas medidas é cortar o fim do post. Cada parágrafo diz UMA coisa e
   para. (1) a notícia contada do começo ao fim; (2) o detalhe mais estranho, curioso ou
   engraçado da história; (3) a leitura do Rodrigo, o que ele pensa disso como quem
   constrói software e lidera time, ancorada num fato do material, fechando com uma
   previsão com ousadia ou uma pergunta específica DESTA história, nunca uma reflexão
   genérica sobre o futuro. Proibido fechar com "O tempo dirá", "Resta saber", "Seja como
   for", "No fim das contas", "Até onde vamos…". Cada `heading` é uma frase curta, de até
   {MAX_HEADING_CHARS} caracteres, tirada de um nome, número ou imagem do texto daquela seção; nunca um rótulo
   nem o papel da seção. PROIBIDO como título: "O que muda para…", "Até onde vai…", "Até
   que ponto…", "O que aconteceu", "Contexto", "Conclusão".
7. OPINIÃO COM LASTRO. Deixe claro o que é opinião, com verbos de quem opina ("acho",
   "aposto", "desconfio"). Onde houver o outro
   lado, dê a ele uma frase honesta. Boato ou notícia sem confirmação vira "segundo o
   veículo X", nunca fato.
8. SEM MARCAÇÃO. Texto puro nos parágrafos: nada de HTML, markdown, asteriscos ou emoji.
9. OS DOIS IDIOMAS DIZEM O MESMO. `en` é a versão em inglês do mesmo post, escrita como
   original em inglês, com o mesmo humor — não tradução literal, e jamais conteúdo diferente.
10. MATERIAL DE APOIO. Fatos, números, datas e nomes próprios saem do material, nunca da sua
   memória: você não conhece o que saiu esta semana, e afirmar o que não está no material é
   criar uma citação falsa (as fontes são listadas no fim do post, em ABNT). Sem material,
   conte uma história vivida na carreira do Rodrigo a partir do currículo e evite números
   que não estejam nele. Quando a experiência dele ajudar a entender a notícia, use-a numa
   frase ("já vi time inteiro cair nessa") — sem inventar episódio, empresa ou número.
11. IMAGEM. `imagePrompt` em INGLÊS. A capa é uma METÁFORA VISUAL da história, não o retrato
   do assunto. Fórmula: pegue UMA imagem que já está no seu texto (o detalhe mais estranho,
   o número, a comparação da seção 2) e transforme-a numa cena física, montada com objetos
   reais e concretos, em escala de mesa ou de maquete, com um sujeito, uma ação e uma
   tensão visível: algo prestes a cair, encaixar, escapar, quebrar ou pesar demais. Quem vê a
   capa tem que sentir a ironia da notícia antes de ler o título. Se a capa coubesse em
   qualquer notícia de tecnologia, reescreva-a com o objeto e a tensão desta história.
   O vermelho é o ÚNICO acento saturado e cai sobre o objeto que carrega a ideia (o que
   escapa, o que quebra, o que pesa), nunca sobre uma luzinha decorativa. O ambiente é limpo,
   claro, de pesquisa de alta tecnologia, mas é só pano de fundo: o sujeito é a metáfora.
   PROIBIDO como ideia da capa: rack de servidor, corredor de data center, sala branca vazia
   com um objeto brilhante no centro, "futuristic glowing", cérebro, rede neural ou placa de
   circuito genéricos, braço robótico genérico, uma luz vermelha sozinha como conceito.
   Fotorrealista e sem texto. Escreva 2 a 4 frases: o sujeito, o que
   ele faz e o enquadramento, que muda de um post para outro.
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
            "temperature": 0.9,
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


def _avoid_covers_block(prompts: list[str]) -> str:
    """As capas já no ar: sem memória entre chamadas, o modelo recairia na mesma composição."""
    limpos = [p.strip() for p in (prompts or []) if (p or "").strip()]
    if not limpos:
        return ""
    lista = "\n".join(f"- {p}" for p in limpos[:8])
    return (
        "\nCAPAS JÁ USADAS (o `imagePrompt` novo tem que ser outra ideia, outro sujeito e "
        f"outro enquadramento, não uma variação destas):\n{lista}\n"
    )


def generate_post(topic: str, context: str = "", avoid_titles: list[str] | None = None,
                  avoid_covers: list[str] | None = None, author_topic: bool = False) -> dict[str, Any]:
    """Escreve um post inteiro (pt+en) sobre `topic`.

    `context` é o material de apoio (pesquisa na web ou o currículo) e
    `avoid_titles` são os títulos já no ar, para não repetir assunto, e `avoid_covers` os
    prompts das capas já no ar, para não repetir imagem. `author_topic` marca o tema
    escolhido pelo autor: o post é sobre ELE, e o material só fundamenta.
    """
    if author_topic:
        cabecalho = f"""TEMA DO AUTOR: {topic}
(O autor escolheu este tema: o post é sobre ELE, não troque de assunto. Se o tema for amplo,
escolha UM ângulo concreto dentro dele e conte esse, com os nomes, datas e números do material.
Não é título nem tese pronta.)"""
        material = (f'MATERIAL DE APOIO — pesquisa feita agora na internet sobre o tema. Apoie os fatos nele, não copie o texto, e não afirme nada que ele não sustente. Se o ângulo escolhido já virou post (lista abaixo), escolha outro:{chr(10)}{context}{chr(10)}'
                    if context.strip() else '')
    else:
        cabecalho = f"""ASSUNTO VIGIADO: {topic}
(Este é o assunto que a pauta está de olho, não é o título nem a tese. Quem decide a
história é o material abaixo.)"""
        material = (f'MATERIAL DE APOIO — apoie os fatos nele, não copie o texto. Ele costuma trazer várias notícias sobre o mesmo nome: escolha UMA — a mais curiosa, inusitada ou engraçada, a que alguém contaria num jantar — e conte só ela. As outras servem de contexto. Se a história escolhida já virou post (lista abaixo), escolha outra:{chr(10)}{context}{chr(10)}'
                    if context.strip() else '')
    prompt = f"""{cabecalho}

{material}{_avoid_block(avoid_titles or [])}{_avoid_covers_block(avoid_covers or [])}
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
