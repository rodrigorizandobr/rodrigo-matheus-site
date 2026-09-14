# rodrigo-matheus.com.br — Guia do Projeto

> **v3 em produção desde 2026-09-13.** `firebase.json` serve `web/dist`; `deploy.sh` faz build+testes
> antes de publicar. O v2 (`site/`, HTML puro) foi removido — está no histórico do git até `6a18db8`.
> Planejamento em `.bmad/planning-artifacts/`, status por sprint em `.bmad/implementation-artifacts/`.

## O que é

Portfólio pessoal + blog. A **v3** vive em `web/`; o backend Flask em `api/`.

| Camada | Onde | O que faz |
|---|---|---|
| Frontend | `site/index.html` | Single-page, HTML/CSS/JS vanilla inline (~630 linhas). Canvas Matrix rain, cards 3D flip, sparklines SVG. |
| Blog | `site/blog/index.html` + `site/blog/posts.json` | Lê `posts.json` estático via `fetch`. |
| Backend | `api/server.py` | Flask. Agrega repos/commits do GitHub, gera sparklines de 28 dias, serve i18n. |
| Hosting | Firebase Hosting | Serve `site/`; faz rewrite de `/api/**` → Cloud Run. |
| API runtime | Cloud Run `portfolio-api` (`southamerica-east1`) | Gunicorn + Dockerfile. |
| Cache | Google Cloud Storage (`github_cache.json`) | Sobrevive a cold start; fallback em disco local. |

**Fluxo:** o frontend faz **uma única** chamada `GET /api/data`, que devolve `{i18n, repos}` de uma vez.

### v3 (`web/`, em desenvolvimento)

Hero como tela de seleção de personagem: um androide branco é o avatar do Rodrigo, ocupa a tela
inteira como **fundo**, e o HUD flutua por cima mostrando métricas reais de carreira
(LEVEL 22 = anos, LEADERSHIP 40+ = pessoas lideradas).

**Não há WebGL.** A referência que guia o projeto é ela própria uma imagem renderizada, e nenhum
GLB gratuito chega perto da fidelidade. O personagem é uma **imagem gerada** (Gemini
`gemini-3-pro-image`); o movimento é CSS: parallax no ponteiro e pulso lento no brilho dos olhos.
R3F/three foram removidos em 2026-09-13 — ver `.bmad/planning-artifacts/04-architecture.md` ADR-14.

**Paleta clara, branco no branco, vidro.** Laboratório estéril: `--bg #ececed` com grade de azulejos
no `body::before`; `.panel` é **glass** (translúcido, cantos retos, highlight interno — **sem**
`backdrop-filter`, ver armadilhas); vermelho é o único acento saturado e aparece como **glow** no que está selecionado
(`.glow-red`, roster ativo, módulo ativo, START pulsando). `--white-armor` é cor de superfície, nunca de texto.

| Camada | Onde |
|---|---|
| App | `web/src/` — Vite 8, React 19, TS 6, Tailwind v4 |
| Personagem | `src/components/hero/HeroPortrait.tsx` — still `<picture>` (LCP) + `<video>` loop por cima no desktop |
| Geração | `scripts/gen-image.mjs` (Gemini imagem) · `scripts/gen-video.mjs` (Veo, image-to-video) |
| Empacotamento | `scripts/pack-hero.mjs` (sharp → webp) · `scripts/pack-video.mjs` (ffmpeg → palíndromo mp4+webm) |
| HUD ao vivo | `TopStrip` / `SyncStamp` leem `/api/data` via `useArena` (1 request, cacheado) |
| Palco por seção | `src/stage/` — `Stage` em todo dispositivo (desktop atrás da página, mobile banda fixa sob o header); coreografia de **zoom** em `sceneMachine.ts` (testada) |
| Motion | GSAP + ScrollTrigger, Lenis dirigido pelo `gsap.ticker` |
| Dados | `src/data/character.ts` e `repos.ts` são **puros e testados** |
| i18n | `src/i18n/*.json` embutido no build (não vem mais da API) |

## Comandos

```bash
# v3 (web/)
cd web && npm install --legacy-peer-deps   # R3F declara expo como peerOptional; sem a flag o resolve quebra
npm run dev            # :5173 — proxy /api → produção, não precisa de Flask local
npm test               # 61 testes (vitest)
npm run build          # → web/dist
npm run typecheck      # app + testes (tsconfigs separados)

# Assets do personagem (precisa de GEMINI_API_KEY em web/.env.local):
node scripts/gen-image.mjs .gen/x.png "<prompt>" --ar 4:5 [--in ref.png]
npm run hero:pack      # .gen/*.png → public/hero/*.webp + og-image.png
node scripts/gen-video.mjs .gen/idle.mp4 "<prompt>" --in .gen/wide-a.png --ar 16:9 --seconds 8
npm run hero:video     # .gen/idle-a.mp4 → public/hero/idle.{mp4,webm} (forward+reverse, sem áudio)

# Backend local
cd api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python server.py   # :5000

# Frontend local
cd site && python -m http.server 8080                 # :8080

# Deploy completo: build+testes do front → Cloud Run → Hosting (web/dist) → refresh do cache
source .env && ./deploy.sh        # firebase via npx firebase-tools@14

# Rebuild do cache do GitHub
curl "https://rodrigomatheus.com.br/api/refresh?key=$REFRESH_KEY"
```

## Armadilhas reais (verificadas no código)

- **`source .env` antes do `./deploy.sh`.** Sem isso o script pula a atualização de env vars **silenciosamente** (só imprime um aviso) e o Cloud Run sobe sem `GITHUB_TOKEN`/`REFRESH_KEY`.
- **`gcloud run deploy --source` reseta as env vars.** Por isso o `deploy.sh` as reaplica num segundo passo (`services update`). Não junte os dois passos.
- **O README está desatualizado:** documenta `GET /api/repos`, mas a rota real em `api/server.py` é `GET /api/data`. `/api/repos` dá 404 no Flask.
- **Textos do site não estão no HTML.** A cópia pt/en vive em `api/i18n/*.json` e chega pelo `/api/data` — mudar texto é alteração de **backend**, e exige redeploy do Cloud Run.
- **Cache é a fonte da verdade.** `/api/data` nunca chama o GitHub; só lê o cache. Dados novos só aparecem após `/api/refresh`.
- `site/index.html` e `site/blog/index.html` têm CSS e JS **inline**. Não existe bundler — edite no lugar.
- `github_cache.json` na raiz é artefato local e está no `.gitignore`.

## Testes

```bash
cd api && source .venv/bin/activate && pytest      # 23 testes, ~0.2s
cd web && npm test                                  # 61 testes, ~1s
```

**No `web/`, WebGL não roda no jsdom.** Os testes cobrem lógica pura (`character`, `repos`,
`capability`, `headTracking`) e componentes de HUD; a cena 3D é verificada no browser.

`pytest` cobre `api/`. `conftest.py` isola tudo: sem rede, sem GCS, sem tocar o cache real
(`_gcs_blob` devolve `None` e `CACHE_FILE` aponta para `tmp_path`).

**`server.py` lê `REFRESH_KEY` para uma constante de módulo no import** — para variar o valor
num teste, use `monkeypatch.setattr(server, "REFRESH_KEY", ...)`, não `monkeypatch.setenv`.



## Segurança de `/api/refresh`

`/api/refresh` é o único endpoint que gasta cota da API do GitHub (varre todos os repos).
Ele exige `REFRESH_KEY` **não-vazio** e compara em tempo constante com `secrets.compare_digest`
sobre bytes. Se `REFRESH_KEY` faltar, o endpoint devolve 403 e o servidor avisa no boot.

Não relaxe esse guard: `gcloud run deploy --source` reseta as env vars e o `deploy.sh` só as
reaplica se `source .env` tiver rodado — sem o guard, esse caminho deixava o endpoint aberto.

## Os três frameworks instalados — quando usar cada um

Eles se sobrepõem. Regra de roteamento:

| Framework | Papel | Use quando |
|---|---|---|
| **Superpowers** (plugin, 14 skills) | **Como** trabalhar — disciplina | Sempre. `test-driven-development`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, `requesting-code-review`. |
| **Spec Kit** (`/speckit-*`, `.specify/`) | **Fluxo de uma feature** | Mudança única e bem delimitada: `constitution` → `specify` → `plan` → `tasks` → `implement`. |
| **BMAD Method** (`/bmad-*`, `_bmad/`, módulo `bmm`) | **Produto e arquitetura** — escopo macro | Trabalho grande e multi-etapa: `bmad-prd`, `bmad-architecture`, `bmad-create-epics-and-stories`, `bmad-sprint-planning`, `bmad-retrospective`. Agentes com papéis (analyst, pm, architect, dev, ux). |

**Não empilhe os três numa tarefa pequena.** Ajuste de CSS ou texto: só Superpowers. Feature nova no blog ou endpoint novo: Spec Kit. Repensar o produto/arquitetura: BMAD, e depois desça para Spec Kit por feature.

Artefatos do BMAD saem em `.bmad/` (`planning-artifacts/`, `implementation-artifacts/`) — alinhado com a convenção `.bmad/` das diretrizes globais. Specs do Spec Kit saem em `specs/`.

## Diretórios dos frameworks (não editar à mão)

- `_bmad/` — runtime do BMAD. `config.toml` é regenerado a cada install; overrides duráveis vão em `_bmad/custom/config.toml`.
- `.specify/` — templates, scripts e `memory/constitution.md` do Spec Kit.
- `.claude/skills/` — 39 skills geradas pelos instaladores (`bmad-*`, `speckit-*`).
- `.claude/settings.json` — declara o marketplace e o plugin Superpowers (escopo de projeto).

## Armadilhas do hero (aprendidas na marra, não repita)

- **O header está no fluxo.** O hero é `h-[calc(100svh-var(--header-h))]`, não `100svh` — senão
  ele começa abaixo do header de 57px e o conteúdo do rodapé sai da tela.
- **A coluna direita define a altura da linha do grid.** Se ela passar da altura disponível, tudo
  que depende de `h-full`/`justify-end` vaza. Foi por isso que as 10 skills saíram do hero.
- **`--white-armor` é superfície, não texto.** Na paleta clara, usá-la como cor de texto é
  branco-sobre-branco. `src/components/hud/contrast.test.ts` calcula contraste WCAG dos tokens e
  quebra se alguém reintroduzir isso.
- **O preload do LCP tem que casar com o `<picture>`.** Art direction usa `media` + `imagesrcset`;
  se divergir, o browser baixa dois arquivos e o Chrome avisa "preloaded but not used".
- **`sharp` é dependência real** do pipeline de imagens (`scripts/pack-hero.mjs`), não transitiva.
- **O loop de vídeo é um palíndromo** (clipe + clipe invertido). O Veo não garante que o último frame
  bata com o primeiro; o ffmpeg garante. `scale` tem que ficar **dentro** do `filter_complex`.
- **Vídeo em todo lugar, mas com orçamento:** desktop usa os encodes 1280 px; mobile usa `*.m.*`
  (854 px), `preload="none"` e só carrega/toca quando a faixa está perto da viewport (`useInViewPlayback`).
  `prefers-reduced-motion` e `Save-Data` desligam vídeo. O still fica sempre por baixo — é o LCP e o fallback.
- **Os atalhos da HintsBar são promessas.** `◀ ▶`, `↵` e `L` estão ligados em `Hero.tsx`; se mudar
  um, mude o outro.
- **Todo CSS próprio vive em `@layer`** (`base` para elementos, `components` para `.panel/.chip/.cta`…).
  Fora de layer ele vence as utilities do Tailwind v4 e quebra `md:hidden`, `text-*`, `!bg-*` em silêncio.
- **`backdrop-filter` vira containing block de `fixed`.** Overlays (menu mobile) saem por `createPortal(document.body)`.
- **`.cta-primary` precisa vencer o `.cta` glass.** A regra glass é `.cta:not(.cta-primary)`; se
  voltar a ser `.cta` puro, o LinkedIn fica branco no branco de novo.
- **Screenshot full-page do Chrome mente nesta página** (hero `100svh` + `body::before` fixo).
  Verifique por viewport ou fatie em tiles.
- **O palco é UMA câmera, não troca de vídeo.** Entre seções vizinhas a câmera vai **parte → parte**
  (`scripts/pack-links.mjs`, clipes `l-<a>-<b>` gerados com `--in still(a) --last still(b)`, 8 s/720p; a volta é
  o arquivo invertido `<b>-<a>`). Só a primeira seção usa busto → olhos, e só saltos pelo menu passam pelo
  busto (`<parte>-out` + `<parte>-in`). `isNeighbour` em `scenes.ts` decide; a máquina recebe o predicado.
  Ao gerar um clipe parte → parte, **olhe o meio dele** — o Veo já trocou o rosto por uma caveira num take
  (coração → cérebro); meça também Δ do primeiro/último frame contra os stills (bom: < 10; controle ~33).
  Sem clipe, cai para zoom CSS do busto (ou crossfade, se vinha de outra parte). Nunca esconda um `<video>`
  com `display:none` — ele ainda baixa e decodifica.
- **Tudo que toca no palco é 60 fps.** O Veo entrega 24 fps — em tela de 60/120 Hz isso é pulldown 3:2 e nunca
  parece fluido, por melhor que decodifique. `scripts/interp60.mjs` interpola cada take uma vez (minterpolate
  mci, ~6 min por take, todos em paralelo) para `.gen/i60-*.mp4`; os `pack-*` preferem esse intermediário.
  Take novo = rodar `interp60` antes de empacotar.
- **Velocidade da viagem é assada no encode, nunca `playbackRate`.** `pack-transitions.mjs` acelera 2,5×:
  24 fps × 2,5 = 60 fps exatos, cada frame do take vira um refresh (3,2 s). 2,2× reamostrado a 30 fps dava
  cadência 2,7/2,7/2,7/1,5 — tranco visível. `playbackRate` no browser obrigava o celular a decodificar ~53 fps.
  Mudou `SPEED`? Mude `TRANSITION_MS` no `Stage.tsx`.
- **Mobile só recebe H.264 (`*.m.mp4`), nunca webm.** Chrome/Safari escolhem o primeiro `<source>` que *podem*
  tocar; VP9 em software num telefone = travado. `videoSrc/transitionSrc(…, mobile)` devolvem só `mp4` (testado).
- **Nenhum `backdrop-filter` em cima do palco.** Medido no M1: ~40 painéis com blur sobre o vídeo → 20–45% dos
  frames acima de 20 ms (o vídeo repinta todo frame e cada painel re-desfoca todo frame); sem blur → 0. Vidro é
  translucidez (84–90%) + highlight + borda + sombra. Header e rodapé também ficam sobre o vídeo: sem blur
  (só o header já custava 7/114 frames longos em Contato). Único blur restante: o overlay do menu mobile.
- **Um vídeo decodificando por vez.** Camada toca só enquanto `playing`; a cena é montada com `preload="auto"`
  (buffer, pausada no frame 0 = último do clipe) e só dá `play()` na entrega. Na volta o loop fica visível
  e pausado sob o clipe — senão o busto pisca antes do clipe aparecer.
- **Clipes são pré-buscados após o load** (`prefetch.ts`, ordem de leitura, respeita Save-Data/2G/reduced-motion) e a
  viagem só começa em `onPlaying` — sem isso, celular em rede lenta vê corte seco.
- **Só o androide aparece no site** — sem foto pessoal (decisão do PO).
- **Cena nova = still + loop do MESMO personagem** (`--in` no gen-image/gen-video). Revise os frames
  antes de empacotar: o Veo mostrou dentes em dois takes da boca — por isso `blog` é `video: false`.
- **Todo número do cromo é real.** REPOS/COMMITS/ONLINE/LAST COMMIT vêm de `/api/data`. Se a
  API estiver com cache velho (só atualiza via `/api/refresh`), o site mostra o número velho.
- **A chave do Gemini vive em `web/.env.local`** (gitignored, `chmod 600`). Nunca em flag de CLI,
  nunca no código.
