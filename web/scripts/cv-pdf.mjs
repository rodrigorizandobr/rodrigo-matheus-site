/**
 * Gera o PDF do currículo a partir do MESMO i18n que alimenta a home.
 *
 *   node scripts/cv-pdf.mjs en         # → public/cv-en.pdf   (o padrão, e o que roda no npm)
 *   node scripts/cv-pdf.mjs pt         # → public/cv-pt-br.pdf  ⚠ SOBRESCREVE o arquivo do PO
 *
 * **O download em português é o PDF do próprio PO**, diagramado no gerador dele e
 * conferido linha a linha — não o desta ferramenta. Por isso o português só sai com
 * pedido explícito: rodar sem argumento gera o inglês, que não tem equivalente dele.
 * Se um dia o português for regerado aqui, o site perde a diagramação original.
 */
import { createElement as h } from 'react'
import { Document, Page, Text, View, Link, StyleSheet, renderToFile } from '@react-pdf/renderer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const lang = process.argv[2] === 'pt' ? 'pt' : 'en'
const t = JSON.parse(readFileSync(resolve(aqui, `../src/i18n/${lang}.json`), 'utf8'))

const CONTATO = {
  local: lang === 'pt' ? 'São Paulo, SP, Brasil' : 'São Paulo, SP, Brazil',
  email: 'rodrigorizando@gmail.com',
  fone: '+55 11 94180-0766',
  linkedin: 'linkedin.com/in/rodrigorizando',
  github: 'github.com/rodrigorizandobr',
}
const TITULOS = {
  pt: { cargo: 'GERENTE DE ENGENHARIA', exp: 'EXPERIÊNCIA', form: 'FORMAÇÃO', proj: 'PROJETOS', comp: 'COMPETÊNCIAS E IDIOMAS' },
  en: { cargo: 'ENGINEERING MANAGER', exp: 'EXPERIENCE', form: 'EDUCATION', proj: 'PROJECTS', comp: 'SKILLS AND LANGUAGES' },
}[lang]

const MESES_PT = { janeiro: 'jan', fevereiro: 'fev', março: 'mar', abril: 'abr', maio: 'mai', junho: 'jun',
                   julho: 'jul', agosto: 'ago', setembro: 'set', outubro: 'out', novembro: 'nov', dezembro: 'dez' }

/**
 * Período no formato compacto do currículo impresso.
 *
 * A seta "→" do site NÃO existe no alfabeto WinAnsi da Helvetica e sai como lixo no
 * PDF — vira travessão. "junho de 2024" vira "jun/2024", que é como um currículo escreve.
 */
const periodo = (texto) => {
  let saida = texto.replace('→', '–')
  if (lang === 'pt') {
    for (const [longo, curto] of Object.entries(MESES_PT)) {
      saida = saida.replace(new RegExp(`${longo} de (\\d{4})`, 'gi'), `${curto}/$1`)
    }
    saida = saida.replace('Presente', 'atual')
  } else {
    saida = saida.replace(/([A-Z][a-z]{2})[a-z]* (\d{4})/g, '$1 $2')
  }
  return saida
}

/** Uma frase por marcador: o site guarda prosa, o currículo lê melhor em lista. */
const bullets = (texto) => texto.split(/(?<=\.)\s+(?=[A-ZÀ-Ý])/).filter(Boolean)

const s = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 40, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1c', lineHeight: 1.45 },
  nome: { fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4, lineHeight: 1.1 },
  cargo: { fontSize: 8.5, letterSpacing: 2.6, marginTop: 6, color: '#3a3a3e' },
  contato: { fontSize: 7.8, color: '#55555a', marginTop: 6 },
  resumo: { marginTop: 12, textAlign: 'justify' },
  secao: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 2.6, marginTop: 16, marginBottom: 7, color: '#1a1a1c' },
  linha: { borderBottomWidth: 0.6, borderBottomColor: '#c8c8cc', marginBottom: 8 },
  cargoLinha: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  cargoNome: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', flex: 1, paddingRight: 10 },
  periodo: { fontSize: 8, color: '#55555a' },
  local: { fontSize: 7.8, color: '#7a7a80', marginBottom: 3 },
  item: { flexDirection: 'row', marginBottom: 1.5 },
  marcador: { width: 9, fontSize: 9 },
  itemTexto: { flex: 1, textAlign: 'justify' },
  curso: { marginBottom: 7 },
  cursoNome: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  nota: { color: '#55555a' },
  competencias: { marginTop: 2 },
})

const Secao = (titulo, filhos) => h(View, {}, h(Text, { style: s.secao }, titulo), h(View, { style: s.linha }), ...filhos)

const Cargo = (e) => h(View, { wrap: false, key: `${e.company}-${e.period}` },
  h(View, { style: s.cargoLinha },
    h(Text, { style: s.cargoNome }, `${e.role} · ${e.company}`),
    h(Text, { style: s.periodo }, periodo(e.period))),
  e.location ? h(Text, { style: s.local }, e.location) : null,
  ...bullets(e.description).map((b, i) =>
    h(View, { style: s.item, key: i }, h(Text, { style: s.marcador }, '•'), h(Text, { style: s.itemTexto }, b))))

const Curso = (c) => h(View, { style: s.curso, wrap: false, key: c.institution + c.period },
  h(View, { style: s.cargoLinha },
    h(Text, { style: s.cursoNome }, `${c.degree} · ${c.institution}`),
    h(Text, { style: s.periodo }, periodo(c.period))),
  h(Text, { style: s.nota }, c.note))

const Projeto = (p) => h(View, { style: s.curso, wrap: false, key: p.title },
  h(Text, { style: s.cursoNome }, p.title),
  h(Text, { style: s.nota }, p.note),
  p.url ? h(Link, { src: p.url, style: { ...s.nota, color: '#a01b1b' } }, p.url.replace('https://', '')) : null)

const doc = h(Document, { title: `Currículo — ${t.hero.name}`, author: t.hero.name },
  h(Page, { size: 'A4', style: s.page },
    h(Text, { style: s.nome }, t.hero.name),
    h(Text, { style: s.cargo }, TITULOS.cargo),
    h(Text, { style: s.contato },
      `${CONTATO.local}   ·   ${CONTATO.email}   ·   ${CONTATO.fone}   ·   ${CONTATO.linkedin}   ·   ${CONTATO.github}`),
    h(Text, { style: s.resumo }, t.about.lead),
    Secao(TITULOS.exp, t.experience.items.map(Cargo)),
    Secao(TITULOS.form, t.education.items.map(Curso)),
    Secao(TITULOS.proj, t.projects.works.map(Projeto)),
    Secao(TITULOS.comp, [
      h(Text, { style: s.competencias, key: 'stack' }, t.about.stack.join('   ·   ')),
      h(Text, { style: { ...s.competencias, marginTop: 4 }, key: 'idiomas' }, t.about.languages.join('   ·   ')),
    ])))

const saida = resolve(aqui, lang === 'pt' ? '../public/cv-pt-br.pdf' : '../public/cv-en.pdf')
await renderToFile(doc, saida)
console.log('PDF gerado:', saida.split('/').slice(-2).join('/'))
