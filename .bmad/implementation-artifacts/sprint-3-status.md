# Sprint 3 — Cutover (2026-09-13) — PUBLICADO

## Entregue

| Story | Estado | Nota |
|---|---|---|
| S2.8 Blog no design novo | ✅ | `src/pages/BlogPage.tsx` + `router.ts` (sem dependência): `/blog` lista, `/blog/<slug>` post; `/blog/#slug` legado ainda resolve. Corpo HTML passa por **DOMPurify** (teste garante que `<script>`/`onerror` não chegam ao DOM). `public/blog/index.html` legado removido |
| S3.1 Pré-render | ✅ (meta) | `scripts/prerender-meta.mjs` no `npm run build`: gera `dist/blog.html` e `dist/blog/<slug>.html` com `<title>`, description, `og:*`, canonical e `article:published_time` por post — previews em LinkedIn/WhatsApp mostram o post certo. O corpo continua renderizado no cliente (Lighthouse SEO já era 100) |
| S3.2 `firebase.json` | ✅ | `public: web/dist`, `cleanUrls`, cache immutable p/ `assets/**`, 30 d p/ `hero|scenes`, 5 min p/ `posts.json`; **CSP**, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy. Backup do anterior em `firebase.json.v2.bak` |
| S3.3 `deploy.sh` | ✅ | Passo 0: `npm ci` → `typecheck` → `vitest run` → `vite build` (aborta em falha). Passo 3: `GET /api/refresh` com a chave do `.env`. `firebase` via `npx firebase-tools@14` (não há CLI global nesta máquina) |
| S3.4 Lighthouse | ✅ | Build de produção, mobile: **A11y 100 · Best Practices 100 · SEO 100 · Agentic 100**, 0 auditorias falhando (após: `--muted` → `#5c5c69`, CTAs sem `aria-label` divergente, `llms.txt` real) |
| S3.5 Cutover | ✅ **publicado 2026-09-13** | `./deploy.sh` completo (Cloud Run rev. 24, Hosting, refresh). Smoke 15/15. Segundo deploy com vídeo no mobile + meta por post |
| S3.6 Limpeza | ⏸ | `site/` removido só após produção validada |

**95 testes verdes**, `tsc` app+test limpo. Transferência inicial (desktop, prod): JS 154 KB · CSS 10 KB · imagens 174 KB · vídeo do hero 1,36 MB (lazy, só desktop).

## Como publicar

```bash
source .env          # GITHUB_TOKEN, REFRESH_KEY, GCS_BUCKET
./deploy.sh          # 0 build+testes → 1 Cloud Run → 2 Hosting → 3 refresh do cache
```

Pré-requisitos: `gcloud` autenticado no projeto `rodrigo-matheus` (está) e login no Firebase
(`npx firebase-tools@14 login`) se `login:list` não mostrar a conta.

Rollback: `npx firebase-tools@14 hosting:rollback --project rodrigo-matheus`, ou restaurar
`firebase.json.v2.bak` e redeployar (`site/` ainda está no repositório).

## Pós-deploy (checklist)
1. Abrir https://rodrigomatheus.com.br em desktop e celular; hero, palco por seção, ARENA online.
2. `/blog` e `/blog/why-i-moved-to-cloud-run`.
3. GA4 em tempo real: `page_view`, `section_view`, `class_select`.
4. `LAST COMMIT` no hero deve refletir o `/api/refresh` do passo 3.
5. Depois de 1 semana sem regressão: remover `site/`, `firebase.json.v2.bak`, `api/i18n/` (só se o Flask deixar de servir i18n) — commit separado.
