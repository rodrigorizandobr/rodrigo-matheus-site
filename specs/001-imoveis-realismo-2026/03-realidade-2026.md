# Pacote 3 — Realidade 2026

Traz os números do mercado para dentro da tela: ao lado de cada campo, nos padrões, no imposto e numa
linha de comparação com a renda fixa. Dados e fontes: `referencias-2026.md`.

Neutro a acrescentar em `NEUTRO`: `impostoModo: 'fixo'`.

Depende dos pacotes 1 e 2.

---

## 3.1 Referências de mercado ao lado do campo

**Arquivo novo:** `web/src/planner/mercado.ts` — o único lugar onde mora um número de mercado. Atualizar
o simulador para 2027 é editar este arquivo.

```ts
export type Referencia = { valor: number; texto: string }
export const MERCADO_DATA = '2026-11'   // mês da coleta

export const MERCADO = {
  aluguel:    { valor: 0.56,  texto: 'FipeZap set/2026: 6,74% a.a. para 1 dormitório (0,56% a.m.); em São Paulo, 6,43% a.a.' },
  incc:       { valor: 6.75,  texto: 'INCC-M em 12 meses até out/2026: 6,75%' },
  usado:      { valor: 4.5,   texto: 'FipeZap venda: +4,54% no ano até out/2026; em São Paulo, cerca de +3%' },
  ipca:       { valor: 4.9,   texto: 'Focus de 9/11/2026: 5,22% em 2026 e 4,90% em 2027' },
  caixa:      { valor: 14.19, texto: 'CDI em 12 meses até out/2026: 14,19% bruto. Selic em 13,75% a.a.; o Focus projeta 11% em 2028' },
  construtora:{ valor: 0,     texto: 'Plano investidor: sem juros, parcelado até as chaves (e, em algumas construtoras, os 30% finais depois). Construtora que cobra juros: IPCA ou IGP-M + 0,69% a 1% a.m. Confira o seu contrato' },
  banco:      { valor: 0.9,   texto: 'Caixa, jun/2026: a partir de TR + 11,19% a.a. (≈ 0,89% a.m.), até 420 meses, até 80% do imóvel' },
  consorcio:  { valor: 20,    texto: 'Taxa de administração do plano inteiro: 15% (média ABAC, 207 meses) a 21% (Banco Central, grupos novos)' },
  diaria:     { valor: 240,   texto: 'São Paulo: diária mediana de R$ 240 (Airbtics); R$ 256 a R$ 282 no Centro (BnBCalc)' },
  ocupacao:   { valor: 55,    texto: 'São Paulo: 62% de ocupação mediana (Airbtics); 42% no Centro (BnBCalc)' },
  plataforma: { valor: 16,    texto: 'Airbnb no Brasil em 2026: taxa única de cerca de 16%, cobrada do anfitrião' },
} as const satisfies Record<string, Referencia>
```

**`ParamField` ganha a prop opcional `referencia?: string`**, desenhada como uma segunda linha sob a dica:
`<p className="text-[11px] text-muted">Referência: {referencia}</p>`.

Ligue as referências aos campos (os de pacotes futuros, quando existirem):

| Campo | Referência |
|---|---|
| "Aluguel bruto mensal" (`rate`) | `MERCADO.aluguel.texto` |
| "Valorização dos studios novos (INCC)" (`incc`) | `MERCADO.incc.texto` |
| "Perda por envelhecimento do imóvel" (`depreciacao`) | `MERCADO.usado.texto` — e troque a dica para: *"Quanto o studio usado valoriza a menos que o lançamento. INCC menos este número é a valorização dos seus studios."* |
| "Inflação (IPCA)" (`ipca`) | `MERCADO.ipca.texto` |
| "Rendimento do caixa" (`rendimentoCaixaAno`) | `MERCADO.caixa.texto` |
| "Juros do financiamento…" (`jurosFinHolding`) | `MERCADO.construtora.texto` |
| pacote 4: "Correção do saldo devedor" | — |
| pacote 5: diária, ocupação, taxa da plataforma | `MERCADO.diaria`, `.ocupacao`, `.plataforma` |
| pacote 7: taxa do consórcio | `MERCADO.consorcio.texto` |

**Botão "Usar referências de mercado"** no topo do grupo "Mercado" (classe `chip`, como o "sair"):

```ts
/** Só os três números que são medição de mercado, não escolha pessoal. */
export function aplicarReferencias(p: PlannerParams): PlannerParams
// → { ...p, rate: 0.56, incc: 6.75, depreciacao: 2.25 }   (6,75 − 2,25 = 4,5% de valorização do usado)
```

Depois de aplicar, aparece ao lado um link **"desfazer"** que devolve os três valores anteriores; ele some
na próxima alteração de qualquer campo. Sob o botão: *"Dados de novembro/2026: aluguel, INCC e valorização
do usado. Os seus números pessoais não mudam."* Não use `confirm()`.

**Testes primeiro**

`mercado.test.ts`: `aplicarReferencias` muda exatamente `rate`, `incc` e `depreciacao`; todo `texto` de
`MERCADO` é não vazio.

`planner-page.test.tsx`: o campo de aluguel mostra a linha "Referência:"; clicar em "Usar referências de
mercado" muda o valor exibido do aluguel para 0,56% e agenda o autosave; "desfazer" volta ao valor anterior.

---

## 3.2 Padrões novos

Mude em `web/src/planner/types.ts` **e** em `api/planner/model.py`:

| Campo | Antes | Depois |
|---|---|---|
| `rate` | 0.8 | 0.6 |
| `incc` | 6 | 6.5 |
| `depreciacao` | 1.5 | 2 |
| `jurosFinHolding` | 0.8 | 0 (plano investidor: sem juros; decisão D5) |

Passos dos sliders: aluguel 0,01 · INCC 0,25 · envelhecimento 0,25 · juros 0,05.

Os campos novos dos pacotes 1 e 2 já nasceram com o padrão realista. Com este item, um plano novo passa a
abrir no cenário "mercado". **Plano já salvo mantém os valores que a pessoa gravou** (só campo ausente
ganha padrão) — o do PO continua com aluguel de 0,8% até ele mexer ou clicar em "Usar referências".

**Testes:** siga a regra do item 0.2 — se um teste de mecânica de `calc.test.ts` quebrar por depender do
padrão antigo, fixe o valor antigo no próprio teste; não mude a asserção. Os testes que usam
`DEFAULT_PARAMS` direto têm que continuar passando como estão:

- "plausível com TODOS os custos padrão ligados" (patrimônio entre 1 e 10 milhões, 3 ou mais studios);
- "no cenário padrão, alugar vence: nenhuma venda em 15 anos";
- "nunca se compromete além do que o caixa aguenta";
- "o saldo de cada mês fecha".

Se algum deles falhar com os padrões novos, **pare e avise o PO** com os números — é informação, não bug a contornar.

`test_planner_model.py`: os testes que comparam `DEFAULT_PARAMS` do backend com valores literais acompanham.

---

## 3.3 Imposto do aluguel pela reforma tributária

**Hoje:** 11,5% fixos. A holding no lucro presumido paga, em 2026, IRPJ + CSLL de 7,68% e PIS/Cofins de
3,65% (11,33%). De 2027 em diante PIS/Cofins saem e entram CBS e IBS, com redução de 70% para aluguel e
um redutor social de R$ 600 por imóvel residencial por mês.

**Parâmetro `impostoModo`**: `'fixo'` (usa `impostoHolding`, neutro) ou `'reforma'` (padrão).

**Arquivo novo:** `web/src/planner/imposto.ts`

```ts
/** IRPJ (15% × 32%) + CSLL (9% × 32%) sobre a receita de aluguel, lucro presumido. */
export const IRPJ_CSLL_PRESUMIDO = 7.68
/** Redutor social: R$ por imóvel residencial por mês, valor de 2027, corrigido pelo IPCA. */
export const REDUTOR_SOCIAL = 600
/**
 * Tributo sobre o consumo no aluguel residencial de longa duração, % da base, já com a
 * redução de 70%. Até 2026 é PIS/Cofins (sem redutor social). Estimativas publicadas em
 * nov/2026 (ver referencias-2026.md) — a alíquota de referência ainda depende do Senado.
 */
export const CONSUMO_LONGA: readonly (readonly [ateOAno: number, pct: number])[] = [
  [2026, 3.65], [2028, 3.39], [2029, 3.89], [2030, 4.39], [2031, 4.89], [2032, 5.39], [Infinity, 8.40],
]
export function aliquotaConsumoLonga(ano: number): number          // a primeira linha com ano <= ateOAno
export function redutorSocial(ano: number, ipcaAno: number): number // 0 até 2026; 600 × (1 + ipca)^(ano − 2027) depois
/** Imposto de UM mês de UMA unidade. `aluguelCheio` é o aluguel do mês ocupado; `ocupada` é 1 − fração vaga. */
export function impostoAluguelLonga(aluguelCheio: number, ocupada: number, ano: number | undefined, p: PlannerParams): number
```

`impostoAluguelLonga`:

- `p.impostoModo === 'fixo'` ou `ano === undefined` → `aluguelCheio × ocupada × p.impostoHolding / 100`.
- `'reforma'` → `ocupada × ( aluguelCheio × 7,68% + Math.max(0, aluguelCheio − redutorSocial(ano, p.ipca)) × aliquotaConsumoLonga(ano)/100 )`.

**Em `calc.ts`:** `contaDoAluguel(valor, p, ano?)` troca `recebido × impostoHolding/100` por
`impostoAluguelLonga(valor × rate/100, 1 − fracaoVaga, ano, p)`. Quem chama passa o ano:

| Chamada | Ano |
|---|---|
| Laço do mês | o ano civil do mês |
| `projetar` e `cabeNaObra` | o ano do **último** mês do horizonte (`dataDoMes(mes + horizonte, inicio).ano`) — a tabela só sobe, então é o pior caso |
| `avaliaVenda` | o ano do fim do período comparado (`mes + prazoObra`) |

**Na tela** — grupo "Custos do aluguel":

- `ChoiceField` **"Imposto sobre o aluguel"**, opções **"Automático"** (`'reforma'`) e **"Fixo"** (`'fixo'`). Dica:

  > *Automático: holding no lucro presumido — 11,33% em 2026 (IRPJ e CSLL de 7,68% + PIS/Cofins de
  > 3,65%). De 2027 em diante entram CBS e IBS com redução de 70% e desconto de R$ 600 por imóvel na
  > base; a parte nova sobe aos poucos até cerca de 8,4% em 2033. São estimativas de novembro/2026.*

- O slider "Imposto sobre o aluguel na Holding" sai do grupo "O studio" e vem para cá; só aparece com "Fixo".

**Exemplos de conferência** (`ipca: 0`, unidade sempre ocupada):

| Aluguel | 2026 | 2027 | 2029 | 2033 |
|---|---|---|---|---|
| R$ 1.560 | 176,75 (11,33%) | 152,35 (9,77%) | 157,15 (10,07%) | 200,45 (12,85%) |
| R$ 3.000 | 339,90 (11,33%) | 311,76 (10,39%) | 323,76 (10,79%) | 432,00 (14,40%) |
| R$ 500 | 56,65 | 38,40 (só IRPJ/CSLL) | 38,40 | 38,40 |

**Testes primeiro**

`imposto.test.ts`:
1. `aliquotaConsumoLonga`: 2025 → 3,65; 2026 → 3,65; 2027 e 2028 → 3,39; 2029 → 3,89; 2032 → 5,39; 2033 e 2040 → 8,40.
2. `redutorSocial(2026, 4.5)` → 0; `(2027, 4.5)` → 600; `(2029, 4.5)` → 655,22 (± 0,01).
3. A tabela de exemplos acima, linha a linha (± 0,01), no modo `'reforma'`.
4. `ocupada = 11/12` → o imposto é 11/12 do valor com `ocupada = 1`.
5. Modo `'fixo'` com `impostoHolding: 11.5` → 1.560 dá 179,40, em qualquer ano.
6. Mesmo aluguel, o imposto de 2033 é maior que o de 2032.

`calc.test.ts`:
7. `'fixo'` → caracterização verde.
8. `'reforma'` com o início padrão (janeiro/2026): numa unidade quitada e **já entregue** (o `unidadeQuitada` do bloco "custos do aluguel", com `mesesEntrega1o: 0`, `ipca: 0`, `years: 9`), a razão `custosImovel / aluguelRecebido` cai do mês 6 (2026) para o mês 18 (2027) e sobe do mês 78 (2032) para o mês 90 (2033).

---

## 3.4 Avisos de regra

Acrescente a `avisos.ts` (criado no pacote 1). Todos `'saiba'`, salvo indicação.

| id | Quando | Texto |
|---|---|---|
| `his-hmp` | `p.custoStudio <= 537_673` | *"Em São Paulo, studios vendidos como habitação popular (HIS e HMP — tetos de R$ 276 mil, R$ 384 mil e R$ 538 mil em 2026) têm limite de renda para o comprador, aluguel limitado e não podem ir para temporada. Confira no memorial se a sua unidade é R2v ou NR."* |
| `adicional-irpj` | primeira linha com `aluguelRecebido > 62_500` | *"A partir de {mês/ano} a receita de aluguel passa de R$ 62,5 mil por mês: sobre o excedente há adicional de IRPJ de 3,2%, que o simulador não desconta."* |
| `dividendos` | primeira linha com `rendaDisponivel > 100_000` | *"A partir de {mês/ano} a distribuição passa de R$ 50 mil por mês por sócio (considerando 2 sócios): há imposto de 10% retido sobre o total distribuído (Lei 15.270/2025), que o simulador não desconta."* |

Ordem no painel: primeiro os `'atencao'`, depois os `'saiba'`, na ordem desta tabela.

`avisos.test.ts`: cada aviso aparece na condição e some fora dela; o texto traz o mês/ano da primeira linha que dispara.

---

## 3.5 Novidades deste pacote

Acrescente a `NOVIDADES` (criado no item 1.5) e troque o `id`:

- "O imposto do aluguel agora segue o calendário da reforma tributária."
- "O gráfico compara o seu plano com os mesmos aportes na renda fixa."
- "Os valores sugeridos de aluguel, INCC e juros foram atualizados para novembro de 2026 — o que você já tinha gravado não muda."

---

## 3.6 Comparação com a renda fixa

Com a Selic a 13,75%, a pergunta honesta é: e se os mesmos aportes fossem para a renda fixa?

**Em `indicadores.ts`:**

```ts
/**
 * O saldo, mês a mês, de quem pusesse na renda fixa exatamente o dinheiro que entrou no plano
 * (o que já foi pago + aportes) e fizesse as mesmas retiradas. Um valor por linha do diário.
 */
export function benchmarkRendaFixa(linhas: MonthRow[], p: PlannerParams): number[]
// saldo = p.initial
// a cada linha: saldo = saldo × (1 + taxaMensal(p.rendimentoCaixaAno)) + aporteMensal + aporteAnual
//               − Math.min(retirada, saldo depois dos aportes)      // não fica negativo
```

O FGTS fica de fora dos dois lados (não pode ir para a renda fixa e não conta no patrimônio).
`taxaMensal` hoje é privada em `calc.ts`: exporte-a.

**Gráfico** (`PlannerChart`). Antes de mexer, **carregue a skill `dataviz`** e siga as regras dela (um
eixo só, legenda sempre que houver duas séries, texto em cor de texto, tabela junto).

- Props: `points`, `benchmark: number[]` (um valor por ponto anual, mesmo índice) e `moeda`.
- Série 1, **"Seu plano em imóveis"**: como hoje (linha cheia `var(--red)`, 2 px, área a 8%).
- Série 2, **"Mesmos aportes na renda fixa"**: linha tracejada (`strokeDasharray="5 4"`), 2 px,
  `var(--heading)` com opacidade 0,55, sem área. A diferença entre as duas é dita por traço **e** por
  legenda, nunca só por cor. Com `rendimentoCaixaAno = 0` o nome da série é **"Total aportado"**.
- Legenda fixa acima do gráfico: amostra de cada traço + nome, em `text-[11px] text-muted`.
- A escala Y cobre o máximo das duas séries.
- A leitura sob o gráfico mostra as duas: "Ano 5 · 2031 — imóveis R$ X · renda fixa R$ Y".
- A tabela "ano a ano" ganha a coluna "Renda fixa".
- `aria-label`: "Patrimônio em imóveis comparado aos mesmos aportes na renda fixa, ao longo de N anos, em reais de hoje".
- O gráfico respeita a chave "R$ de hoje | R$ nominais" (o benchmark também é convertido).
- Depois de pronto, abra na bancada e **olhe**: rótulos do eixo não colidem em 390 px, a legenda não quebra o painel.

**Testes primeiro**

`indicadores.test.ts`:
1. Rendimento 0, aportes de 1.000 por 3 meses, `initial: 5_000` → `[6_000, 7_000, 8_000]`.
2. Rendimento de 12% a.a., dois meses de 1.000, `initial: 0` → `[1_000, 2_009,49]` (± 0,01).
3. Retirada maior que o saldo → o saldo vai a zero e fica em zero, sem negativo.
4. O vetor tem o mesmo tamanho de `linhas`.

`PlannerChart` (arquivo novo `planner-chart.test.tsx`):
5. Há duas linhas desenhadas e uma legenda com os dois nomes.
6. Com `rendimentoCaixaAno = 0` o nome da segunda série é "Total aportado".
7. A tabela "ano a ano" tem a coluna "Renda fixa".

---

## Fecho do pacote

- Backend antes do frontend no deploy (parâmetro `impostoModo` e padrões novos).
- Mensagem ao PO com o cenário padrão novo e a posição dele contra a renda fixa no fim do horizonte.
