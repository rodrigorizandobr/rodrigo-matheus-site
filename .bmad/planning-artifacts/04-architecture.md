# 04 — Arquitetura Técnica: v3

> Fase 4 do fluxo BMAD. Deriva de 01 (benchmark), 02 (PRD) e 03 (UX).

## 1. Visão geral

```
┌────────────── build time ──────────────┐   ┌────────────── runtime ──────────────┐
│ web/ (Vite 8 + React 19 + TS 6)        │   │ Navegador                            │
│  ├─ src/            componentes, cenas │   │  ├─ HTML pré-renderizado (SEO/LCP)   │
│  ├─ public/models/  robot.glb (draco)  │──▶│  ├─ chunk "app" (≤250 KB gz)         │
│  ├─ public/robot-poster.webp           │   │  ├─ chunk "three" (lazy, ~180 KB gz) │
│  └─ dist/  ──────────────────────────────▶│  └─ GET /api/data ──▶ Cloud Run     │
│ api/ (Flask — INALTERADO)               │   │                     (Flask, GCS)    │
└────────────────────────────────────────┘   └─────────────────────────────────────┘
Firebase Hosting: public = web/dist; rewrites /api/** → Cloud Run (inalterado)
```

## 2. Decisões (ADRs curtos)

| ADR | Decisão | Alternativas | Motivo |
|---|---|---|---|
| ADR-1 | **Vite + React 19 + TS**, sem SSR | Next.js; Astro | Hosting é estático; pré-render cobre SEO; menor superfície |
| ADR-2 | **@react-three/fiber 9 + drei** | Three vanilla | `useGLTF`, `useAnimations`, `useProgress`, `Environment` prontos; ecossistema |
| ADR-3 | **GSAP + ScrollTrigger + Lenis** com Lenis no `gsap.ticker` | Framer Motion | Um relógio só; scrub/pin maduros |
| ADR-4 | **HUD em DOM (Tailwind v4 + tokens CSS)** | HUD no canvas | a11y, SEO, i18n, peso |
| ADR-5 | **Canvas em chunk lazy** (`React.lazy` + `Suspense`), montado após `requestIdleCallback` ou primeira interação | Eager | LCP é o HTML + poster |
| ADR-6 | **`frameloop="demand"`** + `invalidate()` em mouse/scroll/animação | `always` | CPU/bateria; Trionn-style |
| ADR-7 | **detect-gpu** → tier 0/1 ou `!WebGL2` ou reduced-motion → poster | Sempre 3D | NFR mobile |
| ADR-8 | GLB via **gltf-transform** (`optimize`: dedup, prune, draco, resize tex 1024, webp) | GLB cru | 80–90% menor |
| ADR-9 | **Pré-render** com `vite-plugin-prerender`/script Playwright para `/`, `/blog`, `/blog/:slug` | SPA puro | SEO ≥ 95 |
| ADR-10 | **i18n embutido no build** (`api/i18n/*.json` copiados p/ `src/i18n/`) + `/api/data` só para repos | Buscar i18n na API | Hero renderiza sem rede; API vira progressivo |
| ADR-11 | Contrato `/api/data` **congelado**; front tolera ausência de `i18n` no payload | Mudar API | 23 testes protegem; zero risco backend |
| ADR-12 | Testes: **Vitest + Testing Library (jsdom)** para HUD/lógica; canvas mockado; **Playwright** smoke p/ 3D real | Só unit | WebGL não roda em jsdom |
| ADR-13 | **Sem pós-processamento.** O brilho dos olhos é feito com 2 sprites aditivos + 1 `PointLight` parentados ao nó `Head` (`EyeGlow.ts`), posicionados a partir dos vértices do material dos olhos | `@react-three/postprocessing` + `Bloom` | Em desenvolvimento, o `EffectComposer` (postprocessing 6.39.5, three r186 — dentro da faixa declarada `<0.187`) renderizou **nada** com canvas `alpha` e HUD em DOM; a cena voltou ao remover o composer. A solução por sprites custa ~2 draw calls, funciona em qualquer tier de GPU e elimina ~60 KB do chunk 3D |

> ADR-10 é uma **mudança de fluxo de dados**: hoje o HTML espera `/api/data` para ter texto. Na v3, texto é estático no bundle; a API só enriquece (Projects). Ganho: hero em < 1s sem depender do Cloud Run acordar (cold start hoje ≈ 2–4s).

## 3. Estrutura de pastas

```
web/
├── index.html                  # shell mínimo; fontes preconnect; poster preload
├── vite.config.ts              # react, tailwind, chunking manual (three/gsap), prerender
├── vitest.config.ts            # jsdom, setupTests, canvas mock
├── public/
│   ├── models/robot.glb        # comprimido (gltf-transform)
│   ├── robot-poster.webp       # fallback + LCP + og:image
│   ├── rodrigo.png cv-pt-br.pdf favicons site.webmanifest   # migrados de site/
│   └── blog/posts.json         # migrado
├── scripts/
│   ├── optimize-model.mjs      # gltf-transform pipeline
│   └── render-poster.mjs       # Playwright → poster
└── src/
    ├── main.tsx                # Lenis + gsap.ticker; providers
    ├── App.tsx                 # rotas: / , /blog , /blog/:slug
    ├── styles/tokens.css       # --bg --red --cyan … (03 §2.1) ; @theme Tailwind
    ├── i18n/{pt,en}.json + useI18n.ts   # ADR-10; localStorage.lang
    ├── analytics/ga.ts         # gaEvt() tipado
    ├── data/
    │   ├── character.ts        # PURO: deriva LEVEL/stats/classes do i18n  ← testável
    │   ├── repos.ts            # PURO: raridade, cor por linguagem, sparkline path
    │   └── api.ts              # fetch /api/data com timeout + fallback
    ├── three/
    │   ├── RobotCanvas.tsx     # <Canvas frameloop="demand" dpr={[1,1.5]}>
    │   ├── Robot.tsx           # useGLTF + useAnimations + head-tracking + materiais
    │   ├── Lighting.tsx        # key/fill/rim + Environment (studio)
    │   ├── EyeGlow.ts          # sprites aditivos + point light nos olhos (ADR-13)
    │   └── capability.ts       # detect-gpu + WebGL2 + reduced-motion → 'webgl' | 'poster'
    ├── components/
    │   ├── hud/ {ClassRoster, StatPanel, StatBar, ActionBar, StartButton, LoadingBar}
    │   ├── sections/ {Hero, About, Campaigns, Arena, Training, Contact, Logs}
    │   ├── layout/ {Header, Footer, LangToggle}
    │   └── ui/ {Panel(chanfro), Tag, Sparkline}
    ├── hooks/ {useScrollReveal(gsap), useIdleTimer, useMousePointer}
    └── test/ {setup.ts, canvasMock.ts, fixtures/apiData.json}
```

## 4. Fluxo de dados

```
i18n (build)  ─┐
               ├─▶ character.ts ─▶ Hero/HUD (renderiza imediatamente)
localStorage.lang ┘
/api/data (runtime, 8s timeout) ─▶ repos.ts ─▶ Arena   (Suspense-like: loading → cards | offline)
mouse/scroll/idle ─▶ RobotCanvas (invalidate) ─▶ Robot (mixer.update, head lerp)
ClassRoster.onSelect ─▶ store (useState no Hero) ─▶ StatPanel (aria-live) + Robot.playGesture()
```

## 5. Modelo 3D — contrato do asset

| ADR-14 | **Sem WebGL. O personagem é uma imagem gerada** (`gemini-3-pro-image`), full-bleed como fundo do hero; movimento é CSS (parallax de ponteiro + pulso no brilho dos olhos) | R3F + GLB rigado | A referência que guia o projeto (motionsites "Robot Battle Arena") é ela própria **uma imagem estática renderizada** — confirmado inspecionando o DOM: zero `<canvas>`, `window.THREE` ausente. Nenhum GLB CC0 chega perto da fidelidade, e o resultado gerado é indistinguível da referência. Removeu three+R3F+drei (263 KB gz) e o GLB (183 KB), trocados por 29 KB de WebP. `src/three/` deletado em 2026-09-13 |
| ADR-15 | **Paleta clara** (`--bg #ececed`, cartões brancos), vermelho como único acento saturado | manter o dark cyberpunk do v2 | Briefing do product owner: "laboratório extremamente esterilizado, fundo branco, robô branco". A v2 escura foi uma suposição minha de continuidade de marca que nunca foi validada |
| ADR-16 | **Personagem em vídeo** (Veo 3.1, image-to-video a partir do mesmo still) como camada sobre o `<picture>`; loop feito por **palíndromo** no ffmpeg; 1280p H.264 + VP9, ~1.0–1.3 MB, sem áudio | Lottie/Rive; WebGL; GIF | Image-to-video preserva a identidade do personagem; o palíndromo elimina a emenda sem depender do modelo; VP9/H.264 cobrem todos os browsers. Só desktop e só sem reduced-motion/Save-Data — mobile fica com o still (LCP intacto) |
| ADR-17 | **Cromo do HUD só com dados reais**: REPOS, COMMITS·28D, LINK e LAST COMMIT vêm de `/api/data`; UNIT do roster vem do CV; ID `RM-<ano>` é derivado do LEVEL; atalhos exibidos são todos funcionais | ornamentos fictícios (moeda, wifi) como na referência | Um portfólio de engenharia não pode ter métrica inventada na tela. A densidade visual da referência é reproduzida com informação verdadeira |
| ADR-18 | **Palco persistente por seção** (`src/stage/`): camada `fixed` atrás da página inteira no desktop; cada seção declara `data-scene` e um `IntersectionObserver` com faixa central (40–60% da viewport) elege a ativa; ao trocar, a máquina de estados volta ao **repouso** (busto) por 520 ms e só então entra o próximo foco (olhos, pescoço, núcleo, cérebro, boca, mão). Mobile: faixa 16:9 em fluxo no topo de cada seção (`SceneBand`), **também animada** — encodes de 854 px (`*.m.mp4/webm`), `preload=none`, `load()`+`play()` só quando a faixa se aproxima da viewport, `pause()` ao sair. Só `prefers-reduced-motion`/`Save-Data` desligam vídeo | um vídeo por seção sem repouso; câmera em trilho WebGL | Pedido do PO ("cada seção uma parte do robô, voltando ao padrão entre elas"). Stills e loops vêm do **mesmo** personagem via image-to-image/-video, então a identidade não deriva. A regra pura (`sceneMachine.ts`) é testada; só a cola de observer/timers é DOM |
| Item | Requisito | Motivo |
|---|---|---|
| Formato | GLB, Y-up, escala 1u = 1m, altura ≈ 1.8u | câmera fixa |
| Rig | esqueleto humanoide com bone de **cabeça** nomeado (`Head`/`mixamorigHead`) | head-tracking |
| Animações (clips nomeados) | obrigatório `Idle`; desejável 3 gestos curtos (≤ 2s) | UX §4 |
| Materiais | corpo separável dos olhos (mesh ou material próprio) | re-estilização: corpo branco fosco, olhos emissive |
| Peso | ≤ 3 MB após `gltf-transform optimize` | NFR |
| Licença | CC0 ou CC-BY (crédito no footer/`humans.txt`) | — |

`Robot.tsx` **não conhece o modelo**: recebe `{ url, headBone, clips: {idle, gestures[]}, eyeMaterial }` de `robot.config.ts`. Trocar por Meshy = trocar config + GLB.

## 6. Performance — orçamento e táticas

| Item | Orçamento | Tática |
|---|---|---|
| LCP | ≤ 2.5s | HTML pré-renderizado + poster `fetchpriority=high`; fontes `display=swap` + preload |
| JS inicial | ≤ 250 KB gz | `manualChunks`: `three`, `r3f`, `gsap`; canvas `React.lazy` |
| GLB | ≤ 3 MB | draco + tex 1024 webp; `useGLTF.preload` após idle |
| Frames | demand | `invalidate()` em eventos; mixer roda só durante clip/lerp ativo |
| Shader warmup | 0 hitch | `gl.compile(scene, camera)` no `onCreated` antes do fade-in |
| DPR | ≤ 1.5 | `dpr={[1, 1.5]}` |
| Glow dos olhos | barato | 2 sprites aditivos + 1 point light; **desligado no tier 2** |
| Memória | sem leaks | `useGLTF` cache; cleanup de ScrollTrigger em `useEffect` |

## 7. Build & Deploy

```bash
# deploy.sh (novo passo 0)
( cd web && npm ci && npm run test -- --run && npm run build )   # build falha → deploy aborta
gcloud run deploy …                                               # inalterado
firebase deploy --only hosting                                    # public: web/dist
```

`firebase.json`: `"public": "web/dist"`; rewrites mantidos (`/api/**` → Cloud Run; `**` → `/index.html`); headers de cache: `models/*.glb` e `assets/*` immutable 1 ano (hash no nome).

Rollback: Firebase Hosting mantém versões — `firebase hosting:rollback`.

## 8. Testes (TDD)

| Camada | Ferramenta | O que | Exemplos |
|---|---|---|---|
| Lógica pura | Vitest | `character.ts`, `repos.ts`, `capability.ts`, `useI18n` | LEVEL = anos; raridade por stars; cor por linguagem; fallback quando `i18n` ausente |
| Componentes | Vitest + RTL | HUD renderiza a partir do i18n; seleção de classe atualiza `aria-live`; Arena estados loading/offline/empty | sem canvas (mock) |
| Integração | Vitest + msw | `/api/data` timeout → offline | |
| 3D | Playwright (headed, chromium) | canvas cria contexto WebGL; GLB carrega; clip `Idle` ativo; screenshot → poster | roda em `npm run e2e` e no `render-poster` |
| Perf | Lighthouse CI | budgets do §6 | no deploy |

## 9. Migração & cutover

1. `web/` cresce ao lado de `site/` (legado intocado).
2. `firebase.json` só muda quando `npm run build` + Lighthouse passarem.
3. Blog: `posts.json` copiado; rotas `/blog/**` já existem no rewrite.
4. `site/` é removido num commit separado após 1 semana de v3 no ar.

## 10. Segurança
- Sem segredos no front (GA ID é público por natureza).
- CSP via headers Firebase: `script-src 'self' googletagmanager.com; connect-src 'self' google-analytics.com; img-src 'self' data:; font-src fonts.gstatic.com`.
- `/api/refresh` continua protegido (fix desta sessão).
