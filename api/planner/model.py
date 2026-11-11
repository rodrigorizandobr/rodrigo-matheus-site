"""Núcleo puro do simulador — sem Firestore, sem rede.

Os 17 parâmetros são os mesmos nomes (camelCase) do `PlannerParams` em
`web/src/planner/types.ts`: o documento do Firestore é essa mesma forma, sem
tradução no meio. O cálculo em si mora no front (`calc.ts`); aqui só se valida
o que entra, para o Firestore nunca guardar um número fora de faixa."""
from __future__ import annotations

from typing import Any

DEFAULT_PARAMS: dict[str, float] = {
    "anoTransicao": 10,
    "pctPagoChaves": 70,
    "jurosFinHolding": 0.8,
    "impostoHolding": 11.5,
    "rate": 0.8,
    "dissidio": 5,
    "incc": 6,
    "depreciacao": 1.5,
    "abate3anos": 110_000,
    "dividaApe": 400_000,
    "extra100k": 1_000,
    "monthlyAmount": 2_000,
    "annualAmount": 96_000,
    "annualMonth": 12,
    "initial": 75_000,
    "custoStudio": 260_000,
    "years": 15,
}

#: (mínimo, máximo) de cada campo — generoso o bastante para qualquer plano real,
#: apertado o bastante para barrar erro de digitação (ex.: "anoTransicao": 2026).
_LIMITS: dict[str, tuple[float, float]] = {
    "anoTransicao": (0, 60),
    "pctPagoChaves": (0, 100),
    "jurosFinHolding": (0, 10),
    "impostoHolding": (0, 27.5),
    "rate": (0, 10),
    "dissidio": (0, 50),
    "incc": (-20, 50),
    "depreciacao": (0, 50),
    "abate3anos": (0, 50_000_000),
    "dividaApe": (0, 50_000_000),
    "extra100k": (0, 1_000_000),
    "monthlyAmount": (0, 10_000_000),
    "annualAmount": (0, 50_000_000),
    "annualMonth": (1, 12),
    "initial": (0, 50_000_000),
    "custoStudio": (1, 50_000_000),
    "years": (1, 60),
}


def sanitize(patch: dict[str, Any]) -> dict[str, float]:
    """Valida os campos conhecidos de `patch`; o resto do payload é ignorado.

    Levanta `ValueError` no primeiro campo fora da faixa ou de tipo errado — quem
    chama decide se devolve 400 (rota) ou propaga (uso interno)."""
    clean: dict[str, float] = {}
    for key, value in (patch or {}).items():
        if key not in DEFAULT_PARAMS:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{key} deve ser um número")
        low, high = _LIMITS[key]
        if not low <= value <= high:
            raise ValueError(f"{key} deve estar entre {low} e {high}")
        clean[key] = value
    return clean


def merged(saved: dict[str, Any] | None) -> dict[str, float]:
    """Os parâmetros salvos sobre os padrões — um plano novo começa do exemplo do
    simulador, nunca de um formulário em branco.

    Nunca levanta: ao contrário de `sanitize` (que barra uma GRAVAÇÃO ruim antes de
    ela acontecer), isto é a LEITURA — um campo salvo que ficou fora de uma faixa
    apertada depois (ex.: o limite mudou) não pode travar o plano de alguém; ele só
    volta para o padrão daquele campo."""
    clean: dict[str, float] = dict(DEFAULT_PARAMS)
    for key, value in (saved or {}).items():
        try:
            clean.update(sanitize({key: value}))
        except ValueError:
            continue
    return clean
