# Pacote 2 — Precisão do motor

Cinco correções de modelo. Nenhuma é "feature": cada uma tira um otimismo ou um pessimismo que o
motor tem hoje. Todas têm valor neutro (ficam desligadas nos testes de mecânica).

Neutros a acrescentar em `NEUTRO`: `prazoApeMeses: 0`, `mesesEntrega1o: 36`, `custoMontagem: 0`,
`mesesAteAlugar: 0`, `rendimentoCaixaAno: 0`, `sobraDoCaixa: 'adianta_obra'`, `custoFixoHoldingMes: 0`.

Depende do pacote 1 (`fatorPreco`, `ipca`, `projetar`).

---

## 2.1 O apê amortiza todo mês (SAC)

**Hoje:** o saldo devedor do apartamento só cai quando o FGTS abate, de 2 em 2 anos. As parcelas pagas
todo mês não amortizam nada. Com dívida de R$ 400 mil e parcela de R$ 4 mil, o motor quita no mês 120;
com a tabela do banco quitaria no mês 96 — dois anos antes de o FGTS começar a comprar studio.

**Parâmetro `prazoApeMeses`**: meses que faltam no financiamento do apê. `0` = "só o FGTS abate" (neutro).

**Regra (quando `prazoApeMeses > 0` e `dividaApe > 0`):**

```ts
// antes do laço
const sacApe = p.prazoApeMeses > 0 && p.dividaApe > 0
// a taxa sai dos três números que a pessoa informou: parcela = saldo/prazo + saldo × taxa
const taxaApe = sacApe ? Math.max(0, p.parcelaApeAtual / p.dividaApe - 1 / p.prazoApeMeses) : 0
let mesesRestantesApe = Math.round(p.prazoApeMeses)

// todo mês, ANTES do bloco do saque de FGTS
const apeTinhaSaldo = saldoApe > 0
if (sacApe) {
  if (saldoApe > 0) {
    const amortizacao = mesesRestantesApe > 1 ? saldoApe / mesesRestantesApe : saldoApe
    parcelaApe = amortizacao + saldoApe * taxaApe        // a parcela DESTE mês
    saldoApe -= amortizacao
    if (saldoApe < 0.5) saldoApe = 0
    mesesRestantesApe = Math.max(0, mesesRestantesApe - 1)
  } else {
    parcelaApe = 0
  }
}
```

- **Saque de FGTS no modo SAC:** só `saldoApe -= abatimento` e `fgtsSaldo -= abatimento`. Não use a
  conta proporcional `parcelaNova = parcelaApe × saldoNovo/saldoApe` nem some em `extraDoApe`: no mês
  seguinte a parcela já sai menor sozinha (ela é função do saldo). No modo antigo (`prazoApeMeses = 0`)
  o bloco fica exatamente como está.
- **A queda da parcela vira aporte** (a regra do PO, agora mês a mês): no modo SAC, depois do bloco do
  FGTS, `extraDoApe = Math.max(0, p.parcelaApeAtual - parcelaApe)`. Quando o apê quita, a parcela vai a
  zero e a parcela inteira vira aporte.
- **Depois da transição no modo "vivo da renda"** (pacote 1): paga-se `parcelaApe` do caixa enquanto
  `apeTinhaSaldo`. Na projeção, a parcela de hoje entra em `recorrente` só para `k ≤ mesesRestantesApe`
  (no modo antigo, para todo `k`).
- `MonthRow` ganha `saldoApe` e `parcelaApe` (nos dois modos).

**Na tela** — grupo "Seu apartamento", depois da parcela:
**"Prazo que falta no financiamento do apê"**, dica: *"Com isso o simulador amortiza o apê todo mês, como
o banco faz (tabela SAC): a parcela cai um pouco a cada mês e essa queda vira aporte. Zero = o apê só
cai com o FGTS."*

Diário: a coluna "FGTS" do desktop passa a se chamar **"FGTS e apê"** e ganha a linha "saldo do apê"
(`saldoApe`, some quando é zero). No celular, a coluna "Saldos" ganha a linha "apê".

**Exemplo de conferência** (dívida 400.000, parcela 4.000, prazo 300 → taxa de 0,6667% a.m.):

| Mês | Amortização | Juros | Parcela | Saldo depois |
|---|---|---|---|---|
| 1 | 1.333,33 | 2.666,67 | 4.000,00 | 398.666,67 |
| 2 | 1.333,33 | 2.657,78 | 3.991,11 | 397.333,33 |
| 3 | 1.333,33 | 2.648,89 | 3.982,22 | 396.000,00 |

**Testes primeiro** (`calc.test.ts`, bloco "apê em SAC";
`ape = base({ dividaApe: 400_000, parcelaApeAtual: 4_000, prazoApeMeses: 300, salarioBrutoCasal: 0, monthlyAmount: 1_000, annualAmount: 0, dissidio: 0, initial: 0, custoStudio: 50_000_000, years: 3 })`)

1. Mês 1: `saldoApe` 398.667, `parcelaApe` 4.000, `aporteMensal` 1.000. Mês 2: 397.333, 3.991, 1.009. Mês 3: 396.000, 3.982, 1.018 (todos ± 1).
2. `saldoApe` e `parcelaApe` nunca sobem de um mês para o outro.
3. Com salário (FGTS abatendo), o apê quita **antes** do que com `prazoApeMeses: 0` (compare o primeiro mês com `saldoApe === 0` nos dois modos; padrões: 96 contra 120).
4. No mês seguinte à quitação, `aporteMensal` inclui a parcela inteira (`monthlyAmount + parcelaApeAtual`, antes da transição e sem dissídio).
5. `parcelaApeAtual: 1_000` com `dividaApe: 400_000, prazoApeMeses: 300` (parcela menor que a amortização): taxa vira 0, nenhum `NaN`, saldo cai 1.333 por mês.
6. `prazoApeMeses: 0` → diário idêntico ao de antes (caracterização).
7. O FGTS só compra studio depois que `saldoApe` chega a zero (a regra atual continua valendo no modo SAC).

---

## 2.2 O 1º studio já está em obra há algum tempo

**Hoje:** "Já pago no 1º studio" cria uma unidade que entrega em `prazoObraMeses` — como se tivesse sido
comprada hoje. Quem já pagou R$ 75 mil normalmente está a 12 ou 24 meses das chaves, não a 36.

**Parâmetro `mesesEntrega1o`** (0 a 60; `0` = já entregue).

```ts
if (p.initial > 0) {
  const r1 = Math.round(Math.min(120, Math.max(0, p.mesesEntrega1o)))
  const fator1 = Math.pow(inccMensal, r1)
  const saldoFinanciadoInicial = Math.max(0, (p.custoStudio - p.initial) * fator1)
  unidades.push({ mesPronto: r1, pago: p.initial, valorNaEntrega: p.custoStudio * fator1, saldoFinanciado: saldoFinanciadoInicial, /* resto como hoje */ })
}
```

- `horizonte` passa a ser `Math.max(prazoObra, r1) + PRAZO_FIN_HOLDING_MESES` (senão o fim do
  financiamento do 1º studio fica fora da projeção quando `r1 > prazoObra`).
- O resto da regra do 1º studio **não muda**: o que falta dele (`custoStudio − initial`, corrigido pelo
  INCC até as chaves) continua sendo financiado inteiro nas chaves.
- Com `r1 = 0` a unidade nasce pronta: aluga e paga parcela desde o mês 1.

**Na tela** — grupo "Seus aportes", logo depois de "Já pago no 1º studio":
**"Meses até a entrega do 1º studio"**, dica: *"Quanto falta para pegar as chaves do studio que você já
está pagando. Zero = já entregue."*

**Teste antigo que este item altera de propósito:** em "o tempo de obra é configurável"
(`simulateMonthly — o diário de bordo mês a mês`), passe `mesesEntrega1o: 24` junto com
`prazoObraMeses: 24`. A asserção não muda.

**Testes primeiro**

1. `mesesEntrega1o: 12` → em construção até o mês 11, com chaves no 12.
2. `mesesEntrega1o: 0` → `imoveisAlugados` é 1 já no mês 1 e há `aluguelRecebido` no mês 1.
3. `prazoObraMeses: 48` com `mesesEntrega1o: 12` → o 1º studio entrega no mês 12 (não segue mais o tempo de obra das compras novas).
4. `mesesEntrega1o: 60` com `prazoObraMeses: 36` → o saldo não fica negativo e a unidade fica quitada 48 parcelas depois do mês 60.
5. O ano 0 continua sendo exatamente o que já foi pago (teste existente, não mexer).

---

## 2.3 Montagem e tempo até o primeiro aluguel

**Hoje:** o studio pega as chaves e aluga no mesmo mês, sem gastar um real. Na prática a unidade é
entregue sem piso, box, armário ou luminária, e leva um tempo para achar inquilino.

**Parâmetros:** `custoMontagem` (R$ de hoje por studio) e `mesesAteAlugar`.

**Regra:**

- `Unidade` ganha `mesAlugavel` (`mesPronto + Math.round(p.mesesAteAlugar)`) e `montada: boolean`.
- `montagemNoMes(m) = p.custoMontagem × fatorPreco(m, p.ipca)` — o pacote 5 troca `p.custoMontagem`
  pela média com a montagem de temporada.
- **Paga-se a montagem** (`caixa −= …`, soma em `montagemDoMes`, marca `montada = true`):
  - na compra de studio pronto (`comprarPronta`), no mês da compra;
  - nas chaves de quem veio da obra: num passo próprio do bloco "Obra", para toda unidade com
    `mes === u.mesPronto && !u.montada` (o 1º studio tem `restante = 0` e hoje é pulado por aquele laço —
    por isso o passo é separado).
  - 1º studio com `mesesEntrega1o = 0`: nasce `montada = true` e `mesAlugavel = 0` (já está alugado).
- **Montagem é gasto**, não entra em `pago` nem no patrimônio.
- **Entre as chaves e o primeiro aluguel** (`u.mesPronto ≤ mes < u.mesAlugavel`): não há aluguel, e IPTU
  e condomínio são do dono por inteiro, quem quer que pague no contrato:
  `custoParado(valor) = valor × (p.iptuPctAno + p.condominioPctAno) / 100 / 12`.
  No laço de aluguéis: `conta = mes >= u.mesAlugavel ? contaDoAluguel(...) : { liquido: -custoParado(valor), custos: custoParado(valor) }`
  (assim `recebidoDoMes` soma zero e `custosDoMes` soma o custo parado). A parcela do financiamento é
  cobrada normalmente desde as chaves.
- **Projeção** (`projetar`): para cada unidade, aluguel só a partir de `u.mesAlugavel`; entre as chaves e
  esse mês, `recorrente[k] −= custoParado(valor)`; para unidade em obra ainda não montada,
  `pontual[k das chaves] −= montagemNoMes(u.mesPronto)`.
- **`cabeNaObra`:** em `k === r`, `efeitoPontual −= montagemNoMes(mes + r)`; aluguel só quando
  `k > r + mesesAteAlugar`; em `r < k ≤ r + mesesAteAlugar`, `efeitoRecorrente −= custoParado(valor)`.
- **Compra pronta precisa do dinheiro da montagem:** em todo lugar que hoje usa
  `custoPronto = precoPronto × (1 + docs)`, some `montagemNoMes(mes)` (teste de reaplicação da venda e
  laço de recompra). Na compra com FGTS, a condição vira
  `precoPronto − doFgts + precoPronto × docs + montagemNoMes(mes) > Math.max(0, folga(mes))` → não compra.
- **`avaliaVenda`:** o caminho "pronto" já recebe `custoPronto` (agora com montagem) e conta aluguel por
  `horizonte − mesesAteAlugar` meses; o caminho "planta" passa a ser
  `(liquido / ((pctChaves + docs) × precoPronto)) × (pctChaves × precoPronto × fatorObra − montagemNoMes(mes + horizonte))`
  — com montagem zero é a mesma conta de hoje. `avaliaVenda` ganha os argumentos de que precisar para isso.
- `MonthRow` ganha `montagem`. `imoveisAlugados` continua contando toda unidade com chaves (o rótulo
  "Alugados" do diário não muda).

**Na tela** — grupo "O studio":

- **"Montagem para alugar (por studio)"**, dica: *"Acabamento que falta na entrega e mobília básica, em
  reais de hoje. Sai do caixa nas chaves — ou na compra, se o studio já está pronto. Estimativa: troque pelo seu orçamento."*
- **"Meses até o primeiro aluguel"**, dica: *"Tempo entre pegar as chaves e o primeiro inquilino entrar.
  Nesse período IPTU e condomínio são seus."*

**Testes primeiro** (bloco "montagem e tempo até alugar";
`uma = base({ monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 5, ipca: 0 })` — a unidade do `initial` entrega no mês 36)

1. `mesesAteAlugar: 2` → `aluguelRecebido` é 0 nos meses 36 e 37 e maior que 0 no 38.
2. Com `mesesAteAlugar: 2`, `iptuPctAno: 1.2, condominioPctAno: 2.4` (pagador inquilino): `custosImovel` do mês 36 = valor da unidade na entrega (`custoStudio × (1 + incc/100)³`) × 3,6% / 12 (± 2), e o do mês 37 é igual ou um pouco maior (a unidade valorizou um mês). No mês 38, já alugada, esse custo some (inquilino paga, sem vacância).
3. `custoMontagem: 10_000` → `montagem` é 10.000 no mês 36 e 0 nos outros; com `ipca: 5`, o valor do mês 36 é 10.000 × 1,05³ (± 1).
4. O patrimônio final com montagem é menor que sem (mesmos parâmetros).
5. A parcela do financiamento é cobrada no mês 36 mesmo sem aluguel.
6. Compra com FGTS e montagem: no cenário `comFgtsFolgado` (do bloco de FGTS) com `custoMontagem: 20_000`, o mês da compra tem `montagem > 0` e `saldo ≥ 0`.
7. A identidade do saldo fecha com `− montagem`.
8. Com os dois em zero, diário idêntico (caracterização).

---

## 2.4 O caixa rende — e a sobra vai para onde rende mais

**Hoje:** o dinheiro parado esperando a próxima compra rende 0%. E toda sobra é adiantada na obra, que
"rende" o INCC (~6,75% a.a.), mesmo quando o caixa aplicado rende mais.

**Parâmetros:** `rendimentoCaixaAno` (% a.a., líquido de imposto) e `sobraDoCaixa`.

**Regra:**

- Primeira coisa do mês, depois de zerar os acumuladores:
  `const rendimentoDoMes = Math.max(0, caixa) × taxaMensal(p.rendimentoCaixaAno); caixa += rendimentoDoMes`.
  Vai para `rendimentoCaixa` da linha.
- **O rendimento não entra na projeção.** Ela continua prudente: dinheiro que ainda não rendeu não paga compromisso.
- `sobraDoCaixa`:
  - `'adianta_obra'` (neutro): o bloco "Adianta, na obra que entrega primeiro…" fica como está.
  - `'automatico'` (padrão): só adianta obra se `p.incc > p.rendimentoCaixaAno`; senão a sobra fica no
    caixa, rendendo, e o `restante` é pago nas chaves. (O pacote 4 acrescenta "quitar financiamento" como destino.)

**Na tela:**

- Grupo "Mercado": **"Rendimento do caixa"**, dica: *"Quanto rende, líquido de imposto, o dinheiro que
  fica parado esperando a próxima compra."*
- Grupo "Crédito e alavancagem" (crie o grupo se ainda não existir; o pacote 4 o completa): `ChoiceField`
  **"Dinheiro que sobra"**, opções **"Automático"** (`'automatico'`) e **"Adianta a obra"** (`'adianta_obra'`).
  Dica: *"Automático: a sobra vai para onde rende mais — adiantar a obra (corrigida pelo INCC), quitar
  financiamento ou ficar aplicada no caixa."*

**Testes primeiro** (bloco "rendimento do caixa")

1. Caixa parado rende: `base({ initial: 0, monthlyAmount: 10_000, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, custoStudio: 50_000_000, rendimentoCaixaAno: 12, years: 1 })` → `rendimentoCaixa` é 0 no mês 1 e 95 no mês 2 (10.000 × 0,9489%, ± 1); `saldo` do mês 12 maior que 120.000.
2. Rendimento maior nunca deixa menos patrimônio no fim (0 contra 8, em `DEFAULT_PARAMS`).
3. `'automatico'` com `rendimentoCaixaAno: 10` e `incc: 6`: a soma de `comprasImoveis` nos meses **anteriores** ao primeiro mês com `imoveisAlugados > 0` é 0 (nada é adiantado; o pagamento cai inteiro nas chaves); com `'adianta_obra'` e os mesmos números, essa soma é maior que 0. (Use o `soAporte({ monthlyAmount: 10_000 })` do bloco do planejador.)
4. `'automatico'` com `rendimentoCaixaAno: 2` e `incc: 6` → diário idêntico ao de `'adianta_obra'` com os mesmos números.
5. O saldo nunca fica negativo nos três cenários do teste existente, agora também com `rendimentoCaixaAno: 10, sobraDoCaixa: 'automatico'`.
6. A identidade do saldo fecha com `+ rendimentoCaixa`.

---

## 2.5 Custo fixo da holding

**Hoje:** a holding não custa nada para existir. Contador, taxas e certificado digital são um custo
mensal que não depende de quantos studios há.

**Parâmetro `custoFixoHoldingMes`** (R$ de hoje por mês).

**Regra:**

- A holding passa a custar a partir do mês em que existe a primeira unidade (em obra ou pronta). Com
  `initial > 0`, desde o mês 1. Guarde `teveUnidade` (vira `true` na primeira unidade e nunca volta).
- Todo mês, no bloco dos aluguéis (antes da retirada do pacote 1):
  `custoFixoDoMes = teveUnidade ? p.custoFixoHoldingMes × fatorPreco(mes, p.ipca) : 0; caixa −= custoFixoDoMes`.
- `rendaDisponivel` passa a subtrair `custoFixoDoMes` (e, portanto, a retirada também).
- **Projeção:** `recorrente[k] −= custoFixoDeHoje` para todo `k ≥ 1`, se `teveUnidade`. Em `cabeNaObra`,
  se `!teveUnidade`, a compra candidata traz o custo junto: `efeitoRecorrente −= custoFixoDeHoje` para `k ≥ 1`.
- Se não houver dinheiro (plano sem aporte e sem aluguel), o saldo fica negativo e o diário mostra —
  isso é um plano inviável, não um erro do motor. Não invente trava.
- `MonthRow` ganha `custoFixoHolding`.

**Na tela** — grupo "Custos do aluguel", por último:
**"Custo fixo da holding"**, dica: *"Contador, taxas e certificado da empresa, por mês, em reais de hoje.
Estimativa: troque pelo que o seu contador cobra."*

**Testes primeiro** (bloco "custo fixo da holding")

1. `custoFixoHoldingMes: 1_000, ipca: 0` → `custoFixoHolding` é 1.000 em todo mês (com `initial > 0`).
2. Com `ipca: 6`, o valor do mês 12 é 1.060 (± 1).
3. `initial: 0` e aportes pequenos: enquanto `totalImoveis` é 0, `custoFixoHolding` é 0; a partir da 1ª compra, é cobrado.
4. Patrimônio final menor com custo fixo do que sem.
5. `rendaDisponivel` desconta o custo fixo.
6. A identidade do saldo fecha com `− custoFixoHolding`.
7. O saldo nunca fica negativo com `{ ...DEFAULT_PARAMS }` depois deste item.

---

## Fecho do pacote

- `api/planner/model.py` e `test_planner_model.py`: os sete campos, com padrões, faixas e os dois enums.
- `planner-ledger.test.tsx`: as linhas novas ("+ rendimento do caixa", "− montagem (acabamento e mobília)",
  "− custo fixo da holding", "saldo do apê") aparecem com valor e somem com zero.
- Rodapé da página — acrescente ao texto "Como o sistema compra…": *"O que sobra é adiantado na obra, ou
  fica aplicado no caixa quando isso rende mais."* (no lugar de "O que sobra é adiantado nas obras em andamento.")
- `NOVIDADES` (item 1.5) — acrescente e troque o `id`:
  - "O apê agora amortiza todo mês, e o dinheiro parado no caixa rende."
  - "Cada studio tem custo de montagem e um tempo até o primeiro aluguel; a holding tem custo fixo mensal."
- Mensagem ao PO: cenário padrão antes e depois (studios, patrimônio, renda disponível, mês em que o apê
  quita, maior saldo parado).
