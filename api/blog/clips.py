"""Escolha do trecho de um vídeo a partir dos quadros marcados — puro, sem rede.

O recorte em si roda no Mac do autor (`clip_worker.py`: o YouTube bloqueia download vindo de
IP de datacenter). Aqui mora só a decisão de QUAL trecho, testável sozinha.

Medido: o Gemini "assistindo" pela URL do YouTube inventa tempo (apontou 37:05 num vídeo de
23:21). Por isso o tempo nunca vem do modelo: vem do quadro que ele marcou, e o quadro tem o
tempo gravado nele. Um quadro a cada `STEP` segundos.
"""
from __future__ import annotations

import json
from typing import Any

STEP = 5
#: menos que isso é piscada, não recorte
MIN_CLIP = 10
#: post de LinkedIn com vídeo longo perde quem rola o feed
MAX_CLIP = 45


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
