# Pacote 7 — Consórcio

**Por quê.** Com a Selic a 13,75%, o consórcio é o crédito barato que existe: não tem juros, só a taxa de
administração (15% a 21% no plano inteiro, cerca de 1% a 1,3% ao ano) e o reajuste anual da carta pelo
INCC. É a única linha de 2026 cujo custo (~8% a.a.) fica perto do que o studio rende (~9% a.a.). O preço
é a incerteza: por sorteio a carta pode sair no último mês.

O simulador é determinístico: **a data da contemplação é uma hipótese que a pessoa informa** (um lance de
tantos por cento, uma contemplação a cada tantos meses). A tela tem que dizer isso com todas as letras.

Prioridade C: só depois dos pacotes 0 a 6. Neutro a acrescentar em `NEUTRO`: `consorcioCotas: 0`.
Depende do pacote 4.

---

## 7.1 Como uma cota funciona aqui

Cada cota é uma carta de crédito do tamanho de **um studio pronto à vista**. Todas começam no mês 1.

```
prazo      = Math.round(p.consorcioPrazoMeses)
taxa       = p.consorcioTaxaTotalPct / 100                       // administração + fundo de reserva, do plano inteiro
cartaBase  = p.custoStudio × (1 − p.descontoAVista/100)          // (pacote 8: troque p.custoStudio por valorPronto(0))
carta(m)   = cartaBase × (1 + p.incc/100) ^ Math.floor((m − 1) / 12)     // reajuste ANUAL pelo INCC, em degrau
```

Estado de cada cota: `fracaoPaga` (0 a 1 — quanto do plano já foi pago), `contemplada`, `mesPlanejado`.
A cota `j` (1, 2, 3…) tem `mesPlanejado = Math.min(prazo, j × p.consorcioIntervaloMeses)`.

**Todo mês** (bloco novo "Consórcio", depois dos aportes e antes da obra), para cada cota:

1. **Parcela**, enquanto `fracaoPaga < 1`:
   `fracao = Math.min(1 / prazo, 1 − fracaoPaga)`; `parcela = fracao × carta(mes) × (1 + taxa)`;
   `caixa −= parcela`; `fracaoPaga += fracao`. Soma em `parcelasConsorcioDoMes`.
   A parcela é obrigatória: se faltar caixa, o saldo fica negativo (o aviso `saldo-negativo` cobre).
2. **Contemplação**, se ainda não foi e `mes >= mesPlanejado`:

   ```
   lance        = mes >= prazo ? 0 : Math.min(p.consorcioLancePct/100 × carta(mes), (1 − fracaoPaga) × carta(mes) × (1 + taxa))
   precoPago    = valorDoProntoNoMes × (1 − p.descontoAVista/100)        // o mesmo preço da compra com FGTS
   credito      = Math.min(carta(mes), precoPago)
   complemento  = precoPago − credito                                    // a carta reajusta 1 vez por ano; o preço, todo mês
   custoNoCaixa = lance + complemento + precoPago × docs + montagemNoMes(mes)
   se folga(mes) < custoNoCaixa → não contempla este mês (tenta de novo no próximo)
   ```

   Contemplou:
   - `caixa −= custoNoCaixa`; `lance` vai para `lanceConsorcioDoMes`; `complemento` para `comprasDoMes`;
     a documentação para `docsDoMes`; a montagem para `montagemDoMes`.
   - `fracaoPaga += (lance + Math.max(0, carta(mes) − precoPago)) / (carta(mes) × (1 + taxa))`, limitado a 1
     (o lance e a sobra da carta abatem o saldo devedor e encurtam o prazo).
   - Nasce uma unidade pronta, como em `comprarPronta`: `mesPronto: mes`, `pago: precoPago`,
     `valorNaEntrega: valorDoProntoNoMes`, sem `saldoFinanciado`, `montada: true`,
     `mesAlugavel: mes + mesesAteAlugar`, e uma referência à cota (`cota`).
   - `contemplacoesDoMes++`.

`valorDoProntoNoMes` é o preço de mercado do studio pronto no mês (hoje `precoDoMes`; no pacote 8, `valorPronto(mes)`).

**Patrimônio** (o fundo comum é poupança; a taxa é despesa):

- cota **não** contemplada: `+ fracaoPaga × carta(mes)`;
- cota contemplada: a unidade entra pelo valor de mercado, como qualquer outra, e a cota entra como dívida:
  `− (1 − fracaoPaga) × carta(mes)`.

**Contagens:** unidade de cota com `fracaoPaga < 1` conta em `imoveisFinanciados`; quitada a cota, em `imoveisQuitados`.

**`MonthRow` ganha:** `parcelasConsorcio`, `lanceConsorcio`, `contemplacoes`, e
`dividaConsorcio` = soma de `(1 − fracaoPaga) × carta(mes) × (1 + taxa)` de todas as cotas (o que ainda falta pagar, com a taxa).

**`rendaDisponivel`** passa a subtrair `parcelasConsorcio` (o lance não: é pontual).

**Cartão "Dívida e compromissos no fim"** e `picoDivida` do comparador passam a somar `dividaConsorcio`.

## 7.2 A projeção

Em `projetar(mes)`, para cada cota com `fracaoPaga < 1`:

- **Parcelas:** `n = Math.ceil((1 − fracaoPaga) × prazo − 1e-9)` meses restantes; para `k = 1 … Math.min(n, horizonte)`:
  `recorrente[k] −= (1 / prazo) × carta(mes + k) × (1 + taxa)` (com o degrau anual — a projeção é prudente).
  O encurtamento que o lance futuro traz **não** é projetado.
- **Contemplação futura** (não contemplada e `mesPlanejado > mes`), em `kc = mesPlanejado − mes`, se `kc ≤ horizonte`:
  `pontual[kc] −= lance + complemento + documentação + montagem`, calculados com `carta(mesPlanejado)` e o
  preço do pronto projetado para aquele mês; e `recorrente[k] += aluguel líquido de um studio pronto` (no
  valor de hoje, congelado) para `k > kc + mesesAteAlugar`.
- **Contemplação atrasada** (`mesPlanejado <= mes`, esperando caixa): não entra na projeção — ela acontece
  quando a `folga` permitir.
- `horizonte` passa a ser o maior entre o de hoje e o maior `n` das cotas.

`cabeNoCredito` (pacote 4) **não** conta parcela de consórcio: administradora não é banco.

## 7.3 Na tela

**Grupo "Consórcio"** (fechado de início):

| Rótulo | Campo | Dica |
|---|---|---|
| Cotas de consórcio | `consorcioCotas` | "Cada cota é uma carta de crédito do tamanho de um studio pronto. Todas começam hoje. Zero = sem consórcio." |
| Prazo do grupo | `consorcioPrazoMeses` | "Em quantos meses a carta é paga." |
| Taxa de administração e fundo de reserva | `consorcioTaxaTotalPct` | "Total do plano inteiro, não ao ano. É o custo do consórcio: não há juros, mas carta e parcelas são reajustadas todo ano pelo INCC." + referência `MERCADO.consorcio` |
| Uma contemplação a cada | `consorcioIntervaloMeses` | "Hipótese sua: a 1ª cota sai depois desse tempo, a 2ª depois do dobro, e assim por diante. Sorteio não tem data — sem lance, a carta pode sair só no fim do prazo." |
| Lance | `consorcioLancePct` | "Parte da carta que você paga de uma vez, com dinheiro do caixa, para ser contemplado. Abate o saldo devedor e encurta o prazo. Se faltar caixa no mês previsto, a contemplação espera." |

`ParamField` ganha o `kind` `'num'` (mostra o número sem unidade) para "Cotas de consórcio".

**Diário:** linhas "− parcelas do consórcio" e "− lance do consórcio" em `MOVIMENTOS`. A coluna de imóveis
ganha "contemplados no mês" (`contemplacoes`), só quando maior que zero, como "vendidos no mês".

**Avisos** (`avisos.ts`):

| id | Nível | Quando | Texto |
|---|---|---|---|
| `consorcio-hipotese` | `'saiba'` | `consorcioCotas > 0` | *"A data de contemplação do consórcio é uma hipótese sua (lance de {N}%, uma carta a cada {M} meses). Por sorteio ela pode sair no último mês do grupo; teste o plano com um intervalo maior."* |
| `consorcio-atrasado` | `'atencao'` | alguma cota foi contemplada depois do `mesPlanejado`, ou não foi contemplada até o fim do diário | *"Faltou caixa para o lance no mês previsto: {K} carta(s) saíram depois do planejado ou não saíram no horizonte."* |

Para o segundo aviso, a linha do diário precisa dizer isso: acrescente a `MonthRow` o campo
`contemplacoesAtrasadas` (contagem acumulada de cotas com `mes > mesPlanejado` ainda não contempladas no fim do mês).

## 7.4 Exemplos de conferência

- Carta: `custoStudio` 260.000 com `descontoAVista` 5 → `cartaBase` 247.000. Prazo 200, taxa 20% →
  parcela dos meses 1 a 12 = 247.000 × 1,2 / 200 = **1.482,00**. Com INCC de 6%, a do mês 13 é **1.570,92**.
- Custo: 20% em 200 meses é 1,2% ao ano sobre a carta, mais o reajuste pelo INCC.
- Sem lance, com INCC 0: a soma das 200 parcelas é 247.000 × 1,2 = **296.400**.
- Lance de 25% no mês 24 (INCC 6%): carta do mês = 247.000 × 1,06 = 261.820; lance = **65.455**;
  `fracaoPaga` antes = 24/200 = 0,12; o lance soma 65.455 / (261.820 × 1,2) = 0,2083 → 0,3283 pagos;
  faltam `Math.ceil(0,6717 × 200)` = 135 parcelas (em vez de 176).

## 7.5 Testes primeiro

`consorcio.test.ts` — ponha em `consorcio.ts` as funções puras (`carta(m, p)`, `parcelaDaCota`, `aplicarLance`) e teste os exemplos acima (± 0,01).

`calc.test.ts` (bloco "consórcio"; `cons = base({ initial: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, annualAmount: 0, descontoAVista: 5, consorcioCotas: 1, consorcioPrazoMeses: 200, consorcioTaxaTotalPct: 20, consorcioIntervaloMeses: 24, consorcioLancePct: 25, years: 10, ...over })`)

1. `consorcioCotas: 0` → caracterização verde.
2. `parcelasConsorcio` é 1.482 nos meses 1 a 12 e 1.571 no mês 13 (± 1), com `incc: 6` e `consorcioIntervaloMeses: 300`.
3. `incc: 0`, `consorcioPrazoMeses: 60`, `consorcioIntervaloMeses: 300`, `years: 6`: a soma de `parcelasConsorcio` é `cartaBase × 1,2` (± 60) e não há parcela depois do mês 60.
4. Com aporte folgado (`monthlyAmount: 20_000`): `contemplacoes` é 1 no mês 24; `lanceConsorcio` desse mês é 25% da carta do mês (± 1); a unidade aparece em `imoveisAlugados` e em `imoveisFinanciados`.
5. Com aporte curto (`monthlyAmount: 2_000`): nenhuma contemplação no mês 24; ela acontece depois ou não acontece — e `contemplacoesAtrasadas` fica maior que zero a partir do mês 25.
6. No cenário do teste 4, o número de meses com `parcelasConsorcio > 0` é menor que 200 (o lance encurtou).
7. **Conservação:** taxa 0, `incc: 0`, `depreciacao: 0`, `descontoAVista: 0`, `rate: 0`, `ipca: 0`, `jurosFinHolding: 0`, lance 0, aporte de 5.000 por mês — o patrimônio de todo mês é a soma dos aportes até ali (± 2). Consórcio sem taxa não cria nem destrói patrimônio.
8. Duas cotas com intervalo 24 e aporte folgado: contemplações nos meses 24 e 48.
9. `rendaDisponivel` desconta `parcelasConsorcio`; a identidade do saldo fecha com `− parcelasConsorcio − lanceConsorcio`.
10. Uma cota com taxa de 20% deixa menos patrimônio no fim do que a mesma cota com taxa 0.

`avisos.test.ts`, `planner-ledger.test.tsx`, `test_planner_model.py`: os cinco campos, as duas linhas do diário, os dois avisos.

---

## Fecho do pacote

- Linha `consorcio` do comparador (pacote 6) passa a aparecer sozinha.
- `NOVIDADES`: "Novo: cotas de consórcio como forma de comprar studios."
- Mensagem ao PO com o cenário padrão com 0, 1 e 2 cotas, com intervalo de 24 e de 60 meses — a diferença
  entre os dois intervalos é o tamanho do risco de contemplação.
