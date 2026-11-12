# Pacote 8 — Ágio do pronto sobre a planta e venda nas chaves

**Por quê.** No motor de hoje um studio pronto custa o mesmo que um lançamento. Então comprar na planta só
"ganha" a correção do INCC sobre o que foi pago cedo, e o FGTS compra pronto a preço de lançamento (e ainda
com desconto). No mercado, o pronto vale mais que a planta — é esse ágio que paga o risco e a espera de
quem compra na planta, e é ele que permite a estratégia de **vender nas chaves e recomeçar**, que gira o
capital sem precisar de financiamento.

Não existe índice oficial desse ágio (relatos de mercado falam em 20% a 40% do lançamento à entrega, já
contando o INCC, que sozinho dá ~21% em 3 anos). Por isso o padrão é **zero**: é hipótese da pessoa.

Prioridade C: por último. Neutros a acrescentar em `NEUTRO`: `agioProntoPct: 0`, `pctVendaNasChaves: 0`.
Depende do pacote 4.

---

## 8.1 Três preços em vez de um

**Arquivo novo:** `web/src/planner/planta.ts`

```ts
/** Preço de tabela de um lançamento no mês `mes` (é o `precoNovoNoMes` de hoje). */
export const precoLancamento = (mes: number, p: PlannerParams): number =>
  p.custoStudio * Math.pow(1 + p.incc / 100, mes / 12)
/** Valor de mercado de um studio PRONTO equivalente, no mês `mes`. */
export const valorPronto = (mes: number, p: PlannerParams): number =>
  precoLancamento(mes, p) * (1 + p.agioProntoPct / 100)
/** Preço de contrato de quem compra hoje com `r` meses de obra pela frente (r = prazoObra → lançamento; r = 0 → pronto). */
export const precoNaObra = (mes: number, r: number, prazoObra: number, p: PlannerParams): number =>
  precoLancamento(mes, p) * (1 + (p.agioProntoPct / 100) * (1 - r / prazoObra))
```

**Em `calc.ts`** — separe o que hoje é um número só (`preco`/`precoDoMes`):

| Onde | Hoje | Passa a ser |
|---|---|---|
| `novaNaObra(mes, r)` | `valorNaEntrega = preco × INCC^r`; `saldoFinanciado = valorNaEntrega × (1 − pctChaves)`; `restante = (pctChaves + docs) × preco` | `P = precoNaObra(mes, r, prazoObra, p)`; `valorNaEntrega = valorPronto(mes, p) × INCC^r`; `saldoFinanciado = P × INCC^r × (1 − pctChaves)`; `restante = (pctChaves + docs) × P` |
| `cabeNaObra(proj, r)` | tudo sobre `valor = preco × INCC^r` | pagamentos e dívida sobre `P × INCC^r`; aluguel sobre `valorPronto(mes, p) × INCC^r` |
| `comprarPronta` e a compra com FGTS | `precoMercado = precoDoMes` | `precoMercado = valorPronto(mes, p)` |
| `precoPronto`, `custoPronto` | a partir de `precoDoMes` | a partir de `valorPronto(mes, p)` |
| 1º studio | `valorNaEntrega = custoStudio × fator1` | `custoStudio × fator1 × (1 + agio)`; o saldo a financiar não muda (é do contrato) |
| `avaliaVenda` | um preço só | recebe `lancamento` e `pronto`: caminho "planta" = `(liquido / ((pctChaves + docs) × lancamento)) × (lancamento × fatorObra × (agio + pctChaves) − montagem na entrega)`; caminho "pronto" usa `pronto` no lugar de `precoPronto` |
| consórcio (pacote 7) | `cartaBase` e compra sobre `custoStudio`/`precoDoMes` | sobre `valorPronto(0, p)` e `valorPronto(mes, p)` |
| `pontosAnuais.precoStudioNovo` | lançamento | continua lançamento |

O que o ágio faz, em uma frase: **quem compra na planta ganha o ágio como patrimônio na entrega; quem
compra pronto paga por ele.** A dívida e os pagamentos seguem o preço de contrato; o valor de mercado (e o
aluguel, que é um percentual dele) segue o valor do pronto.

**Exemplos de conferência** (`custoStudio` 260.000, `incc` 6, `agioProntoPct` 20, `prazoObra` 36):

- `precoLancamento(0)` 260.000 · `valorPronto(0)` 312.000 · `valorPronto(12)` 330.720
- `precoNaObra(0, 36, 36)` 260.000 · `precoNaObra(0, 18, 36)` 286.000 · `precoNaObra(0, 0, 36)` 312.000

**Na tela** — grupo "Venda":

**"Quanto o pronto vale a mais que o lançamento"** (`agioProntoPct`), dica:

> *Studio pronto costuma valer mais que o mesmo studio na planta. Com isso, comprar pronto fica mais caro
> e quem compra na planta ganha essa diferença na entrega. Zero = pronto e lançamento custam o mesmo.
> Não existe índice oficial: é uma hipótese sua.*

**Aviso `agio-hipotese`** (`'saiba'`, quando `agioProntoPct > 0`): *"O ágio de {N}% do pronto sobre a planta
é uma hipótese sua, sem índice oficial. Teste o plano também com zero."*

**Testes primeiro**

`planta.test.ts`: os exemplos acima (± 0,5).

`calc.test.ts` (bloco "ágio da planta"):
1. `agioProntoPct: 0` → caracterização verde.
2. Uma unidade só (o `soUmaUnidade` do bloco do diário, com `rate: 0` para o caixa ser igual nos dois casos): no mês 40, o patrimônio com ágio de 20% é maior que com ágio 0, e a diferença é 20% do valor da unidade sem ágio (± 0,5%).
3. A parcela do financiamento dessa unidade é a mesma com e sem ágio (a dívida é do contrato).
4. O aluguel recebido dela é 20% maior com ágio de 20% (aluguel é percentual do valor).
5. Compra com FGTS (cenário `comFgtsFolgado`): `compraAVistaFgts + comprasImoveis` = `valorPronto(mês da compra) × (1 − desconto)` (± 10) — o pronto ficou mais caro.
6. O saldo nunca fica negativo com `{ ...DEFAULT_PARAMS, agioProntoPct: 20 }`.

---

## 8.2 Vender nas chaves

**Parâmetro `pctVendaNasChaves`**: de cada 100 studios que saem da obra, quantos são vendidos na entrega.
É uma estratégia declarada, não uma decisão automática — o comparador (pacote 6) mostra se ela compensa.

**Regra:**

- `Unidade` ganha `daPlanta: boolean` (verdadeiro para `novaNaObra` com `r > 0` e para o 1º studio com
  `mesesEntrega1o > 0`) e `docsPagos` (acumulado em `pagarObra`: `valor × u.fracaoDocs`).
- Um contador `entregasDaPlanta` sobe a cada unidade `daPlanta` que chega ao mês das chaves. A unidade de
  número `n` é vendida segundo a função pura (em `planta.ts`), com aritmética inteira para não depender de
  arredondamento de ponto flutuante:

  ```ts
  /** A n-ésima entrega da planta (1, 2, 3…) é vendida nas chaves? `pct` de 0 a 100. */
  export const vendeNasChaves = (n: number, pct: number): boolean =>
    Math.floor((n * pct) / 100) > Math.floor(((n - 1) * pct) / 100)
  ```

  (100% → todas; 50% → a 2ª, a 4ª…; 30% → a 4ª, a 7ª, a 10ª…; 0% → nenhuma.)
- A venda acontece no mês das chaves, **antes** de pagar o `restante` e a montagem:

  ```ts
  /** O que sobra para quem vende nas chaves. Sem escritura no nome do vendedor, não há ITBI nem cartório. */
  export function liquidoVendaNasChaves(valorNaEntrega, restante, fracaoDocs, saldoFinanciado, docsPagos, p): number {
    const atrito = (p.corretagemVendaPct + p.impostoVendaPct) / 100
    const devidoAConstrutora = restante * (1 - fracaoDocs) + saldoFinanciado   // o comprador assume ou o vendedor quita
    return valorNaEntrega * (1 - atrito) - devidoAConstrutora + docsPagos       // a documentação separada volta
  }
  ```

  Se o líquido for positivo: a unidade sai da carteira, `caixa += liquido`, `vendasDoMes++`,
  `valorVendasDoMes += liquido`; não se paga `restante`, montagem nem parcela dela. O planejador do mesmo
  mês já enxerga esse caixa e recompra.
  Se o líquido for zero ou negativo: não vende; a unidade segue o caminho normal.
- A avaliação de venda de dezembro (unidades quitadas) continua como está.
- Não há campo novo no diário: a venda aparece em `vendas` e em "+ venda de studio".

**Exemplo de conferência:** valor na entrega 300.000; `restante` 52.000 com `fracaoDocs` = 0,04 / 0,74;
saldo a financiar 75.000; `docsPagos` 7.189,19; corretagem 6% e imposto 6,73% →
300.000 × 0,8727 − (49.189,19 + 75.000) + 7.189,19 = **144.810,00**.

**Na tela** — grupo "Venda":

**"Vender nas chaves"** (`pctVendaNasChaves`), dica:

> *De cada 10 studios comprados na planta, quantos você vende ao pegar as chaves em vez de alugar. O
> dinheiro volta para o caixa e o sistema recompra. Paga corretagem e imposto de venda; como a escritura
> não chega a sair no seu nome, não paga ITBI nem cartório. Só faz sentido se o pronto valer mais que a
> planta (campo acima).*

**Testes primeiro**

`planta.test.ts`: o exemplo de conferência (± 0,01); `vendeNasChaves` — com 100, verdadeiro para n de 1 a
10; com 50, verdadeiro só para n par; com 30, verdadeiro só para 4, 7 e 10 (entre 1 e 10); com 0, sempre falso.

`calc.test.ts` (bloco "venda nas chaves"):
1. `pctVendaNasChaves: 0` → caracterização verde.
2. Uma unidade só, `pctVendaNasChaves: 100`: no mês 36 há `vendas: 1`, `valorVendas` = `liquidoVendaNasChaves` dela (± 2), nenhuma montagem e nenhuma parcela dessa unidade.
3. **Conservação:** corretagem 0, imposto de venda 0, ágio 0, `incc: 0`, `depreciacao: 0`, `rate: 0`, documentação 0 — vender nas chaves não muda o patrimônio do mês (mês 36 igual ao mês 35, ± 2).
4. Com ágio 0 e os atritos padrão (6% + 6,73%), vender tudo nas chaves termina com **menos** patrimônio do que não vender (cenário `soAporte({ monthlyAmount: 10_000 })`).
5. Com `pctVendaNasChaves: 100` no cenário do teste 4, nenhum mês tem `aluguelRecebido > 0` vindo de unidade da planta: a soma de `aluguelRecebido` do diário é 0 (só há compras na obra, e todas são vendidas na entrega) — desde que o planejador não compre pronto; fixe `monthlyAmount` baixo o bastante para isso ou confira que `imoveisAlugados` é 0 em todo mês.
6. Atrito de 60% (líquido negativo) → nenhuma venda nas chaves.
7. A identidade do saldo fecha; `totalImoveis = imoveisEmConstrucao + imoveisAlugados` em todo mês.
8. Espera-se (se falhar, **avise o PO em vez de forçar**): com ágio de 30%, atrito zero e `rate: 0`, vender tudo nas chaves termina com patrimônio maior ou igual a não vender — sem aluguel, girar o ágio é o único ganho.

---

## Fecho do pacote

- `api/planner/model.py` e teste: os dois campos.
- Comparador (pacote 6): acrescente a linha `chaves` — **"Vendendo tudo nas chaves"**,
  `pctVendaNasChaves: p.pctVendaNasChaves >= 50 ? 0 : 100`, descrição "Vende cada studio da planta na entrega
  e recompra." — só quando `p.agioProntoPct > 0` (sem ágio ela perde por construção).
- `NOVIDADES`: "Novo: ágio do pronto sobre a planta e a estratégia de vender nas chaves."
- Mensagem ao PO com o cenário padrão para ágio de 0, 10 e 20% e venda nas chaves de 0, 50 e 100%.
