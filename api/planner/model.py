"""Núcleo puro do simulador — sem Firestore, sem rede.

Os parâmetros são os mesmos nomes (camelCase) do `PlannerParams` em
`web/src/planner/types.ts`: o documento do Firestore é essa mesma forma, sem
tradução no meio. O cálculo em si mora no front (`calc.ts`); aqui só se valida
o que entra, para o Firestore nunca guardar um número fora de faixa.

Dois formatos de campo: numérico com faixa (`_LIMITS`) e categórico de conjunto
fechado (`_ENUMS` — quem paga IPTU e condomínio)."""
from __future__ import annotations

from typing import Any

DEFAULT_PARAMS: dict[str, Any] = {
    "prazoObraMeses": 36,
    "vacanciaMesesAno": 1,
    "iptuPctAno": 0.6,
    "iptuPagador": "inquilino",
    "condominioPctAno": 2,
    "condominioPagador": "inquilino",
    "taxaAdmPct": 8,
    "manutencaoPctAno": 0.5,
    "itbiPct": 3,
    "escrituraPct": 0.5,
    "registroPct": 0.5,
    "descontoAVista": 5,
    "fgtsTetoImovel": 2_250_000,
    "corretagemVendaPct": 6,
    "impostoVendaPct": 6.73,
    "anoTransicao": 10,
    "pctPagoChaves": 70,
    "jurosFinHolding": 0.8,
    "impostoHolding": 11.5,
    "rate": 0.8,
    "dissidio": 5,
    "mesDissidio": 8,
    "incc": 6,
    "depreciacao": 1.5,
    "dividaApe": 400_000,
    "salarioBrutoCasal": 34_000,
    "parcelaApeAtual": 4_000,
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
    "prazoObraMeses": (1, 120),
    "vacanciaMesesAno": (0, 12),
    "iptuPctAno": (0, 10),
    "condominioPctAno": (0, 20),
    "taxaAdmPct": (0, 50),
    "manutencaoPctAno": (0, 20),
    "itbiPct": (0, 10),
    "escrituraPct": (0, 10),
    "registroPct": (0, 10),
    "descontoAVista": (0, 50),
    "fgtsTetoImovel": (0, 50_000_000),
    "corretagemVendaPct": (0, 20),
    "impostoVendaPct": (0, 50),
    "anoTransicao": (0, 60),
    "pctPagoChaves": (0, 100),
    "jurosFinHolding": (0, 10),
    "impostoHolding": (0, 27.5),
    "rate": (0, 10),
    "dissidio": (0, 50),
    "mesDissidio": (1, 12),
    "incc": (-20, 50),
    "depreciacao": (0, 50),
    "dividaApe": (0, 50_000_000),
    "salarioBrutoCasal": (0, 10_000_000),
    "parcelaApeAtual": (0, 10_000_000),
    "monthlyAmount": (0, 10_000_000),
    "annualAmount": (0, 50_000_000),
    "annualMonth": (1, 12),
    "initial": (0, 50_000_000),
    "custoStudio": (1, 50_000_000),
    "years": (1, 60),
}

#: campos categóricos — não têm faixa, têm um conjunto fechado de valores.
_ENUMS: dict[str, tuple[str, ...]] = {
    "iptuPagador": ("inquilino", "proprietario"),
    "condominioPagador": ("inquilino", "proprietario"),
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
    simulador, nunca de um formulário em branco. Plano salvo antes de um campo
    existir ganha o padrão dele na leitura.

    Nunca levanta: ao contrário de `sanitize` (que barra uma GRAVAÇÃO ruim antes de
    ela acontecer), isto é a LEITURA — um campo salvo que ficou fora de uma faixa
    apertada depois (ex.: o limite mudou) não pode travar o plano de alguém; ele só
    volta para o padrão daquele campo."""
    clean: dict[str, Any] = dict(DEFAULT_PARAMS)
    for key, value in (saved or {}).items():
        try:
            clean.update(sanitize({key: value}))
        except ValueError:
            continue
    return clean
