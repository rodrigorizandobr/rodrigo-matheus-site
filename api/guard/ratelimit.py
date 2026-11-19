"""Limite de requisições: um balde de fichas por chave. Puro, sem Flask e sem rede.

Cada chave começa com `limit` fichas, gasta uma por chamada e as recupera ao longo de
`per_seconds`. Sem ficha, a chamada é recusada.

A contagem mora na memória do processo. O Cloud Run sobe até 2 instâncias e zera tudo ao
dormir, então o teto real é "até o dobro do limite, por instância acordada": serve para segurar
abuso, não para contabilidade exata.
"""
from __future__ import annotations

import math
import threading
import time
from typing import Callable


class Limiter:
    def __init__(self, limit: int, per_seconds: float, clock: Callable[[], float] = time.monotonic,
                 max_keys: int = 5000) -> None:
        self.limit = float(limit)
        self.per_seconds = float(per_seconds)
        self._clock = clock
        self._max_keys = max_keys
        self._buckets: dict[str, tuple[float, float]] = {}  # chave -> (fichas, quando foi vista)
        self._lock = threading.Lock()  # o gunicorn roda com 2 threads

    def __len__(self) -> int:
        return len(self._buckets)

    def _tokens(self, key: str, now: float) -> float:
        tokens, seen = self._buckets.get(key, (self.limit, now))
        return min(self.limit, tokens + (now - seen) * self.limit / self.per_seconds)

    def allow(self, key: str) -> bool:
        """Gasta uma ficha da chave. `False` quando não há ficha."""
        now = self._clock()
        with self._lock:
            tokens = self._tokens(key, now)
            allowed = tokens >= 1
            if key not in self._buckets and len(self._buckets) >= self._max_keys:
                self._forget(now)
            self._buckets[key] = (tokens - 1 if allowed else tokens, now)
            return allowed

    def retry_after(self, key: str) -> int:
        """Segundos até a próxima ficha da chave; 0 se já há uma."""
        now = self._clock()
        with self._lock:
            if key not in self._buckets:
                return 0
            tokens = self._tokens(key, now)
        if tokens >= 1:
            return 0
        return math.ceil(round((1 - tokens) * self.per_seconds / self.limit, 6))

    def _forget(self, now: float) -> None:
        """Abre espaço: primeiro quem já voltou a ter o balde cheio (não há o que lembrar), depois os mais antigos."""
        for key in [k for k in self._buckets if self._tokens(k, now) >= self.limit]:
            del self._buckets[key]
        excess = len(self._buckets) - self._max_keys + 1
        if excess > 0:
            oldest = sorted(self._buckets, key=lambda k: self._buckets[k][1])
            for key in oldest[:max(excess, self._max_keys // 10)]:
                del self._buckets[key]
