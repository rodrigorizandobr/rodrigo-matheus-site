# 01 — Discovery & Benchmark: Redesign 3D do rodrigomatheus.com.br

> Fase 1 do fluxo BMAD. Data: 2026-09-13. Fonte: navegação ao vivo (motionsites.ai, site atual) + pesquisa técnica.

## 1. O que o motionsites.ai realmente é

Verificado no DOM ao vivo (`document.querySelectorAll('video|img|canvas')`, scripts carregados):

| Achado | Evidência | Implicação |
|---|---|---|
| **Marketplace de prompts**, não de sites | Título: "Official Premium AI Website Prompts"; CTA "Go Unlimited" bloqueia o prompt | O produto vendido é o *texto* que você cola no Lovable/v0/Claude |
| **Previews são MP4 no Cloudflare R2** | 45 `<video autoplay loop>` apontando para `pub-…r2.dev/designs/*.mp4` | Nenhum "site 3D" ali roda 3D — são vídeos de sites |
| **Robot Battle Arena é uma imagem estática** | Único elemento grande no modal: `<IMG 734×549>`; zero `<canvas>`, `window.THREE` ausente | O que você gostou é a **direção de arte**, não uma técnica |
| Categoria: **"Game UI"** | Label no card | O conceito é *tela de seleção de personagem* |
| Stack do próprio motionsites | Vite SPA (`/assets/index-*.js`), sem React/Next detectável | Irrelevante para nós; eles não fazem 3D |

### 1.1 Anatomia do "Robot Battle Arena" (a referência visual)

- **Personagem:** robô humanoide, armadura branca fosca com painéis segmentados, olhos vermelhos brilhantes, capa/manto preto. Iluminação de estúdio, fundo cinza neutro.
- **HUD à esquerda:** roster "YOUR ROBOTS — CLASSES S–A" com 4 cards (Berserker, Destroyer, Warrior, Fighter) + "Add Robots".
- **HUD à direita:** `LEVEL 51`, classe `FIGHTER · Class S`, barras `ATTACK 260 / DEFENCE 80 / ACCURACY 150 / DEXTERITY 220`, 3 ícones de skills, botão `START`.
- **Topo:** moeda/energia `2523`, ícone wifi.
- **Tipografia:** sans condensada em caixa alta, tracking largo, números grandes tabulares.

**Tradução para portfólio de um executivo de engenharia (a sacada):** a tela de seleção de personagem vira a *ficha* do Rodrigo. Stats = métricas de carreira reais (22+ anos, 40+ pessoas, 16+ liderando). Classes = papéis (Engineering Manager · AI Strategist · Fintech · Architect). Skills = as 10 pills. Roster = as 16 experiências como "campanhas". Projects = arena com os repos do GitHub como cards de loot (sparklines já existem). Isso é coerente, memorável e reaproveita 100% do conteúdo atual.

## 2. Quem faz isso DE VERDADE em 3D (o benchmark que importa)

Awwwards/Codrops 2026 — padrões recorrentes:

| Site | Conceito | Técnica | Lição |
|---|---|---|---|
| Trionn (Codrops, jul/2026) | Hero com símbolo 3D explodindo + galeria helicoidal | Three.js vanilla, GSAP como relógio central, Lenis no `gsap.ticker`, render **dirigido por scroll** (não loop contínuo), `renderer.compile()` antes da seção aparecer | Um único ticker; renderizar só quando visível; aquecer shaders |
| Hubtown (SOTD jun/2026) | Monólito 3D brilhante sobre paisagem refletiva | WebGL + GSAP, mouse-reveal | **Uma ideia forte** por site |
| ITom (HM abr/2026) | Corredor 3D com portas navegáveis | React + Three.js + GSAP | Navegação espacial funciona como menu |
| Minh Pham (SOTD) | Sistema de motion GSAP sobre Three.js | R3F + GSAP | Motion design > quantidade de 3D |
| Cartier W&W | 6 alcovas 3D, uma por peça | GLSL, GSAP, Lenis, Web Audio | Áudio sutil eleva a experiência |
| IVRESS | Filme curto interativo | **WebGPU + fallback WebGL**, TSL | 2026: WebGPU já é produção com fallback |

Frase-guia do Utsubo: *"The best Three.js sites of 2026 commit to **one hard idea**."* Para nós: **o robô é a ideia**. Tudo o mais é HUD.

## 3. Stack consolidada (consenso 2026)

| Camada | Escolha | Por quê | Alternativa rejeitada |
|---|---|---|---|
| Build | **Vite + React 19 + TypeScript** | Saída estática → cai direto no Firebase Hosting atual | Next.js (SSR desnecessário; hosting é estático) |
| 3D | **Three.js via @react-three/fiber + @react-three/drei** | Padrão de mercado; drei traz `useGLTF`, `useAnimations`, `useProgress`, `Environment`, `ContactShadows` prontos | Three vanilla (mais controle, 2× mais código; Trionn escolheu isso, mas é agência com 5 devs) |
| Scroll/motion | **GSAP + ScrollTrigger + Lenis** | Lenis no `gsap.ticker` = um único relógio; ScrollTrigger scrub → progresso 0–1 no R3F | Framer Motion (ótimo para UI, fraco para timelines pinadas) |
| UI 2D | **Tailwind v4** + CSS vars | HUD é 90% DOM, não WebGL — mais leve, acessível, SEO-ok | Renderizar HUD no canvas (péssimo p/ a11y/SEO) |
| Pós-processamento | `@react-three/postprocessing` (Bloom seletivo p/ olhos vermelhos) | Bloom é o que faz "brilhar" | — |
| Áudio | Web Audio API, sons sintetizados, opt-in | Cartier/Trionn fazem; custo zero de asset | — |
| Compressão | `gltf-transform` (Draco/meshopt + KTX2) | 80–90% de redução no GLB | — |
| Hosting | **Firebase Hosting (inalterado)** + Cloud Run API (inalterada) | `/api/data` continua servindo i18n + repos | — |

### 3.1 Regras de performance (extraídas do Trionn/Joulyan)

1. Canvas montado só quando necessário; HTML renderiza primeiro (SEO/CWV).
2. Render dirigido por scroll/interação; `frameloop="demand"` no R3F quando parado.
3. `renderer.compile()` + 1 frame oculto antes da seção 3D entrar.
4. `useMemo` para tudo dentro de `useFrame`; zero alocação por frame.
5. `gsap.matchMedia()` para desktop/mobile com lógicas distintas.
6. `prefers-reduced-motion`: reduz velocidade, não desliga.
7. Detecção de GPU tier (`detect-gpu`) → mobile fraco recebe **poster/vídeo** do robô em vez de WebGL.
8. Orçamento: GLB do robô ≤ 3 MB comprimido; bundle JS inicial ≤ 250 KB gz; LCP < 2.5s.

## 4. O robô: de onde vem (pipeline de assets)

| Rota | Custo | Tempo | Unicidade | Quando |
|---|---|---|---|---|
| **A. Meshy AI** (texto/imagem → modelo → auto-rig → 600+ animações → GLB) | créditos (~US$ 20/mês) | 1–2 h | **Alta** — robô exclusivo do Rodrigo | **Recomendada.** Você entra, gera a partir de referência (o print do motionsites + direção nossa), rig e animações (idle, look-around, salute, point) saem prontos |
| B. Tripo AI | similar | similar | Alta | Rig mais amplo, mas **sem biblioteca de animações** — teríamos que animar |
| C. Sketchfab CC-BY (ex.: *Sci-Fi Robot Character Pack*, *Robot No.1 rigged/animated*) | grátis | 30 min | Baixa (outros usam) | Fallback / protótipo imediato |
| D. Blender manual / comissionar | R$ 500–3000 | dias | Máxima | Só se A não atingir a qualidade |
| ~~E. Spline~~ | — | — | — | **Descartada:** `@splinetool/r3f-spline` sem release há 4 anos; runtime pesado |

Pós-processo em todos os casos: Mixamo/Meshy para animações extras → `gltf-transform optimize` → `useGLTF` + `useAnimations`.

## 5. Como as pessoas usam o Fable 5 para isso (meta-benchmark)

- Repositórios públicos vibe-coded com Fable: `pulkitxm/claude-directory` (MIT, 41 heros, 3D & shaders, cada pasta com `prompt.md` + `demo.mp4`) e `codewithmuh/fable5-websites` (Vite + React 19 + R3F + drei, 11 landings).
- Padrão de prompt que funciona: **descrever a experiência, não a implementação** ("deve parecer um museu; cada seção revela a próxima") + tokens de marca reutilizáveis.
- Armadilhas documentadas: GC spikes por alocação em `useFrame`; jank por DOM em scroll (usar ScrollTrigger); leaks de listener sem cleanup.
- Custo relatado: landing 3D de alto nível "em uma tarde por < US$ 10 em tokens + créditos".

**Aplicação aqui:** o `CLAUDE.md` do projeto vai ganhar os tokens de marca e as regras de performance como *skill*, para que cada feature herde o padrão.

## 6. Tipografia e direção visual (proposta inicial)

- Display/HUD: **Chakra Petch** ou **Rajdhani** (condensada, técnica, caixa alta — casa com a referência) — Google Fonts.
- Corpo: **Inter** (já em uso) ou **Geist**.
- Mono (dados/labels): **JetBrains Mono** ou manter **Fira Code** (já em uso — continuidade de marca).
- Paleta: manter a identidade cyberpunk atual (`#0a0a0f`, cyan `#00f0ff`, magenta `#ff2daa`) **mas** o robô traz branco fosco + **vermelho** dos olhos como novo acento de destaque. Decisão UX: vermelho `#ff3b3b` vira cor de "energia/ação", cyan vira cor de "dados".

## 7. Inventário do conteúdo atual (100% reaproveitável)

- Hero: tag, título, subtítulo, 3 CTAs (LinkedIn, CV PDF, GitHub), 3 stats.
- About: lead + 10 pills.
- Projects: repos ao vivo via `/api/data` (sparkline 28d + 5 commits).
- Experience: **16 itens** (2007 → presente; Santander, GoNow, Serasa ×6, Itaú, Natura Pay ×2, Bankly, banQi).
- Education: 4 itens (FIAP IA 2025, MBA USP/Esalq, FMU, FIAP SI).
- Contact: card + e-mail. Blog: 3 posts em `posts.json`. i18n pt/en. GA4 com eventos.

## 8. Riscos identificados

| Risco | Mitigação |
|---|---|
| Robô AI-gerado com topologia ruim / rig quebrado | Validar no viewer do Meshy antes de exportar; fallback Sketchfab já mapeado |
| Peso da página vs. LCP | HTML-first, canvas lazy, poster estático como LCP, GLB comprimido |
| Mobile fraco | GPU tier → vídeo/poster; HUD 2D funciona sem WebGL |
| Perda de SEO/a11y ao virar SPA | Conteúdo em DOM semântico; pré-render das rotas (`vite-plugin-prerender`/SSG) |
| Quebrar `/api/data` | Contrato mantido; testes já cobrem |
| Escopo inflar ("mais um efeito") | *One hard idea*: o robô. Lista de efeitos congelada no PRD |

## Fontes

- Codrops — [The Architecture Behind Trionn](https://tympanus.net/codrops/2026/07/15/the-architecture-behind-trionn-coordinating-gsap-three-js-lenis-and-web-audio/)
- Utsubo — [Best Three.js Websites 2026](https://www.utsubo.com/blog/best-threejs-websites-2026)
- Joulyan — [Building Animated 3D Sites With Claude Code](https://joulyan.com/en/blog/fable-5-for-web-design-developers-are-building-animated-3d-sites-with-claude-cod)
- GitHub — [pulkitxm/claude-directory](https://github.com/pulkitxm/claude-directory) · [codewithmuh/fable5-websites](https://github.com/codewithmuh/fable5-websites)
- Meshy — [Meshy vs Tripo 2026](https://www.meshy.ai/compare/meshy-vs-tripo) · SelfCAD — [comparativo](https://www.selfcad.com/blog/meshy-vs-tripo)
- Sketchfab — [Sci-Fi Robot Character Pack](https://sketchfab.com/3d-models/sci-fi-robot-character-pack-9-unique-designs-aa5f8d7a53b847fa80f32f96a71160c7) · [Robot No.1 rigged/animated](https://sketchfab.com/3d-models/robot-no1-rigged-animated-9f8f0c6fc1ce4fc08e19ead884ee4b98)
- Cinevva — [Mixamo e alternativas 2026](https://app.cinevva.com/guides/free-character-animations-rigging)
- npm — [@splinetool/r3f-spline](https://www.npmjs.com/package/@splinetool/r3f-spline) (sem release há 4 anos)
- Hontran — [Award-winning websites 2026](https://www.hontran.dev/blog/best-award-winning-websites-2026)
