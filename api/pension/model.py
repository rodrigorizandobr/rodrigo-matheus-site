"""Núcleo puro do simulador de previdência — sem Firestore, sem rede.

Os parâmetros são os mesmos nomes (camelCase) do `PensionParams` em
`web/src/pension/types.ts`: o documento do Firestore é essa mesma forma, sem
tradução no meio. O cálculo em si mora no front (`calc.ts`); aqui só se valida
o que entra, para o Firestore nunca guardar um número fora de faixa.

Diferente do `planner/model.py` (todo numérico), aqui há dois campos
categóricos (`vehicle`, `regime`) — a dedução de 12% do PGBL e a tabela
regressiva/progressiva do IR não são números numa régua, são ESCOLHAS."""
from __future__ import annotations

from typing import Any

DEFAULT_PARAMS: dict[str, Any] = {
    "vehicle": "PGBL",
    "regime": "regressiva",
    "salarioBrutoCasal": 34_000,
    "dissidio": 5,
    "mesDissidio": 8,
    "dividaApe": 400_000,
    "parcelaApeAtual": 4_000,
    "monthlyAmount": 2_000,
    "annualAmount": 20_000,
    "annualMonth": 12,
    "initial": 50_000,
    "rendimentoAnual": 10,
    "taxaAdministracaoAnual": 1,
    "aliquotaIrMarginal": 27.5,
    "years": 25,
}

#: (mínimo, máximo) de cada campo numérico — generoso o bastante para qualquer
#: plano real, apertado o bastante para barrar erro de digitação.
_LIMITS: dict[str, tuple[float, float]] = {
    "salarioBrutoCasal": (0, 10_000_000),
    "dissidio": (0, 50),
    "mesDissidio": (1, 12),
    "dividaApe": (0, 50_000_000),
    "parcelaApeAtual": (0, 10_000_000),
    "monthlyAmount": (0, 10_000_000),
    "annualAmount": (0, 50_000_000),
    "annualMonth": (1, 12),
    "initial": (0, 50_000_000),
    "rendimentoAnual": (-20, 50),
    "taxaAdministracaoAnual": (0, 10),
    "aliquotaIrMarginal": (0, 27.5),
    "years": (1, 60),
}

#: campos categóricos — não têm faixa, têm um conjunto fechado de valores.
_ENUMS: dict[str, tuple[str, ...]] = {
    "vehicle": ("PGBL", "VGBL"),
    "regime": ("regressiva", "progressiva"),
}


def sanitize(patch: dict[str, Any]) -> dict[str, Any]:
    """Valida os campos conhecidos de `patch`; o resto do payload é ignorado.

    Levanta `ValueError` no primeiro campo fora da faixa/conjunto ou de tipo
    errado — quem chama decide se devolve 400 (rota) ou propaga (uso interno)."""
    clean: dict[str, Any] = {}
    for key, value in (patch or {}).items():
        if key in _ENUMS:
            if value not in _ENUMS[key]:
                raise ValueError(f"{key} deve ser um de {_ENUMS[key]}")
            clean[key] = value
        elif key in _LIMITS:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{key} deve ser um número")
            low, high = _LIMITS[key]
            if not low <= value <= high:
                raise ValueError(f"{key} deve estar entre {low} e {high}")
            clean[key] = value
        # chave desconhecida: ignorada, não é erro
    return clean


def merged(saved: dict[str, Any] | None) -> dict[str, Any]:
    """Os parâmetros salvos sobre os padrões — um plano novo começa do exemplo do
    simulador, nunca de um formulário em branco.

    Nunca levanta: ao contrário de `sanitize` (que barra uma GRAVAÇÃO ruim antes
    de ela acontecer), isto é a LEITURA — um campo salvo que ficou fora de uma
    faixa apertada depois (ex.: o limite mudou) não pode travar o plano de
    alguém; ele só volta para o padrão daquele campo."""
    clean: dict[str, Any] = dict(DEFAULT_PARAMS)
    for key, value in (saved or {}).items():
        try:
            clean.update(sanitize({key: value}))
        except ValueError:
            continue
    return clean
