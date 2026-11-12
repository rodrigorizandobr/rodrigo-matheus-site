# Pacote 4 — Crédito e alavancagem

**Por quê.** O PO quer mais alavancagem. Hoje existe uma linha só (48 meses, sem correção), e a tela não
diz se alavancar compensa. Medido no motor atual, com aluguel e juros de mercado: quem paga 100% nas
chaves termina 15 anos com R$ 4,44 mi; quem financia 90% termina com R$ 3,44 mi. E esticando o prazo
para 360 meses a 0,91% a.m. (30% financiado), a renda sobe de R$ 15,6 mil para R$ 17,5 mil, mas o
patrimônio cai de R$ 4,49 mi para R$ 4,37 mi. **Alavancar em 2026 compra mais studios e mais renda, não
mais patrimônio.** Este pacote dá as linhas de crédito reais e mostra a conta.

Neutros a acrescentar em `NEUTRO`: `prazoFinMeses: 48`, `correcaoFinAno: 0`, `comprometimentoMaxPct: 0`.
(`sobraDoCaixa` já é neutro desde o pacote 2.)

Depende dos pacotes 2 e 3.

---

## 4.1 Prazo e correção monetária do financiamento

**Parâmetros:** `prazoFinMeses` (hoje a constante `PRAZO_FIN_HOLDING_MESES = 48`) e `correcaoFinAno`
(IPCA ou IGP-M na construtora, TR no banco; hoje zero).

**Arquivo novo:** `web/src/planner/credito.ts`

```ts
/** Uma parcela em SAC com correção monetária do saldo. `jurosMes` e `correcaoMes` em fração (0,01 = 1%). */
export function parcelaSac(saldo: number, mesesRestantes: number, jurosMes: number, correcaoMes: number):
  { parcela: number; amortizacao: number; juros: number; saldoDepois: number }
// corrigido    = saldo × (1 + correcaoMes)
// amortizacao  = mesesRestantes <= 1 ? corrigido : corrigido / mesesRestantes
// juros        = corrigido × jurosMes
// saldoDepois  = corrigido − amortizacao      (0 quando mesesRestantes <= 1)

/** Custo efetivo anual de uma linha: juros ao mês compostos + correção. Em %. */
export const custoAnualDoCredito = (jurosMesPct: number, correcaoAnoPct: number): number =>
  (Math.pow(1 + jurosMesPct / 100, 12) * (1 + correcaoAnoPct / 100) - 1) * 100
```

**Em `calc.ts`:**

- `Unidade.amortizacaoMensal` sai; entra `mesesRestantesFin` (igual a `prazoFin` quando a unidade nasce
  com saldo a financiar; 0 quando não tem). Três lugares criam unidade: o 1º studio, `novaNaObra` e `comprarPronta`.
- `const prazoFin = Math.max(1, Math.round(p.prazoFinMeses))`, `const correcaoMensal = taxaMensal(p.correcaoFinAno)`.
- No laço do mês, para unidade pronta com saldo:
  `const x = parcelaSac(u.saldoFinanciado, u.mesesRestantesFin, juros, correcaoMensal)` →
  `parcelasDoMes += x.parcela; u.saldoFinanciado = x.saldoDepois; u.mesesRestantesFin -= 1`.
- `projetar` e `cabeNaObra` usam a mesma função para simular as parcelas futuras (com a correção — a
  projeção é prudente).
- `horizonte = Math.max(prazoObra, r1) + prazoFin + Math.round(p.mesesAteAlugar)`. Depois desse mês não
  existe parcela de nada que já foi comprado, então a projeção cobre tudo.
- A constante `PRAZO_FIN_HOLDING_MESES` some.
- O saldo que uma unidade em obra vai financiar continua fixado na compra (já com o INCC até as chaves);
  a correção só corre depois das chaves.

**Na tela** — grupo "Crédito e alavancagem", nesta ordem:

1. (item 4.2) as duas linhas prontas
2. "% pago até pegar as chaves" — vem do grupo "O studio". Dica nova: *"O resto é financiado nas chaves, nas condições abaixo."*
3. "Juros do financiamento (ao mês)" — o `jurosFinHolding`, vem do grupo "O studio", rótulo novo.
4. **"Correção do saldo devedor"** (`correcaoFinAno`), dica: *"Índice que corrige a dívida além dos juros: IPCA ou IGP-M na construtora, TR no banco."*
5. **"Prazo do financiamento"** (`prazoFinMeses`), dica: *"Em quantos meses o saldo financiado nas chaves é pago, em tabela SAC: parcela maior no começo, caindo todo mês."*
6. (item 4.3) limite de parcelas
7. "Dinheiro que sobra" (já existe desde o pacote 2)

**Exemplos de conferência**

- `parcelaSac(100_000, 100, 0.01, 0)` → amortização 1.000, juros 1.000, parcela 2.000, saldo depois 99.000.
- `parcelaSac(100_000, 100, 0.01, 0.005)` → corrigido 100.500; amortização 1.005; juros 1.005; parcela 2.010; saldo depois 99.495.
- `parcelaSac(5_000, 1, 0.01, 0)` → amortização 5.000, juros 50, saldo depois 0.
- `custoAnualDoCredito(1, 4.5)` → 17,75; `custoAnualDoCredito(0.8, 0)` → 10,03; `custoAnualDoCredito(0.9, 2)` → 13,58.

**Testes primeiro**

`credito.test.ts`: os exemplos acima (± 0,01).

`calc.test.ts` (bloco "financiamento"; use o `soUmaUnidade` do bloco do diário):
1. Uma unidade financiada fica quitada exatamente `prazoFinMeses` parcelas depois das chaves (48 → mês 83; 120 → mês 155, com `years: 14`).
2. Prazo maior → a primeira parcela é menor e a soma de todas as parcelas é maior.
3. `correcaoFinAno: 5` → a soma das parcelas é maior do que com 0, e o saldo não cai linearmente.
4. Com prazo de 360 meses, o saldo nunca fica negativo nos três cenários do teste existente.
5. Neutro (`48`, `0`) → caracterização verde.

---

## 4.2 Linhas de crédito prontas

Dois botões no topo do grupo que preenchem os campos de baixo. Depois a pessoa ajusta o que quiser.

**Em `credito.ts`:**

```ts
export function aplicarLinha(p: PlannerParams, linha: 'construtora' | 'banco'): PlannerParams
// construtora → { prazoFinMeses: 48,  jurosFinHolding: 1.0, correcaoFinAno: p.ipca, comprometimentoMaxPct: 0 }
// banco       → { prazoFinMeses: 360, jurosFinHolding: 0.9, correcaoFinAno: 2,      comprometimentoMaxPct: 30,
//                 pctPagoChaves: Math.max(p.pctPagoChaves, 20) }      // banco não financia mais que 80%
```

**Na tela:** dois `chip` lado a lado, **"Direto com a construtora"** e **"Banco, 30 anos"**. Sob eles:

> *Preenchem os campos abaixo com as condições típicas de novembro/2026. Construtora: IPCA + 1% a.m. em
> 4 anos. Banco: TR + cerca de 11,4% a.a. em 30 anos, até 80% do imóvel e parcelas limitadas a 30% da
> renda — condições de pessoa física; para a holding costumam ser piores.*

O botão cujos quatro valores coincidem com o plano atual fica marcado (`neon-red`, `aria-pressed`).

**Testes:** `aplicarLinha` muda só os campos listados; banco com `pctPagoChaves: 10` sobe para 20 e com 70
mantém 70; na página, clicar num botão agenda o autosave com os valores da linha.

---

## 4.3 Limite de crédito (parcelas sobre a renda)

Sem isso, um prazo de 30 anos deixaria o planejador comprar dezenas de studios financiados que nenhum
banco aprovaria.

**Parâmetro `comprometimentoMaxPct`** (`0` = sem limite; a linha "banco" põe 30).

**Regra** (dentro de `simulateMonthly`):

```ts
const parcelaInicial = (saldo: number) => saldo * (1 + correcaoMensal) * (1 / prazoFin + juros)
const comprometido = () => {
  let total = saldoApe > 0 ? parcelaApe : 0
  for (const u of unidades) {
    if (u.saldoFinanciado <= 0) continue
    total += mes >= u.mesPronto
      ? parcelaSac(u.saldoFinanciado, u.mesesRestantesFin, juros, correcaoMensal).parcela
      : parcelaInicial(u.saldoFinanciado)          // em obra: a 1ª parcela que virá
  }
  return total
}
const rendaParaCredito = () => (trabalhando ? salario : 0) + recebidoDoMes   // aluguel bruto recebido no mês
const cabeNoCredito = (saldoNovo: number) =>
  p.comprometimentoMaxPct <= 0 || saldoNovo <= 0 ||
  comprometido() + parcelaInicial(saldoNovo) <= (p.comprometimentoMaxPct / 100) * rendaParaCredito()
```

`trabalhando` é falso só no modo "vivo da renda" depois da transição (pacote 1).

Onde vale: no laço do planejador (um `r` só serve se `cabeNaObra(...) && cabeNoCredito(saldo que essa
compra financiaria)`) e na recompra em lançamento depois de uma venda. Compra pronta à vista não tem
dívida: não passa pelo limite.

**Na tela:** **"Limite de parcelas sobre a renda"**, dica: *"Banco não empresta se as parcelas passarem de
cerca de 30% da renda. Aqui a renda é o salário do casal mais os aluguéis recebidos, e as parcelas
incluem a do apê. Zero = sem limite (crédito direto com a construtora)."*

**Testes primeiro**

1. `comprometimentoMaxPct: 0` → diário idêntico (caracterização).
2. Com prazo de 360, `pctPagoChaves: 20` e limite de 30, há **menos** unidades financiadas no pico do que sem limite.
3. Com `pctPagoChaves: 100`, o limite não muda nada (diário idêntico com 0 e com 30).
4. No cenário do teste 2, o maior `totalParcelasFinanciamento` do diário é menor com o limite de 30 do que sem limite.
5. Com salário zero e nenhum aluguel ainda (`initial: 0`), o limite de 30 impede qualquer compra financiada: enquanto `aluguelRecebido` for 0, `imoveisFinanciados` e `aPagarObra` não crescem por compra com saldo a financiar (só entram compras 100% pagas).

---

## 4.4 A sobra também quita financiamento

Completa o `'automatico'` do item 2.4. No bloco "Adianta, na obra que entrega primeiro…":

```ts
let livre = folga(mes)
if (p.sobraDoCaixa === 'adianta_obra') {
  // exatamente como hoje
} else {
  const destinos = [
    { tipo: 'financiamento' as const, taxa: custoAnualDoCredito(p.jurosFinHolding, p.correcaoFinAno) },
    { tipo: 'obra' as const, taxa: p.incc },
  ].filter((d) => d.taxa > p.rendimentoCaixaAno).sort((a, b) => b.taxa - a.taxa)
  for (const d of destinos) {
    if (livre <= 0.01) break
    if (d.tipo === 'obra') { /* o laço de adiantar obra de hoje, consumindo `livre` */ }
    else {
      // unidades prontas com saldo, da MENOR dívida para a maior (quita uma de cada vez)
      for (const u of prontasComSaldo) {
        if (livre <= 0.01) break
        const valor = Math.min(livre, u.saldoFinanciado)
        u.saldoFinanciado -= valor; caixa -= valor; amortizacaoExtraDoMes += valor; livre -= valor
        if (u.saldoFinanciado < 0.5) { u.saldoFinanciado = 0; u.mesesRestantesFin = 0 }
      }
    }
  }
}
```

- O prazo não muda: com saldo menor, a parcela seguinte cai (é `parcelaSac` sobre o saldo novo).
- Amortizar não muda o patrimônio (sai caixa, sai dívida) e é seguro para o caixa: usa só a `folga`.
- `MonthRow` ganha `amortizacaoExtra`; entra na identidade do saldo e no diário.

**Testes primeiro**

1. `'adianta_obra'` → `amortizacaoExtra` é 0 sempre.
2. Juros de 1,5% a.m., `rendimentoCaixaAno: 0`, uma unidade financiada e aporte mensal folgado, sem obra em andamento: `amortizacaoExtra > 0` em algum mês e a unidade fica quitada antes das `prazoFinMeses` parcelas.
3. Com `rendimentoCaixaAno` maior que o custo do crédito (ex.: juros 0,3% a.m. e caixa a 10% a.a.), `amortizacaoExtra` é 0 sempre.
4. No cenário do teste 2, o patrimônio final em `'automatico'` é maior ou igual ao de `'adianta_obra'`.
5. A identidade do saldo fecha com `− amortizacaoExtra`; o saldo nunca fica negativo.

---

## 4.5 Dívida, cobertura e "vale financiar?"

**`MonthRow` ganha:**

- `dividaFinanciamento` = soma de `saldoFinanciado` das unidades **prontas**;
- `aPagarObra` = soma de `restante + saldoFinanciado` das unidades **em obra** (o que ainda será pago ou financiado);
- `valorImoveis` = soma do valor de mercado das unidades prontas.

**Em `indicadores.ts`:**

```ts
export const alavancagem = (l: MonthRow): number => (l.valorImoveis > 0 ? l.dividaFinanciamento / l.valorImoveis : 0)
export const cobertura = (l: MonthRow): number | null =>
  l.totalParcelasFinanciamento > 0 ? l.rendaMensalLiquida / l.totalParcelasFinanciamento : null
export function spreadAlavancagem(p: PlannerParams, ano: number): {
  retornoAluguel: number   // 12 × contaDoAluguel(p.custoStudio, p, ano).liquido / p.custoStudio × 100
  valorizacao: number      // p.incc − p.depreciacao
  retornoImovel: number    // soma dos dois
  custoCredito: number     // custoAnualDoCredito(p.jurosFinHolding, p.correcaoFinAno)
  spread: number           // retornoImovel − custoCredito
}
```

**Exemplo de conferência** (aluguel 0,6% a.m., vacância 1 mês, imobiliária 8%, imposto fixo 11,5%, IPTU
0,6% e condomínio 2% pagos pelo inquilino, manutenção 0,5%, INCC 6,5, envelhecimento 2, juros 1,0% a.m.,
correção 4,5%): aluguel líquido de R$ 995,87 por mês num studio de R$ 260 mil → `retornoAluguel` 4,60;
`valorizacao` 4,50; `retornoImovel` 9,10; `custoCredito` 17,75; `spread` −8,66 (± 0,02).

**Na tela:**

- **Cartão "Dívida e compromissos no fim"** no lugar do cartão "Renda mensal líquida" (segunda fileira):
  valor = `dividaFinanciamento + aPagarObra` da última linha; apoio = "pico de R$ X em {mês/ano}" (a maior
  soma do diário). Segue a chave de moeda.
- **Cartão "Vale financiar?"** (painel de largura inteira, abaixo do gráfico). Texto, com os números do
  plano e uma casa decimal:
  - spread negativo: *"Hoje não. O studio rende **9,1% a.a.** (4,6% de aluguel líquido + 4,5% de
    valorização) e o financiamento custa **17,8% a.a.** Cada R$ 100 financiados tiram cerca de R$ 8,70
    por ano do seu patrimônio. Financiar ainda compra mais studios mais cedo — compare as estratégias
    para ver se compensa no seu caso."*
  - spread positivo ou zero: *"Sim. O studio rende **X% a.a.** e o financiamento custa **Y% a.a.**: cada
    R$ 100 financiados somam cerca de R$ Z por ano."*
  - Segunda linha, sempre: *"No fim do plano a dívida é {alavancagem}% do valor dos imóveis e os aluguéis
    cobrem {cobertura} vezes as parcelas."* (sem parcelas: "…e não há parcelas a pagar.")
- **Aviso `spread-negativo`** (`'atencao'`) quando `spread < 0` e `pctPagoChaves < 100`: *"Financiar custa
  mais do que o studio rende ({custo}% contra {retorno}% a.a.). A alavancagem aumenta o número de studios,
  mas reduz o patrimônio."*
- A tabela "ano a ano" do gráfico ganha a coluna "Dívida" (`dividaFinanciamento + aPagarObra`).
- **Desempenho:** em `PlannerPage`, simule sobre `useDeferredValue(params)` — com prazo longo a simulação
  fica mais pesada e o slider não pode travar. Meça com 30 anos, prazo de 420 e 20% pago nas chaves: se
  passar de 600 ms, guarde o resultado de `projetar(mes)` enquanto nada mudou no mês (um contador de
  "versão" incrementado em toda mutação de `caixa` ou `unidades`) e avise o PO do tempo medido.

**Testes primeiro**

`indicadores.test.ts`: o exemplo de conferência; `alavancagem` e `cobertura` com linhas montadas à mão (inclusive os casos zero/`null`).

`calc.test.ts`:
1. `dividaFinanciamento` é 0 quando `imoveisFinanciados` é 0, e positiva quando há unidade pronta com saldo.
2. `patrimonioLiquido = saldo + valorImoveis − dividaFinanciamento + (o que já foi pago das unidades em obra)` — confira no cenário padrão que `patrimonioLiquido − saldo − valorImoveis + dividaFinanciamento ≥ 0` em todo mês e é 0 quando não há unidade em obra (± 3). (O pacote 7 acrescenta as cotas de consórcio a essa conta; este teste roda com `consorcioCotas: 0`.)
3. `aPagarObra` é 0 quando `imoveisEmConstrucao` é 0.

`planner-page.test.tsx`: troque as três buscas por "Renda mensal líquida" por "Renda disponível no fim"; o
cartão "Dívida e compromissos no fim" e o painel "Vale financiar?" aparecem.

`avisos.test.ts`: `spread-negativo` aparece com os padrões e some com `pctPagoChaves: 100`.

---

## Fecho do pacote

- Rodapé da página, trecho do financiamento: *"O que não é pago até as chaves vira financiamento em
  parcelas decrescentes, no prazo, juros e correção que você escolheu."*
- `NOVIDADES`: "O financiamento agora tem prazo, correção e limite de crédito, e a tela mostra se financiar compensa."
- Mensagem ao PO com o cenário padrão nas duas linhas (construtora e banco): studios, patrimônio, renda
  disponível, pico de dívida.
