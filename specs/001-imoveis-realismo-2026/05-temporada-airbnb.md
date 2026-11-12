# Pacote 5 — Temporada (Airbnb)

**Por quê.** O PO pediu. E a conta não é óbvia: com os números medianos de São Paulo e uma gestora, a
temporada rende **menos** que o aluguel tradicional; sem gestora, 58% a mais. O simulador tem que mostrar
essa conta com os números da pessoa, e avisar das regras de 2026.

Conta de apoio (studio de R$ 260 mil, diária de R$ 240, taxa de plataforma de 16%, imposto de 11,5%,
condomínio 2% e IPTU 0,6% a.a., R$ 450 de contas fixas, manutenção de 1,5% a.a.):

| | Sobra por mês |
|---|---|
| Aluguel tradicional a 0,6% a.m. (1 mês vago, imobiliária 8%) | R$ 996 |
| Temporada, 55% de ocupação, gestora a 20% | R$ 898 |
| Temporada, 55% de ocupação, sem gestora | R$ 1.573 |
| Temporada, 42% de ocupação, gestora a 20% | R$ 369 |
| Temporada, 62% de ocupação, gestora a 20% | R$ 1.183 |

Empata com o tradicional a 57,4% de ocupação com gestora e a 44,1% sem.

Neutro a acrescentar em `NEUTRO`: `pctTemporada: 0`. Depende dos pacotes 1, 2 e 3.

---

## 5.1 A conta da temporada

**Arquivo novo:** `web/src/planner/temporada.ts`

```ts
export const DIAS_POR_MES = 365 / 12
export type Conta = { bruto: number; custos: number; liquido: number }

/** O mês de UMA unidade em temporada que vale `valor`, no mês `mes` do plano. */
export function contaTemporada(valor: number, mes: number, p: PlannerParams): Conta
```

```
preco      = fatorPreco(mes, p.ipca)                       // diária e contas sobem com a inflação
bruto      = p.diariaHoje × preco × DIAS_POR_MES × p.ocupacaoPct/100
plataforma = bruto × p.taxaPlataformaPct/100
gestao     = (bruto − plataforma) × p.taxaGestaoPct/100    // a gestora cobra sobre o que sobra da plataforma
imposto    = bruto × p.impostoTemporadaPct/100
condominio = valor × p.condominioPctAno/100/12             // em temporada é SEMPRE do dono
iptu       = valor × p.iptuPctAno/100/12                   // idem — `iptuPagador`/`condominioPagador` não valem aqui
fixos      = p.custoFixoTemporadaMes × preco               // luz, água, internet, enxoval
manutencao = valor × p.manutencaoTemporadaPctAno/100/12
custos     = plataforma + gestao + imposto + condominio + iptu + fixos + manutencao
liquido    = bruto − custos
```

- `vacanciaMesesAno`, `taxaAdmPct`, `manutencaoPctAno` e `impostoModo` são do aluguel tradicional: não entram aqui.
- A limpeza é cobrada do hóspede à parte e não aparece nos dois lados.
- O imposto é um percentual fixo informado pela pessoa (decisão D6). Motivo no item 5.4.

**Exemplo de conferência** (`valor` 260.000, `mes` 0, diária 240, ocupação 55, plataforma 16, gestão 20,
imposto 11,5, condomínio 2, IPTU 0,6, fixos 450, manutenção 1,5):

| bruto | plataforma | gestão | imposto | condomínio | IPTU | fixos | manutenção | custos | líquido |
|---|---|---|---|---|---|---|---|---|---|
| 4.015,00 | 642,40 | 674,52 | 461,73 | 433,33 | 130,00 | 450,00 | 325,00 | 3.116,98 | 898,02 |

Com gestão 0: custos 2.442,46, líquido 1.572,54.

**Testes primeiro** (`temporada.test.ts`)

1. O exemplo acima, com e sem gestão (± 0,05).
2. `mes: 12` com `ipca: 5` → o `bruto` é 5% maior que no mês 0; condomínio e IPTU não mudam (dependem do valor, não da inflação).
3. Ocupação maior → líquido maior. Ocupação 0 → bruto 0 e líquido negativo (os custos fixos continuam).
4. `iptuPagador: 'inquilino'` não muda nada: o resultado é igual ao de `'proprietario'`.
5. `vacanciaMesesAno` não muda nada.

---

## 5.2 Carteira mista no motor

**Parâmetro `pctTemporada`**: a parte da carteira que opera em temporada (0 a 100%). O motor não sorteia
"qual studio": cada unidade rende a média ponderada dos dois modos — a mesma lógica da vacância, que é
uma esperança e não um sorteio de meses.

**Em `calc.ts`:**

```ts
/** Receita e custos de uma unidade pronta, misturando aluguel tradicional e temporada. */
export function rendaDaUnidade(valor: number, mes: number, ano: number | undefined, p: PlannerParams): { liquido: number; custos: number } {
  const f = Math.min(100, Math.max(0, p.pctTemporada)) / 100
  const longa = contaDoAluguel(valor, p, ano)
  if (f === 0) return longa                                   // caminho neutro: exatamente a conta de hoje
  const temp = contaTemporada(valor, mes, p)
  return {
    liquido: (1 - f) * longa.liquido + f * temp.liquido,
    custos: (1 - f) * longa.custos + f * temp.custos,
  }
}
```

- Troque por `rendaDaUnidade` **toda** chamada de `contaDoAluguel` que calcula a renda de uma unidade:
  laço do mês, `projetar`, `cabeNaObra`, `avaliaVenda`, `spreadAlavancagem`. Na projeção o `mes` é o mês
  corrente (diária e contas congeladas no valor de hoje, como o aluguel).
- `aluguelRecebido` continua sendo `liquido + custos` (a receita bruta recebida) e `custosImovel` os custos — agora da mistura.
- **Montagem:** `montagemNoMes(m)` (item 2.3) passa a usar
  `(1 − f) × p.custoMontagem + f × p.custoMontagemTemporada` no lugar de `p.custoMontagem`.
- `mesesAteAlugar` e o custo parado entre as chaves e a primeira locação valem igual.

**Testes primeiro** (`calc.test.ts`, bloco "temporada"; use o `unidadeQuitada` do bloco "custos do aluguel", com `ipca: 0`)

1. `pctTemporada: 0` → caracterização verde.
2. `pctTemporada: 100`: a renda do mês 40 é `contaTemporada(valor da unidade no mês 40, 40, p).liquido` (± 2).
3. `pctTemporada: 50`: a renda do mês 40 é a média entre a de 0 e a de 100 (± 2).
4. Com 100%, mudar `vacanciaMesesAno` ou `taxaAdmPct` não muda a renda; mudar `ocupacaoPct` muda.
5. `custoMontagemTemporada: 40_000` com `pctTemporada: 100` e `custoMontagem: 10_000` → `montagem` de 40.000 nas chaves; com 50% → 25.000.
6. O saldo nunca fica negativo com `{ ...DEFAULT_PARAMS, pctTemporada: 100 }`.

---

## 5.3 "Tradicional × temporada" na tela

**Em `temporada.ts`:**

```ts
/** Um studio que vale `p.custoStudio` hoje, nos dois modos — e a ocupação em que eles empatam. */
export function comparaLocacao(p: PlannerParams, ano: number): { longa: Conta; temporada: Conta; ocupacaoDeEquilibrio: number }
```

- `longa` = `contaDoAluguel(p.custoStudio, p, ano)` no formato `Conta` (`bruto = liquido + custos`).
- `temporada` = `contaTemporada(p.custoStudio, 0, p)`.
- `ocupacaoDeEquilibrio` (em %, pode passar de 100 ou ser negativa):

  ```
  A = p.diariaHoje × DIAS_POR_MES × (1 − plat − (1 − plat) × gest − imp)     // plat, gest, imp em fração
  B = condominio + iptu + fixos + manutencao                                  // os custos que não dependem da ocupação
  ocupacaoDeEquilibrio = (longa.liquido + B) / A × 100
  ```

  Se `A ≤ 0` (as taxas comem a diária inteira), devolva `Infinity`.

**Painel "Tradicional × temporada"** (largura inteira, abaixo do "Vale financiar?"):

- Tabela de três colunas ("", "Tradicional", "Temporada") e quatro linhas: "Receita no mês",
  "Custos e impostos", "Sobra no mês", "Sobra ao ano sobre o valor do studio" (`12 × liquido / custoStudio`, em %).
- Frase abaixo, conforme `ocupacaoDeEquilibrio`:
  - entre 0 e 100: *"A temporada empata com o aluguel tradicional a **{N}% de ocupação**. Você informou {ocupacaoPct}%."*
  - acima de 100 ou `Infinity`: *"Com estas taxas a temporada não alcança o aluguel tradicional nem com a casa sempre cheia."*
  - 0 ou menos: *"A temporada ganha do aluguel tradicional com qualquer ocupação."*
- O painel aparece sempre (é a resposta de "vale a pena?"), mesmo com `pctTemporada = 0`.

**Grupo "Temporada (Airbnb)"**, nesta ordem (faixas em `parametros.md`):

| Rótulo | Campo | Dica |
|---|---|---|
| Parte da carteira em temporada | `pctTemporada` | "Zero = tudo em aluguel tradicional. O resto dos campos deste grupo só pesa na parte em temporada." |
| Diária média | `diariaHoje` | "Em reais de hoje, já sem a taxa de limpeza." + referência `MERCADO.diaria` |
| Ocupação | `ocupacaoPct` | "Parte das noites do mês com hóspede." + referência `MERCADO.ocupacao` |
| Taxa da plataforma | `taxaPlataformaPct` | referência `MERCADO.plataforma` |
| Taxa da gestora | `taxaGestaoPct` | "% do que sobra depois da plataforma. Zero se você mesmo recebe os hóspedes. Sem tabela pública: use o orçamento da sua gestora." |
| Contas fixas do mês | `custoFixoTemporadaMes` | "Luz, água, internet e reposição de enxoval, em reais de hoje. Condomínio e IPTU entram sozinhos — em temporada são sempre seus." |
| Manutenção em temporada | `manutencaoTemporadaPctAno` | "% ao ano do valor do imóvel. Gira mais gente: desgasta mais que o aluguel tradicional." |
| Imposto sobre a receita de temporada | `impostoTemporadaPct` | texto do item 5.4 |
| Montagem para temporada (por studio) | `custoMontagemTemporada` | "Mobília completa, eletros e enxoval, em reais de hoje. Estimativa: troque pelo seu orçamento." |

**Exemplo de conferência de `comparaLocacao`** (os números do exemplo 5.1, mais aluguel 0,6% a.m., vacância
1, imobiliária 8, imposto fixo 11,5, IPTU e condomínio pagos pelo inquilino, manutenção 0,5):
`longa.liquido` 995,87; `temporada.liquido` 898,02; `ocupacaoDeEquilibrio` 57,4. Com `taxaGestaoPct: 0`: 44,1.

**Testes primeiro**

`temporada.test.ts`: o exemplo (± 0,1); `A ≤ 0` devolve `Infinity`; a ocupação de equilíbrio cai quando a diária sobe.

`planner-page.test.tsx`: o painel aparece com as três colunas; com as taxas somando 100% aparece a frase "não alcança".

---

## 5.4 Regras e impostos: o que a tela tem que dizer

**Dica do campo "Imposto sobre a receita de temporada":**

> *Percentual sobre a receita bruta. Hoje, na holding do lucro presumido, cerca de 11,3%. Pela reforma
> tributária, hospedagem de até 90 dias feita por quem é contribuinte de IBS e CBS segue o regime de
> hotelaria (redução de 40%, contra 70% do aluguel residencial): a alíquota bruta estimada chega a cerca
> de 17% em 2033, antes dos créditos sobre taxa de plataforma, gestora e contas — que o simulador não
> calcula. Confirme com o seu contador.*

Por isso o imposto da temporada é um número fixo da pessoa, e não a tabela do pacote 3: a regra nova é
não cumulativa e o resultado depende de créditos que só o contador conhece.

**Aviso `temporada-regras`** (`'atencao'`, quando `pctTemporada > 0`), em `avisos.ts`:

> *Temporada depende do condomínio e da cidade. Em maio de 2026 o STJ decidiu que, em condomínio
> residencial, a locação por temporada via aplicativo só vale com autorização expressa na convenção
> (REsp 2.121.055/MG; a tese geral ainda será fixada no Tema 1.443). Em São Paulo, unidades HIS e HMP não
> podem ser anunciadas para temporada.*

`avisos.test.ts`: aparece com `pctTemporada: 10` e some com 0.

---

## Fecho do pacote

- `api/planner/model.py` e teste: os nove campos.
- `NOVIDADES`: "Agora dá para simular parte da carteira em temporada (Airbnb) e comparar com o aluguel tradicional."
- Mensagem ao PO com o cenário padrão em 0%, 50% e 100% de temporada (studios, patrimônio, renda disponível),
  com e sem gestora, e a ocupação de equilíbrio dos números dele.
