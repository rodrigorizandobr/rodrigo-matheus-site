# Pacote 0 — Rede de segurança

Nada aqui muda o que o simulador calcula. É o que permite mexer no motor sem medo. Faça os quatro
itens antes de qualquer outro pacote.

## 0.1 Teste de caracterização

**O que é.** Um teste que congela o comportamento do motor no commit `f81ad5e`. Todo pacote seguinte
tem que mantê-lo verde quando os parâmetros novos estão no valor neutro.

**Arquivo:** `web/src/planner/caracterizacao.test.ts`.

**Regra de ouro:** escreva este teste e veja-o **passar sem tocar em `calc.ts`**. Se não passar, o
erro está no teste (ou alguém já mexeu no motor) — descubra qual antes de seguir.

```ts
import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { NEUTRO } from './neutro'
import type { MonthRow, PlannerParams } from './types'

// Os padrões do commit f81ad5e, congelados AQUI. Não importe DEFAULT_PARAMS: ele vai mudar.
const V1 = {
  prazoObraMeses: 36, vacanciaMesesAno: 1, iptuPctAno: 0.6, iptuPagador: 'inquilino',
  condominioPctAno: 2, condominioPagador: 'inquilino', taxaAdmPct: 8, manutencaoPctAno: 0.5,
  itbiPct: 3, escrituraPct: 0.5, registroPct: 0.5, descontoAVista: 5, corretagemVendaPct: 6,
  impostoVendaPct: 6.73, anoTransicao: 10, pctPagoChaves: 70, jurosFinHolding: 0.8,
  impostoHolding: 11.5, rate: 0.8, dissidio: 5, mesDissidio: 8, incc: 6, depreciacao: 1.5,
  dividaApe: 400_000, salarioBrutoCasal: 34_000, parcelaApeAtual: 4_000, monthlyAmount: 2_000,
  annualAmount: 96_000, annualMonth: 12, initial: 75_000, custoStudio: 260_000, years: 15,
} as const

const SEM_CUSTOS = {
  vacanciaMesesAno: 0, iptuPctAno: 0, condominioPctAno: 0, taxaAdmPct: 0, manutencaoPctAno: 0,
  itbiPct: 0, escrituraPct: 0, registroPct: 0, descontoAVista: 0,
} as const

const params = (over: object = {}) => ({ ...V1, ...NEUTRO, ...over }) as PlannerParams
```

Três cenários. Os valores esperados abaixo saíram do motor do commit `f81ad5e` em 2026-11-12:

```ts
const CENARIOS = {
  padrao15: params(),
  venda: params({ ...SEM_CUSTOS, initial: 260_000, custoStudio: 260_000, pctPagoChaves: 50,
    jurosFinHolding: 0, monthlyAmount: 15_000, annualAmount: 0, dissidio: 0, dividaApe: 0,
    salarioBrutoCasal: 0, corretagemVendaPct: 0, impostoVendaPct: 0, rate: 0, incc: 15,
    depreciacao: 10, years: 8 }),
  fgts: params({ ...SEM_CUSTOS, dividaApe: 50_000, parcelaApeAtual: 1_000, salarioBrutoCasal: 60_000,
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 10 }),
}
```

Esperado — **última linha** de cada cenário:

| Campo | `padrao15` (mês 180) | `venda` (mês 96) | `fgts` (mês 120) |
|---|---|---|---|
| `aporteMensal` | 0 | 15000 | 1000 |
| `aporteAnual` | 0 | 0 | 0 |
| `saldoFgts` | 430585 | 0 | 53777 |
| `imoveisEmConstrucao` | 2 | 0 | 0 |
| `imoveisAlugados` | 8 | 4 | 2 |
| `imoveisQuitados` | 7 | 1 | 2 |
| `imoveisFinanciados` | 1 | 3 | 0 |
| `totalImoveis` | 10 | 4 | 2 |
| `totalParcelasFinanciamento` | 4577 | 19570 | 0 |
| `aluguelRecebido` | 32777 | 0 | 7162 |
| `comprasImoveis` | 1109 | 0 | 0 |
| `documentacao` | 63 | 0 | 0 |
| `saldo` | 36990 | 509498 | 78720 |
| `custosImovel` | 9061 | 0 | 824 |
| `rendaMensalLiquida` | 23716 | 0 | 6338 |
| `patrimonioLiquido` | 4685700 | 2452720 | 973986 |

Esperado — **soma de cada campo em todos os meses**:

| Campo | `padrao15` | `venda` | `fgts` |
|---|---|---|---|
| `aporteMensal` | 519222 | 1440000 | 97000 |
| `aporteAnual` | 1267853 | 0 | 0 |
| `abatimentoApeFgts` | 400001 | 0 | 50000 |
| `compraAVistaFgts` | 0 | 0 | 587516 |
| `saldoFgts` | 20015590 | 0 | 15102560 |
| `imoveisEmConstrucao` | 293 | 176 | 0 |
| `imoveisAlugados` | 752 | 192 | 69 |
| `imoveisQuitados` | 404 | 27 | 69 |
| `imoveisFinanciados` | 348 | 165 | 0 |
| `totalImoveis` | 1045 | 368 | 69 |
| `totalParcelasFinanciamento` | 1194258 | 708868 | 0 |
| `aluguelRecebido` | 2474238 | 0 | 215593 |
| `comprasImoveis` | 2219265 | 975036 | 209079 |
| `documentacao` | 126820 | 0 | 0 |
| `saldo` | 3899507 | 23413267 | 5335943 |
| `custosImovel` | 683984 | 0 | 24796 |
| `rendaMensalLiquida` | 1790257 | 0 | 190801 |
| `vendas` | 0 | 2 | 0 |
| `valorVendas` | 0 | 753395 | 0 |
| `patrimonioLiquido` | 348865430 | 118603065 | 33081620 |

**Como comparar.**

- Campos de contagem (`imoveis*`, `totalImoveis`, `vendas`): **exatos**, na última linha e nas somas.
- Campos de dinheiro: última linha com tolerância de **± 2**; somas com tolerância de **± (número de meses)**.
  A folga existe porque alguns pacotes trocam a ordem de somas em ponto flutuante; ela não cobre erro de lógica.
- Compare só os campos destas tabelas — os pacotes vão acrescentar campos ao `MonthRow`.
- Um `it` por cenário, com mensagem que diga qual campo divergiu.

**Como os pacotes usam.** Ao criar um parâmetro, acrescente o neutro dele em `NEUTRO` (item 0.2) e
rode este teste. Se quebrar, o pacote mudou o comportamento com o parâmetro "desligado": conserte o
pacote, nunca os números acima.

## 0.2 `neutro.ts` e o `base()` dos testes

**Arquivo novo:** `web/src/planner/neutro.ts`.

```ts
import type { PlannerParams } from './types'

/**
 * O valor NEUTRO de cada parâmetro criado depois do commit f81ad5e: com todos eles o motor
 * se comporta exatamente como naquele commit. É o que os testes de mecânica e o teste de
 * caracterização usam — DEFAULT_PARAMS é realista, isto aqui é "tudo desligado".
 */
export const NEUTRO: Partial<PlannerParams> = {}
```

Começa vazio. Cada pacote acrescenta as linhas dele (coluna "Neutro" de `parametros.md`).

**Em `web/src/planner/calc.test.ts`**, troque o `base()`:

```ts
const base = (over: Partial<PlannerParams> = {}): PlannerParams =>
  ({ ...DEFAULT_PARAMS, ...SEM_CUSTOS, ...NEUTRO, ...over })
```

Os testes que usam `DEFAULT_PARAMS` direto continuam assim de propósito — eles conferem que o mundo
realista segue plausível (ordem de grandeza, saldo nunca negativo, saldo que fecha, totais batendo).

**Atenção para o pacote 3:** quando os padrões de `rate`, `incc`, `depreciacao` e `jurosFinHolding`
mudarem, alguns testes de mecânica que dependiam do valor antigo podem precisar do valor explícito no
`over`. A regra: se um teste de `calc.test.ts` quebrar por causa de um padrão novo, fixe no teste o
valor antigo daquele campo (`rate: 0.8`, etc.) — não mude a asserção.

## 0.3 `planner-page.test.tsx` rápido

Hoje o arquivo leva ~40 s porque cada render monta 180 linhas em duas tabelas. Os testes não
conferem número nenhum do diário.

- No `beforeEach`, o plano devolvido passa a ser `{ ...DEFAULT_PARAMS, years: 2 }` (24 linhas).
- No teste "mexer num slider agenda um autosave", troque o valor para `'3'` e a asserção para
  `expect.objectContaining({ years: 3 })`.
- Não mude mais nada.

**Pronto quando:** o arquivo roda em menos de 10 s com a máquina livre e os 6 testes passam.

## 0.4 Formulário em grupos recolhíveis

Hoje são 38 campos numa coluna só; os pacotes acrescentam ~30. Sem recolher, a página fica inutilizável.

**O que muda em `web/src/pages/PlannerPage.tsx`:**

- `Group` vira um `<details>` nativo com `<summary>` (teclado e leitor de tela de graça, sem estado
  de abertura em React). Mesma aparência de hoje: `panel hud-frame p-5`, título em `hud-label`.
  O `<summary>` mostra o título e, à direita, um sinal `+`/`−` (texto, não ícone de fonte) que
  acompanha o estado (`details[open]` no CSS).
- Nova prop `inicial?: 'aberto' | 'fechado'` (padrão `'fechado'`). Abertos de início: "Seus aportes" e
  "O studio" (e "Viver de renda" quando o pacote 1 criar o grupo).
- O estado aberto/fechado de cada grupo é lembrado em `localStorage`
  (`planner:grupo:<título>` = `'1'`/`'0'`), lido uma vez na montagem e gravado no evento `toggle`.
  Leitura e gravação dentro de `try/catch`: sem `localStorage`, vale a prop `inicial`.
- CSS novo em `web/src/styles/tokens.css`, dentro de `@layer components` (fora de layer ele vence as
  utilities do Tailwind): tirar o marcador padrão do `summary` (`list-style: none` e
  `::-webkit-details-marker { display: none }`), `cursor: pointer`, e o `:focus-visible` do site.
- Reordene os grupos existentes para a ordem da seção 8 do `README.md` (os grupos de pacotes futuros
  ainda não existem).
- Nenhum campo muda de rótulo, faixa ou dica neste item.

**Testes primeiro** (`web/src/pages/planner/planner-page.test.tsx`, bloco novo "grupos do formulário"):

1. "Seus aportes" e "O studio" começam abertos; "Venda" começa fechado (`details.open`).
2. O slider de um grupo fechado continua no DOM (o autosave e `findByLabelText` não dependem do grupo estar aberto).
3. Abrir um grupo grava a escolha; remontar a página o traz aberto.
4. Com `localStorage.getItem` lançando erro, a página monta com os padrões.

**Conferir na bancada** (README 7.3): 390 px e 1440 px, grupos abrindo e fechando por clique e por teclado
(Tab até o título, Enter).

**Pronto quando:** os quatro itens estão em produção, a suíte está verde e nenhum número do simulador mudou
(o cenário padrão continua em 10 studios, R$ 4.685.700 e R$ 23.716).
