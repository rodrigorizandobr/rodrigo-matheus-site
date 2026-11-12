# Referências de mercado — novembro de 2026

Coletadas por busca na web em 2026-11-12. São **notícias, relatórios e artigos**, não cotação oficial
nem parecer: servem para calibrar o simulador, não para fechar negócio. Antes de pôr dinheiro, confirme
na fonte primária (banco, construtora, contador, convenção do condomínio).

Onde está escrito "sem link guardado", o número veio de uma busca anterior desta mesma pesquisa e a
página não ficou anotada — confira antes de citar.

## Juros, inflação e renda fixa

| Dado | Valor | Fonte e data |
|---|---|---|
| Selic | 13,75% a.a., mantida em 4/11/2026 depois de cinco cortes desde 15% | Copom (sem link guardado) |
| Focus (9/11/2026) | Selic: 13,75% no fim de 2026, 12,50% em 2027, 11,00% em 2028. IPCA: 5,22% em 2026, 4,90% em 2027 | Boletim Focus, Banco Central (sem link guardado) |
| IPCA | 4,26% em 2025; IPCA-15 de 4,62% em 12 meses até out/2026 | IBGE (sem link guardado) |
| CDI | 14,19% em 12 meses até out/2026; 11,63% de janeiro a outubro | [Investidor10](https://investidor10.com.br/noticias/com-retorno-de-11-63-este-e-o-investimento-campeao-de-2026-123634/) |
| TR | cerca de 2,0% a 2,2% a.a. | (sem link guardado) |
| FGTS | rendeu 6,90% em 2025 (TR + 3% + 1,87% de distribuição de lucros) | (sem link guardado) |

Uso no simulador: `ipca` 4,5; `rendimentoCaixaAno` 8 (líquido, média para o horizonte — o CDI de hoje é
bem maior, mas o Focus o vê caindo); `MERCADO.caixa`, `MERCADO.ipca`.

## Preço e aluguel de imóvel

| Dado | Valor | Fonte e data |
|---|---|---|
| Rentabilidade do aluguel (FipeZap, set/2026) | Brasil 6,13% a.a.; **1 dormitório 6,74% a.a.**; São Paulo 6,43% a.a. | [Diário do Comércio, 14/10/2026](https://diariodocomercio.com.br/economia/aluguel-sobe-dobro-inflacao-2026/) |
| Aluguel em 12 meses (set/2026) | Brasil +9,13%; São Paulo +6,22%; São Paulo a R$ 65,78/m² | mesma fonte |
| Rentabilidade (FipeZap, jan/2026) | Brasil 5,99%; 1 dormitório 6,67%; 4 ou mais 4,90% | [Portas](https://portas.com.br/dados-inteligencia/aluguel-residencial/) |
| Preço de venda (FipeZap) | Brasil +4,54% no ano até out/2026; São Paulo cerca de +3%; São Paulo a R$ 12.099/m² (jul/2026) | (sem link guardado) |
| INCC-M | 6,75% em 12 meses até out/2026 (0,35% no mês; São Paulo: 7,60%) | [Brasil 61, 2/11/2026](https://brasil61.com/n/custo-da-construcao-sobe-0-35-em-outubro-aponta-fgv-bras2617395), [ValorFinal](https://valorfinal.com.br/incc-acumulado) |
| INCC-M um ano antes | 6,58% em 12 meses até out/2025 | [Economic News Brasil](https://economicnewsbrasil.com.br/2025/10/28/incc-m-de-outubro-setor-da-construcao/), [IstoÉ Dinheiro](https://istoedinheiro.com.br/incc-m-sobe-021-em-outubro-e-repete-variacao-de-setembro-revela-fgv) |
| INCC-M, média de 2 anos | (1,0658 × 1,0675)^½ − 1 = **6,66% a.a.** — padrão da correção das parcelas de obra (pacote 9) | cálculo sobre as duas linhas acima |
| Vacância residencial em São Paulo | "em torno de 6%" — fonte fraca, sem metodologia | [Monitor Mercantil](https://monitormercantil.com.br/selic-alta-aluguel-em-alta-o-paradoxo-do-mercado-de-apartamentos-para-alugar-em-sao-paulo-em-2026/) |

Uso: `rate` 0,6 (referência 0,56); `incc` 6,5 (referência 6,75); `depreciacao` 2 (usado sobe 4,5%).
O PDF oficial do FipeZap de setembro não pôde ser lido; os números vêm da notícia.

**Não encontrado:** custo de mobiliar um studio (os padrões de R$ 12 mil e R$ 35 mil de montagem são
estimativa minha, sem fonte); tempo médio para alugar; vacância com metodologia.

## Crédito

| Dado | Valor | Fonte e data |
|---|---|---|
| Caixa, pessoa física, SFH | a partir de TR + 11,19% a.a. (jun/2026), até 11,49%; SFI a TR + 12%; até 80% do imóvel; até 420 meses; teto do SFH de R$ 2,25 mi | (sem link guardado — uma nova busca em nov/2026 não achou anúncio mais recente) |
| Plano investidor da construtora | sem juros até as chaves; algumas construtoras parcelam os 30% finais depois da entrega, também sem juros (informação do PO, 2026-11-12, não é pesquisa; correção por INCC/IPCA depende do contrato) | PO |
| Construtora que cobra juros, depois das chaves | IPCA ou IGP-M + 0,69% a 1% a.m. | (sem link guardado) |
| Tabela Price em construtora | decisão judicial de maio/2026 barrou capitalização de juros em período menor que um ano | (sem link guardado) |
| Consórcio de imóveis | taxa de administração média de 0,073% ao mês, prazo médio de 207 meses (ABAC) → ~15% no plano; Banco Central: 21,19% em média, em 217 meses, para grupos novos; de 11,7% a 29,2% entre administradoras | (sem link guardado) |
| Empréstimo com garantia de imóvel | cerca de 1,09% a 1,8% a.m. (alguns + IPCA), 50% a 60% do valor, até 240 meses | (sem link guardado) |

Uso: linha "plano investidor" (juros 0, 36 meses, padrão), linha "construtora com juros" (1,0% a.m. + IPCA, 48 meses), linha "banco" (0,9% a.m. + TR de 2%, 360 meses,
80%, 30% da renda), `consorcioTaxaTotalPct` 20. Crédito bancário para a **holding** não tem tabela pública
e costuma ser pior que o de pessoa física.

## Impostos

| Dado | Valor | Fonte e data |
|---|---|---|
| Holding no lucro presumido, hoje | PIS/Cofins 3,65% + IRPJ 4,8% + CSLL 2,88% = 11,33% do aluguel; até 14,53% com o adicional de IRPJ (10% sobre o lucro presumido acima de R$ 60 mil por trimestre) | [IBDFAM](https://ibdfam.org.br/artigos/2501/A+Loca%C3%A7%C3%A3o+de+Im%C3%B3veis+na+Reforma+Tribut%C3%A1ria%3A+Pessoa+F%C3%ADsica+versus+Holding+Patrimonial+e+a+Janela+de+Oportunidade+em+2027%E2%80%932028) |
| Reforma — aluguel residencial | redução de 70% da alíquota; redutor social de R$ 600 por imóvel por mês, corrigido pelo IPCA | [ConJur, 11/11/2026](https://conjur.com.br/2026-nov-11/aluguel-de-imoveis-com-nota-fiscal-o-que-muda-na-reforma-tributaria/), [Contábeis, 10/11/2026](https://www.contabeis.com.br/noticias/80736/reforma-tributaria-no-aluguel-regras-para-pessoa-fisica-e-juridica/) |
| Reforma — calendário (simulação do ConJur) | 2026: teste de 0,9% + 0,1%, sem desembolso para quem cumpre as obrigações; 2027–2028: efetivo de 3,39% no lugar do PIS/Cofins; 2029 a 2032: 3,89%, 4,39%, 4,89%, 5,39%; 2033: 8,40% (alíquota cheia de 28%) | ConJur, acima. A alíquota de referência de 2027 (11,3%, cálculo do TCU) ainda depende do Senado |
| Reforma — pessoa física | só vira contribuinte com mais de 3 imóveis alugados **e** receita acima de R$ 240 mil por ano | ConJur e Contábeis, acima; [InfoMoney](https://www.infomoney.com.br/minhas-financas/como-a-reforma-tributaria-muda-a-conta-de-quem-vive-de-aluguel-entenda/); [Radar da Reforma](https://radardareformatributaria.com/locacao-imoveis-ibs-cbs-2027-pessoa-fisica-holding-transicao/) (as fontes divergem sobre a regra dos R$ 288 mil) |
| Reforma — temporada (até 90 dias) | regime de hotelaria para quem é contribuinte: redução de 40% → cerca de 16,8% com a alíquota cheia, antes dos créditos | InfoMoney e Radar da Reforma, acima (a conta de 16,8% é 60% de 28%) |
| Nota fiscal de aluguel | obrigatória a partir de 1º/12/2026 (1º/1/2027 no Simples) | ConJur, acima |
| Dividendos | 10% retidos na fonte sobre dividendos acima de R$ 50 mil por mês da mesma empresa para a mesma pessoa, desde jan/2026 (Lei 15.270/2025) | (sem link guardado) |
| LC 224/2025 | +10% nos percentuais de presunção para receita acima de R$ 5 milhões por ano; contestada na Justiça | [NetCPA](https://netcpa.com.br/colunas/lucro-presumido-apos-lc-224-majoracao-e-atenuantes/27079) |

Uso: `imposto.ts` (tabela `CONSUMO_LONGA`, `REDUTOR_SOCIAL`, `IRPJ_CSLL_PRESUMIDO`) e os avisos
`adicional-irpj` e `dividendos`. Nenhuma destas fontes é oficial; os percentuais de 2027 em diante são
simulação de quem escreveu o artigo.

## Temporada (Airbnb)

| Dado | Valor | Fonte e data |
|---|---|---|
| Taxa do Airbnb | taxa única de cerca de 16% cobrada do anfitrião, no Brasil, em 2026 | (sem link guardado) |
| São Paulo, cidade | ocupação mediana de 62%, diária média de R$ 240, cerca de R$ 52 mil por ano por anúncio | Airbtics (sem link guardado) |
| São Paulo, Centro | ocupação de 42%, diária de R$ 282 (1 dormitório: R$ 256), cerca de R$ 49 mil por ano | BnBCalc (sem link guardado) |
| STJ, 7/5/2026 | REsp 2.121.055/MG, 2ª Seção, 5 a 4: em condomínio de uso residencial, locação por temporada via aplicativo só com autorização expressa na convenção. Tema 1.443 (repetitivo) pendente | (sem link guardado) |
| São Paulo — HIS e HMP | temporada proibida nessas unidades (Decretos 63.130/2024 e 64.244/2025); em agosto/2026 o Airbnb removeu 1.625 anúncios; a prefeitura mandou as plataformas tirarem os anúncios | [Portas](https://portas.com.br/noticias/sp-cobra-plataformas-por-remocao-de-anuncios-de-imoveis-populares/), [Myside](https://myside.com.br/guia-sao-paulo/diferenca-his-hmp-r2v-nr-sao-paulo-sp) |
| São Paulo — tetos de 2026 | HIS-1: renda familiar até R$ 4.863, venda até R$ 276.102; HIS-2: até R$ 9.726 e R$ 383.637; HMP: até R$ 16.210 e R$ 537.673 (Decreto 64.895, de 5/1/2026) | [Gestão Urbana](https://gestaourbana.prefeitura.sp.gov.br/?p=54044), [Legisweb](https://www.legisweb.com.br/legislacao/?id=489167) |

Uso: `diariaHoje` 240, `ocupacaoPct` 55 (entre as duas medições), `taxaPlataformaPct` 16, os avisos
`temporada-regras` e `his-hmp`.

**Não encontrado:** taxa de gestora de temporada no Brasil (os 20% do padrão são referência de mercado
sem fonte). Atenção ao aviso `his-hmp`: um studio de R$ 260 mil em São Paulo está na faixa de preço de
HIS-1, e essas unidades têm limite de renda para quem compra — confira o enquadramento antes de simular
temporada ou mesmo aluguel livre.

## Valorização da planta

Relatos de mercado falam em 20% a 40% de valorização do lançamento à entrega, sem fonte rigorosa. Só o
INCC de 3 anos dá cerca de 21%. Por isso `agioProntoPct` nasce em zero e é tratado como hipótese.

## Como atualizar

1. Refaça as buscas (FipeZap de locação e de venda, INCC-M, Focus, CDI, tabela da Caixa, ABAC).
2. Edite `web/src/planner/mercado.ts` (`MERCADO` e `MERCADO_DATA`) e, se a regulamentação da reforma
   mudou, `web/src/planner/imposto.ts`.
3. Reveja os padrões em `types.ts` e `api/planner/model.py` só se a referência se afastou muito.
4. Copie esta página para `referencias-<ano>.md` com as fontes novas.
