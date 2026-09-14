# 05 — Épicos, Stories e Sprint Plan

> Fase 5 do fluxo BMAD. Cada story tem critérios de aceite (AC) testáveis. Ordem = ordem de execução. TDD em todas: teste vermelho → implementação → verde.

## Sprint 1 — Fundação + Hero (o "uau")

### E0 · Plataforma
- **S0.1 Scaffold & toolchain** — Vite 8 + React 19 + TS 6; Tailwind v4; Vitest + RTL + jsdom; `npm test` roda verde com 1 teste de fumaça. *(feito)*
- **S0.2 Tokens & tipografia** — `tokens.css` com paleta 03 §2.1; Chakra Petch/Inter/Fira Code via Google Fonts com `display=swap`. AC: snapshot de `:root` expõe `--red`, `--cyan`, `--bg`.
- **S0.3 i18n embutido** — `src/i18n/{pt,en}.json` copiados de `api/i18n/`; `useI18n()` lê `localStorage.lang` (default `en` como hoje) e troca `<html lang>`. AC: teste troca idioma e vê `hero.title` mudar; `lang` persiste.
- **S0.4 Analytics** — `gaEvt(name, params)` tipado, injeta `language`. AC: teste verifica chamada a `window.gtag` com `language`.
- **S0.5 Lenis + GSAP** — Lenis no `gsap.ticker`, `ScrollTrigger.scrollerProxy` não necessário (Lenis nativo). AC: smoke; `useScrollReveal` registra e limpa triggers (teste conta `ScrollTrigger.getAll()` após unmount = 0).

### E1 · Hero "Character Select"
- **S1.1 `character.ts`** (lógica pura) — deriva de `i18n.hero.stats` + `about.pills`: `level` (anos), `stats[]` {key,label,value,pct}, `classes[]` {id,label,blurb,gesture}. AC: `level=22`; `stats` tem 4 entradas com `pct` 0–100; classe default `eng-manager`; sem i18n → valores neutros, sem throw.
- **S1.2 HUD `StatPanel` + `StatBar`** — renderiza a partir de `character.ts`; `aria-live="polite"`; barras animam via CSS var `--pct`. AC: RTL vê `LEVEL 22`, 4 barras com `aria-valuenow`.
- **S1.3 HUD `ClassRoster`** — `<nav>` com `<button aria-pressed>`; teclado ←/→ navega; `onSelect(class)` dispara `gaEvt('class_select')`. AC: RTL clica 2ª classe → `aria-pressed` move; `gtag` chamado.
- **S1.4 `ActionBar` + `StartButton`** — LinkedIn/CV/GitHub com `gaEvt` iguais aos atuais; START chama `lenis.scrollTo('#about')`. AC: RTL verifica hrefs e eventos.
- **S1.5 `capability.ts`** — `'webgl' | 'poster'` a partir de `detect-gpu` (mock), `WebGL2RenderingContext`, `matchMedia(prefers-reduced-motion)`. AC: 4 casos de tabela.
- **S1.6 `RobotCanvas` lazy** — `React.lazy` + `Suspense` com `LoadingBar` (`useProgress`); montado após `requestIdleCallback`; `frameloop="demand"`, `dpr=[1,1.5]`, `gl.compile` no `onCreated`. AC: Hero renderiza HUD **sem** o chunk three no bundle inicial (teste de `manualChunks` via `vite build` + assert de tamanho no CI); em `poster` mode renderiza `<img>`.
- **S1.7 `Robot.tsx`** — `useGLTF(config.url)`, `useAnimations`, clip `idle` em loop; materiais: corpo → `--white-armor` fosco; olhos → emissive `--red` intensidade 2 + layer bloom. AC: Playwright: canvas presente, `mixer` com 1 ação ativa; screenshot ≠ vazio.
- **S1.8 Head-tracking + gestos** — bone cabeça lerp para o cursor (limite ±35°); `playGesture(name)` crossfade 0.25s e retorna a idle; idle-timer 12s → gesto "look around"; reduced-motion desliga tracking. AC: unit no helper de lerp/clamp; Playwright move mouse e lê rotação do bone via `window.__robot` (só em dev).
- **S1.9 Efeitos** — Bloom seletivo (layers) só olhos; desligado no tier 2. AC: config por tier testada.
- **S1.10 Poster & LCP** — `scripts/render-poster.mjs` (Playwright) gera `robot-poster.webp`; `index.html` faz `preload`; `og:image`. AC: arquivo existe após script; Lighthouse LCP ≤ 2.5s em `npm run lh`.
- **S1.11 Layout responsivo do Hero** — 3 breakpoints do 03 §3. AC: Playwright screenshots em 390/820/1440 sem overflow horizontal.

**Definição de pronto Sprint 1:** hero completo no `localhost`, Lighthouse mobile Perf ≥ 80, testes verdes, poster gerado.

## Sprint 2 — Seções + dados

### E2 · Telas
- **S2.1 `Header` + `LangToggle` + `Footer`** — nav com labels HUD (ABOUT · CAMPAIGNS · ARENA · TRAINING · LOGS); sticky com blur. AC: RTL: links âncora corretos; toggle troca idioma.
- **S2.2 About "BIO"** — foto `rodrigo.png` em moldura chanfrada; lead; 10 skills. AC: 10 itens renderizados do i18n.
- **S2.3 Experience "CAMPAIGNS"** — timeline 16 itens, 1º marcado `ACTIVE`. AC: 16 cards; `ACTIVE` só no primeiro; reveal registra 16 triggers e limpa.
- **S2.4 `repos.ts`** (lógica pura) — `rarity(stars)`, `languageColor(lang)`, `sparklinePath(days)`, `timeAgo(iso, i18n)`. AC: tabela: 0→comum, 5→raro, 12→lendário; path SVG começa com `M`; `timeAgo` respeita idioma.
- **S2.5 `api.ts`** — `fetch('/api/data')` com `AbortController` 8s; retorna `{repos}`; ignora `i18n` do payload. AC: msw: 200 → repos; timeout → `offline`; 500 → `offline`.
- **S2.6 Arena** — estados loading/offline/empty/cards; sparkline "desenha"; expandir mostra 5 commits. AC: 4 estados renderizados com fixtures.
- **S2.7 Training / Contact / Logs (lista)** — AC: contagens do i18n / `posts.json`.
- **S2.8 Blog post `/blog/:slug`** — rota, prosa 68ch, meta por post. AC: rota renderiza post da fixture; 404 amigável.
- **S2.9 Contraste & a11y** — `--muted` → `#8a8aa0`; axe sem violações críticas. AC: `vitest-axe` no Hero e Arena.

## Sprint 3 — Cutover

### E3 · Deploy
- **S3.1 Pré-render** — `/`, `/blog`, `/blog/:slug` geram HTML estático em `dist/`. AC: `curl dist/index.html | grep "Strong engineering"`.
- **S3.2 `firebase.json`** → `public: web/dist`; headers immutable p/ `assets/**` e `models/**`; CSP. AC: `firebase serve` local responde `/`, `/blog/x`, `/api/data` (proxy).
- **S3.3 `deploy.sh`** — passo 0: `npm ci && npm test -- --run && npm run build`; aborta em falha. AC: rodar com teste falhando → exit ≠ 0 antes do gcloud.
- **S3.4 Lighthouse CI** — budgets 04 §6 como asserts. AC: `npm run lh` verde.
- **S3.5 Cutover** — deploy; smoke em produção (Playwright contra `rodrigomatheus.com.br`); GA recebe `page_view`. AC: checklist assinado.
- **S3.6 Limpeza** — remover `site/` após 7 dias; atualizar README/CLAUDE.md. *(commit separado)*

## Release 2 (backlog)
- Robô exclusivo (Meshy) — só troca `robot.config.ts` + GLB.
- Web Audio opt-in (hover/select).
- Easter egg `Dance` com toast.
- Card de repo em 3D (flip real) na Arena.
- Modo "Class S" (tema alternativo desbloqueado ao visitar todas as seções).

## Rastreabilidade
| Objetivo PRD | Stories |
|---|---|
| O1 memorabilidade | S1.7–S1.9, S2.3, S2.6 |
| O2 conversão | S1.4, S2.1, S3.5 |
| O3 prova técnica | S1.6, S1.10, S3.4 |
| O4 não regredir | S0.3, S1.6, S1.10, S3.1–S3.4 |
