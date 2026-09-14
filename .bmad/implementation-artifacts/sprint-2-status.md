# Sprint 2 — Status (2026-09-13)

Escopo: as cinco "telas" + blog, menu mobile, e o segundo passe de design (glass + glow). Hero aprovado pelo PO ao fim da Sprint 1.5 (vídeo Veo + HUD ao vivo).

## Entregue

| Story | Estado | Nota |
|---|---|---|
| S2.1 Header + LangToggle + Footer | ✅ | **Menu mobile** em folha de vidro (`role=dialog`, Escape fecha, `aria-expanded`) — fecha a pendência #1 da Sprint 1 |
| S2.2 About "BIO" | ✅ | Foto real (webp 800/480, eager), lead, **FIELD RECORD** (os 3 números do hero, mesma fonte), **SKILL TREE** com as 10 skills numeradas |
| S2.3 Experience "CAMPAIGNS" | ✅ | 16 itens em timeline alternada (spine vermelho→cinza), numeração 16→01, 1º com `ACTIVE` + glow; reveal por card |
| S2.4 `repos.ts` | ✅ (Sprint 1) | raridade, cor por linguagem, sparkline, timeAgo |
| S2.5 `api.ts` + `useArena` | ✅ | timeout 8s, tolerante a payload parcial; **um request por página**, `refetch` notifica todos os consumidores (strip + stamp + arena) |
| S2.6 Arena | ✅ | 4 estados (skeleton shimmer / OFFLINE + RETRY / vazio / cards); raridade por stars com moldura; sparkline com área; commits expansíveis; GA `repo_link_click`, `repo_card_flip`, `see_all_repos` |
| S2.7 Training / Contact / Logs | ✅ | Logs lê `posts.json` no idioma atual, calcula min de leitura, linka para `/blog/#slug` |
| S2.8 Blog post `/blog/:slug` | ⚠️ **substituído** | Sem router: a página legada `site/blog/index.html` foi copiada para `web/public/blog/` e continua servida pós-cutover. **Ela ainda é dark** — inconsistência visual, entra na Sprint 3 |
| S2.9 Contraste & a11y | ✅ parcial | Teste de contraste dos tokens existe; **axe não foi rodado** |

**82 testes verdes**, `tsc` (app + test) limpo. Bundle inicial ≈ **150 KB gz** (CSS subiu para 9.4 KB gz com o glass).

## Design pass 2 — glass + glow

- `.panel` virou vidro: cantos retos (como a referência), preenchimento translúcido 68%, `backdrop-filter: blur(18px) saturate(1.5)`, highlight interno de 1px, sombra real. O chanfro saiu dos painéis (o `clip-path` cortava sombra e glow) e ficou só nos CTAs.
- Fundo do `body`: grade de azulejos de 64px + dois campos de cor (vermelho/ciano a 7%) — é o que o vidro refrata.
- Glow vermelho: card ativo do roster, módulo ativo, 1ª campanha, 1ª formação, LEVEL (text-shadow), START (pulso lento), hover do CTA primário.
- Molduras de raridade na Arena: RARE ciano, LEGENDARY âmbar com glow.

## Bugs pegos na verificação visual
- **Cascade layers do Tailwind v4:** CSS próprio *fora* de `@layer` vence qualquer utility (`md:hidden`, `text-heading`, `!bg-*`). Sintomas: links do menu em ciano, hambúrguer visível no desktop. Correção: defaults de elemento em `@layer base`, todo componente próprio (`.panel`, `.chip`, `.cta`…) em `@layer components`.
- **`backdrop-filter` cria containing block para `position: fixed`:** a folha do menu mobile, filha do header com blur, ficava com a altura do header. Correção: `createPortal` para o `body`.
- `.cta-primary` estava sendo sobrescrito pela regra glass de `.cta` (mesma especificidade, declarada depois) → LinkedIn ficou branco no branco. Corrigido com `.cta:not(.cta-primary)`.
- Repos sem descrição reservavam duas linhas em branco → agora mostram topics ou nada.
- Screenshot *full-page* do Chrome não é confiável nesta página (o `100svh` do hero e o `body::before` fixo distorcem a costura) — usar tiles/viewport.

## Sprint 2.5 — palco persistente (pedido do PO)

Cada seção examina uma parte do androide; entre seções ele volta ao repouso.

| Seção | Parte | Loop |
|---|---|---|
| hero | busto (repouso) | idle 16 s |
| about | olhos | pisca, íris giram |
| experience | pescoço/tendões | respiração, pulsos vermelhos |
| projects | núcleo no peito | **batimento** — commits como pulso |
| education | cérebro (crânio aberto) | pulsos na treliça |
| blog | boca | **só still** — dois takes do Veo mostraram dentes em instantes diferentes; o poster é sereno |
| contact | mão estendida | dedos flexionam, palma se oferece |

- `src/stage/sceneMachine.ts` (puro, 7 testes): `focus` → `resting` (520 ms) → `rested` → `showing`; trocar de ideia durante o repouso só troca o destino.
- `useActiveSection`: um `IntersectionObserver`, faixa central 40–60 % da viewport, thresholds finos; mantém a seção anterior quando nada domina (sem piscar).
- Desktop: `Stage` `fixed` atrás de tudo, camada `rest` sempre montada + camada da cena com crossfade; **um `<video>` tocando por vez** (`pause()` nas ocultas). Mobile: `SceneBand` 16:9 em fluxo no topo de cada seção, só poster.
- Assets: 6 stills (image-to-image a partir do busto, mesma identidade) + 6 loops Veo (image-to-video) → `public/scenes/` (posters 16–59 KB; loops 0,25–2,1 MB webm). Verificado ao vivo: cada seção acende a parte certa, com passagem pelo repouso.

## Pendências (Sprint 3)
1. Blog legado é dark — migrar `/blog` para o design novo (rota + prosa) ou re-tematizar a página estática.
2. axe/Lighthouse CI não rodados ainda.
3. Cache do `/api/data` em produção pode estar velho (último push exibido: abr/2026) — rodar `/api/refresh` antes do cutover.
4. `firebase.json` → `public: web/dist`; `deploy.sh` com `npm ci && npm test && npm run build`; pré-render.
