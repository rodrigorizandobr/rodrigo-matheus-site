# Sprint 1 — Status (2026-09-13)

Escopo: fundação + hero "Character Select". Ver `.bmad/planning-artifacts/05-epics-stories.md`.

## Entregue

| Story | Estado | Nota |
|---|---|---|
| S0.1 Scaffold & toolchain | ✅ | Vite 8, React 19.2, TS 6, Vitest 5, Tailwind v4 |
| S0.2 Tokens & tipografia | ✅ | `src/styles/tokens.css`; Chakra Petch + Inter + Fira Code |
| S0.3 i18n embutido | ✅ | `src/i18n/{pt,en}.json` + `useI18n`; `localStorage.lang` preservado |
| S0.4 Analytics | ✅ | `gaEvt` tipado; nomes de evento v2 mantidos |
| S0.5 Lenis + GSAP | ✅ | Lenis no `gsap.ticker`; `useScrollReveal` com cleanup testado |
| S1.1 `character.ts` | ✅ | LEVEL/stats/classes derivados do i18n; 9 testes |
| S1.2 StatPanel | ✅ | `aria-live`, 4 progressbars com `aria-valuenow` |
| S1.3 ClassRoster | ✅ | `aria-pressed`, setas ←/→ com wrap, GA `class_select` |
| S1.4 ActionBar + Start | ✅ | Mesmos destinos e evento `hero_click` da v2 |
| S1.5 `capability.ts` | ✅ | detect-gpu + WebGL2 + reduced-motion; 8 casos de tabela |
| S1.6 RobotCanvas lazy | ✅ | `React.lazy` + `requestIdleCallback`; chunk 3D fora do bundle inicial |
| S1.7 Robot.tsx | ✅ | GLB + `Idle`; armadura branca fosca, olhos vermelhos |
| S1.8 Head-tracking + gestos | ✅ | lerp FPS-independente, ±35°; gesto por classe com crossfade |
| S1.9 Efeitos | ✅ (mudou) | Sem pós-processamento — ver **ADR-13** |
| S1.10 Poster & LCP | ⚠️ parcial | Poster gerado e versionado (20 KB webp); automação Playwright **não** feita |
| S1.11 Responsivo | ⚠️ parcial | 3 breakpoints funcionam, sem overflow; roster mobile ainda empilhado, não chips |

**61 testes verdes.** `tsc --noEmit` limpo.

## Orçamento (produção, `vite build`)

| Chunk | raw | gzip | Carrega |
|---|---|---|---|
| `index` (app + React + HUD) | 254 KB | **81 KB** | eager |
| `motion` (GSAP + Lenis) | 132 KB | **49 KB** | eager |
| `r3f` (three + fiber + drei) | 983 KB | 263 KB | **lazy**, após idle |
| `RobotCanvas` | 4 KB | 2 KB | lazy |
| CSS | 21 KB | 5 KB | eager |
| `robot.glb` (meshopt) | 183 KB | — | lazy |
| `robot-poster.webp` | 20 KB | — | eager (LCP/fallback) |

Inicial ≈ **131 KB gz** — dentro do orçamento de 250 KB gz (04 §6).

## Decisões tomadas durante a implementação

- **ADR-13 — sem pós-processamento.** `@react-three/postprocessing` 3.1.1 + `postprocessing` 6.39.5 com three r186 (dentro da faixa declarada `>=0.168 <0.187`) renderizou cena **vazia** com canvas `alpha:true`. Removido; o brilho dos olhos virou material emissivo + um `PointLight` parenteado ao nó `Head` (`EyeGlow.ts`). Menos 60 KB e funciona em qualquer tier.
- **meshopt em vez de Draco.** Draco baixa o decoder de `gstatic.com` em runtime — dependência externa e mais um round-trip no caminho crítico. meshopt vem no bundle do three. Mesmo tamanho (183 KB vs 182 KB).
- **`--palette false` no gltf-transform.** O `optimize` padrão funde materiais numa paleta e destrói os nomes (`Main`/`Grey`/`Black`) que o re-estilo usa para achar corpo/juntas/olhos.
- **Materiais por duck-typing** (`isMesh`, `isMeshStandardMaterial`) em vez de `instanceof`, mais `resolve.dedupe` no Vite: uma segunda cópia do three quebra `instanceof` silenciosamente.
- **Error boundary no canvas.** Falha de WebGL cai para o poster em vez de deixar o hero em branco.

## Pendências conhecidas (entram na Sprint 2)

1. **Sem navegação no mobile** — o `<nav>` do header é `hidden md:flex` e não há menu alternativo.
2. **Roster mobile** empilhado verticalmente; a spec (03 §3.2) pede chips horizontais com scroll-snap.
3. **Headline sobrepõe as pernas do robô** em telas baixas — precisa de máscara/gradiente mais alto ou reenquadramento.
4. **Seções são placeholders** (About/Experience/Projects/Education/Contact) — Sprint 2.
5. **Poster manual** — regeneração documentada em `web/scripts/README.md`; automação é a S1.10 restante.
6. `THREE.Clock deprecated` — aviso vindo de dentro do drei, não do nosso código. Some quando o drei atualizar.
