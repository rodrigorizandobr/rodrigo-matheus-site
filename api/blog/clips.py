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


def choose_segment(segments: list[tuple[int, int]], min_len: int = MIN_CLIP,
                   max_len: int = MAX_CLIP) -> tuple[int, int] | None:
    """O trecho mais longo, cortado em `max_len` a partir do início; curto demais → None."""
    if not segments:
        return None
    inicio, fim = max(segments, key=lambda s: s[1] - s[0])
    if fim - inicio < min_len:
        return None
    return inicio, min(fim, inicio + max_len)


def parse_times(text: str, duration: int | None = None) -> list[int]:
    """Lê `{"tempos": [...]}` da resposta do modelo, descartando o que não é tempo válido."""
    try:
        bruto: Any = json.loads(text).get("tempos")
    except (ValueError, AttributeError):
        return []
    if not isinstance(bruto, list):
        return []
    tempos = []
    for t in bruto:
        if isinstance(t, bool) or not isinstance(t, (int, float)):
            continue
        t = int(t)
        if t < 0 or (duration is not None and t > duration):
            continue
        tempos.append(t)
    return tempos


def hms(seconds: int) -> str:
    """Segundos → "MM:SS" ou "H:MM:SS", o formato do `--download-sections` do yt-dlp."""
    h, resto = divmod(int(seconds), 3600)
    m, s = divmod(resto, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"
