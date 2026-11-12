# Pacote 1 — Calendário real, reais de hoje e viver de renda

**Por quê.** A página promete "viver de imóveis" e hoje não diz quando, nem com quanto, nem em dinheiro
de que ano. Este pacote ancora o plano no calendário, mostra tudo em reais de hoje e faz a família de
fato retirar a renda depois da transição.

Parâmetros: `ipca`, `metaRendaHoje`, `aposTransicao` (ver `parametros.md`).
Neutro a acrescentar em `NEUTRO`: `aposTransicao: 'reinveste'`.

Itens na ordem: 1.1 → 1.2 → 1.3 → 1.4 → 1.5. Cada um pode ser um commit.

---

## 1.1 Calendário real

Hoje o mês 1 do plano é sempre "janeiro do ano 1". Um plano aberto em novembro de 2026 deveria começar
em novembro de 2026: o aporte anual de dezembro cai no mês 2, não no 12; o dissídio de agosto, no mês 10.

**Arquivo novo:** `web/src/planner/calendario.ts`

```ts
export type Inicio = { ano: number; mes: number }            // mes: 1 = janeiro … 12 = dezembro
export const INICIO_PADRAO: Inicio = { ano: 2026, mes: 1 }    // o que os testes usam: mês 1 = janeiro
/** A ÚNICA porta do simulador para o relógio. Quem chama é a página, nunca o motor. */
export function inicioDeHoje(agora: Date = new Date()): Inicio
/** Data civil do mês-índice `mes` (1, 2, 3…) de um plano que começa em `inicio`. */
export function dataDoMes(mes: number, inicio: Inicio): { ano: number; mesDoAno: number }
export function rotuloMesAno(ano: number, mesDoAno: number): string   // "mar/2038"
```

`dataDoMes`: `i = (inicio.mes − 1) + (mes − 1)`; `ano = inicio.ano + Math.floor(i / 12)`; `mesDoAno = (i % 12) + 1`.

**Em `calc.ts`:**

- `simulateMonthly(p, inicio = INICIO_PADRAO)` e `simulate(p, inicio = INICIO_PADRAO)`.
- A função interna `mesDoAno(mes)` some. Todo uso dela vira `dataDoMes(mes, inicio).mesDoAno` — são
  cinco: dissídio, 13º do FGTS, aporte anual (no laço do mês **e** dentro de `caminhoDoCaixa`),
  avaliação de venda de dezembro, e o campo `mesDoAno` da linha.
- O saque bienal do FGTS continua em `mes % 24 === 0` (meses de plano, não de calendário).
- `MonthRow` ganha `ano` (ano civil). `anoDoPlano` continua igual.
- `YearPoint` ganha `anoCalendario` = o `ano` da linha do mês `12 × ano` (no ponto 0, o `ano` da 1ª linha).

**Na tela:**

- `PlannerPage`: `const inicio = useMemo(() => inicioDeHoje(), [])` e `simulateMonthly(params, inicio)`.
- `PlannerLedger`: a coluna "Ano" mostra `l.ano` (desktop e celular).
- `PlannerChart`: a legenda sob o gráfico passa de "Ano 5" para "Ano 5 · 2031"; a tabela "ano a ano"
  ganha o ano civil na primeira coluna ("5 · 2031").

**Testes primeiro**

`calendario.test.ts`:
1. `dataDoMes(1, {ano: 2026, mes: 11})` → `{ano: 2026, mesDoAno: 11}`; mês 2 → dezembro/2026; mês 3 → janeiro/2027; mês 14 → dezembro/2027.
2. `dataDoMes(1, INICIO_PADRAO)` → janeiro/2026; mês 13 → janeiro/2027.
3. `inicioDeHoje(new Date(2026, 10, 12))` → `{ano: 2026, mes: 11}`.
4. `rotuloMesAno(2038, 3)` → `'mar/2038'`.

`calc.test.ts` (bloco novo "calendário"):
5. Com `inicio = {ano: 2026, mes: 11}` e `annualMonth: 12`, os meses com `aporteAnual > 0` são 2, 14, 26…
6. Com o mesmo início e `mesDissidio: 8`, o `aporteMensal` sobe pela primeira vez no mês 10.
7. A primeira linha tem `ano: 2026, mesDoAno: 11`; a terceira, `ano: 2027, mesDoAno: 1`.
8. Sem passar `inicio`, o diário é igual ao de antes (o teste de caracterização cobre).

`planner-ledger.test.tsx`: o `linha()` de apoio ganha `ano: 2026`; novo teste "a coluna Ano mostra o ano civil".

**Pronto quando:** caracterização verde; abrir a página em novembro/2026 mostra a primeira linha do diário como "2026 · nov".

---

## 1.2 Inflação e "reais de hoje"

**Arquivo novo:** `web/src/planner/inflacao.ts`

```ts
/** Quanto os preços subiram do início do plano até o mês `mes`. */
export const fatorPreco = (mes: number, ipcaAno: number): number => Math.pow(1 + ipcaAno / 100, mes / 12)
/** Um valor do mês `mes` trazido para o poder de compra de hoje. */
export const emReaisDeHoje = (valor: number, mes: number, ipcaAno: number): number => valor / fatorPreco(mes, ipcaAno)
```

**Parâmetro `ipca`** (padrão 4,5). Neste item ele só alimenta a exibição; os itens seguintes e os
pacotes 2, 3 e 5 o usam no motor.

**Na tela:**

- Campo no grupo "Mercado": **"Inflação (IPCA)"**, dica: *"Corrige a sua meta de renda e os custos em
  reais ao longo do plano. É também o que converte os resultados para reais de hoje."*
- Acima dos cartões, uma chave com `ChoiceField` (o mesmo componente de `pages/pension/`):
  rótulo **"Valores em"**, opções **"R$ de hoje"** (`'hoje'`) e **"R$ nominais"** (`'nominal'`).
  Estado local da página, padrão `'hoje'` (decisão D3), lembrado em `localStorage` (`planner:moeda`),
  com `try/catch`. Não é parâmetro do plano: não vai para o backend.
- Com `'hoje'`, todo valor em dinheiro dos **cartões**, do **gráfico** e da **tabela ano a ano** passa
  por `emReaisDeHoje(valor, mes, params.ipca)` — `mes` é o mês da linha (para um ponto anual, `12 × ano`).
- O `aria-label` do gráfico e o título da tabela dizem "em reais de hoje" ou "em valores nominais".
- O **diário de bordo fica sempre nominal**. A frase de apoio dele ganha: *"Valores nominais (da época), sem descontar a inflação."*

**Testes primeiro**

`inflacao.test.ts`:
1. `fatorPreco(0, 7)` → 1; `fatorPreco(12, 5)` → 1,05; `fatorPreco(24, 5)` → 1,1025.
2. `emReaisDeHoje(23_716, 180, 4.5)` → 12.255 (± 1).
3. Com `ipcaAno = 0`, `emReaisDeHoje` devolve o próprio valor.

`planner-page.test.tsx`:
4. A chave "Valores em" existe e começa em "R$ de hoje".
5. Trocar para "R$ nominais" muda o texto do cartão "Patrimônio líquido no fim" (item 1.3 cria o cartão; se fizer 1.2 antes, use o cartão de renda).
6. A escolha sobrevive a remontar a página.

`api/tests/test_planner_model.py`: `ipca` aceito dentro da faixa, recusado fora, presente em `merged({})`.

---

## 1.3 Meta de renda: "quando eu vivo de imóveis?"

**Parâmetro `metaRendaHoje`** (padrão R$ 15.000, decisão D7): quanto a pessoa quer por mês, em reais de hoje.

**`MonthRow` ganha:**

- `metaDoMes` = `Math.round(p.metaRendaHoje × fatorPreco(mes, p.ipca))`.
- `rendaDisponivel` = `Math.round(recebidoDoMes − custosDoMes − parcelasDoMes − parcelaApePagaDoMes)` —
  o que sobra do aluguel depois dos custos **e das parcelas**. (Os pacotes 2 e 7 subtraem mais termos;
  a fórmula completa está em `parametros.md`.) `parcelaApePagaDoMes` nasce no item 1.4; aqui é 0.

**Arquivo novo:** `web/src/planner/indicadores.ts`

```ts
/**
 * O primeiro mês (campo `mes`) em que a renda disponível cobre a meta E continua cobrindo
 * por 12 meses seguidos (ou até o fim do diário, se faltarem menos de 12). `null` se nunca
 * acontece ou se não há meta (`metaDoMes` zerado).
 */
export function mesDaMeta(linhas: MonthRow[]): number | null
```

**Cartões** (primeira fileira passa a ser estes três; a segunda continua "Studios c/ chaves",
"Studios quitados" e "Renda mensal líquida" até o pacote 4):

| Cartão | Valor | Texto pequeno (`title` e linha de apoio) |
|---|---|---|
| **Vive de renda a partir de** | `rotuloMesAno` do mês de `mesDaMeta`, ex.: "mar/2038" | "ano 12 do plano · meta de R$ 15.000 de hoje" |
| | sem meta (`metaRendaHoje = 0`): "—" | "defina sua meta em Viver de renda" |
| | meta não atingida: "não chega" | "em 15 anos a renda chega a 62% da meta" (última linha: `rendaDisponivel / metaDoMes`) |
| **Renda disponível no fim** | `rendaDisponivel` da última linha, na moeda escolhida | "aluguéis menos custos e parcelas" |
| **Patrimônio líquido no fim** | `patrimonioLiquido` da última linha, na moeda escolhida | "imóveis + caixa − dívidas; o FGTS fica de fora" |

O componente `Stat` ganha uma linha de apoio opcional (`apoio?: string`, `text-[11px] text-muted`).

**Novo grupo "Viver de renda"** (aberto de início), nesta ordem:

1. "Ano de transição para renda passiva" — **sai** de "Seus aportes" e vem para cá. Dica nova:
   *"A partir deste ano os aportes do bolso param. O que acontece com os aluguéis depende da escolha abaixo."*
2. "Depois da transição" (item 1.4).
3. **"Quanto você quer por mês para viver"** (`metaRendaHoje`), dica: *"Em reais de hoje. O simulador corrige esse valor pela inflação mês a mês."*

**Testes primeiro**

`indicadores.test.ts` (linhas montadas à mão, só com os campos usados):
1. Renda cruza a meta no mês 5 e não volta → 5.
2. Cruza no 5, cai no 9, volta no 11 e fica → 11.
3. Nunca cruza → `null`. Meta zerada em todas as linhas → `null`.
4. Cruza faltando 3 meses para o fim e fica até o fim → o mês do cruzamento.

`calc.test.ts`:
5. `metaDoMes` no mês 12 com `metaRendaHoje: 10_000, ipca: 5` → 10.500 (± 1).
6. `rendaDisponivel = rendaMensalLiquida − totalParcelasFinanciamento` em todo mês do cenário padrão (± 2).
7. Mais meta não muda nada no modo `'reinveste'` além de `metaDoMes` (o resto do diário é idêntico).

`planner-page.test.tsx`: os três cartões novos aparecem; o grupo "Viver de renda" começa aberto.

---

## 1.4 Depois da transição: viver da renda

**Parâmetro `aposTransicao`**: `'reinveste'` (como é hoje: só os aportes param) ou `'vive_da_renda'`
(padrão recomendado, decisão D2).

No modo `'vive_da_renda'`, a partir do mês seguinte ao da transição (`mes > mesTransicao`):

1. **A pessoa parou de trabalhar.** Não há mais depósito de FGTS (nem o do 13º). O saldo do fundo
   continua rendendo e continua valendo para abater o apê e comprar studio pronto (regras atuais).
2. **A parcela do apê sai do caixa.** Enquanto houver saldo devedor, `caixa −= parcelaApe` todo mês;
   o valor vai para `parcelaApePaga` da linha. (Antes da transição a parcela é paga pelo salário, fora
   do simulador, como hoje.)
3. **A família retira a meta, limitada ao que a renda deixa.** Depois de aluguéis, custos e parcelas:

   ```ts
   const disponivel = recebidoDoMes − custosDoMes − parcelasDoMes − parcelaApePagaDoMes
   const retiradaDoMes = Math.min(metaDoMes, Math.max(0, disponivel))
   caixa −= retiradaDoMes
   ```

   A retirada **nunca consome o caixa acumulado** nem o dinheiro de uma venda: vem só da renda do mês,
   e só depois de pagas as parcelas. O que passar da meta continua comprando studio.

`MonthRow` ganha `retirada` e `parcelaApePaga`. Os dois entram na identidade do saldo e no diário
(rótulos em `parametros.md`).

### A projeção precisa saber da retirada

Sem isso o planejador contaria com um aluguel que a família vai gastar. `caminhoDoCaixa` vira
`projetar`, que devolve as parcelas do caminho separadas:

```ts
type Projecao = {
  pontual: Float64Array      // aportes, pagamento de obra nas chaves — o que não é renda mensal
  recorrente: Float64Array   // aluguel líquido − parcelas de financiamento − parcela do apê (pós-transição)
  meta: Float64Array         // retirada desejada em cada mês futuro (0 antes da transição ou no modo 'reinveste')
  caminho: Float64Array      // saldo projetado do caixa, já com a retirada
}

const projetar = (mes: number): Projecao => {
  // 1. Preencha `pontual` e `recorrente` com EXATAMENTE o que caminhoDoCaixa soma hoje em `fluxo`:
  //    aportes e o `restante` das obras vão para `pontual`; aluguel e parcelas, para `recorrente`.
  //    No modo 'vive_da_renda', para os meses m = mes + k > mesTransicao com saldo devedor no apê,
  //    recorrente[k] −= parcelaApe (o valor de hoje, congelado).
  // 2. Meta congelada no valor de hoje, como o aluguel:
  const metaHoje = p.metaRendaHoje * fatorPreco(mes, p.ipca)
  let s = caixa
  for (let k = 0; k <= horizonte; k++) {
    const vive = k > 0 && p.aposTransicao === 'vive_da_renda' && mes + k > mesTransicao
    meta[k] = vive ? metaHoje : 0
    const retirada = Math.min(meta[k], Math.max(0, recorrente[k]))
    s += pontual[k] + recorrente[k] - retirada
    caminho[k] = s
  }
  return { pontual, recorrente, meta, caminho }
}
const folga = (mes: number) => projetar(mes).caminho.reduce((a, b) => Math.min(a, b), Infinity)
```

`cabeNaObra` passa a receber a projeção e a refazer o caminho com o efeito da compra. Duas condições:
o caixa não fica negativo **e a compra não reduz a retirada de nenhum mês**.

```ts
const cabeNaObra = (proj: Projecao, r: number, preco: number): boolean => {
  // valor, aluguel, saldo e amortizacao: como hoje
  let s = caixa
  for (let k = 0; k <= horizonte; k++) {
    const efeitoPontual = k === r ? -(pctChaves + docs) * valor : 0
    let efeitoRecorrente = 0
    if (k > r) {
      efeitoRecorrente += aluguel
      if (saldo > 0) { efeitoRecorrente -= amortizacao + saldo * juros; saldo = Math.max(0, saldo - amortizacao) }
    }
    const recSem = proj.recorrente[k]
    const recCom = recSem + efeitoRecorrente
    const retSem = Math.min(proj.meta[k], Math.max(0, recSem))
    const retCom = Math.min(proj.meta[k], Math.max(0, recCom))
    if (retCom < retSem - 0.01) return false          // não se compra studio com o dinheiro de viver
    s += proj.pontual[k] + efeitoPontual + recCom - retCom
    if (s < -0.01) return false
  }
  return true
}
```

Com `meta` toda zerada (`'reinveste'`), `retSem = retCom = 0` e a conta é a de hoje. Os três lugares que
chamam `cabeNaObra(caminhoDoCaixa(mes), …)` passam a chamar `cabeNaObra(projetar(mes), …)`.

**Na tela** — `ChoiceField` "Depois da transição" no grupo "Viver de renda":
opções **"Vivo da renda"** (`'vive_da_renda'`) e **"Reinvisto tudo"** (`'reinveste'`). Dica:

> *Vivo da renda: no ano de transição você para de trabalhar — aportes e depósitos de FGTS param — e
> passa a retirar a sua meta todo mês, limitada ao que os aluguéis deixam depois das parcelas. O que
> sobrar continua comprando studios. Reinvisto tudo: você só para de aportar; todo aluguel vira studio novo.*

**Primeiro aviso da tela.** Crie `web/src/planner/avisos.ts` e `web/src/pages/planner/PlannerAvisos.tsx`
(o pacote 3 acrescenta os outros avisos):

```ts
export type Aviso = { id: string; nivel: 'atencao' | 'saiba'; texto: string }
export function avisos(linhas: MonthRow[], p: PlannerParams): Aviso[]
```

- `saldo-negativo` (`'atencao'`): na primeira linha com `saldo < 0`: *"A partir de {mês/ano} o caixa fica
  negativo: as contas obrigatórias (parcelas, apê, custos fixos) passam do que entra. O plano não fecha
  como está."* — o motor nunca compra além do que o caixa aguenta, mas conta obrigatória (a parcela do apê
  depois da transição; nos pacotes seguintes, custo fixo da holding e parcela de consórcio) é paga mesmo
  sem dinheiro, e o diário mostra o buraco em vez de escondê-lo.
- `transicao-nao-cobre` (`'atencao'`): no modo `'vive_da_renda'`, se na primeira linha depois da transição
  `rendaDisponivel < metaDoMes`: *"Na transição ({mês/ano}) a renda disponível cobre {N}% da sua meta. Você
  retira só o que a renda permite — adie a transição ou reduza a meta para fechar a conta."*
- O painel é um `<details open>` com título **"Atenção (N)"**, logo abaixo dos cartões; cada aviso é um
  parágrafo que começa com "Atenção:" ou "Saiba:" (o nível nunca é dito só por cor). Sem aviso, o painel não aparece.

**Rodapé da página** — troque a última frase do texto "Como o sistema compra…" por:
*"No modo "vivo da renda", depois da transição a sua meta sai dos aluguéis antes de qualquer compra.
Simulação educativa, não é recomendação de investimento."*

**Testes primeiro** (`calc.test.ts`, bloco "viver da renda"; `vive = base({ aposTransicao: 'vive_da_renda', anoTransicao: 5, years: 15, metaRendaHoje: 8_000 })`)

1. `'reinveste'`: `retirada` e `parcelaApePaga` são 0 em todos os meses, com qualquer meta.
2. `vive`: até o mês 60 a retirada é 0; depois, em todo mês, `0 ≤ retirada ≤ metaDoMes + 1` e `retirada ≤ Math.max(0, rendaDisponivel) + 1`.
3. `vive` termina com **menos** patrimônio que o mesmo plano em `'reinveste'`.
4. Meta de 16.000 em vez de 8.000: soma das retiradas maior ou igual, patrimônio final menor ou igual.
5. Meta inalcançável (`metaRendaHoje: 5_000_000`): depois da transição, `retirada = Math.max(0, rendaDisponivel)` (± 1) em todo mês — tudo que sobra vai para a família — e o saldo não fica negativo.
6. FGTS: em `vive`, com `dividaApe: 0` e `custoStudio: 50_000_000` (nada é comprado), depois da transição `saldoFgts[m] / saldoFgts[m−1]` = `1 + taxa mensal de 5,5% a.a.` (± 0,0001); em `'reinveste'` a razão é maior (ainda há depósito).
7. Apê: em `vive` com `dividaApe: 5_000_000` (não quita), `parcelaApePaga > 0` depois da transição e 0 antes; em `'reinveste'`, sempre 0.
8. O saldo nunca fica negativo com `{ ...DEFAULT_PARAMS, aposTransicao: 'vive_da_renda' }` em 15 e em 25 anos.
9. A identidade do saldo fecha com `− retirada − parcelaApePaga`.

`avisos.test.ts`: o aviso `transicao-nao-cobre` aparece quando a renda da transição não cobre a meta, traz o
percentual certo, e não aparece em `'reinveste'`; `saldo-negativo` aparece com o mês/ano da primeira linha
de saldo negativo e não aparece quando o saldo nunca fica abaixo de zero.

`planner-ledger.test.tsx`: as linhas "− retirada para viver" e "− parcela do apê" aparecem quando há valor e somem quando é zero.

`api/tests/test_planner_model.py`: `aposTransicao` aceita os dois valores e recusa um terceiro; `metaRendaHoje` dentro e fora da faixa.

**Testes antigos que este pacote altera de propósito:** nenhum de `calc.test.ts` (todos usam `base()` com
`NEUTRO`). Em `planner-ledger.test.tsx`, o `linha()` de apoio ganha os campos novos zerados.

---

## 1.5 Aviso de novidades

Plano já salvo ganha os padrões novos nos campos que ainda não tinha (decisão D1): ao abrir a página
depois deste pacote, os números de quem já usava mudam. A pessoa precisa saber por quê.

- Constante em `PlannerPage.tsx`: `const NOVIDADES = { id: '2026-11-pacote-1', itens: [ … ] }` — uma frase
  por mudança que altera número. **Cada pacote seguinte acrescenta as frases dele e troca o `id`** (assim
  o aviso reaparece uma vez a cada entrega).
- Frases deste pacote:
  - "Os resultados agora aparecem em reais de hoje (dá para ver o valor nominal na chave acima dos cartões)."
  - "Depois da transição você passa a retirar a sua meta de renda; antes, todo aluguel era reinvestido. Dá para voltar em Viver de renda."
- Desenho: um `panel` acima da chave de moeda, título **"O simulador ficou mais realista"**, a lista, e o
  botão **"entendi"** (`chip`). Ao clicar, grava `localStorage['planner:novidades'] = NOVIDADES.id` e some.
  Só aparece se o valor gravado for diferente do `id`. `try/catch` em volta do `localStorage` (sem
  armazenamento, o aviso aparece e some até a página ser recarregada).

`planner-page.test.tsx`: aparece na primeira visita; some ao clicar em "entendi" e não volta ao remontar;
reaparece se o valor gravado for de outro `id`.

---

**Pronto quando:** tudo acima, mais a mensagem ao PO com o cenário padrão nos dois modos (studios,
patrimônio e renda disponível no fim, em reais de hoje e nominais) e o mês em que a meta é atingida.
