"""Núcleo puro do simulador de previdência — sem Firestore, sem rede.

Os parâmetros são os mesmos nomes (camelCase) do `PensionParams` em
`web/src/pension/types.ts`: o documento do Firestore é essa mesma forma, sem
tradução no meio. O cálculo em si mora no front (`calc.ts`); aqui só se valida
o que entra, para o Firestore nunca guardar um número fora de faixa.

Três formatos de campo, não um só:
- numérico com faixa (`_LIMITS`), como sempre;
- categórico de conjunto fechado (`_ENUMS`) — `vehicle`, `regime`;
- `faixasEmpresa`: uma LISTA de objetos (idadeMin/idadeMax/percentual), porque a
  contrapartida da empresa por idade é algo que a pessoa insere, edita e apaga
  livremente — não cabe numa régua nem num conjunto fechado."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

#: tamanho máximo da lista de faixas — gente real não cadastra mais que isso,
#: e cada documento do Firestore tem um teto de tamanho.
MAX_FAIXAS = 20

DEFAULT_PARAMS: dict[str, Any] = {
    "vehicle": "PGBL",
    "regime": "regressiva",
    "idadeAtual": 35,
    "salarioBruto": 15_000,
    "dissidio": 5,
    "mesDissidio": 8,
    "aporteBasicoPct": 5,
    "aporteExtraPct": 0,
    "initial": 50_000,
    "rendimentoAnual": 10,
    "taxaAdministracaoAnual": 1,
    "aliquotaIrMarginal": 27.5,
    "years": 25,
    "faixasEmpresa": [
        {"idadeMin": 0, "idadeMax": 40, "percentual": 100},
        {"idadeMin": 41, "idadeMax": 50, "percentual": 150},
        {"idadeMin": 51, "idadeMax": 120, "percentual": 200},
    ],
}

#: (mínimo, máximo) de cada campo numérico — generoso o bastante para qualquer
#: plano real, apertado o bastante para barrar erro de digitação.
_LIMITS: dict[str, tuple[float, float]] = {
    "idadeAtual": (14, 100),
    "salarioBruto": (0, 10_000_000),
    "dissidio": (0, 50),
    "mesDissidio": (1, 12),
    "aporteBasicoPct": (0, 100),
    "aporteExtraPct": (0, 100),
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

_FAIXA_LIMITS: dict[str, tuple[float, float]] = {
    "idadeMin": (0, 120),
    "idadeMax": (0, 120),
    "percentual": (0, 1000),
}


def _sanitize_faixa(faixa: Any) -> dict[str, float]:
    if not isinstance(faixa, dict):
        raise ValueError("faixasEmpresa: cada faixa deve ser um objeto")
    limpa: dict[str, float] = {}
    for key, (low, high) in _FAIXA_LIMITS.items():
        value = faixa.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"faixasEmpresa.{key} deve ser um número")
        if not low <= value <= high:
            raise ValueError(f"faixasEmpresa.{key} deve estar entre {low} e {high}")
        limpa[key] = value
    if limpa["idadeMax"] < limpa["idadeMin"]:
        raise ValueError("faixasEmpresa: idadeMax deve ser >= idadeMin")
    return limpa


def _sanitize_faixas(value: Any) -> list[dict[str, float]]:
    if not isinstance(value, list):
        raise ValueError("faixasEmpresa deve ser uma lista")
    if len(value) > MAX_FAIXAS:
        raise ValueError(f"faixasEmpresa aceita no máximo {MAX_FAIXAS} faixas")
    return [_sanitize_faixa(f) for f in value]


def sanitize(patch: dict[str, Any]) -> dict[str, Any]:
    """Valida os campos conhecidos de `patch`; o resto do payload é ignorado.

    Levanta `ValueError` no primeiro campo fora da faixa/conjunto ou de tipo
    errado — quem chama decide se devolve 400 (rota) ou propaga (uso interno)."""
    clean: dict[str, Any] = {}
    for key, value in (patch or {}).items():
        if key == "faixasEmpresa":
            clean[key] = _sanitize_faixas(value)
        elif key in _ENUMS:
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
    de ela acontecer), isto é a LEITURA — um campo salvo que ficasse fora de uma
    faixa apertada depois (ex.: o limite mudou) não pode travar o plano de
    alguém; ele só volta para o padrão daquele campo específico.

    `deepcopy` (não `dict(DEFAULT_PARAMS)`) porque `faixasEmpresa` é uma lista de
    dicts: uma cópia rasa compartilharia a MESMA lista entre todo uid que nunca
    mexeu nela, e qualquer mutação futura em cima do resultado vazaria para o
    padrão global."""
    clean: dict[str, Any] = deepcopy(DEFAULT_PARAMS)
    for key, value in (saved or {}).items():
        try:
            clean.update(sanitize({key: value}))
        except ValueError:
            continue
    return clean
