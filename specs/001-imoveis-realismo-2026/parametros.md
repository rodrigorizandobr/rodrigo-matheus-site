# Tabela-mestra de parâmetros novos

Fonte única dos nomes, padrões, neutros e limites. `web/src/planner/types.ts`,
`web/src/planner/neutro.ts`, `api/planner/model.py` e os sliders de `PlannerPage.tsx` têm que bater
com esta tabela. Só crie o campo quando o pacote dele for executado.

- **Padrão**: valor em `DEFAULT_PARAMS` (front e back).
- **Neutro**: valor em `NEUTRO` — com ele o motor se comporta como no commit `f81ad5e`.
  "—" = o campo não altera o motor enquanto os outros estiverem neutros (não precisa entrar em `NEUTRO`,
  mas pode).
- **Backend**: par `(mínimo, máximo)` de `_LIMITS`, ou os valores de `_ENUMS`.
- **Campo**: `kind`, mínimo–máximo e passo do `ParamField`; "escolha" = `ChoiceField`.

## Pacote 1 — calendário, inflação, viver de renda

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `ipca` | % a.a. | 4.5 | — | (0, 30) | pct, 0–12, passo 0,25 | Mercado |
| `metaRendaHoje` | R$/mês de hoje | 15000 | — | (0, 10_000_000) | brl, 0–100.000, passo 500 | Viver de renda |
| `aposTransicao` | `'reinveste' \| 'vive_da_renda'` | `'vive_da_renda'` | `'reinveste'` | enum | escolha | Viver de renda |

## Pacote 2 — precisão do motor

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `prazoApeMeses` | meses | 300 | 0 | (0, 480) | meses, 0–420, passo 12 | Seu apartamento |
| `mesesEntrega1o` | meses | 36 | 36 | (0, 120) | meses, 0–60, passo 1 | Seus aportes |
| `custoMontagem` | R$ de hoje por studio | 12000 | 0 | (0, 1_000_000) | brl, 0–100.000, passo 1.000 | O studio |
| `mesesAteAlugar` | meses | 2 | 0 | (0, 12) | meses, 0–6, passo 1 | O studio |
| `rendimentoCaixaAno` | % a.a. líquido | 8 | 0 | (0, 30) | pct, 0–15, passo 0,25 | Mercado |
| `sobraDoCaixa` | `'adianta_obra' \| 'automatico'` | `'automatico'` | `'adianta_obra'` | enum | escolha | Crédito e alavancagem |
| `custoFixoHoldingMes` | R$/mês de hoje | 800 | 0 | (0, 100_000) | brl, 0–5.000, passo 50 | Custos do aluguel |

## Pacote 3 — realidade 2026

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `impostoModo` | `'fixo' \| 'reforma'` | `'reforma'` | `'fixo'` | enum | escolha | Custos do aluguel |

Padrões de campos **que já existem** e mudam no pacote 3 (o neutro deles é o valor antigo, que já está
congelado no `V1` do teste de caracterização — não entram em `NEUTRO`):

| Campo | Antes | Depois | Motivo |
|---|---|---|---|
| `rate` | 0.8 | 0.6 | FipeZap set/2026: 6,74% a.a. (0,56% a.m.) para 1 dormitório |
| `incc` | 6 | 6.5 | INCC-M em 12 meses até out/2026: ~6,75% |
| `depreciacao` | 1.5 | 2 | Usado passa a subir 4,5% a.a. (FipeZap venda: +4,54% no ano até out/2026) |
| `jurosFinHolding` | 0.8 | 0 | Plano investidor da construtora: sem juros (informação do PO, 2026-11-12). Construtora que cobra juros: IPCA/IGP-M + 0,69% a 1% a.m. |

Sliders que mudam de passo: `rate` 0,01 · `incc` 0,25 · `depreciacao` 0,25 · `jurosFinHolding` 0,05.

## Pacote 4 — crédito e alavancagem

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `prazoFinMeses` | meses | 36 | 48 | (1, 420) | meses, 12–420, passo 12 | Crédito e alavancagem |
| `correcaoFinAno` | % a.a. | 0 | 0 | (0, 30) | pct, 0–12, passo 0,25 | Crédito e alavancagem |
| `comprometimentoMaxPct` | % da renda (0 = sem limite) | 0 | 0 | (0, 100) | pct, 0–100, passo 5 | Crédito e alavancagem |

## Pacote 9 — contrato do plano investidor, reserva e estresse

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `cronograma` | `'contrato' \| 'simples'` | `'contrato'` | `'simples'` | enum | escolha | Plano investidor (contrato) |
| `correcaoObraModo` | `'propria' \| 'incc'` | `'propria'` | `'incc'` | enum | escolha | Plano investidor (contrato) |
| `correcaoObraAno` | % a.a. | 6.66 | — | (0, 30) | pct, 0–15, passo 0,05 | Plano investidor (contrato) |
| `entradaPct` | % do preço | 10 | — | (0, 100) | pct, 0–50, passo 1 | Plano investidor (contrato) |
| `mensaisPct` | % do preço | 25 | — | (0, 100) | pct, 0–80, passo 1 | Plano investidor (contrato) |
| `reforcoPct` | % do preço | 15 | — | (0, 100) | pct, 0–40, passo 1 | Plano investidor (contrato) |
| `reforcoCadaMeses` | meses | 12 | — | (1, 60) | meses, 3–24, passo 1 | Plano investidor (contrato) |
| `chavesPct` | % do preço | 20 | — | (0, 100) | pct, 0–60, passo 1 | Plano investidor (contrato) |
| `posChavesMeses` | meses | 36 | — | (1, 120) | meses, 1–96, passo 1 | Plano investidor (contrato) |
| `reservaMeses` | meses | 3 | 0 | (0, 24) | meses, 0–12, passo 1 | Crédito e alavancagem |

Regra extra no backend: `entradaPct + mensaisPct + reforcoPct + chavesPct <= 100` (validar depois de
mesclar com o plano salvo; na leitura, se estourar, os quatro voltam ao padrão). No modo `'contrato'`,
`pctPagoChaves` e `prazoFinMeses` não são usados (o motor lê os do contrato); continuam gravados para o modo `'simples'`.

## Pacote 5 — temporada

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `pctTemporada` | % da carteira | 0 | 0 | (0, 100) | pct, 0–100, passo 10 | Temporada (Airbnb) |
| `diariaHoje` | R$ de hoje | 240 | — | (0, 10_000) | brl, 80–800, passo 10 | Temporada (Airbnb) |
| `ocupacaoPct` | % das noites | 55 | — | (0, 100) | pct, 20–90, passo 1 | Temporada (Airbnb) |
| `taxaPlataformaPct` | % da receita | 16 | — | (0, 50) | pct, 0–25, passo 0,5 | Temporada (Airbnb) |
| `taxaGestaoPct` | % do que sobra da plataforma | 20 | — | (0, 60) | pct, 0–40, passo 1 | Temporada (Airbnb) |
| `custoFixoTemporadaMes` | R$/mês de hoje | 450 | — | (0, 50_000) | brl, 0–2.000, passo 50 | Temporada (Airbnb) |
| `manutencaoTemporadaPctAno` | % a.a. do valor | 1.5 | — | (0, 20) | pct, 0–5, passo 0,1 | Temporada (Airbnb) |
| `impostoTemporadaPct` | % da receita | 11.5 | — | (0, 40) | pct, 0–30, passo 0,5 | Temporada (Airbnb) |
| `custoMontagemTemporada` | R$ de hoje por studio | 35000 | — | (0, 1_000_000) | brl, 0–150.000, passo 1.000 | Temporada (Airbnb) |

## Pacote 7 — consórcio

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `consorcioCotas` | nº de cotas | 0 | 0 | (0, 20) | número, 0–10, passo 1 | Consórcio |
| `consorcioPrazoMeses` | meses | 200 | — | (12, 300) | meses, 60–240, passo 12 | Consórcio |
| `consorcioTaxaTotalPct` | % do plano inteiro | 20 | — | (0, 60) | pct, 5–35, passo 0,5 | Consórcio |
| `consorcioIntervaloMeses` | meses | 24 | — | (1, 300) | meses, 6–120, passo 6 | Consórcio |
| `consorcioLancePct` | % da carta | 25 | — | (0, 100) | pct, 0–60, passo 5 | Consórcio |

`ParamField` não tem `kind` para número puro: o pacote 7 acrescenta `'num'` (mostra o valor sem unidade).

## Pacote 8 — planta, ágio e venda nas chaves

| Campo | Tipo | Padrão | Neutro | Backend | Campo na tela | Grupo |
|---|---|---|---|---|---|---|
| `agioProntoPct` | % sobre o lançamento | 0 | 0 | (0, 100) | pct, 0–40, passo 1 | Venda |
| `pctVendaNasChaves` | % das entregas | 0 | 0 | (0, 100) | pct, 0–100, passo 10 | Venda |

## Campos novos do diário (`MonthRow`)

Todos em reais arredondados (`Math.round`), salvo indicação. Campo de pacote ainda não entregue não existe.

| Campo | Pacote | O que é |
|---|---|---|
| `ano` | 1 | Ano civil do mês (ex.: 2027). `anoDoPlano` continua existindo |
| `rendaDisponivel` | 1 | `rendaMensalLiquida − totalParcelasFinanciamento − custoFixoHolding − parcelasConsorcio − parcelaApePaga` |
| `metaDoMes` | 1 | `metaRendaHoje` corrigida pelo IPCA até o mês |
| `retirada` | 1 | O que saiu para a família viver no mês |
| `parcelaApePaga` | 1 | Parcela do apê paga pelo caixa (só no modo "vivo da renda", depois da transição) |
| `saldoApe` | 2 | Saldo devedor do apê no fim do mês |
| `parcelaApe` | 2 | Parcela do apê neste mês |
| `montagem` | 2 | Acabamento/mobília pagos no mês |
| `rendimentoCaixa` | 2 | Rendimento do caixa creditado no mês |
| `custoFixoHolding` | 2 | Contador e taxas da holding no mês |
| `amortizacaoExtra` | 4 | Amortização antecipada de financiamento |
| `dividaFinanciamento` | 4 | Soma dos saldos de financiamento das unidades prontas |
| `aPagarObra` | 4 | `restante` + saldo a financiar das unidades em obra |
| `valorImoveis` | 4 | Soma do valor de mercado das unidades prontas |
| `parcelasObra` | 9 | Parcelas de obra do contrato pagas no mês (mensal, reforço, chaves; sem a entrada do ato nem adiantamentos) |
| `obrigacoesMes` | 9 | `totalParcelasFinanciamento + parcelasObra + parcelaApePaga + custoFixoHolding + parcelasConsorcio` (positivo) |
| `parcelasConsorcio` | 7 | Parcelas de consórcio pagas no mês |
| `lanceConsorcio` | 7 | Lance pago no mês |
| `contemplacoes` | 7 | Cotas contempladas no mês (contagem) |
| `contemplacoesAtrasadas` | 7 | Cotas que já passaram do mês previsto e ainda esperam caixa para o lance (contagem, no fim do mês) |
| `dividaConsorcio` | 7 | O que ainda falta pagar das cotas (com a taxa) |

## A identidade do saldo (o teste "o saldo de cada mês fecha")

Cada pacote que cria uma entrada ou saída de caixa acrescenta o termo ao teste existente em
`calc.test.ts` e a linha correspondente em `MOVIMENTOS` de `PlannerLedger.tsx`. Forma final:

```
saldo[m] − saldo[m−1] =
    aporteMensal + aporteAnual + aluguelRecebido + valorVendas + rendimentoCaixa
  − custosImovel − totalParcelasFinanciamento − comprasImoveis − documentacao
  − montagem − custoFixoHolding − retirada − parcelaApePaga
  − amortizacaoExtra − parcelasConsorcio − lanceConsorcio
```

Tolerância: 5 por linha enquanto houver até 10 termos, 10 daí em diante (cada termo é arredondado sozinho).

Rótulos das linhas novas do diário (`rotulo` / `breve`):

| Campo | Sinal | Rótulo | Breve (celular) |
|---|---|---|---|
| `rendimentoCaixa` | + | rendimento do caixa | rendimento |
| `montagem` | − | montagem (acabamento e mobília) | montagem |
| `custoFixoHolding` | − | custo fixo da holding | holding |
| `retirada` | − | retirada para viver | retirada |
| `parcelaApePaga` | − | parcela do apê | apê |
| `amortizacaoExtra` | − | amortização antecipada | amortização |
| `parcelasConsorcio` | − | parcelas do consórcio | consórcio |
| `lanceConsorcio` | − | lance do consórcio | lance |
