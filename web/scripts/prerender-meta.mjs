#!/usr/bin/env node
/**
 * Post-build: give /blog and each /blog/<slug> its own HTML shell with the right <title>,
 * description and Open Graph tags, so link previews (LinkedIn, WhatsApp, Slack) show the post
 * instead of the site's generic card. The React app still renders the page client-side.
 *
 * With Firebase `cleanUrls: true`, dist/blog/<slug>.html is served at /blog/<slug>.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SITE = 'https://rodrigomatheus.com.br'
const dist = 'dist'
const shell = readFileSync(`${dist}/index.html`, 'utf8')
const posts = JSON.parse(readFileSync(`${dist}/blog/posts.json`, 'utf8'))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function withMeta(html, { title, description, url, type = 'article', published }) {
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/, `$1${type}$2`)
  const extra = [
    `<meta property="og:url" content="${url}" />`,
    `<link rel="canonical" href="${url}" />`,
    published ? `<meta property="article:published_time" content="${published}" />` : '',
  ].filter(Boolean).join('\n    ')
  return out.replace('</head>', `    ${extra}\n  </head>`)
}

mkdirSync(`${dist}/blog`, { recursive: true })
writeFileSync(`${dist}/blog.html`, withMeta(shell, {
  title: 'Blog — Rodrigo Matheus', type: 'website', url: `${SITE}/blog`,
  description: 'Notes on engineering leadership, cloud architecture and AI in fintech.',
}))
let n = 1
for (const p of posts) {
  const en = p.i18n?.en ?? Object.values(p.i18n)[0]
  writeFileSync(`${dist}/blog/${p.slug}.html`, withMeta(shell, {
    title: `${en.title} — Rodrigo Matheus`, description: en.summary, url: `${SITE}/blog/${p.slug}`, published: p.date,
  }))
  n++
}
console.log(`prerender-meta: blog.html + ${posts.length} post shells`)
