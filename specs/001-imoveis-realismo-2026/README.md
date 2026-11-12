# 001 — Vivendo de Imóveis: realismo 2026, alavancagem e temporada

> **Isto é especificação, não código.** Nada do simulador foi alterado para escrevê-la.
> Escrita em 2026-11-12 sobre o commit `f81ad5e` (`web/src/planner/calc.ts`, 472 linhas).
> Quem executa: outro modelo, pacote por pacote, na ordem da seção 4.
> Leia este arquivo inteiro antes de abrir qualquer pacote.

## 1. Por que mexer — medido no motor de hoje

Rodei o motor atual (sem alterar nada) com os parâmetros padrão e trocando um número por vez pelo
valor de mercado de novembro/2026. Horizonte de 15 anos.

| Cenário | Studios | Patrimônio | Renda líquida/mês |
|---|---|---|---|
| Padrão de hoje (aluguel 0,8% a.m., juros 0,8% a.m., INCC 6%) | 10 | R$ 4.685.700 | R$ 23.716 |
| Só o aluguel no valor de mercado (0,56% a.m. — FipeZap, 1 dormitório) | 7 | R$ 3.839.118 | R$ 13.809 |
| Só os juros no valor de mercado (1,36% a.m. ≈ IPCA + 12% a.a.) | 9 | R$ 4.405.290 | R$ 23.888 |
| Aluguel 0,56 + juros 1,36 + INCC 6,75 ("mercado") | 7 | R$ 3.866.252 | R$ 13.076 |
| "Mercado", pagando 100% nas chaves (sem financiar) | 7 | R$ 4.443.000 | R$ 13.201 |
| "Mercado", pagando 10% nas chaves (alavancagem máxima) | 6 | R$ 3.443.563 | R$ 13.037 |

O que isso mostra, e o que cada pacote ataca:

1. **O aluguel é o número que mais pesa, e o padrão está otimista.** 0,8% a.m. é 9,6% a.a.; o FipeZap
   de setembro/2026 mede 6,74% a.a. para 1 dormitório. A renda cai 42% só com essa troca. → pacote 3.
2. **Tudo aparece em reais do futuro.** R$ 23.716 por mês em 2041 compram o que R$ 12.255 compram hoje
   (IPCA de 4,5% a.a.); R$ 4,69 milhões viram R$ 2,42 milhões. → pacote 1.
3. **Ninguém "vive" da renda.** Depois do ano de transição o motor reinveste 100% do aluguel para
   sempre. A página se chama Vivendo de Imóveis e não responde "quando" nem "com quanto". → pacote 1.
4. **A alavancagem depende do custo do crédito, e a tela não mostra.** Com crédito a juros de mercado
   (banco, ou construtora cobrando IPCA + 1% a.m., ~17,7% a.a.) alavancar tira patrimônio: no cenário
   "mercado", quem não financia termina com R$ 4,44 mi e quem financia 90% com R$ 3,44 mi, porque o
   studio rende só ~9% a.a. (aluguel líquido + valorização). **Mas o PO compra no "plano investidor"
   da construtora: parcelado até as chaves sem juros e, em algumas construtoras, os 30% finais também
   parcelados sem juros depois da entrega** (informação dele, 2026-11-12). Com juros zero a conta vira:
   pagando 30% até as chaves (resto em 36 meses) o motor dá 9 studios, R$ 4,50 mi e R$ 17,6 mil de renda,
   contra 8 studios, R$ 4,43 mi e R$ 15,6 mil pagando 100%; com 10%, R$ 4,60 mi. **Para ele, alavancar
   com a construtora compensa**; o que não compensa é o banco. → pacote 4 (linha "plano investidor" como
   padrão, mostrar o spread) e pacote 6 (comparar estratégias).
5. **O financiamento é uma linha só e curta**: 48 meses, sem correção monetária. Não existe banco
   (até 420 meses, TR + ~11,5% a.a.) nem consórcio (sem juros, taxa de ~15% a 21% no plano todo). → pacotes 4 e 7.
6. **O apartamento em que a pessoa mora só cai com FGTS**: as parcelas pagas todo mês não amortizam
   nada. Com a tabela SAC ele quitaria no mês 96; hoje o motor só quita no 120. → pacote 2.
7. **Caixa parado rende 0%** (pico de R$ 178 mil no padrão, R$ 340 mil no cenário "mercado") com o CDI
   a 14% a.a.; e o motor adianta obra (que corrige a ~6,75%) mesmo quando deixar aplicado rende mais. → pacote 2.
8. **Studio pronto aluga no mesmo mês, sem gastar nada**: não há acabamento/mobília nem tempo até o
   primeiro inquilino. → pacote 2.
9. **Imposto fixo de 11,5%**: a reforma tributária muda a conta ano a ano até 2033. → pacote 3.
10. **Temporada (Airbnb) não existe.** Conta de apoio (studio de R$ 260 mil, diária de R$ 240, 55% de
    ocupação, taxa de plataforma de 16%): com gestora a 20% sobra R$ 898/mês, menos que os R$ 996 do
    aluguel tradicional a 0,6% a.m.; sem gestora sobra R$ 1.573. O ponto de equilíbrio é 57% de ocupação
    com gestora e 44% sem. → pacote 5.

Fontes e datas de cada número: `referencias-2026.md`.

## 2. Princípios (valem para todos os pacotes)

1. **Neutro = idêntico.** Todo parâmetro novo tem um valor NEUTRO com o qual o motor se comporta
   exatamente como no commit `f81ad5e`. Os valores neutros moram em `web/src/planner/neutro.ts` e o
   teste de caracterização (pacote 0) prova a igualdade. Se um pacote não conseguir ficar neutro,
   **pare e avise o PO** — não ajuste o teste de caracterização para passar.
2. **Padrão ≠ neutro.** `DEFAULT_PARAMS` (o que um plano novo vê) passa a ser realista; os testes de
   mecânica usam `base()`, que aplica `NEUTRO`. Assim mudar um padrão nunca quebra teste de mecânica.
3. **TDD.** Cada item traz a lista "Testes primeiro". Escreva, rode, veja falhar, só então implemente.
4. **Teste de propriedade, não de número.** Como no `calc.test.ts` de hoje: "mais X dá mais Y",
   "o saldo fecha", "nunca fica negativo". Número exato só nos exemplos de conferência desta
   especificação (todos calculados à mão e conferidos por script) e no teste de caracterização.
5. **Motor puro e no navegador.** Nada de rede, `Date.now()` ou `Math.random()` dentro de
   `web/src/planner/` — a única porta para o relógio é `inicioDeHoje()` (pacote 1), chamada pela página.
6. **Front e back andam juntos.** Parâmetro novo entra em `web/src/planner/types.ts`
   (`PlannerParams` + `DEFAULT_PARAMS`) **e** em `api/planner/model.py` (`DEFAULT_PARAMS` + `_LIMITS`
   ou `_ENUMS`) no mesmo commit, com os valores de `parametros.md`. O backend ignora chave
   desconhecida em silêncio: se ele não conhecer o campo, a pessoa mexe no slider, recarrega e o
   valor voltou ao padrão.
7. **Código novo em arquivo novo.** `calc.ts` só ganha pontos de integração; cada conceito novo é um
   módulo puro com o próprio teste (lista na seção 7.2).
8. **Rótulos e dicas exatamente como escritos aqui**, em português, sem jargão.
9. **Um pacote por vez**: testes verdes → commit → push → deploy (seção 7.4). Não comece o próximo com
   o anterior pela metade.

## 3. Mapa dos pacotes

| # | Arquivo | Entrega | Prioridade | Depende de |
|---|---|---|---|---|
| 0 | `00-rede-de-seguranca.md` | Teste de caracterização, `NEUTRO`, teste da página rápido, formulário em grupos recolhíveis | Obrigatório, primeiro | — |
| 1 | `01-calendario-inflacao-viver-de-renda.md` | Datas reais, "reais de hoje", meta de renda, retirada depois da transição | A | 0 |
| 2 | `02-precisao-do-motor.md` | Apê em SAC, entrega do 1º studio, montagem e tempo até alugar, rendimento do caixa, custo fixo da holding | A | 0, 1 |
| 3 | `03-realidade-2026.md` | Referências de mercado na tela, padrões novos, imposto da reforma, avisos, comparação com renda fixa | A | 1, 2 |
| 4 | `04-credito-e-alavancagem.md` | Prazo e correção do financiamento, linhas "construtora" e "banco", limite de crédito, amortização antecipada, dívida e spread | A | 2, 3 |
| 5 | `05-temporada-airbnb.md` | Conta da temporada, carteira mista, comparativo e ponto de equilíbrio | B | 1, 2, 3 |
| 6 | `06-comparar-estrategias.md` | Tabela "seu plano × sem dívida × banco × temporada × cenário ruim" | B | 4 (5 e 7 opcionais) |
| 7 | `07-consorcio.md` | Cotas de consórcio como linha de crédito | C | 4 |
| 8 | `08-planta-agio-e-venda-nas-chaves.md` | Ágio do pronto sobre a planta e venda nas chaves | C | 4 |
| 9 | `09-contrato-investidor-reserva-estresse.md` | Cronograma do contrato do plano investidor, correção pela média do INCC de 2 anos, reserva mínima de caixa, teste de estresse | A (pedido do PO em 2026-11-12) | 2, 4 |

Apoio: `parametros.md` (tabela-mestra de todo campo novo) e `referencias-2026.md` (dados e fontes).

Prioridade A = é o que deixa a página assertiva; B = a oportunidade que o PO pediu (Airbnb) e a
ferramenta que mostra qual estratégia ganha; C = mais alavancagem, mais complexo, só depois do resto.

## 4. Ordem de execução

`0 → 1 → 2 → 3 → 4 → 9 → 5 → 6 → 7 → 8`. O pacote 9 (numerado por último, mas pedido depois) vai logo
depois do 4: ele troca o "X% até as chaves" pelo cronograma real do contrato, e tudo que vem depois (temporada,
comparador, consórcio, ágio) deve nascer em cima dele. Cada pacote termina em produção antes do seguinte começar.
Dentro de um pacote, os itens (1.1, 1.2…) também são sequenciais e cada um pode ser um commit.

Se o PO quiser parar no meio, os pontos de parada naturais são depois do 3 (a página já é honesta) e
depois do 6 (já responde "qual estratégia").

## 5. Decisões que são do PO (cada uma com o padrão que eu recomendo)

O executor segue o recomendado, salvo ordem em contrário.

| # | Decisão | Recomendado | Alternativa |
|---|---|---|---|
| D1 | Plano já salvo ganha os padrões novos nos campos que ainda não tem (os números dele mudam ao abrir a página) | **Sim**, com um aviso de novidades dispensável (pacote 1, item 1.5) | Campos novos nascerem neutros em plano antigo — os números não mudam, mas o plano antigo fica menos realista que um novo |
| D2 | Depois da transição | **"Vivo da renda"** como padrão (retira a meta, para FGTS e aportes) | "Reinvisto tudo" (como hoje) |
| D3 | Valores dos cartões e do gráfico | **Reais de hoje** por padrão, com botão para ver nominal | Nominal por padrão |
| D4 | Aluguel padrão | **0,6% a.m.**, com a referência do FipeZap (0,56%) ao lado do campo | Manter 0,8% |
| D5 | Linha de crédito padrão | **Plano investidor da construtora: juros 0, correção 0 depois das chaves, 36 meses** (é como o PO compra) | Banco, 360 meses |
| D9 | Índice e valor da correção das parcelas de obra | **Média composta do INCC-M de 24 meses: 6,66% a.a.** (pedido do PO), ajustável; mercado segue o `incc` dos lançamentos | Igual ao `incc` |
| D10 | Reserva mínima padrão de caixa | **3 meses de obrigações** | 0 (como hoje, gasta tudo) ou 6 |
| D8 | A construtora corrige as parcelas por INCC/IPCA? "Sem juros" não quer dizer "sem correção". Hoje o motor corrige o que falta pagar na obra pelo INCC e nada depois das chaves | **Manter assim**: INCC até as chaves, zero depois. O PO precisa confirmar com o contrato dele; se houver correção depois, é só preencher "Correção do saldo devedor" | Corrigir também depois das chaves |
| D6 | Imposto da temporada | **Percentual fixo** informado pela pessoa (a regra nova depende de créditos que o simulador não conhece) | Tabela automática |
| D7 | Meta de renda padrão | **R$ 15.000/mês de hoje** | Outro valor |

Decisões já tomadas pelo PO — **não reabrir**:

- FGTS é usado sempre, sem restrição de cidade ou de tipo de imóvel; com saldo devedor no apê, abate o apê primeiro.
- Compra com FGTS é de imóvel **pronto**.
- O diário de bordo é **tabela** no desktop e no celular (nunca cartão); entradas e saídas ficam numa coluna só, empilhadas e com nome.
- É "tempo de obra", não "atraso de obra". Padrão 36 meses.
- IPTU e condomínio separados, cada um com "quem paga"; vago, quem paga é o dono.
- Não modelar água e luz na vacância do aluguel tradicional.
- Venda só quando o sistema calcula que compensa (a regra de dezembro fica como está).

## 6. Fora de escopo (avaliado e deixado de fora, com o motivo)

- **Empréstimo com garantia de imóvel (home equity).** Custa de 1,1% a 1,8% a.m. (15% a 24% a.a.) contra
  ~9% a.a. de retorno do studio: em 2026 é perda certa. Reavaliar quando a Selic cair para perto de 9%.
- **Aluguel na pessoa física.** O produto é uma holding; misturar carnê-leão e tabela progressiva dobra a
  complexidade sem ser o caso do PO.
- **Adicional de IRPJ, IRRF de dividendos e LC 224/2025 dentro do motor.** Só mordem acima de R$ 62,5 mil
  de aluguel por mês / R$ 50 mil de distribuição por sócio. Viram **aviso** na tela (pacote 3), não cálculo.
- **Rendimento do FGTS.** Fica nos 5,5% a.a. (em 2025 rendeu 6,90% com a distribuição de lucros; a
  diferença muda pouco e não é escolha de quem planeja).
- **Tabela Price, juros de obra, financiamento associativo, laudêmio, seguro.** Detalhe que não muda decisão.
- **Sorteio do consórcio.** O simulador é determinístico: a contemplação é uma hipótese da pessoa (pacote 7).
- **Biblioteca de gráfico, cálculo no servidor, mudança em `firestore.rules`.** Nenhuma é necessária.

## 7. Como trabalhar

### 7.1 Leia antes

- `CLAUDE.md` da raiz, seções "Simulador Vivendo de Imóveis" e "Armadilhas".
- `web/src/planner/calc.ts` inteiro (o motor é uma função só, `simulateMonthly`, com estado em closure).
- `web/src/planner/calc.test.ts` (o estilo dos testes).

Glossário do motor de hoje:

| Nome | O que é |
|---|---|
| `Unidade` | Um studio: `mesPronto`, `pago` (equity em obra), `valorNaEntrega`, `saldoFinanciado`, `amortizacaoMensal`, `restante` (entrada + documentação a pagar até as chaves, corrigida pelo INCC), `fracaoDocs` |
| `caminhoDoCaixa(mes)` | Projeção prudente do saldo do caixa para os próximos `horizonte` meses (aportes até a transição, aluguel congelado, parcelas em SAC, o que cada obra ainda deve cobrado nas chaves) |
| `folga(mes)` | O mínimo desse caminho: dinheiro que pode sair hoje sem faltar depois |
| `cabeNaObra(caminho, r, preco)` | "Comprar hoje um studio que entrega em `r` meses mantém o caminho ≥ 0?" |
| `novaNaObra(mes, r, preco)` | Cria a unidade comprada com `r` meses de obra pela frente |
| `pagarObra(u, valor)` | Paga parte do `restante` (separa imóvel de documentação) |
| `comprarPronta(mes, precoMercado, doFgts)` | Compra pronta à vista com `descontoAVista` |
| `contaDoAluguel(valor, p)` | Aluguel recebido e custos de uma unidade pronta |
| `avaliaVenda(...)` | Todo dezembro: manter × vender e ir para a planta × vender e comprar pronto |
| `pontosAnuais(linhas, p)` | Um ponto por ano para o gráfico, derivado do diário |

### 7.2 Onde o código novo mora

```
web/src/planner/
  calc.ts          orquestra o mês (só pontos de integração mudam)
  types.ts         PlannerParams, DEFAULT_PARAMS, MonthRow, YearPoint
  neutro.ts        NEUTRO: o valor neutro de cada parâmetro novo            (pacote 0)
  calendario.ts    início real do plano, data de cada mês                    (pacote 1)
  inflacao.ts      fator de preço e "reais de hoje"                          (pacote 1)
  indicadores.ts   meta de renda, dívida, cobertura, spread, benchmark       (pacotes 1, 3, 4)
  mercado.ts       referências de mercado com fonte e data                   (pacote 3)
  imposto.ts       imposto do aluguel: fixo × reforma                        (pacote 3)
  avisos.ts        avisos da tela                                            (pacotes 1, 3, 4, 5, 7, 8)
  credito.ts       SAC com correção, linhas prontas, custo anual             (pacote 4)
  temporada.ts     conta da temporada e comparação                           (pacote 5)
  estrategias.ts   comparar estratégias                                      (pacote 6)
  consorcio.ts     cotas e parcelas                                          (pacote 7)
  planta.ts        preço na planta com ágio, venda nas chaves                (pacote 8)
```

Cada módulo tem `nome.test.ts` ao lado. Componentes de tela ficam em `web/src/pages/planner/`.

### 7.3 Comandos

```bash
cd web
npx vitest run src/planner src/pages/planner     # só o simulador (rápido)
npm test -- --run                                # tudo, antes do commit
npm run typecheck
cd ../api && source .venv/bin/activate && pytest tests/test_planner_model.py tests/test_planner_routes.py tests/test_planner_store.py
```

`planner-page.test.tsx` é lento com a máquina ocupada (o `testTimeout` é de 20 s); o pacote 0 o deixa
rápido. Não rode a suíte com um Vite subindo ao lado.

**Conferir a tela sem login** (a página real exige Google): monte uma bancada temporária e apague ao
terminar — nunca entra em commit.

- `web/vite.bench.config.ts`: a config do Vite com `resolve.alias` trocando `src/lib/firebase` e
  `src/planner/api` por arquivos de mentira em `web/dev/stubs/` (um `watchUser` que entrega um usuário
  fixo; um `plannerApi` que devolve `DEFAULT_PARAMS` e finge salvar).
- `web/dev-planner-check.html` + `web/dev/planner-check.tsx`: uma página que só monta `<PlannerPage />`.
- `npx vite --config vite.bench.config.ts --port 5180` e abra `/dev-planner-check.html`.
- Confira em 390 px e em 1440 px: `document.documentElement.scrollWidth === clientWidth` (sem rolagem
  lateral da página). Tabela larga rola dentro do próprio painel. Se algo estourar: falta `min-w-0`
  num item de grid, ou um `<input>` com largura intrínseca (ver CLAUDE.md).
- Toda captura de tela gerada é enviada ao PO na hora (regra global dele).

### 7.4 Commit, push e deploy

**O git da pasta do Google Drive não é confiável** (a referência `origin/main` local está velha e o
`git fetch` trava lá). Nunca rode `git reset --hard`, `git pull` ou `git checkout` de arquivo nessa pasta.

1. Tenha um clone em **disco local** (fora do Drive): `git clone <url do origin> ~/clones/rodrigo-matheus`
   (a URL sai de `git remote get-url origin` na pasta do Drive). Se já existir, `git pull` nele.
2. Edite e rode os testes na pasta do Drive (é onde estão `node_modules` e `.venv`).
3. Copie para o clone **só os arquivos que você alterou ou criou** (`cp` arquivo a arquivo, mantendo o
   caminho). No clone: `git status` e `git diff` para conferir que só entrou o que devia.
4. No clone: `git add -A && git commit -m "imoveis: <o que mudou>" && git push origin main`.
   Mensagem em português, sem acento no assunto (padrão do histórico), terminando com as linhas de
   atribuição exigidas pela sessão.
5. **Deploy.** `./deploy.sh` a partir do Drive falha no upload do Cloud Run (`Errno 89`). O que funciona:
   - Mudou `api/`? No **clone**: `cd api && rm -rf .venv` e
     `gcloud run deploy portfolio-api --source . --region southamerica-east1 --project rodrigo-matheus --allow-unauthenticated --memory 512Mi --cpu 1 --min-instances 0 --max-instances 2 --timeout 1000 --quiet`.
     Depois confira que as variáveis de ambiente continuam lá:
     `gcloud run services describe portfolio-api --region southamerica-east1 --project rodrigo-matheus --format='value(spec.template.spec.containers[0].env[].name)'`
     (devem ser as mesmas de antes; se sumirem, reaplique com o passo de `services update` do `deploy.sh`).
   - Sempre, na pasta do **Drive**: `cd web && npm run build`; depois, da raiz,
     `set -a; source .env; set +a`, `gcloud storage cp web/dist/index.html gs://$GCS_BUCKET/spa-shell.html`
     e `npx --yes firebase-tools@14 deploy --only hosting --project rodrigo-matheus`.
   - **Backend antes do frontend** quando o pacote cria parâmetro (princípio 6).
   - Rode cada comando em uma chamada separada (comando encadeado longo com o caminho do Drive já foi recusado pela ferramenta).
6. Confira no ar: `https://rodrigomatheus.com.br/vivendo-de-imoveis` responde 200 e
   `GET /api/planner/plan` sem token responde 401.
7. Atualize a seção do simulador no `CLAUDE.md` ao fim de cada pacote: o que mudou, por quê, e a
   armadilha que você encontrou. É assim que o projeto guarda memória.

### 7.5 Quando parar e perguntar

- O teste de caracterização quebrou e você não sabe por quê.
- Um teste antigo passou a falhar e a especificação não manda alterá-lo (cada pacote lista os testes
  antigos que ele altera de propósito).
- Com os padrões novos, `Math.min(...saldo)` de `simulateMonthly(DEFAULT_PARAMS)` ficou negativo.
- A simulação padrão passou de 50 ms (medida: 3 ms hoje, a quente) ou a pior combinação passou de 600 ms.

## 8. Tela final (para todos os pacotes convergirem)

Coluna da esquerda — grupos recolhíveis (pacote 0, item 0.4), nesta ordem:

1. **Seus aportes** (aberto) · 2. **Viver de renda** (aberto) · 3. **O studio** (aberto) ·
4. **Plano investidor (contrato)** (aberto) · 5. **Crédito e alavancagem** · 6. **Custos do aluguel** ·
7. **Temporada (Airbnb)** · 8. **Consórcio** · 9. **Documentação de compra** · 10. **Venda** ·
11. **Mercado** · 12. **Seu apartamento** · 13. **Horizonte**

O grupo de cada campo novo está em `parametros.md`. Grupo de pacote ainda não entregue não aparece.

Coluna da direita, de cima para baixo:

1. Chave **"R$ de hoje | R$ nominais"** (pacote 1).
2. Cartões, duas fileiras de três:
   - "Vive de renda a partir de" · "Renda disponível no fim" · "Patrimônio líquido no fim"
   - "Studios c/ chaves" · "Studios quitados" · "Dívida e compromissos no fim"
3. Painel **"Atenção"** com os avisos (pacote 3).
4. Gráfico: patrimônio × "mesmos aportes na renda fixa" (pacote 3).
5. Cartão "Vale financiar?" (pacote 4), painel "Teste de estresse" (pacote 9) e cartão "Tradicional × temporada" (pacote 5).
6. Botão e tabela "Comparar estratégias" (pacote 6).
7. Diário de bordo (tabela).
8. Texto de rodapé "Como o sistema compra…", atualizado a cada pacote que muda a regra.

## 9. Definição de pronto de um pacote

- [ ] Todos os "Testes primeiro" do pacote existem e passam; a suíte inteira passa (`web` e `api`).
- [ ] O teste de caracterização passa sem ter sido editado (além de acrescentar o neutro do pacote em `NEUTRO`).
- [ ] `npm run typecheck` limpo.
- [ ] `parametros.md` bate com `types.ts` e com `model.py` (nomes, padrões, limites).
- [ ] Tela conferida na bancada em 390 px e 1440 px, sem rolagem lateral; capturas enviadas ao PO.
- [ ] `CLAUDE.md` atualizado.
- [ ] Commit, push e deploy feitos; produção conferida.
- [ ] Mensagem ao PO com: o que mudou, quanto mudaram os números do cenário padrão (studios,
      patrimônio, renda — antes e depois) e qualquer coisa que não saiu como a especificação previa.

## 10. Como pedir a execução de um pacote

Um pacote por conversa. Texto pronto para colar (troque N e o nome do arquivo):

> Leia `specs/001-imoveis-realismo-2026/README.md` inteiro e depois execute o **pacote N**
> (`specs/001-imoveis-realismo-2026/0N-….md`), item por item, na ordem. Regras: TDD (escreva os "Testes
> primeiro", veja falhar, implemente); o teste de caracterização não pode ser alterado além de
> acrescentar o neutro do pacote em `NEUTRO`; nomes, padrões e limites saem de `parametros.md`; rótulos
> e dicas exatamente como na especificação. Se algo da seção 7.5 do README acontecer, pare e me avise.
> Ao terminar: suíte inteira verde, confira a tela na bancada em 390 px e 1440 px e me mande as
> capturas, atualize o `CLAUDE.md`, faça commit, push e deploy como na seção 7.4, e me diga quanto
> mudaram os números do cenário padrão.

Quem preferir o fluxo do Spec Kit pode usar o arquivo do pacote como entrada de `/speckit-plan` e
`/speckit-tasks`; não é obrigatório — cada pacote já traz os itens na ordem de execução.
