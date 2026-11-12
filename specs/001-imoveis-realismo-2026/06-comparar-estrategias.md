# Pacote 6 — Comparar estratégias

**Por quê.** Depois dos pacotes 4 e 5 o plano tem muitas alavancas (quanto financiar, em que linha, quanto
de temporada). Ninguém acha a melhor combinação arrastando slider. Este pacote roda o plano da pessoa em
algumas variações fixas e põe os resultados lado a lado — incluindo um cenário ruim, porque alavancagem
se mede na hora em que dá errado.

Não cria parâmetro. Depende do pacote 4; as linhas de temporada e de consórcio só aparecem se os pacotes
5 e 7 já estiverem entregues.

---

## 6.1 O comparador

**Arquivo novo:** `web/src/planner/estrategias.ts`

```ts
export type Estrategia = { id: string; nome: string; descricao: string; params: PlannerParams }
export type Resultado = {
  id: string; nome: string; descricao: string
  studios: number                    // totalImoveis da última linha
  patrimonioFinal: number            // nominal
  patrimonioFinalHoje: number        // em reais de hoje
  rendaDisponivelFinal: number       // nominal
  rendaDisponivelFinalHoje: number
  picoDivida: number                 // maior (dividaFinanciamento + aPagarObra [+ dividaConsorcio]) do diário, nominal
  menorSaldo: number                 // menor `saldo` do diário (negativo = o plano não fecha)
  mesDaMeta: number | null
}

export function estrategias(p: PlannerParams): Estrategia[]
export function compararEstrategias(p: PlannerParams, inicio: Inicio): Resultado[]
```

`estrategias(p)` devolve, nesta ordem (cada uma é `{ ...p, ...mudanças }`):

| id | Nome | Mudanças | Descrição |
|---|---|---|---|
| `plano` | Seu plano | — | "Como está nos campos ao lado." |
| `sem_divida` | Sem financiar | `pctPagoChaves: 100` (e `consorcioCotas: 0`, se existir) | "Paga 100% até as chaves; nenhuma dívida nova." |
| `construtora` | Construtora, metade financiada | `aplicarLinha(p, 'construtora')` + `pctPagoChaves: 50` | "Metade paga até as chaves, metade em 48 meses a 1% a.m. + IPCA." |
| `banco` | Banco, 30 anos, 70% financiado | `aplicarLinha(p, 'banco')` + `pctPagoChaves: 30` | "30% pago até as chaves; o resto em 360 meses, com limite de 30% da renda." |
| `temporada` | Tudo em temporada — ou "Tudo em aluguel tradicional" | `pctTemporada: p.pctTemporada >= 50 ? 0 : 100` | "A carteira inteira no outro modo de locação." |
| `consorcio` | Com 2 cotas de consórcio — ou "Sem consórcio" | `consorcioCotas: p.consorcioCotas > 0 ? 0 : 2` | "Duas cartas de crédito começando hoje." / "Sem as cotas." |
| `ruim` | Cenário ruim | `rate × 0,85`; `vacanciaMesesAno + 1` (máx. 12); `prazoObraMeses + 6`; `mesesEntrega1o + 6`; `jurosFinHolding + 0,2`; `ocupacaoPct − 10` (mín. 0), se existir | "Aluguel 15% menor, 1 mês vago a mais por ano, obra 6 meses mais longa e juros 0,2 ponto maiores." |

Regras:

- `temporada` só entra se `'pctTemporada' in p`; `consorcio` só se `'consorcioCotas' in p`.
- Uma variação cujos parâmetros ficam **iguais** aos do plano é omitida (ex.: o plano já paga 100% → não há linha "Sem financiar"). Compare com `JSON.stringify` dos parâmetros.
- `compararEstrategias` roda `simulateMonthly` uma vez por estratégia e monta o `Resultado`. É a única função do pacote que simula.

**Testes primeiro** (`estrategias.test.ts`)

1. A primeira linha é sempre `plano`, com os parâmetros intocados.
2. Com `pctPagoChaves: 100` no plano, não existe a linha `sem_divida`.
3. `ruim` tem aluguel 15% menor e não muda aportes, salário nem meta.
4. Sem o campo `pctTemporada`, não existe a linha `temporada` (monte o parâmetro sem o campo no teste).
5. `compararEstrategias` devolve um resultado por estratégia; o de `plano` bate com `simulateMonthly(p, inicio)` (studios, patrimônio final).
6. No resultado de `ruim`, `rendaDisponivelFinal` é menor ou igual à de `plano` (use o `base()` neutro com um plano simples).
7. `menorSaldo` é o mínimo do campo `saldo`.

---

## 6.2 Na tela

Painel de largura inteira, entre o "Tradicional × temporada" e o diário de bordo.

- Título **"Comparar estratégias"** e o botão **"comparar"** (`cta cta-primary`). A comparação **não roda
  sozinha**: são seis ou sete simulações e não devem acontecer a cada arrasto de slider.
- Ao clicar: calcula (síncrono) e guarda `{ resultados, paramsUsados }` no estado da página.
- Se os parâmetros mudarem depois, a tabela fica visível, mas com a nota *"Os números ao lado mudaram
  depois desta comparação."* e o botão vira **"comparar de novo"**.
- Valores em dinheiro seguem a chave "R$ de hoje | R$ nominais" (use os campos `…Hoje` ou os nominais).

**Tabela do desktop** (`hidden md:block`, dentro de `overflow-x-auto min-w-0`):

| Estratégia | Studios | Patrimônio no fim | Renda disponível no fim | Vive de renda em | Pico de dívida | Menor saldo |
|---|---|---|---|---|---|---|

- "Estratégia": nome em `text-heading`, descrição embaixo em `text-muted`.
- "Vive de renda em": `rotuloMesAno` do mês de `mesDaMeta`, ou "não chega".
- A maior célula de "Patrimônio no fim" e a de "Renda disponível no fim" ganham o texto **"maior"** ao lado
  (em `text-muted`, não só cor).
- "Menor saldo" negativo aparece com o texto **"não fecha"** ao lado do valor.

**Tabela do celular** (`md:hidden`), continua sendo tabela — três colunas com valores empilhados, como o diário:

| Estratégia | Resultado | Risco |
|---|---|---|
| nome + descrição | patrimônio · renda · studios · vive em | pico de dívida · menor saldo |

- Frase de apoio sob o título: *"O mesmo plano, mudando uma coisa de cada vez. O cenário ruim mostra
  quanto a sua estratégia aguenta."*

**Testes primeiro** (`planner-page.test.tsx`; plano de 2 anos, como no item 0.3)

1. Antes do clique não há tabela de comparação.
2. Depois do clique há uma linha "Seu plano" e uma "Cenário ruim".
3. Mexer num slider depois de comparar mostra a nota de que os números mudaram e o botão "comparar de novo".
4. As duas tabelas (desktop e celular) têm o mesmo número de linhas de dados.

**Conferir na bancada:** 390 px sem rolagem lateral da página; a tabela do desktop rola dentro do painel se precisar.

---

## Fecho do pacote

- Sem backend (nenhum parâmetro novo).
- `NOVIDADES`: "Novo: compare o seu plano com outras estratégias e com um cenário ruim."
- Mensagem ao PO com a tabela do cenário padrão dele — é o resultado mais útil de toda esta especificação:
  mostra, com os números dele, qual estratégia deixa mais patrimônio, qual deixa mais renda e qual quebra no cenário ruim.
