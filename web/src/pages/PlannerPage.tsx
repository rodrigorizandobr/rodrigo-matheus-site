import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { idToken, signInWithGoogle, signOutUser, watchUser } from '../lib/firebase'
import { plannerApi } from '../planner/api'
import { pontosAnuais } from '../planner/calc'
import { caminhos, type IdEstrategia } from '../planner/caminhos'
import { inicioDeHoje, rotuloMesAno } from '../planner/calendario'
import { avisos as calcularAvisos } from '../planner/avisos'
import { posChavesPct, pctAteChaves } from '../planner/contrato'
import { emReaisDeHoje } from '../planner/inflacao'
import { PlannerChartEstrategias } from './planner/PlannerChartEstrategias'
import { PlannerRecomendacao, PlannerRoteiro } from './planner/PlannerCaminhos'
import { benchmarkRendaFixa, mesDaMeta } from '../planner/indicadores'
import { MERCADO, aplicarReferencias } from '../planner/mercado'
import { aplicarRegras } from '../planner/regras'
import { DEFAULT_PARAMS, type PlannerParams } from '../planner/types'
import { formatBRL, formatBRLCompact } from '../planner/format'
import { ParamField } from './planner/ParamField'
import { ChoiceField } from './pension/ChoiceField'
import { Group } from './planner/Group'
import { PlannerLedgerAbas } from './planner/PlannerLedger'
import { PlannerComparar } from './planner/PlannerComparar'
import { Novidades, PlannerAvisos, Stat, TesteDeEstresse, TradicionalTemporada, ValeFinanciar } from './planner/PlannerPaineis'

type Session = { email: string } | null
type SaveState = 'salvo' | 'salvando' | 'erro' | null
type Moeda = 'hoje' | 'nominal'

const SAVE_DEBOUNCE_MS = 900
const CHAVE_MOEDA = 'planner:moeda'

function moedaLembrada(): Moeda {
  try { return window.localStorage.getItem(CHAVE_MOEDA) === 'nominal' ? 'nominal' : 'hoje' } catch { return 'hoje' }
}

/**
 * /vivendo-de-imoveis — simulador de patrimônio em studios comprados na planta pelo plano investidor da
 * construtora, aberto a qualquer conta Google (sem allowlist): cada pessoa tem o próprio plano, guardado
 * pelo uid (api/planner/). O cálculo roda inteiro no navegador (planner/calc.ts); o backend só guarda e
 * devolve os parâmetros.
 */
export function PlannerPage() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [params, setParams] = useState<PlannerParams>(DEFAULT_PARAMS)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [moeda, setMoeda] = useState<Moeda>(moedaLembrada)
  const [escolhida, setEscolhida] = useState<IdEstrategia | null>(null)
  const [anterior, setAnterior] = useState<Pick<PlannerParams, 'rate' | 'incc' | 'depreciacao'> | null>(null)

  const api = useMemo(() => plannerApi(idToken), [])
  const inicio = useMemo(() => inicioDeHoje(), [])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(false)

  useEffect(() => {
    document.title = 'Vivendo de Imóveis — Rodrigo Matheus'
    return watchUser((user) => setSession(user ? { email: user.email ?? '' } : null))
  }, [])

  useEffect(() => {
    if (!session) return
    let vivo = true
    setLoaded(false)
    api.getPlan().then((plano) => {
      if (!vivo) return
      skipNextSave.current = true
      setParams(plano.params)
      setLoaded(true)
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => { vivo = false }
  }, [session, api])

  // Autosalva 900ms depois da última mudança — não dispara na carga inicial do plano.
  useEffect(() => {
    if (!loaded) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('salvando')
    saveTimer.current = setTimeout(() => {
      api.savePlan(params)
        .then(() => setSaveState('salvo'))
        .catch(() => setSaveState('erro'))
    }, SAVE_DEBOUNCE_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, loaded])

  const set = useCallback(<K extends keyof PlannerParams>(key: K) => (value: PlannerParams[K]) => {
    setAnterior(null)
    setParams((p) => ({ ...p, [key]: value }))
  }, [])

  const escolherMoeda = (m: Moeda) => {
    setMoeda(m)
    try { window.localStorage.setItem(CHAVE_MOEDA, m) } catch { /* sem armazenamento: vale só nesta visita */ }
  }

  // Com prazo longo a simulação pesa: o slider não pode travar esperando por ela.
  const simulado = useDeferredValue(params)
  const efetivo = useMemo(() => aplicarRegras(simulado), [simulado])
  const resultado = useMemo(() => caminhos(efetivo, inicio), [efetivo, inicio])
  const idAtivo = escolhida ?? resultado.recomendada
  const ativa = resultado.estrategias.find((e) => e.id === idAtivo) ?? resultado.estrategias[0]
  const linhas = ativa.linhas
  const pontos = useMemo(() => pontosAnuais(linhas, ativa.params), [linhas, ativa.params])
  const lista = useMemo(() => calcularAvisos(linhas, ativa.params), [linhas, ativa.params])
  const bench = useMemo(() => benchmarkRendaFixa(linhas, ativa.params), [linhas, ativa.params])
  const final = pontos.at(-1)!
  const ultima = linhas.at(-1)!

  const conv = useCallback(
    (valor: number, mes: number) => (moeda === 'hoje' ? emReaisDeHoje(valor, mes, simulado.ipca) : valor),
    [moeda, simulado.ipca],
  )
  const benchConv = useMemo(() => bench.map((v, i) => conv(v, i + 1)), [bench, conv])
  const metaDoMes = useCallback((mes: number) => conv(linhas[mes - 1]?.metaDoMes ?? 0, mes), [linhas, conv])

  const mesMeta = mesDaMeta(linhas)
  const linhaMeta = mesMeta === null ? undefined : linhas.find((l) => l.mes === mesMeta)
  const pctMeta = ultima.metaDoMes > 0 ? Math.round((ultima.rendaDisponivel / ultima.metaDoMes) * 100) : 0

  if (session === undefined) {
    return <Shell><p className="text-muted text-[13px]">Verificando sessão…</p></Shell>
  }

  if (session === null) {
    return (
      <Shell>
        <div className="panel hud-frame p-8 md:p-10 max-w-md mx-auto text-center grid gap-5">
          <div>
            <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">VIVENDO DE IMÓVEIS</div>
            <p className="text-[13px] text-muted mt-2">Simule sua carteira de studios. Entre com o Google — o plano é só seu.</p>
          </div>
          <button type="button"
                  onClick={() => { setBusy('login'); setError(''); signInWithGoogle().catch((err) => setError((err as Error).message)).finally(() => setBusy(null)) }}
                  disabled={busy === 'login'}
                  className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
            {busy === 'login' ? 'abrindo…' : 'entrar com Google'}
          </button>
          {error && <p className="text-[12px] text-red">{error}</p>}
        </div>
      </Shell>
    )
  }

  const somaContrato = params.entradaPct + params.mensaisPct + params.reforcoPct + params.chavesPct
  const maxDe = (campo: 'entradaPct' | 'mensaisPct' | 'reforcoPct' | 'chavesPct', teto: number) =>
    Math.min(teto, Math.max(params[campo], 100 - (somaContrato - params[campo])))

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
        <div>
          <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">VIVENDO DE IMÓVEIS</div>
          <p className="text-[12px] text-muted mt-1">
            {session.email} · {saveState === 'salvando' ? 'salvando…' : saveState === 'erro' ? 'erro ao salvar' : saveState === 'salvo' ? 'salvo' : ' '}
          </p>
        </div>
        <button type="button" onClick={() => signOutUser()} className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">sair</button>
      </div>

      {!loaded ? (
        <p className="text-muted text-[13px]">Carregando seu plano…</p>
      ) : (
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 min-w-0">
          <div className="grid gap-4 content-start min-w-0">
            <Group title="Seus recursos hoje" inicial="aberto">
              <ParamField label="Salário bruto do casal (CLT)" kind="brl" min={0} max={200_000} step={500}
                          value={params.salarioBrutoCasal} onChange={set('salarioBrutoCasal')}
                          hint="Calcula o FGTS e vale como base do aporte anual (em salários). Com saldo devedor no apê, a cada 2 anos ele abate o apê. Com o apê quitado, compra studio pronto à vista assim que FGTS + caixa livre fecham a conta." />
              <ParamField label="Aporte anual (em salários)" kind="num" min={0} max={12} step={0.5}
                          value={params.annualSalarios} onChange={set('annualSalarios')}
                          hint={`13º, bônus, PLR: quantos salários brutos do casal você aporta por ano, de uma vez, no mês abaixo. Hoje: ${formatBRL(Math.round(params.annualSalarios * params.salarioBrutoCasal))} por ano.`} />
              <ParamField label="Mês do aporte anual" kind="mes" min={1} max={12} step={1}
                          value={params.annualMonth} onChange={set('annualMonth')} />
              <ParamField label="Saldo devedor do apartamento em que você mora hoje" kind="brl" min={0} max={2_000_000} step={10_000}
                          value={params.dividaApe} onChange={set('dividaApe')} />
              <ParamField label="Parcela atual do financiamento do apê" kind="brl" min={0} max={30_000} step={100}
                          value={params.parcelaApeAtual} onChange={set('parcelaApeAtual')} />
              <ParamField label="Prazo que falta no financiamento do apê" kind="meses" min={0} max={420} step={12}
                          value={params.prazoApeMeses} onChange={set('prazoApeMeses')}
                          hint="Com isso o simulador amortiza o apê todo mês, como o banco faz (tabela SAC): a parcela cai um pouco a cada mês e essa queda vira aporte. Zero = o apê só cai com o FGTS." />
              <ParamField label="Anos acumulando bens" kind="anos" min={1} max={40} step={1}
                          value={params.years} onChange={set('years')}
                          hint="Você compra e acumula durante todo esse prazo e, no fim, vive só de aluguel. Quer continuar comprando? Aumente o prazo (20, 30, 40 anos)." />
              <ParamField label="Quanto você quer por mês para viver" kind="brl" min={0} max={100_000} step={500}
                          value={params.metaRendaHoje} onChange={set('metaRendaHoje')}
                          hint="A meta de renda, em reais de hoje. O simulador corrige esse valor pela inflação mês a mês." />
            </Group>

            <Group title="Seus aportes" inicial="aberto">
              <ParamField label="Aporte mensal" kind="brl" min={0} max={30_000} step={100}
                          value={params.monthlyAmount} onChange={set('monthlyAmount')} />
              <ParamField label="Já pago no 1º studio" kind="brl" min={0} max={500_000} step={1_000}
                          value={params.initial} onChange={set('initial')} />
              <ParamField label="Meses até a entrega do 1º studio" kind="meses" min={0} max={60} step={1}
                          value={params.mesesEntrega1o} onChange={set('mesesEntrega1o')}
                          hint="Quanto falta para pegar as chaves do studio que você já está pagando. Zero = já entregue." />
              <ParamField label="Parcela mensal fixa do studio atual" kind="brl" min={0} max={30_000} step={100}
                          value={params.parcelaMensal1o} onChange={set('parcelaMensal1o')}
                          hint="O que você já paga todo mês nele até as chaves. Sai do caixa (o aporte mensal precisa cobrir) e reduz o saldo que será parcelado depois da entrega. Zero = o simulador só considera o que falta pagar depois das chaves." />
              <ParamField label="Parcela anual do studio atual" kind="brl" min={0} max={300_000} step={1_000}
                          value={params.parcelaAnual1o} onChange={set('parcelaAnual1o')}
                          hint="O reforço anual que você já paga nele até as chaves, no mesmo mês do aporte anual (o do bônus)." />
            </Group>

            <Group title="O studio" inicial="aberto">
              <ParamField label="Custo de 1 studio hoje" kind="brl" min={100_000} max={1_000_000} step={5_000}
                          value={params.custoStudio} onChange={set('custoStudio')}
                          hint="Studio na planta no centro de São Paulo. Confira se a unidade é HIS ou HMP (ver avisos)." />
              <ParamField label="Tempo de obra" kind="meses" min={12} max={60} step={1}
                          value={params.prazoObraMeses} onChange={set('prazoObraMeses')}
                          hint="Obra mais longa que o sistema aceita comprar. Ele sempre procura o studio com MENOS meses de obra faltando que o seu caixa consegue pagar." />
              <ParamField label="Aluguel bruto mensal" kind="pct" min={0} max={2} step={0.01}
                          value={params.rate} onChange={set('rate')} referencia={MERCADO.aluguel.texto} />
              <ParamField label="Meses até o primeiro aluguel" kind="meses" min={0} max={6} step={1}
                          value={params.mesesAteAlugar} onChange={set('mesesAteAlugar')}
                          hint="Tempo entre pegar as chaves e o primeiro inquilino entrar. Nesse período IPTU e condomínio são seus." />
              <ParamField label="Montagem para alugar (por studio)" kind="brl" min={0} max={100_000} step={1_000}
                          value={params.custoMontagem} onChange={set('custoMontagem')}
                          hint="Acabamento que falta na entrega e mobília básica, em reais de hoje. Sai do caixa nas chaves — ou na compra, se o studio já está pronto. Estimativa: troque pelo seu orçamento." />
            </Group>

            <Group title="Plano investidor (contrato)" inicial="aberto">
              <ParamField label="Entrada (no ato)" kind="pct" min={0} max={maxDe('entradaPct', 50)} step={1}
                          value={params.entradaPct} onChange={set('entradaPct')} />
              <ParamField label="Parcelado até as chaves (mensais + reforços)" kind="pct" min={0} max={Math.min(80, Math.max(params.mensaisPct + params.reforcoPct, 100 - params.entradaPct - params.chavesPct))} step={1}
                          value={params.mensaisPct + params.reforcoPct}
                          onChange={(v) => { setAnterior(null); setParams((q) => ({ ...q, mensaisPct: v, reforcoPct: 0 })) }}
                          hint="O sistema divide o parcelado entre parcelas mensais e reforços anuais pelo seu fluxo: os reforços caem no mês do seu bônus e levam a fatia que ele paga; as mensais levam o resto." />
              <ParamField label="Na entrega das chaves" kind="pct" min={0} max={maxDe('chavesPct', 60)} step={1}
                          value={params.chavesPct} onChange={set('chavesPct')} />
              <ParamField label="Meses para parcelar o resto depois das chaves" kind="meses" min={1} max={96} step={1}
                          value={params.posChavesMeses} onChange={set('posChavesMeses')} />
              <p className="text-[11px] text-muted">
                Até as chaves: {pctAteChaves(params)}% · Depois das chaves: {posChavesPct(params)}% em {params.posChavesMeses} meses, sem juros.
                Reproduza o cronograma do seu contrato; até as chaves as parcelas são corrigidas pelo INCC e o resíduo pago à construtora depois das chaves, pelo IPCA. O plano real pode ter datas e valores próprios
                por parcela — aqui eles são espalhados em partes iguais.
              </p>
            </Group>

            <Group title="Rendimento do caixa">
              <ParamField label="Rendimento do caixa" kind="pct" min={0} max={15} step={0.25}
                          value={params.rendimentoCaixaAno} onChange={set('rendimentoCaixaAno')}
                          hint="Quanto rende, líquido de imposto, o dinheiro que fica parado esperando a próxima compra."
                          referencia={MERCADO.caixa.texto} />
            </Group>

            <Group title="Custos do aluguel">
              <ParamField label="Vacância" kind="meses" min={0} max={6} step={0.5}
                          value={params.vacanciaMesesAno} onChange={set('vacanciaMesesAno')}
                          hint="Meses por ano sem inquilino. Padrão de mercado: 1 mês por ano." />
              <ParamField label="IPTU" kind="pct" min={0} max={3} step={0.1}
                          value={params.iptuPctAno} onChange={set('iptuPctAno')}
                          hint="% ao ano sobre o valor atual do imóvel. Quem paga é o inquilino; nos meses vagos fica com você." />
              <ParamField label="Condomínio" kind="pct" min={0} max={6} step={0.1}
                          value={params.condominioPctAno} onChange={set('condominioPctAno')}
                          hint="% ao ano sobre o valor atual do imóvel." />
              <ParamField label="Taxa da imobiliária" kind="pct" min={0} max={20} step={0.5}
                          value={params.taxaAdmPct} onChange={set('taxaAdmPct')}
                          hint="% do aluguel recebido. Zere se você mesmo administra." />
              <ParamField label="Manutenção e reformas" kind="pct" min={0} max={3} step={0.1}
                          value={params.manutencaoPctAno} onChange={set('manutencaoPctAno')}
                          hint="% ao ano do valor do imóvel, pago pelo dono." />
              <ChoiceField label="Imposto sobre o aluguel" value={params.impostoModo} onChange={set('impostoModo')}
                           options={[{ value: 'reforma', label: 'Automático' }, { value: 'fixo', label: 'Fixo' }]}
                           hint="Automático: holding no lucro presumido — 11,33% em 2026 (IRPJ e CSLL de 7,68% + PIS/Cofins de 3,65%). De 2027 em diante entram CBS e IBS com redução de 70% e desconto de R$ 600 por imóvel na base; a parte nova sobe aos poucos até cerca de 8,4% em 2033. São estimativas de novembro/2026." />
              {params.impostoModo === 'fixo' && (
                <ParamField label="Imposto sobre o aluguel na Holding" kind="pct" min={0} max={27.5} step={0.5}
                            value={params.impostoHolding} onChange={set('impostoHolding')} />
              )}
              <ParamField label="Custo fixo da holding" kind="brl" min={0} max={5_000} step={50}
                          value={params.custoFixoHoldingMes} onChange={set('custoFixoHoldingMes')}
                          hint="Contador, taxas e certificado da empresa, por mês, em reais de hoje. Estimativa: troque pelo que o seu contador cobra." />
            </Group>

            <Group title="Temporada (Airbnb)">
              <ParamField label="Parte da carteira em temporada" kind="pct" min={0} max={100} step={10}
                          value={params.pctTemporada} onChange={set('pctTemporada')}
                          hint="Zero = tudo em aluguel tradicional. O resto dos campos deste grupo só pesa na parte em temporada." />
              <ParamField label="Diária média" kind="brl" min={80} max={800} step={10}
                          value={params.diariaHoje} onChange={set('diariaHoje')}
                          hint="Em reais de hoje, já sem a taxa de limpeza." referencia={MERCADO.diaria.texto} />
              <ParamField label="Ocupação" kind="pct" min={20} max={90} step={1}
                          value={params.ocupacaoPct} onChange={set('ocupacaoPct')}
                          hint="Parte das noites do mês com hóspede." referencia={MERCADO.ocupacao.texto} />
              <ParamField label="Taxa da plataforma" kind="pct" min={0} max={25} step={0.5}
                          value={params.taxaPlataformaPct} onChange={set('taxaPlataformaPct')} referencia={MERCADO.plataforma.texto} />
              <ParamField label="Taxa da gestora" kind="pct" min={0} max={40} step={1}
                          value={params.taxaGestaoPct} onChange={set('taxaGestaoPct')}
                          hint="% do que sobra depois da plataforma. Zero se você mesmo recebe os hóspedes. Sem tabela pública: use o orçamento da sua gestora." />
              <ParamField label="Contas fixas do mês" kind="brl" min={0} max={2_000} step={50}
                          value={params.custoFixoTemporadaMes} onChange={set('custoFixoTemporadaMes')}
                          hint="Luz, água, internet e reposição de enxoval, em reais de hoje. Condomínio e IPTU entram sozinhos — em temporada são sempre seus." />
              <ParamField label="Manutenção em temporada" kind="pct" min={0} max={5} step={0.1}
                          value={params.manutencaoTemporadaPctAno} onChange={set('manutencaoTemporadaPctAno')}
                          hint="% ao ano do valor do imóvel. Gira mais gente: desgasta mais que o aluguel tradicional." />
              <ParamField label="Imposto sobre a receita de temporada" kind="pct" min={0} max={30} step={0.5}
                          value={params.impostoTemporadaPct} onChange={set('impostoTemporadaPct')}
                          hint="Percentual sobre a receita bruta. Hoje, na holding do lucro presumido, cerca de 11,3%. Pela reforma tributária, hospedagem de até 90 dias feita por quem é contribuinte de IBS e CBS segue o regime de hotelaria (redução de 40%, contra 70% do aluguel residencial): a alíquota bruta estimada chega a cerca de 17% em 2033, antes dos créditos — que o simulador não calcula. Confirme com o seu contador." />
              <ParamField label="Montagem para temporada (por studio)" kind="brl" min={0} max={150_000} step={1_000}
                          value={params.custoMontagemTemporada} onChange={set('custoMontagemTemporada')}
                          hint="Mobília completa, eletros e enxoval, em reais de hoje. Estimativa: troque pelo seu orçamento." />
            </Group>

            <Group title="Consórcio">
              <ParamField label="Cotas de consórcio" kind="num" min={0} max={10} step={1}
                          value={params.consorcioCotas} onChange={set('consorcioCotas')}
                          hint="Cada cota é uma carta de crédito do tamanho de um studio pronto. Todas começam hoje. Zero = sem consórcio." />
              <ParamField label="Prazo do grupo" kind="meses" min={60} max={240} step={12}
                          value={params.consorcioPrazoMeses} onChange={set('consorcioPrazoMeses')}
                          hint="Em quantos meses a carta é paga." />
              <ParamField label="Taxa de administração e fundo de reserva" kind="pct" min={5} max={35} step={0.5}
                          value={params.consorcioTaxaTotalPct} onChange={set('consorcioTaxaTotalPct')}
                          hint="Total do plano inteiro, não ao ano. É o custo do consórcio: não há juros, mas carta e parcelas são reajustadas todo ano pelo INCC."
                          referencia={MERCADO.consorcio.texto} />
              <ParamField label="Uma contemplação a cada" kind="meses" min={6} max={120} step={6}
                          value={params.consorcioIntervaloMeses} onChange={set('consorcioIntervaloMeses')}
                          hint="Hipótese sua: a 1ª cota sai depois desse tempo, a 2ª depois do dobro, e assim por diante. Sorteio não tem data — sem lance, a carta pode sair só no fim do prazo." />
              <ParamField label="Lance" kind="pct" min={0} max={60} step={5}
                          value={params.consorcioLancePct} onChange={set('consorcioLancePct')}
                          hint="Parte da carta que você paga de uma vez, com dinheiro do caixa, para ser contemplado. Abate o saldo devedor e encurta o prazo. Se faltar caixa no mês previsto, a contemplação espera." />
            </Group>

            <Group title="Leilão e imóveis da Caixa">
              <p className="text-[11px] text-muted leading-relaxed">Tudo aqui é estimativa: cada edital é diferente. Troque pelos números do imóvel que você está olhando.</p>
              <ParamField label="Desconto sobre o valor de mercado" kind="pct" min={0} max={70} step={1}
                          value={params.leilaoDescontoPct} onChange={set('leilaoDescontoPct')}
                          hint="Quanto abaixo do mercado você arremata um studio pronto. Leilões da Caixa e judiciais costumam sair bem abaixo da avaliação, mas o desconto efetivo depende da concorrência." />
              <ParamField label="Comissão do leiloeiro" kind="pct" min={0} max={15} step={0.5}
                          value={params.leilaoComissaoPct} onChange={set('leilaoComissaoPct')}
                          hint="Em geral 5% do valor arrematado." />
              <ParamField label="Jurídico e dívidas do imóvel" kind="pct" min={0} max={30} step={0.5}
                          value={params.leilaoJuridicoPct} onChange={set('leilaoJuridicoPct')}
                          hint="Advogado, desocupação e condomínio/IPTU atrasados, em % do valor arrematado. É onde mora o risco do leilão." />
              <ParamField label="Reforma" kind="pct" min={0} max={50} step={1}
                          value={params.leilaoReformaPct} onChange={set('leilaoReformaPct')}
                          hint="% do valor de mercado." />
              <ParamField label="Meses até o primeiro inquilino" kind="meses" min={0} max={36} step={1}
                          value={params.leilaoMesesAteAlugar} onChange={set('leilaoMesesAteAlugar')}
                          hint="Desocupação, reforma e locação. Nesse período IPTU e condomínio são seus." />
            </Group>

            <Group title="Documentação de compra">
              <ParamField label="ITBI" kind="pct" min={0} max={5} step={0.1}
                          value={params.itbiPct} onChange={set('itbiPct')} />
              <ParamField label="Escritura" kind="pct" min={0} max={3} step={0.1}
                          value={params.escrituraPct} onChange={set('escrituraPct')} />
              <ParamField label="Registro" kind="pct" min={0} max={3} step={0.1}
                          value={params.registroPct} onChange={set('registroPct')}
                          hint="Tudo em % do preço pago. Na planta, paga nas chaves; no imóvel pronto, na compra." />
              <ParamField label="Desconto à vista (imóvel pronto)" kind="pct" min={0} max={30} step={1}
                          value={params.descontoAVista} onChange={set('descontoAVista')}
                          hint="O poder do dinheiro à vista: vale para compras com FGTS, consórcio e com o dinheiro de uma venda." />
            </Group>

            <Group title="Venda">
              <ParamField label="Corretagem na venda" kind="pct" min={0} max={10} step={0.5}
                          value={params.corretagemVendaPct} onChange={set('corretagemVendaPct')} />
              <ParamField label="Imposto na venda" kind="pct" min={0} max={20} step={0.1}
                          value={params.impostoVendaPct} onChange={set('impostoVendaPct')}
                          hint="% do valor de venda (holding no lucro presumido ≈ 6,73%). Todo dezembro o sistema compara manter cada studio quitado contra vender e comprar na planta ou pronto com desconto — só vende quando compensa." />
              <ParamField label="Quanto o pronto vale a mais que o lançamento" kind="pct" min={0} max={40} step={1}
                          value={params.agioProntoPct} onChange={set('agioProntoPct')}
                          hint="Studio pronto costuma valer mais que o mesmo studio na planta. Com isso, comprar pronto fica mais caro e quem compra na planta ganha essa diferença na entrega. Zero = pronto e lançamento custam o mesmo. Não existe índice oficial: é uma hipótese sua." />
              <ParamField label="Vender nas chaves" kind="pct" min={0} max={100} step={10}
                          value={params.pctVendaNasChaves} onChange={set('pctVendaNasChaves')}
                          hint="De cada 10 studios comprados na planta, quantos você vende ao pegar as chaves em vez de alugar. O dinheiro volta para o caixa e o sistema recompra. Paga corretagem e imposto de venda; como a escritura não chega a sair no seu nome, não paga ITBI nem cartório. Só faz sentido se o pronto valer mais que a planta (campo acima)." />
            </Group>

            <Group title="Mercado">
              <div className="grid gap-1.5">
                <button type="button" className="chip !h-8 justify-self-start font-display font-semibold text-[11px] uppercase tracking-wider"
                        onClick={() => {
                          setAnterior({ rate: params.rate, incc: params.incc, depreciacao: params.depreciacao })
                          setParams((p) => aplicarReferencias(p))
                        }}>
                  Usar referências de mercado
                </button>
                <p className="text-[11px] text-muted">
                  Dados de novembro/2026: aluguel, INCC e valorização do usado. Os seus números pessoais não mudam.
                  {anterior && (
                    <> <button type="button" className="underline" onClick={() => { setParams((p) => ({ ...p, ...anterior })); setAnterior(null) }}>desfazer</button></>
                  )}
                </p>
              </div>
              <ParamField label="Valorização dos studios novos (INCC)" kind="pct" min={0} max={15} step={0.25}
                          value={params.incc} onChange={set('incc')} referencia={MERCADO.incc.texto} />
              <ParamField label="Perda por envelhecimento do imóvel" kind="pct" min={0} max={10} step={0.25}
                          value={params.depreciacao} onChange={set('depreciacao')}
                          hint="Quanto o studio usado valoriza a menos que o lançamento. INCC menos este número é a valorização dos seus studios."
                          referencia={MERCADO.usado.texto} />
              <ParamField label="Inflação (IPCA)" kind="pct" min={0} max={12} step={0.25}
                          value={params.ipca} onChange={set('ipca')}
                          hint="Corrige a sua meta de renda e os custos em reais ao longo do plano. É também o que converte os resultados para reais de hoje."
                          referencia={MERCADO.ipca.texto} />
              <ParamField label="Dissídio anual (salário e bônus)" kind="pct" min={0} max={15} step={0.5}
                          value={params.dissidio} onChange={set('dissidio')} />
              <ParamField label="Mês do dissídio" kind="mes" min={1} max={12} step={1}
                          value={params.mesDissidio} onChange={set('mesDissidio')} />
            </Group>
          </div>

          <div className="grid gap-6 content-start min-w-0">
            <Novidades />
            <ChoiceField label="Valores em" value={moeda} onChange={escolherMoeda}
                         options={[{ value: 'hoje', label: 'R$ de hoje' }, { value: 'nominal', label: 'R$ nominais' }]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Vive de renda a partir de"
                    value={params.metaRendaHoje <= 0 ? '—' : linhaMeta ? rotuloMesAno(linhaMeta.ano, linhaMeta.mesDoAno) : 'não chega'}
                    apoio={params.metaRendaHoje <= 0 ? 'defina a meta de renda ao lado'
                      : linhaMeta ? `ano ${linhaMeta.anoDoPlano} do plano · meta de ${formatBRL(params.metaRendaHoje)} de hoje`
                        : `em ${params.years} anos a renda chega a ${pctMeta}% da meta`} />
              <Stat label="Renda disponível no fim" value={formatBRLCompact(conv(ultima.rendaDisponivel, ultima.mes))}
                    title={formatBRL(conv(ultima.rendaDisponivel, ultima.mes))} apoio="aluguéis menos custos e parcelas" />
              <Stat label="Patrimônio líquido no fim" value={formatBRLCompact(conv(ultima.patrimonioLiquido, ultima.mes))}
                    title={formatBRL(conv(ultima.patrimonioLiquido, ultima.mes))} apoio="imóveis + caixa − dívidas; o FGTS fica de fora" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Studios c/ chaves" value={String(final.studiosComChaves)} />
              <Stat label="Studios quitados" value={String(final.studiosQuitadosEquiv)} />
              <Stat label="Dívida e compromissos no fim" value={formatBRLCompact(conv(final.divida, ultima.mes))} title={formatBRL(conv(final.divida, ultima.mes))} />
            </div>
            <PlannerRecomendacao estrategias={resultado.estrategias} recomendada={resultado.recomendada} porque={resultado.porque}
                                 selecionada={ativa.id} onSelecionar={setEscolhida} anos={simulado.years} metaHoje={simulado.metaRendaHoje} />
            <PlannerChartEstrategias estrategias={resultado.estrategias} selecionada={ativa.id} onSelecionar={setEscolhida}
                                     conv={conv} benchmark={benchConv} metaDoMes={metaDoMes} moeda={moeda}
                                     nomeBenchmark={simulado.rendimentoCaixaAno > 0 ? 'Mesmos aportes na renda fixa' : 'Total aportado'} />
            <PlannerAvisos avisos={lista} />
            <PlannerRoteiro estrategia={ativa} />
            {ativa.params.compraNaPlanta !== false && <ValeFinanciar p={ativa.params} linhas={linhas} />}
            <TesteDeEstresse linhas={linhas} reservaMeses={efetivo.reservaMeses} moeda={conv} />
            <TradicionalTemporada p={efetivo} ano={inicio.ano} />
            <PlannerComparar params={aplicarRegras(params)} inicio={inicio} moeda={moeda} />
            <PlannerLedgerAbas estrategias={resultado.estrategias} selecionada={ativa.id} onSelecionar={setEscolhida} />
            <p className="text-[11px] text-muted leading-relaxed">
              Como o sistema compra: todo mês ele soma o saldo acumulado com as entradas e saídas previstas (aportes, aluguéis,
              parcelas da construtora, custos) e compra o studio com menos obra pela frente que essa conta paga até as chaves — sem deixar o
              caixa ficar abaixo da sua reserva (reserva automática de 3 meses de obrigações). No plano investidor a construtora cobra entrada, parcelas e reforços corrigidos pelo INCC, e o resto depois das chaves corrigido pelo IPCA, sem juros. O que sobra é adiantado na obra, ou fica aplicado no caixa quando isso
              rende mais. Você acumula bens até o fim do prazo e, depois dele, vive dos aluguéis. Simulação
              educativa, não é recomendação de investimento.
            </p>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-10 md:py-14 min-h-[70svh]">
      {children}
    </div>
  )
}
