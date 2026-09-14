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
| S3.6 Limpeza | ✅ | `site/` e `firebase.json.v2.bak` removidos após smoke 15/15 em dois deploys; recuperáveis em `git show 6a18db8:site/index.html` |

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

## Revisão do PO (2026-09-13, após o cutover)

**Feedback:** "cada seção está com um vídeo, não era isto" — o pedido era **zoom**: rosto em repouso → zoom até a parte → loop → zoom de volta → próxima parte; e no mobile o palco fixo no topo, trocando por scroll ou pelo menu.

**Feito:**
- `sceneMachine.ts` reescrita: `rest → zoomIn → show → zoomOut → hold(450 ms) → zoomIn(próxima)`. 13 testes. O busto em repouso nunca some: ele é **escalado** (`transform-origin` na parte, 2.0–2.6×) e o close-up faz fade no fim do zoom.
- `Stage` universal: desktop atrás da página; **mobile = banda fixa de 38svh sob o header**, `main` com padding equivalente. `SceneBand` e `HeroPortrait` removidos.
- Vídeo por dispositivo: encodes 1280 px no desktop, 854 px (`*.m.*`) no mobile; `<video key>` troca a fonte se a classe de viewport mudar.

**Bloqueado:** o **punho** para LOGS. Gemini devolveu `429 — monthly spending cap exceeded` (https://ai.studio/spend). LOGS reutiliza o loop da **mão** até o teto ser elevado; então:
```bash
node scripts/gen-image.mjs .gen/sc-fist.png "<prompt do punho>" --in .gen/wide-a.png --ar 16:9
node scripts/gen-video.mjs .gen/v-fist.mp4 "<prompt do loop>" --in .gen/sc-fist.png --ar 16:9 --seconds 8 --res 1080p
node scripts/pack-scenes.mjs fist && node scripts/pack-mobile.mjs   # e trocar part:'hand'→'fist' em scenes.ts (blog)
```

## Revisão do PO #2 (2026-09-13) — continuidade, punho, sem foto

**Feedback:** "quando começa o vídeo de loop da seção começa de uma posição diferente do zoom, dá uma quebrada" · "tire a minha foto" · teto do Gemini elevado.

**Feito:**
- **Punho** gerado (still + loop Veo), empacotado (desktop + mobile), LOGS → `fist`. Nenhuma cena reutiliza parte de outra (teste).
- **Foto removida** do About: só o androide aparece no site. `rodrigo*.png/webp` apagados; BIO virou lead + FIELD RECORD + SKILL TREE em coluna única.
- **Continuidade real:** em vez de escalar o busto e cortar para o close-up (composições diferentes → salto), cada parte ganha um **clipe de transição** gerado pelo Veo com **primeiro e último frame** (`--last`): começa no busto e termina **exatamente** no still do close-up, que é o primeiro frame do loop. Medido nos olhos: Δ primeiro frame vs busto 3,7; Δ último frame vs still 3,1; controle busto vs olhos 34 (escala 0–255). A volta é o mesmo clipe invertido (`ffmpeg reverse`). `Stage` toca o clipe numa camada própria (`TransitionLayer`), avança a máquina no `onEnded` (com teto de 9 s) e cai para o zoom CSS se o clipe faltar/falhar (`transition: false` ou `onError`).
- Veo só aceitou primeiro+último frame em **8 s / 720p** (4 s / 1080p → `400 use case not supported`).
- `scripts/pack-transitions.mjs`: `<part>-in|out[.m].{mp4,webm}`.

- Clipes tocam a **2,2×** (8 s → ~3,7 s por perna). Ao pousar, o clipe fica 400 ms em fade sobre o loop já visível (`LINGER_MS`), cobrindo o resíduo do pescoço/cérebro (Δ 10–11). O idle do busto pausa enquanto um clipe toca (um decode a menos).
- Medições de continuidade (Δ 0–255, menor é melhor; controle = busto↔still): olhos 3,7/3,1 (34) · pescoço 3,6/11 (21) · núcleo 3,7/6,1 (34) · cérebro 3,6/10,1 (24) · punho 3,7/3,6 (26) · mão 3,6/6,6 (9,7).

**Ressalva honesta:** na volta (loop → clipe invertido) o loop está num instante qualquer e o clipe começa no still — há um fade de 250 ms cobrindo essa junta. Na ida a junta é exata.

## Revisão do PO #3 — "no celular ficou ofuscado e o vídeo dos olhos apareceu do nada"

**Causa:** o clipe de transição só começava a baixar ao entrar na seção; enquanto não chegava, o busto já estava desfocado (`filter: blur`) e, se o clipe não iniciava em ~5 s, o cronômetro de segurança pulava para o loop. Não havia pré-carregamento.

**Correções:**
- **Prefetch progressivo** (`src/stage/prefetch.ts`): após `requestIdleCallback`, busca em ordem de leitura — por cena: ida, loop, volta — um arquivo por vez, `fetch(..., {cache:'force-cache', priority:'low'})`, webm ou mp4 conforme `canPlayType`. Desligado com `Save-Data`, em 2G e com `prefers-reduced-motion`. Ordem testada (`prefetch.test.ts`).
- **Viagem só começa quando o clipe está tocando:** o busto fica nítido e visível (idle rodando) até `onPlaying`; o cronômetro "deve ter terminado até" só arma a partir daí. Se o clipe não iniciar em 12 s, aquela parte cai para o zoom CSS — nunca para um corte seco.
- Desfoque do busto removido.

Verificado com emulação mobile + Slow 4G no Chrome: 18 clipes pré-buscados após o load; BIO: busto nítido até ~1 s, clipe completo, pouso no loop.

## 2026-09-14 — fluidez no celular real

Sintoma (PO, aba anônima no telefone): vídeos "travados, sem fluidez". Causa: `playbackRate 2.2` sobre clipes
24 fps (≈53 fps a decodificar), webm/VP9 escolhido pelo browser e decodificado por software, e loop da cena
decodificando junto com o clipe. Correções: velocidade assada no encode (30 fps, 3,6 s), mobile só H.264,
uma camada decodificando por vez (`playing` separado de `visible`), linger unificado ida/volta (`landed`),
loop pausado sob o clipe de volta. `public/scenes` 45 → 33 MB. Continuidade último frame preservada (Δ ≤ 2,2).

### Segunda rodada (S25 Ultra + MacBook Air M1 ainda sem fluidez)
Duas causas medidas: (1) desktop — 86 elementos com `backdrop-filter` sobre o vídeo; A/B ao vivo: só desligar
o blur dos painéis leva de 15/78 frames >20 ms para 0/90. Painéis sem blur (84% opacos). (2) mídia — clipes
reamostrados 52,8 → 30 fps tinham cadência 2,7/2,7/2,7/1,5 e os loops eram 24 fps (pulldown 3:2). Agora
transições a 2,5× = 60 fps exatos (3,2 s) e loops interpolados a 60 fps (`scripts/interp60.mjs`, mci, ~20 min
com 7 em paralelo). Após tudo: `show`/scroll 0/121 frames longos no M1.
Fechamento: header e rodapé (`backdrop-blur-xl`, sobre o vídeo) eram o resto do jank em Contato (7/114 → 0/121 sem eles). Removidos.

## 2026-09-14 — uma câmera só: parte → parte

PO: "entre uma cena e outra falta uma filmagem que roda uma vez: do último frame da seção anterior ao primeiro
da atual". Antes: olhos → busto → pescoço. Agora 5 clipes Veo parte → parte (olhos→pescoço, pescoço→coração,
coração→cérebro, cérebro→punho, punho→mãos) com primeiro/último frame travados nos stills; máquina ganhou
`from` + predicado `direct` (vizinhas = clipe direto; saltos = via busto); `Stage` mantém a camada da parte
de origem visível/pausada sob o clipe; prefetch na ordem descer → subir → saídas. Take coração→cérebro
regerado (o primeiro virou caveira no meio).
