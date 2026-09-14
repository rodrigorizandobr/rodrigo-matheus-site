#!/usr/bin/env node
/**
 * Post-build: dá ao /blog um shell próprio com <title>, description e Open Graph
 * corretos, para a prévia de link (LinkedIn, WhatsApp, Slack) não mostrar o card
 * genérico do site. O app React continua desenhando a página.
 *
 * As páginas de POST não são geradas aqui. Desde que o blog passou a publicar
 * sozinho (agendamento), um shell criado no build mostraria o card genérico em
 * todo post que entrasse no ar depois do deploy. Quem serve `/blog/<slug>` — e o
 * `/sitemap.xml` — é `api/blog/page.py`, sempre com o conteúdo do momento e com
 * cache de CDN. Ver o rewrite `/blog/*` → Cloud Run em firebase.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SITE = 'https://rodrigomatheus.com.br'
const dist = 'dist'
const shell = readFileSync(`${dist}/index.html`, 'utf8')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function withMeta(html, { title, description, url, type = 'website' }) {
  const out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/, `$1${type}$2`)
  const extra = [
    `<meta property="og:url" content="${url}" />`,
    `<link rel="canonical" href="${url}" />`,
  ].join('\n    ')
  return out.replace('</head>', `    ${extra}\n  </head>`)
}

mkdirSync(`${dist}/blog`, { recursive: true })
writeFileSync(`${dist}/blog.html`, withMeta(shell, {
  title: 'Blog — Rodrigo Matheus',
  url: `${SITE}/blog`,
  description: 'Notas sobre liderança de engenharia, arquitetura em nuvem e IA aplicada.',
}))
console.log('prerender-meta: blog.html (páginas de post vêm do Cloud Run)')
