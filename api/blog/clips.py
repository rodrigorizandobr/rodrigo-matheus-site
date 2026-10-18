"""Escolha do trecho de um vídeo a partir dos quadros marcados — puro, sem rede.

O recorte em si roda no Mac do autor (`clip_worker.py`: o YouTube bloqueia download vindo de
IP de datacenter). Aqui mora só a decisão de QUAL trecho, testável sozinha.

Medido: o Gemini "assistindo" pela URL do YouTube inventa tempo (apontou 37:05 num vídeo de
23:21). Por isso o tempo nunca vem do modelo: vem do quadro que ele marcou, e o quadro tem o
tempo gravado nele. Um quadro a cada `STEP` segundos.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

STEP = 5
#: menos que isso é piscada, não recorte
MIN_CLIP = 10
#: não é gosto, é limite da plataforma: o vídeo nativo do LinkedIn aceita até 10 minutos. Abaixo
#: disso o assunto decide o tamanho (pedido do PO, 2026-10-17: "sem limite de tempo").
MAX_CLIP = 600


def group_segments(times: list[int], step: int = STEP) -> list[tuple[int, int]]:
    """Tempos marcados → trechos contínuos `(início, fim)`.

    Um buraco de UM quadro não quebra o trecho (o modelo às vezes pula um quadro da mesma
    cena). O fim vai até a próxima amostra: o assunto marcado em t aparece até perto de t+step.
    """
    trechos: list[tuple[int, int]] = []
    for t in sorted(set(times)):
        if trechos and t - (trechos[-1][1] - step) <= 2 * step:
            trechos[-1] = (trechos[-1][0], t + step)
        else:
            trechos.append((t, t + step))
    return trechos


def _window_score(inicio: int, fim: int, scores: dict[int, int]) -> int:
    return sum(n for t, n in scores.items() if inicio <= t < fim)


def rank_segments(segments: list[tuple[int, int]], min_len: int = MIN_CLIP,
                  max_len: int = MAX_CLIP, scores: dict[int, int] | None = None) -> list[tuple[int, int]]:
    """Janelas de até `max_len`, da melhor para a pior, sem sobreposição; curtas demais saem.

    Sem nota, vence a mais longa. Com nota, vence a que SOMA mais nota — medido no Roadster: o
    trecho mais longo era o carro só passando, e o loop e o salto eram um trecho mais curto.
    Empate fica com a mais longa. A lista existe para a conferência: recusou a primeira, tenta
    a segunda antes de trocar de vídeo.
    """
    candidatos = []
    for inicio, fim in segments:
        if fim - inicio < min_len:
            continue
        # janelas começando em cada quadro marcado do trecho
        partidas = sorted(t for t in (scores or {}) if inicio <= t < fim) or [inicio]
        for p in partidas:
            j_fim = min(fim, p + max_len)
            if j_fim - p >= min_len:
                nota = _window_score(p, j_fim, scores) if scores else 0
                candidatos.append((nota, j_fim - p, -p, (p, j_fim)))
    escolhidas: list[tuple[int, int]] = []
    for *_, (p, f) in sorted(candidatos, reverse=True):
        if all(f <= a or p >= b for a, b in escolhidas):
            escolhidas.append((p, f))
    return escolhidas


def choose_segment(segments: list[tuple[int, int]], min_len: int = MIN_CLIP,
                   max_len: int = MAX_CLIP, scores: dict[int, int] | None = None) -> tuple[int, int] | None:
    """A melhor janela de `rank_segments`; nada aproveitável → None."""
    janelas = rank_segments(segments, min_len, max_len, scores)
    return janelas[0] if janelas else None


#: o vídeo único montado a partir de vários recortes: poucos o bastante para ainda contar UMA história
MAX_PARTS = 6
#: partes a menos de tanto uma da outra (segundos) viram uma só — um corte de 2 s no meio não ajuda
PART_GAP = 3
#: uma parte só entra se o assunto aparece nela com pelo menos esta fração da intensidade da melhor
PART_DENSITY = 0.6


def _density(janela: tuple[int, int], scores: dict[int, int]) -> float:
    inicio, fim = janela
    return _window_score(inicio, fim, scores) / max(1, (fim - inicio) / STEP)


def select_parts(segments: list[tuple[int, int]], scores: dict[int, int], max_total: int | None = None,
                 max_parts: int = MAX_PARTS, density: float = PART_DENSITY) -> list[tuple[int, int]]:
    """Os momentos do vídeo que mostram o assunto, da melhor parte para a pior.

    Entra a melhor janela e as outras que são tão boas quanto ela POR SEGUNDO (medido no Roadster:
    o carro só passando, nota 1, não deve vir junto do salto, nota 3). A soma fica sob o teto
    da plataforma; parte que não cabe sai e a seguinte tenta.
    """
    max_total = MAX_CLIP if max_total is None else max_total
    janelas = rank_segments(segments, max_len=max_total, scores=scores)
    if not janelas:
        return []
    melhor = _density(janelas[0], scores)
    escolhidas: list[tuple[int, int]] = []
    total = 0
    for janela in janelas:
        tamanho = janela[1] - janela[0]
        if len(escolhidas) >= max_parts or total + tamanho > max_total:
            continue
        if escolhidas and _density(janela, scores) < density * melhor:
            continue
        escolhidas.append(janela)
        total += tamanho
    return escolhidas


def assemble(parts: list[tuple[int, int]], max_total: int | None = None, max_parts: int = MAX_PARTS,
             gap: int = PART_GAP) -> list[tuple[int, int]]:
    """Partes (da melhor para a pior, já ajustadas às frases) → o que entra no vídeo final, em ordem
    de vídeo. Sobreposição e encosto viram uma parte só ANTES de somar; parte que estoura o teto
    ou o máximo sai, e a mais bem colocada fica."""
    max_total = MAX_CLIP if max_total is None else max_total
    aceitas: list[tuple[int, int]] = []
    for parte in parts:
        candidatas = _merge(aceitas + [parte], gap)
        if len(candidatas) <= max_parts and sum(f - i for i, f in candidatas) <= max_total:
            aceitas = candidatas
    return aceitas


def _merge(parts: list[tuple[int, int]], gap: int) -> list[tuple[int, int]]:
    junto: list[tuple[int, int]] = []
    for inicio, fim in sorted(parts):
        if junto and inicio - junto[-1][1] <= gap:
            junto[-1] = (junto[-1][0], max(junto[-1][1], fim))
        else:
            junto.append((inicio, fim))
    return junto


def parse_scores(text: str, duration: int | None = None) -> dict[int, int]:
    """Lê `{"tempos": [...]}` — cada item é um tempo ou `{"t": tempo, "nota": 1 a 3}`.

    Tempo sem nota vale 1; nota fora da escala é contida em 1..3. O que não é tempo válido sai.
    """
    try:
        bruto: Any = json.loads(text).get("tempos")
    except (ValueError, AttributeError):
        return {}
    if not isinstance(bruto, list):
        return {}
    notas: dict[int, int] = {}
    for item in bruto:
        nota: Any = 1
        if isinstance(item, dict):
            item, nota = item.get("t"), item.get("nota", 1)
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            continue
        t = int(item)
        if t < 0 or (duration is not None and t > duration):
            continue
        if isinstance(nota, bool) or not isinstance(nota, (int, float)):
            nota = 1
        notas[t] = max(1, min(3, int(nota)))
    return notas


def parse_times(text: str, duration: int | None = None) -> list[int]:
    """Só os tempos, na ordem da resposta (aceita o formato com nota)."""
    return list(parse_scores(text, duration))


def hms(seconds: int) -> str:
    """Segundos → "MM:SS" ou "H:MM:SS", o formato do `--download-sections` do yt-dlp."""
    h, resto = divmod(int(seconds), 3600)
    m, s = divmod(resto, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


#: pausa entre duas palavras que fecha a frase quando a legenda não tem pontuação
PAUSE = 2.5
#: o corte só recua/avança até a fronteira de frase se ela estiver a até isto de distância
SNAP_REACH = 15
#: ponta a até isto da borda de uma frase só raspa nela
SNAP_GRAZE = 1.5
_END_OF_SENTENCE = re.compile(r"[.?!][\"')\]]*$")


def parse_captions(data: Any) -> list[tuple[float, float, str]]:
    """Legenda json3 do YouTube → frases `(início, fim, texto)` em segundos.

    Sem a fala o corte só enxerga quadros: num vídeo de explicação (gráfico, animação, alguém
    falando) o assunto está no que é DITO. Legenda ausente ou torta → lista vazia, nunca erro.
    """
    if not isinstance(data, dict):
        return []
    palavras: list[tuple[float, str]] = []
    for ev in data.get("events") or []:
        if not isinstance(ev, dict) or not isinstance(ev.get("tStartMs"), (int, float)):
            continue
        for seg in ev.get("segs") or []:
            texto = str(seg.get("utf8", "")).strip() if isinstance(seg, dict) else ""
            if texto:
                palavras.append(((ev["tStartMs"] + seg.get("tOffsetMs", 0)) / 1000, texto))
    palavras.sort(key=lambda p: p[0])
    grupos: list[list[tuple[float, str]]] = []
    atual: list[tuple[float, str]] = []
    for i, (t, texto) in enumerate(palavras):
        atual.append((t, texto))
        proxima = palavras[i + 1][0] if i + 1 < len(palavras) else None
        if _END_OF_SENTENCE.search(texto) or proxima is None or proxima - t > PAUSE:
            grupos.append(atual)
            atual = []
    frases = []
    for i, g in enumerate(grupos):
        fim = g[-1][0] + 2.0
        if i + 1 < len(grupos):
            fim = min(fim, grupos[i + 1][0][0])
        frases.append((g[0][0], fim, " ".join(p[1] for p in g)))
    return frases


def transcript_text(falas: list[tuple[float, float, str]], start: float | None = None,
                    end: float | None = None, limit: int = 60000) -> str:
    """Frases com o tempo de cada uma, para o prompt; `start`/`end` recortam a região."""
    linhas, total = [], 0
    for ini, fim, texto in falas:
        if (end is not None and ini >= end) or (start is not None and fim <= start):
            continue
        linha = f"[{int(ini)}s] {texto}"
        total += len(linha) + 1
        if total > limit:
            break
        linhas.append(linha)
    return "\n".join(linhas)


def snap_to_sentences(start: int, end: int, falas: list[tuple[float, float, str]],
                      reach: int = SNAP_REACH) -> tuple[int, int]:
    """Corte que abre ou fecha no meio de uma frase soa quebrado (o do Argon abria em "…it can now
    write" e fechava em "Now, in most of the benchmarks"). Ponta no meio da frase leva a frase
    inteira; o INÍCIO que só raspa a cauda da frase anterior avança para a próxima, mas o FIM nunca
    corta uma frase (pedido do PO, 2026-10-17: "pegar a frase completa"). Frase longa demais, corte que fica
    curto demais ou passa do teto da plataforma: o corte fica como veio."""
    novo_inicio, novo_fim = start, end
    for ini, fim, _ in falas:
        if ini < start < fim:
            if fim - start <= SNAP_GRAZE and fim - start < start - ini:
                novo_inicio = math.ceil(fim)
            elif start - ini <= reach:
                novo_inicio = math.floor(ini)
        if ini < end < fim and fim - end <= reach:
            novo_fim = math.ceil(fim)
    if not MIN_CLIP <= novo_fim - novo_inicio <= MAX_CLIP:
        return start, end
    return novo_inicio, novo_fim
