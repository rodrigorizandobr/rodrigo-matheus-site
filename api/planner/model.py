"""Núcleo puro do simulador — sem Firestore, sem rede.

Os parâmetros são os mesmos nomes (camelCase) do `PlannerParams` em
`web/src/planner/types.ts`: o documento do Firestore é essa mesma forma, sem
tradução no meio. O cálculo em si mora no front (`calc.ts`); aqui só se valida
o que entra, para o Firestore nunca guardar um número fora de faixa.

Dois formatos de campo: numérico com faixa (`_LIMITS`) e categórico de conjunto
fechado (`_ENUMS` — quem paga IPTU e condomínio, modo de imposto, cronograma…).
Uma regra entre campos: as quatro fatias do contrato até as chaves somam no máximo 100%."""
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
    "corretagemVendaPct": 6,
    "impostoVendaPct": 6.73,
    "anoTransicao": 10,
    "pctPagoChaves": 70,
    "jurosFinHolding": 0,
    "impostoHolding": 11.5,
    "rate": 0.65,
    "dissidio": 5,
    "mesDissidio": 8,
    "incc": 6.5,
    "depreciacao": 2,
    "dividaApe": 400_000,
    "salarioBrutoCasal": 34_000,
    "parcelaApeAtual": 4_000,
    "monthlyAmount": 2_000,
    "annualAmount": 96_000,
    "annualMonth": 12,
    "initial": 75_000,
    "custoStudio": 260_000,
    "years": 15,
    # pacote 1: calendário, inflação, viver de renda
    "ipca": 4.5,
    "metaRendaHoje": 15_000,
    "aposTransicao": "vive_da_renda",
    # pacote 2: precisão do motor
    "prazoApeMeses": 300,
    "mesesEntrega1o": 36,
    "custoMontagem": 12_000,
    "mesesAteAlugar": 2,
    "rendimentoCaixaAno": 8,
    "sobraDoCaixa": "automatico",
    "custoFixoHoldingMes": 800,
    # pacote 3
    "impostoModo": "reforma",
    # pacote 9: contrato do plano investidor, reserva
    "cronograma": "contrato",
    "correcaoObraModo": "propria",
    "correcaoObraAno": 6.66,
    "correcaoPosChavesAno": 4.5,
    "parcelamento": "automatico",
    "parcelaMensal1o": 0,
    "parcelaAnual1o": 0,
    "entradaPct": 10,
    "mensaisPct": 25,
    "reforcoPct": 15,
    "reforcoCadaMeses": 12,
    "chavesPct": 20,
    "posChavesMeses": 36,
    "reservaMeses": 3,
    # pacote 5: temporada (Airbnb)
    "pctTemporada": 0,
    "diariaHoje": 256,
    "ocupacaoPct": 42,
    "taxaPlataformaPct": 16,
    "taxaGestaoPct": 20,
    "custoFixoTemporadaMes": 450,
    "manutencaoTemporadaPctAno": 1.5,
    "impostoTemporadaPct": 11.5,
    "custoMontagemTemporada": 35_000,
    # pacote 7: consórcio
    "consorcioCotas": 0,
    "consorcioPrazoMeses": 200,
    "consorcioTaxaTotalPct": 20,
    "consorcioIntervaloMeses": 24,
    "consorcioLancePct": 25,
    # pacote 8: planta, ágio, venda nas chaves
    "agioProntoPct": 0,
    "pctVendaNasChaves": 0,
}

#: as quatro fatias do contrato que vão até as chaves: a soma nunca passa de 100%.
CONTRATO_ATE_AS_CHAVES = ("entradaPct", "mensaisPct", "reforcoPct", "chavesPct")

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
    "ipca": (0, 30),
    "metaRendaHoje": (0, 10_000_000),
    "prazoApeMeses": (0, 480),
    "mesesEntrega1o": (0, 120),
    "custoMontagem": (0, 1_000_000),
    "mesesAteAlugar": (0, 12),
    "rendimentoCaixaAno": (0, 30),
    "custoFixoHoldingMes": (0, 100_000),
    "correcaoObraAno": (0, 30),
    "correcaoPosChavesAno": (0, 30),
    "parcelaMensal1o": (0, 1_000_000),
    "parcelaAnual1o": (0, 50_000_000),
    "entradaPct": (0, 100),
    "mensaisPct": (0, 100),
    "reforcoPct": (0, 100),
    "reforcoCadaMeses": (1, 60),
    "chavesPct": (0, 100),
    "posChavesMeses": (1, 120),
    "reservaMeses": (0, 24),
    "pctTemporada": (0, 100),
    "diariaHoje": (0, 10_000),
    "ocupacaoPct": (0, 100),
    "taxaPlataformaPct": (0, 50),
    "taxaGestaoPct": (0, 60),
    "custoFixoTemporadaMes": (0, 50_000),
    "manutencaoTemporadaPctAno": (0, 20),
    "impostoTemporadaPct": (0, 40),
    "custoMontagemTemporada": (0, 1_000_000),
    "consorcioCotas": (0, 20),
    "consorcioPrazoMeses": (12, 300),
    "consorcioTaxaTotalPct": (0, 60),
    "consorcioIntervaloMeses": (1, 300),
    "consorcioLancePct": (0, 100),
    "agioProntoPct": (0, 100),
    "pctVendaNasChaves": (0, 100),
}

#: campos categóricos — não têm faixa, têm um conjunto fechado de valores.
_ENUMS: dict[str, tuple[str, ...]] = {
    "iptuPagador": ("inquilino", "proprietario"),
    "condominioPagador": ("inquilino", "proprietario"),
    "aposTransicao": ("reinveste", "vive_da_renda"),
    "sobraDoCaixa": ("adianta_obra", "automatico"),
    "impostoModo": ("fixo", "reforma"),
    "cronograma": ("simples", "contrato"),
    "correcaoObraModo": ("incc", "propria"),
    "parcelamento": ("manual", "automatico"),
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


def check_contract(params: dict[str, Any]) -> None:
    """Levanta `ValueError` se as fatias do contrato até as chaves passam de 100%."""
    total = sum(params.get(k, DEFAULT_PARAMS[k]) for k in CONTRATO_ATE_AS_CHAVES)
    if total > 100:
        raise ValueError(f"entradaPct + mensaisPct + reforcoPct + chavesPct deve somar no máximo 100 (soma {total})")


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
    try:
        check_contract(clean)
    except ValueError:
        # um contrato salvo que estoura 100% não pode travar a leitura: as quatro fatias voltam ao padrão
        for k in CONTRATO_ATE_AS_CHAVES:
            clean[k] = DEFAULT_PARAMS[k]
    return clean
