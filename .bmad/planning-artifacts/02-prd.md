# 02 — PRD: rodrigomatheus.com.br v3 "Character Sheet"

> Fase 2 do fluxo BMAD. Decisões do product owner (Rodrigo, 2026-09-13): conceito **Ficha de personagem**; robô **Sketchfab/CC0 agora** (Meshy depois, se quiser exclusividade); **robô substitui a foto** no hero (foto vai para About); stack **Vite + React + R3F**.

## 1. Visão

> "O portfólio de um líder de engenharia apresentado como a tela de seleção de personagem de um jogo AAA — um robô 3D que é o avatar do Rodrigo, e um HUD onde cada número é uma métrica real de carreira."

**Uma ideia forte:** o robô. Todo o resto é HUD a serviço dele.

## 2. Objetivos de negócio

| # | Objetivo | Métrica (GA4 já instalado) | Baseline hoje |
|---|---|---|---|
| O1 | Memorabilidade — recrutadores/pares lembram do site | Tempo médio na página ≥ 90s | medir antes do cutover |
| O2 | Conversão para contato profissional | Cliques em LinkedIn + e-mail + CV ≥ 2× baseline | eventos `gaEvt` existentes |
| O3 | Prova de competência técnica em IA/front moderno | Menções/compartilhamentos; scroll até "arena" ≥ 60% | novo evento `scroll_depth` |
| O4 | Não regredir em descoberta | Lighthouse SEO ≥ 95; LCP ≤ 2.5s mobile 4G | Lighthouse atual (medir) |

## 3. Personas

1. **Recrutador/headhunter executivo** — 30s para decidir; precisa achar cargo atual, anos, LinkedIn, CV. *Não pode ser bloqueado pelo 3D.*
2. **Par técnico / CTO** — quer ver profundidade: repos ao vivo, arquitetura, posts. Vai julgar a performance do site.
3. **Curioso via post/LinkedIn** — mobile, rede 4G, quer o "uau" em 3s e sair.

## 4. Escopo — MVP (release 1)

### Épico A — Hero "Character Select"
- A1. Robô 3D (GLB) com animação idle em loop, **olha na direção do cursor** (head-tracking por lerp), olhos com emissive vermelho + Bloom seletivo.
- A2. HUD esquerdo "CLASSES": Engineering Manager (ativa), AI Strategist, Platform Architect, Fintech. Hover/clique troca o texto do painel direito e dispara uma animação curta do robô.
- A3. HUD direito: `LEVEL 22` (anos em tech), nome, tag; barras animadas: **LEADERSHIP 40+** (pessoas), **COMMAND 16+** (anos liderando), **AI/ML** (FIAP 2025), **ARCHITECTURE**. Valores vêm do i18n (`hero.stats`) — sem número hardcoded.
- A4. Ações: `[ LINKEDIN ] [ RESUME ] [ GITHUB ]` (mesmos links de hoje, mesmos eventos GA).
- A5. Botão `START ▶` = scroll suave (Lenis) para About.
- A6. **Fallback:** sem WebGL / GPU tier baixo / `prefers-reduced-motion` → poster PNG do robô renderizado + HUD idêntico. O HUD é DOM, nunca canvas.

### Épico B — Seções como "telas do jogo"
- B1. **About** = "BIO": foto real do Rodrigo (a atual), lead, 10 pills como "SKILLS" com ícones.
- B2. **Experience** = "CAMPAIGNS": timeline vertical das 16 experiências, cada card com `company · role · period`; scroll revela com stagger (GSAP ScrollTrigger). Empresa atual marcada `ACTIVE`.
- B3. **Projects** = "ARENA": repos do `/api/data` como cards de loot; sparkline 28d, linguagem como "element", stars como raridade. Estado loading/empty preservados.
- B4. **Education** = "TRAINING": 4 itens.
- B5. **Contact** = "JOIN PARTY": card + e-mail.
- B6. **Blog** = "LOGS": lista de `posts.json` + página de post (rota `/blog/:slug`).

### Épico C — Plataforma
- C1. i18n pt/en preservado, toggle no header, `localStorage.lang` mantido (GA usa).
- C2. `/api/data` **inalterado** (contrato coberto por 23 testes).
- C3. Build Vite → `web/dist`; `firebase.json` aponta para ele; `deploy.sh` roda `npm run build` antes.
- C4. SEO: pré-render das rotas (`/`, `/blog`, `/blog/:slug`) em HTML estático; meta/OG por rota; `sitemap.xml`.
- C5. GA4 + eventos existentes migrados; novos: `class_select`, `robot_interact`, `scroll_depth`.
- C6. Acessibilidade: HUD navegável por teclado, `aria-live` no painel de classe, contraste AA, canvas `aria-hidden` com descrição textual.

## 5. Fora do escopo (release 1)
- Áudio (Web Audio) — release 2, opt-in.
- Robô exclusivo via Meshy — release 2 (troca de GLB, zero mudança de código se o rig seguir a spec).
- Cena imersiva única / câmera em trilho.
- CMS para blog (continua `posts.json`).
- Dark/light toggle (site é dark por identidade).

## 6. Requisitos não-funcionais

| NFR | Alvo | Como verificar |
|---|---|---|
| Performance | LCP ≤ 2.5s (mobile 4G), INP ≤ 200ms, CLS ≤ 0.1 | Lighthouse CI no deploy |
| Peso | JS inicial ≤ 250 KB gz (3D em chunk lazy); GLB ≤ 3 MB comprimido | `vite build --report`, `gltf-transform inspect` |
| FPS | ≥ 55 fps desktop, ≥ 30 fps mobile médio | `r3f-perf` em dev; `frameloop="demand"` quando idle |
| Compatibilidade | Chrome/Edge/Firefox/Safari últimas 2; iOS Safari 16+ | manual + Playwright smoke |
| Acessibilidade | WCAG 2.1 AA no HUD e conteúdo | axe no CI |
| Resiliência | Site 100% utilizável sem WebGL e sem `/api/data` (Projects mostra estado de erro) | testes |

## 7. Métricas de sucesso do release
- Lighthouse mobile: Perf ≥ 80, SEO ≥ 95, A11y ≥ 95.
- Zero regressão nos 23 testes da API; ≥ 30 testes de front (Vitest) verdes.
- Cutover sem downtime (Firebase Hosting é atômico).

## 8. Riscos & mitigação (delta do discovery)
- **Robô CC0 genérico demais** → materiais re-estilizados em código (branco fosco `MeshStandardMaterial roughness .6`, olhos emissive `#ff2d2d`), e o rig segue nomes padrão para troca futura por Meshy.
- **Escopo inflar** → esta lista é o contrato; novos efeitos entram em release 2.

## 9. Dependências
- `web/` scaffold (Vite 8, React 19.2, TS 6) — **feito**.
- GLB do robô com animações nomeadas (`Idle`, + 2 gestos) — em seleção.
- Poster PNG do robô para fallback/LCP — gerado a partir da cena (screenshot) no build.
