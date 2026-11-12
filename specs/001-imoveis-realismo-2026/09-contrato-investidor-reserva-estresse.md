# Pacote 9 — Contrato do plano investidor, reserva mínima e teste de estresse

**Por quê.** O PO compra na planta pelo "plano investidor" da construtora: sem juros, parcelado até as
chaves e, em algumas, os últimos 30% parcelados depois da entrega, também sem juros. Com dívida sem juros
o custo do crédito some e o que quebra um plano é **caixa**: parcelas de obra, reforços e pós-chaves
chegando juntas. Este pacote faz três coisas:

1. **Cronograma do contrato** (entrada, mensais, reforços, chaves, pós-chaves) no lugar do "X% até as chaves".
2. **Correção das parcelas pela média do INCC dos últimos 2 anos**, ajustável.
3. **Reserva mínima no caixa** e **teste de estresse**, para o plano não "fechar" no papel e quebrar no primeiro mês ruim.

Depende dos pacotes 2 e 4 (`projetar`, `parcelaSac`, `prazoFin`). **Ordem recomendada:** logo depois do
pacote 4 (`0 → 1 → 2 → 3 → 4 → 9 → 5 …`).

Neutros a acrescentar em `NEUTRO`: `cronograma: 'simples'`, `correcaoObraModo: 'incc'`, `reservaMeses: 0`.
Os campos do cronograma e `correcaoObraAno` não precisam de neutro (só valem nos modos novos).

---

## 9.1 Correção da obra pela média do INCC de 2 anos

**Dado (FGV, INCC-M em 12 meses):** 6,58% até out/2025 e 6,75% até out/2026 → média composta de 24 meses:
`(1,0658 × 1,0675)^(1/2) − 1 = 6,66% a.a.` Em `mercado.ts` acrescente
`inccMedia2anos: { valor: 6.66, texto: 'INCC-M em 12 meses: 6,58% até out/2025 e 6,75% até out/2026 (FGV); média composta de 6,66% a.a.' }`.

**Parâmetros:** `correcaoObraModo` (`'incc'` neutro | `'propria'` padrão) e `correcaoObraAno` (% a.a., padrão 6.66).

**Regra no motor:**

- `inccObraMensal = p.correcaoObraModo === 'incc' ? inccMensal : 1 + taxaMensal(p.correcaoObraAno)`.
- O que a construtora corrige com esse índice: **as parcelas de obra ainda devidas** (`restante`, e os
  valores do cronograma do item 9.2) **e o saldo que será parcelado depois das chaves**.
- O que continua no INCC dos lançamentos (`incc`): o **preço de mercado** (valor do studio na entrega,
  `valorNaEntrega`, preço de lançamento do mês). Mercado e contrato podem andar em ritmos diferentes.
- Trocas no `calc.ts` (modo simples): `u.restante *= inccObraMensal`; em `projetar`
  `u.restante × inccObraMensal^k`; em `cabeNaObra` e `novaNaObra`,
  `saldoFinanciadoInicial = P × (1 − pctChaves) × inccObraMensal^r` (P = preço de contrato);
  1º studio: `saldoFinanciadoInicial = (custoStudio − initial) × inccObraMensal^r1`.
  Com `correcaoObraModo: 'incc'` tudo isso é igual ao de hoje.

**Na tela** — grupo "Plano investidor (contrato)":

- `ChoiceField` **"Índice da obra"**: **"Meu valor"** (`'propria'`) e **"Igual ao INCC dos lançamentos"** (`'incc'`).
- Com "Meu valor": slider **"Correção das parcelas da obra"** (`correcaoObraAno`, 0–15, passo 0,05, `kind` pct),
  dica *"A construtora corrige as parcelas que faltam pelo INCC. O padrão é a média dos últimos 2 anos. Confira
  no seu contrato o índice e se há teto."* + referência `MERCADO.inccMedia2anos.texto`.
- Botão `chip` **"Usar a média do INCC dos últimos 2 anos (6,66%)"**: grava `correcaoObraAno = MERCADO.inccMedia2anos.valor`
  e `correcaoObraModo = 'propria'`. Mexer no slider também põe `'propria'`.

**Testes primeiro** (`calc.test.ts`, bloco "correção da obra"; `soUmaUnidade` do bloco do diário, `years: 6`)

1. `'incc'` → caracterização verde.
2. `'propria'` com `correcaoObraAno` igual ao `incc` do plano → diário idêntico ao de `'incc'`.
3. `correcaoObraAno` maior → mais `comprasImoveis` somados e menos patrimônio no fim (mesmos aportes).
4. `correcaoObraAno: 0` com `incc: 6`: a parcela de financiamento da unidade (mês 37) é menor que com `'incc'`, e o `patrimonioLiquido` do mês 40 é o mesmo nos dois (o mercado segue o `incc`).
5. O saldo nunca fica negativo nos três cenários do teste existente com `'propria'`.

`mercado.test.ts`: `inccMedia2anos.valor` está entre 6,6 e 6,7.

---

## 9.2 Cronograma do contrato

**Parâmetros** (todos em % do preço de contrato; padrão = plano investidor típico com 30% depois das chaves):

| Campo | Padrão | Significado |
|---|---|---|
| `cronograma` | `'contrato'` (neutro `'simples'`) | `'simples'` = `pctPagoChaves` como hoje |
| `entradaPct` | 10 | paga no ato da compra |
| `mensaisPct` | 25 | diluída em parcelas mensais iguais até as chaves |
| `reforcoPct` | 15 | diluída em reforços periódicos |
| `reforcoCadaMeses` | 12 | intervalo entre reforços |
| `chavesPct` | 20 | paga na entrega das chaves |
| `posChavesMeses` | 36 | meses em que o resto é parcelado depois das chaves |

**O que sobra depois das chaves:** `posChavesPct = 100 − (entradaPct + mensaisPct + reforcoPct + chavesPct)`
(derivado, não é campo). Regra de validação: a soma dos quatro nunca passa de 100.

**Arquivo novo:** `web/src/planner/contrato.ts`

```ts
export type Parcela = { k: number; pct: number; tipo: 'entrada' | 'mensal' | 'reforco' | 'chaves' }

/** % até as chaves: o `pctPagoChaves` do modo simples, ou a soma dos quatro do contrato. */
export const pctAteChaves = (p: PlannerParams): number
export const posChavesPct = (p: PlannerParams): number                 // 100 − pctAteChaves
export const prazoPosChaves = (p: PlannerParams): number              // contrato: posChavesMeses; simples: prazoFinMeses

/** As parcelas de um contrato fechado hoje, com `r` meses de obra pela frente (r = 0: pronto). */
export function cronograma(r: number, p: PlannerParams): Parcela[]
```

`cronograma(r, p)` — modo `'contrato'`, em % do preço de contrato `P`:

- `r = 0` (pronto): **uma** parcela `{k: 0, pct: pctAteChaves(p), tipo: 'entrada'}` (tudo o que vem até as chaves é pago na hora).
- `r ≥ 1`:
  - `{k: 0, pct: entradaPct, tipo: 'entrada'}`;
  - mensais: `r` parcelas, `k = 1 … r`, `pct = mensaisPct / r` cada;
  - reforços: `n = Math.floor((r − 1) / reforcoCadaMeses)`; se `n ≥ 1`, em `k = reforcoCadaMeses × i` (i = 1…n), `pct = reforcoPct / n` cada; **se `n = 0` o `reforcoPct` inteiro vai para as chaves**;
  - `{k: r, pct: chavesPct (+ reforcoPct se n = 0), tipo: 'chaves'}`.
- Soma dos `pct` = `pctAteChaves(p)` sempre (propriedade testada).
- Modo `'simples'` não usa esta função (o motor mantém o caminho de hoje).

**Valor de cada parcela** (modo contrato): para uma unidade comprada no mês `m0` com preço de contrato
`P`, a parcela do mês `m0 + k` vale `pct/100 × P × inccObraMensal^k`. (Mensal, reforço e chaves são
corrigidos desde a compra; a entrada não.)

**Documentação (ITBI, escritura, registro) no modo contrato:** paga **uma vez, no mês das chaves**
(`docs × P`, sem correção), e não mais diluída nas parcelas. Compra pronta: paga na compra. Isso é mais
fiel ao cartório e é a única mudança de timing de documentação do pacote.

**Integração em `calc.ts`:**

- `Unidade` ganha `parcelas: { mes: number; pct: number }[]` (as que faltam pagar, com `mes` absoluto),
  `precoContrato: number`, `mesCompra: number`, `docsAPagar: number`. `restante` e `fracaoDocs` valem só no modo simples.
- `const pctChaves = pctAteChaves(p) / 100` e `prazoFin = prazoPosChaves(p)` substituem os usos de
  `pctPagoChaves` / `prazoFinMeses` (piso de 10% do modo simples continua só nele).
- `novaNaObra(mes, r, preco)`: `parcelas = cronograma(r, p)` com `mes: mes + k`; saldo a financiar
  `posChavesPct/100 × P × inccObraMensal^r`, com `mesesRestantesFin = prazoFin` (parcelas via `parcelaSac`,
  juros `jurosFinHolding` — zero no plano investidor — e correção `correcaoFinAno`).
- **Mês a mês:** toda parcela com `mes === mesAtual` é paga (`pagarParcela`): `caixa −= valor`,
  `u.pago += valor`, soma em `comprasImoveis` e em `parcelasObraDoMes`; no mês das chaves paga também `docsAPagar`
  (soma em `docsDoMes`). Parcela obrigatória não espera caixa: se faltar dinheiro o saldo fica negativo e o
  aviso `saldo-negativo` mostra (não invente trava).
- **Adiantar com a sobra** (`sobraDoCaixa`): paga as parcelas **mais próximas primeiro**; adiantar o valor `V`
  em `mesAgora` consome `V / (P × inccObraMensal^(mesAgora − mesCompra))` pontos percentuais, em ordem de data
  (parcela parcial permitida). A parcela é removida/encolhida; `docsAPagar` não se adianta.
- **Comprar com `r = 0`:** paga `pctAteChaves(p)` na hora; nasce pronta com o saldo pós-chaves.
- **1º studio (`initial`):** não ganha cronograma (já foi pago em parte). Continua: `restante = 0`, o que falta
  (`custoStudio − initial`) corrigido por `inccObraMensal^r1` e parcelado em `prazoFin` depois das chaves
  (como hoje, só trocando o índice).
- **`projetar`:** para cada unidade em obra, cada parcela futura vira `pontual[k] −= valorCorrigido`
  (`k = parcela.mes − mes`), e `pontual[k das chaves] −= docsAPagar`. É prudente: a correção já está embutida.
- **`cabeNaObra(proj, r, preco)`:** o efeito pontual da candidata é `cronograma(r, p)` (com a mesma correção)
  mais a documentação no `k = r`; a dívida pós-chaves entra como hoje.
- Saída obrigatória vs. escolha: `parcelasObraDoMes` guarda só o que **estava no contrato** (mensal, reforço,
  chaves) — não a entrada do ato nem o adiantamento. Alimenta `obrigacoesMes` (item 9.4).

**`MonthRow` ganha:** `parcelasObra` (o `parcelasObraDoMes`), ver `parametros.md`.

**Na tela** — grupo "Plano investidor (contrato)" (depois do "Índice da obra"):

- `ChoiceField` **"Como a construtora cobra"**: **"Cronograma do contrato"** (`'contrato'`) e **"Simples (% até as chaves)"** (`'simples'`).
  No modo simples o grupo mostra o slider "% pago até pegar as chaves" de hoje (e o "Prazo do financiamento" do pacote 4);
  no modo contrato esses dois ficam escondidos (valem os do contrato).
- Sliders do modo contrato, rótulo → campo → faixa (passo):
  **"Entrada (no ato)"** `entradaPct` 0–50 (1) · **"Parcelas mensais até as chaves"** `mensaisPct` 0–80 (1) ·
  **"Reforços periódicos"** `reforcoPct` 0–40 (1) · **"Um reforço a cada"** `reforcoCadaMeses` 3–24 (1, `kind` meses) ·
  **"Na entrega das chaves"** `chavesPct` 0–60 (1) · **"Meses para parcelar o resto depois das chaves"** `posChavesMeses` 1–96 (1, meses).
- O `max` de cada um dos quatro percentuais é `100 − soma dos outros três` (nunca deixa passar de 100).
- Linha de resumo sob os sliders (texto, `text-[11px]`): *"Até as chaves: {pctAteChaves}% · Depois das chaves: {posChavesPct}% em {posChavesMeses} meses, sem juros."*
  (se `jurosFinHolding > 0`: troque "sem juros" por "com juros de {x}% ao mês").
- Dica do grupo: *"Reproduza o cronograma do seu contrato. Valores em % do preço do imóvel; as parcelas são
  corrigidas pelo índice acima. O plano real pode ter datas e valores próprios por parcela — aqui eles são
  espalhados em partes iguais."*
- Os juros e a correção do que é parcelado depois das chaves continuam nos campos do pacote 4 ("Juros do
  financiamento", "Correção do saldo devedor"); o botão **"Plano investidor"** do pacote 4 passa a também
  gravar `cronograma: 'contrato'` e os padrões da tabela acima.

**Exemplo de conferência** (`custoStudio` 260.000 como preço de contrato, compra com `r = 36`, `correcaoObraAno: 0` para
isolar o cronograma, `descontoAVista` e agio zerados):

| Parcela | Mês (k) | Valor |
|---|---|---|
| Entrada | 0 | 26.000,00 |
| Mensais (36) | 1 a 36 | 1.805,56 cada (total 65.000) |
| Reforços (n = ⌊35/12⌋ = 2) | 12 e 24 | 19.500,00 cada (total 39.000) |
| Chaves | 36 | 52.000,00 |
| Pós-chaves (SAC, 36 meses, sem juros) | 37 a 72 | 2.166,67 cada (total 78.000) |

Até as chaves: 182.000 (70%). Com `correcaoObraAno: 6.66` a parcela das chaves (k = 36) vale 52.000 × 1,0666³ ≈ 63.097 (± 5).

**Testes primeiro**

`contrato.test.ts`:
1. O exemplo acima, linha a linha (± 0,01), inclusive `n` de reforços e a soma 70%.
2. `cronograma(r, p)` soma sempre `pctAteChaves(p)` para `r` de 0 a 60 e para `reforcoCadaMeses` de 3 a 24.
3. `r = 0` devolve uma parcela só, em `k = 0`.
4. `r = 10`, `reforcoCadaMeses = 12` (n = 0): sem reforços; o `reforcoPct` vai para as chaves.
5. `r = 1`: entrada em 0, uma mensal e as chaves em 1.
6. `pctAteChaves` no modo simples devolve `pctPagoChaves`; `posChavesPct` é o complemento.

`calc.test.ts` (bloco "cronograma do contrato"; `unica = base({ initial: 0, monthlyAmount: 30_000, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, cronograma: 'contrato', correcaoObraAno: 0, correcaoObraModo: 'propria', years: 8 })`)
7. `'simples'` → caracterização verde.
8. Numa compra com 36 meses de obra: o `comprasImoveis` do mês da compra é a entrada; os 36 meses seguintes têm pagamento mensal; os meses 12 e 24 têm o reforço a mais (compare com o mês vizinho).
9. Total pago de uma unidade (soma de `comprasImoveis`) ao chegar nas chaves = `pctAteChaves%` do preço de contrato (± 1%), com `correcaoObraAno: 0` e sem adiantamento (`sobraDoCaixa: 'adianta_obra'` desligado: use `rendimentoCaixaAno` maior que o `incc` e `'automatico'`).
10. Documentação: `documentacao` é 0 entre a compra e as chaves e `docs × P` no mês das chaves.
11. Depois das chaves, a unidade paga exatamente `posChavesMeses` parcelas de financiamento e fica quitada.
12. `jurosFinHolding: 0` e `correcaoFinAno: 0`: a soma das parcelas pós-chaves é `posChavesPct%` do preço de contrato corrigido (± 1%).
13. Adiantar com a sobra paga primeiro a parcela mais próxima: com `rendimentoCaixaAno: 0` e aporte folgado, a parcela mensal do mês seguinte à compra é menor que a do contrato e a soma total das parcelas não muda (sem correção).
14. O saldo nunca fica negativo e a identidade do saldo fecha em `DEFAULT_PARAMS` (que já é `'contrato'` desde este pacote).
15. `totalImoveis = imoveisEmConstrucao + imoveisAlugados` em todo mês.

`planner-page.test.tsx`: o grupo aparece; no modo simples os sliders do contrato somem e o "% pago até pegar as chaves" volta; levar `entradaPct` a 50 reduz o `max` dos outros três.

`api/tests/test_planner_model.py`: os sete campos novos dentro e fora da faixa; soma dos quatro percentuais acima de 100 é **recusada na gravação** (`store.save_plan`, depois de mesclar com o plano salvo — leia `api/planner/store.py`) e, na leitura (`merged`), faz os quatro voltarem ao padrão.

---

## 9.3 Reserva mínima no caixa

**Problema medido:** o menor saldo do diário é sempre R$ 0, porque o planejador gasta tudo que a projeção
prudente permite. Com dívida sem juros ele tende a se comprometer até o limite. A reserva é o colchão.

**Parâmetro `reservaMeses`** (0 a 12; padrão 3; neutro 0): quantos meses de obrigações o caixa precisa
manter antes de o planejador gastar o resto.

**Obrigações** = saídas que a pessoa não escolhe: parcelas de financiamento, parcela de obra do contrato
(mensal, reforço, chaves), parcela do apê paga pelo caixa (só no modo "vivo da renda"), custo fixo da holding,
parcelas de consórcio. **Não** entram entradas de compra, adiantamentos, montagem nem lances (decisões).

**Regra** — `projetar` passa a devolver também `saidas: Float64Array` (cada obrigação futura, positiva, por `k`),
construído junto de `pontual`/`recorrente`:

```ts
const obrigacaoMedia = (saidas: Float64Array, extra?: Float64Array): number => {
  let soma = 0; let n = 0
  for (let k = 1; k <= 12 && k < saidas.length; k++) { soma += saidas[k] + (extra?.[k] ?? 0); n++ }
  return n === 0 ? 0 : soma / n
}
const reserva = (proj: Projecao, extra?: Float64Array) => p.reservaMeses * obrigacaoMedia(proj.saidas, extra)
const folgaLivre = (mes: number) => { const pr = projetar(mes); return pr.caminho.reduce((a, b) => Math.min(a, b), Infinity) - reserva(pr) }
```

- `cabeNaObra`: o caminho precisa ficar `≥ reserva(proj, saidasDaCandidata)` em todo `k` (e não só `≥ 0`).
  `saidasDaCandidata[k]` = parcelas de obra do contrato, financiamento e custo fixo (se a holding ainda não
  existia) que a compra cria, para `k = 1…12`.
- `folgaLivre` substitui `folga` em: adiantar obra, amortizar financiamento (pacote 4), compra com FGTS,
  reaplicação de venda, recompra de consórcio e contemplação (pacote 7).
- A reserva **não** é cobrada à força: se o caixa já está abaixo dela, o planejador só deixa de comprar; nada é vendido
  nem retirado. Com `reservaMeses: 0` a conta é a de hoje.
- Na tela o "menor saldo" do comparador (pacote 6) passa a ser lido junto com a reserva (item 9.4).

**Na tela** — grupo "Crédito e alavancagem", depois de "Dinheiro que sobra":
**"Reserva mínima no caixa"** (`reservaMeses`, 0–12, passo 1, `kind` meses), dica:
*"Quantos meses das suas obrigações (parcelas de obra, financiamento, apê, custos fixos) o caixa mantém guardados antes de comprar
o próximo studio. Com a dívida da construtora sem juros, o que quebra um plano é o caixa, não o custo. Zero = gasta tudo que a
projeção permite."*

**Testes primeiro** (`calc.test.ts`, bloco "reserva mínima"; `plano = base({ cronograma: 'contrato', ...})` com `soAporte({ monthlyAmount: 15_000 })`, `years: 10`)

1. `reservaMeses: 0` → caracterização verde.
2. Com `reservaMeses: 3`, o menor `saldo` do diário **depois da primeira compra** é maior que com 0.
3. Com 3, o número de studios no mês 60 é menor ou igual ao de 0.
4. Com 3, em todo mês depois da primeira compra, `saldo ≥ 0` e o menor saldo dos 12 meses seguintes a cada compra do planejador é `≥ 0,8 × reserva` do mês da compra (tolerância porque o aluguel real difere do projetado).
5. `reservaMeses` maior nunca aumenta `totalImoveis` do mês 60.
6. A reserva não bloqueia o aporte nem faz o saldo cair: um plano sem nenhuma compra possível (`custoStudio: 50_000_000`) tem o mesmo diário com `reservaMeses` 0 e 12.
7. Em `DEFAULT_PARAMS` o saldo nunca fica negativo (os testes existentes).

---

## 9.4 Teste de estresse

**`MonthRow` ganha** `obrigacoesMes` (positivo) = `totalParcelasFinanciamento + parcelasObra + parcelaApePaga + custoFixoHolding + parcelasConsorcio`
do mês (campos que não existirem ainda contam 0).

**Em `indicadores.ts`:**

```ts
/** Meses que o caixa do mês paga as obrigações do mês sem NENHUM aluguel, aporte ou retirada. Infinity sem obrigações. */
export const folego = (l: MonthRow): number => (l.obrigacoesMes > 0 ? Math.max(0, l.saldo) / l.obrigacoesMes : Infinity)
/** Quanto das obrigações o fluxo recorrente cobre: (renda líquida dos aluguéis + aporte mensal) / obrigações. Infinity sem obrigações. */
export const coberturaObrigacoes = (l: MonthRow): number =>
  l.obrigacoesMes > 0 ? (l.rendaMensalLiquida + l.aporteMensal) / l.obrigacoesMes : Infinity

export type Estresse = {
  piorFolego: { meses: number; mes: number } | null        // menor `folego` entre os meses com obrigação; `mes` = campo mes da linha
  piorCobertura: { razao: number; mes: number } | null
  picoObrigacoes: { valor: number; mes: number } | null
}
export function estresse(linhas: MonthRow[]): Estresse    // só considera meses com obrigacoesMes > 0
```

**Painel "Teste de estresse"** (largura inteira, abaixo do "Vale financiar?"; some se não houver obrigação):

- Três `Stat` (o componente da página): **"Menor fôlego de caixa"** — `{N} meses` + apoio *"em {mês/ano}: quanto o caixa paga sem nenhum aluguel"*;
  **"Pior cobertura das obrigações"** — `{X}×` + apoio *"em {mês/ano}: aluguéis e aporte contra parcelas"*;
  **"Maior obrigação mensal"** — valor na moeda escolhida + apoio *"em {mês/ano}"*.
- Frase abaixo: *"Se nenhum studio render a partir de {mês/ano}, o caixa aguenta {N} meses de obrigações. O ideal é ter pelo menos
  {reservaMeses} (a sua reserva mínima)."* (sem reserva configurada, use 3 como referência.)
- Valores com `Infinity` aparecem como "—".

**Avisos** (`avisos.ts`):

| id | Nível | Quando | Texto |
|---|---|---|---|
| `folego-curto` | `'atencao'` | `piorFolego.meses < 3` (ou `< reservaMeses` se for menor) | *"Em {mês/ano} o caixa paga só {N} meses de obrigações se nenhum studio render. Aumente a reserva mínima, reduza a parte financiada ou espaçe as compras."* |
| `cobertura-baixa` | `'saiba'` | `piorCobertura.razao < 1` | *"Em {mês/ano} aluguéis e aporte cobrem {X}× das parcelas: o resto sai do caixa. Funciona enquanto o caixa aguenta."* |

**Comparador (pacote 6):** `Resultado` ganha `piorFolegoMeses: number | null` e a tabela uma coluna **"Menor fôlego"**
(célula com a palavra "meses"; "—" quando não há obrigação); no celular entra na coluna "Risco".

**Testes primeiro** (`indicadores.test.ts`, linhas montadas à mão)

1. `folego`: saldo 30.000, obrigações 10.000 → 3; obrigações 0 → `Infinity`; saldo negativo → 0.
2. `coberturaObrigacoes`: renda 6.000, aporte 4.000, obrigações 20.000 → 0,5.
3. `estresse` escolhe o mês de menor fôlego e o de menor cobertura entre vários, e ignora meses sem obrigação.
4. `estresse([])` e linhas sem obrigação → tudo `null`.

`calc.test.ts`:
5. `obrigacoesMes` é 0 antes da primeira compra e positivo depois; é ≥ `totalParcelasFinanciamento` sempre.
6. Em `DEFAULT_PARAMS`, `obrigacoesMes` inclui a parcela de obra nos meses de contrato (≥ `parcelasObra`).

`avisos.test.ts`: `folego-curto` aparece com um plano sem reserva (`reservaMeses: 0`, aporte curto) e some com `reservaMeses: 6`; `cobertura-baixa` idem com razão < 1.

`planner-page.test.tsx`: o painel "Teste de estresse" aparece com os três cartões.

---

## Fecho do pacote

- `api/planner/model.py` e `test_planner_model.py`: `cronograma` e `correcaoObraModo` (enums); `correcaoObraAno`, `entradaPct`,
  `mensaisPct`, `reforcoPct`, `reforcoCadaMeses`, `chavesPct`, `posChavesMeses`, `reservaMeses` (limites em `parametros.md`);
  regra da soma ≤ 100. Backend **antes** do frontend no deploy.
- Comparador (pacote 6): a linha `investidor` passa a usar o cronograma do contrato; a linha `banco` força `cronograma: 'simples'`.
- Rodapé da página: troque a frase do financiamento por *"No plano investidor a construtora cobra entrada, parcelas e reforços
  corrigidos pelo índice que você escolher, e o resto depois das chaves; o sistema só compra se o caixa projetado cobrir tudo
  isso e ainda manter a sua reserva."*
- `NOVIDADES`: "Novo: o cronograma do contrato da construtora, a correção pela média do INCC e uma reserva mínima de caixa."
- `CLAUDE.md`: seção do simulador, com o que mudou e o aviso de que `restante` só vale no modo simples.
- Mensagem ao PO com o cenário padrão antes e depois (studios, patrimônio, renda, menor saldo, menor fôlego), e o mesmo
  cenário com `reservaMeses` 0, 3 e 6.
