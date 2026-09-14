# rodrigo-matheus.com.br — Guia do Projeto

> **v3 em produção desde 2026-09-13.** `firebase.json` serve `web/dist`; `deploy.sh` faz build+testes
> antes de publicar. O v2 (`site/`, HTML puro) foi removido — está no histórico do git até `6a18db8`.
> Planejamento em `.bmad/planning-artifacts/`, status por sprint em `.bmad/implementation-artifacts/`.

## O que é

Portfólio pessoal + blog. A **v3** vive em `web/`; o backend Flask em `api/`.

| Camada | Onde | O que faz |
|---|---|---|
| Frontend | `site/index.html` | Single-page, HTML/CSS/JS vanilla inline (~630 linhas). Canvas Matrix rain, cards 3D flip, sparklines SVG. |
| Blog | `web/src/pages/BlogPage.tsx` + `api/blog/` | **Gerenciado por IA.** Posts em Firestore, escritos pelo Gemini Flash Lite, painel em `/admin`. |
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

## Blog gerenciado por IA (`api/blog/` + `/admin`)

Um post é um documento **bilíngue** no Firestore, escrito numa única chamada ao Gemini
Flash Lite. O corpo são **seções** (`heading` + `paragraphs`), nunca HTML: texto de modelo
entra no DOM como texto, então não há `dangerouslySetInnerHTML` nem sanitização na página.

| Camada | Onde | Papel |
|---|---|---|
| Núcleo puro | `api/blog/model.py` | Slug, agendamento, cadência, tags, validação. **Sem rede.** |
| Persistência | `api/blog/store.py` | Firestore `blog_posts` + `blog_config/settings`. |
| Geração | `api/blog/gemini.py` | Texto pt+en numa chamada, `responseSchema` obrigatório. |
| Imagens | `api/blog/images.py` | Só BUSCA: Gemini (IA) e Pixabay (banco). Quem grava é a biblioteca. |
| Biblioteca | `api/blog/media.py` | Upload, IA e banco caem todos aqui: JPEG, lado máximo, nome pelo hash. |
| Pesquisa | `api/blog/research.py` | Serper **notícias, Brasil** + leitura das páginas. Opcional em todo lugar. |
| Currículo | `api/blog/profile.py` | A carreira vira material de apoio quando não há notícia. |
| Coreografia | `api/blog/service.py` | tema → texto → capa → grava; `tick()` do agendador. |
| Portaria | `api/blog/auth.py` | ID token do Firebase + allowlist de e-mail. |
| Rotas | `api/blog/routes.py` | Público / painel / agendador, portarias diferentes. |
| Metatags | `api/blog/page.py` | Serve `/blog/<slug>` e `/sitemap.xml` com o conteúdo do momento. |
| Painel | `web/src/pages/AdminPage.tsx` | Carregado sob demanda (`lazy`) — o visitante não baixa o Firebase. |

**Armadilhas deste subsistema:**

- **O site público nunca pode ver rascunho.** Por isso existem `list_public_posts`/`get_public_post`
  separados do par administrativo, em vez de um filtro opcional que um dia alguém esquece de passar.
  `INTERNAL_FIELDS` some da resposta pública (prompt da capa, metadados de geração, data agendada).
- **Agendamento é no fuso local, não em UTC.** "Publicar às 8h" é 8h em São Paulo; um post gerado
  23h de sábado em SP não pode contar como domingo. Tudo isso é testado em `test_blog_model.py`.
- **O `tick` publica ANTES de gerar, e uma coisa não derruba a outra.** Publicar tem hora marcada;
  gerar depende do Gemini estar de pé. Se inverter a ordem, uma cota estourada segura a fila.
- **Uma geração por dia local.** O agendador bate de hora em hora; a guarda `last_generated_at`
  é o que evita uma enxurrada de posts.
- **Pauta esgotada não gera.** Repetir tema produz post quase igual ao anterior — pior que não publicar.
- **A página do post é servida pelo Cloud Run**, não por HTML estático: um post que entra no ar
  sozinho precisa da prévia de link certa na hora. O shell vem do `spa-shell.html` que o `deploy.sh`
  publica no GCS a cada deploy; o cache de CDN (`s-maxage`) faz o container ser acionado raramente.
- **As chaves do Firebase no `web/src/blog/firebase.ts` são públicas por desenho.** Quem protege é a
  allowlist no backend. Entrar com outra conta Google mostra o painel e toda ação volta 401.
- **A pesquisa na web é OPCIONAL em três níveis**: a chave `SERPER_API_KEY` pode faltar, a configuração
  pode desligá-la, e cada geração manual pode decidir por conta própria (`use_research`). Sem ela o
  post sai do repertório do modelo — o que nunca pode acontecer é o post não sair.
- **Os trechos da busca valem tanto quanto o crawler.** O Cloud Run sai de IP de datacenter e boa parte
  dos sites recusa a leitura direta; sem os `snippet` do Serper a pesquisa voltaria vazia quase sempre.
  Por isso `search_web` junta páginas lidas E trechos. Lição herdada de monster-jobs/br51.
- **Serper no endpoint `/news`, com `gl=br` e `hl=pt-br`** — nunca a busca web: ela devolveria página
  institucional e conteúdo antigo bem posicionado em SEO, e o blog fala do que é novidade aqui.
- **Assunto vigiado nomeia ACONTECIMENTO, não profissão.** Medido contra o Serper: "arquitetura de
  software" trouxe 3 anúncios de vaga/concurso em 10; "vazamento de dados" e "regulação de IA", 0 em 10.
  Em português o nome da disciplina é também o nome do cargo, então a busca de notícia cai em
  recrutamento. Ao sugerir termos novos, prefira o que um jornalista escreveria.
- **`research.is_noise()` filtra pelo TÍTULO** (vaga, concurso, edital, curso, bolsa, estágio…), nunca
  pelo trecho — filtrar por trecho derruba notícia legítima. Sem isso, um anúncio de emprego acabava
  citado como fonte em ABNT no fim do post.
- **Só vira referência a página que foi LIDA.** Link que apareceu apenas como trecho de busca entra em
  `sources` (consultado), não em `references` (citado) — citar o que não fundamentou o texto é exagero.
- **Sem notícia, o lastro é o CURRÍCULO** (`profile.career_context()`, lido do mesmo `api/i18n/pt.json`
  do site): empresas, times e números reais em vez de o modelo escrever de memória. Não existe mais
  "pauta" de temas — o PO tirou do produto.
- **Os títulos já publicados vão no prompt** (`store.recent_titles()`): o modelo não tem memória entre
  chamadas, então dois posts do mesmo termo sairiam quase iguais. A memória vai no prompt.
- **Tamanho se manda em regra concreta, não em total de palavras.** "600 a 900 palavras" produzia posts
  de 286; "4 seções, 3 parágrafos cada, 70 a 110 palavras por parágrafo" produziu 1.149. O modelo executa
  estrutura, não orçamento.
- **Termo de notícia REPETE de propósito.** O que muda numa notícia é a notícia, então os termos entram
  em rodízio (`pick_rotating`, o mais antigo primeiro).
- **Toda imagem passa por `media.store_image`** — upload, IA ou banco. Nunca se linka o arquivo de
  terceiro: a URL pode virar 403 e o post fica com imagem quebrada para sempre. O nome é o sha256 do
  JPEG final, então a mesma imagem não duplica e a URL pode ser cacheada para sempre.
- **Imagem em uso por um post não é apagada** (`InUseError` → 409 dizendo em quais posts).
- **As regras do Firestore negam tudo**: o navegador nunca fala com o banco, só com a API.
- **`main[data-stage="true"]`**: só a home tem a banda fixa do robô. A regra mobile que empurra o
  `<main>` em 38svh vale SÓ para ela — sem esse atributo, blog e painel abriam com meia tela de vazio
  no topo (o PO reportou como "um vazio no começo da página").
- **Um renderizador de post só** (`web/src/blog/PostArticle.tsx`), usado pela página pública E pela
  prévia do painel. Prévia que renderiza diferente do site não serve para decidir se publica.
- **"Visualizar" funciona em rascunho** porque a prévia acontece DENTRO do painel, com o post que ele
  já tem em mãos — não abrindo `/blog/<slug>`. Nunca abra uma porta pública para post não publicado.
- **Corpo do post: um campo só por idioma** (`##` abre seção), convertido para seções em `onBlur`
  (`blog/editing.ts`, ida-e-volta testada). Oito caixas para 4 seções em 2 línguas era impraticável;
  HTML livre traria de volta o risco que as seções eliminam.
- **Título de seção do post é FRASE, não rótulo** — por isso `.post-body h2` desliga o `uppercase`
  herdado de `.prose-log h2` e usa a marca `//` vermelha. Em caixa alta, uma frase de três linhas
  deixa de se distinguir do parágrafo e o post vira "texto corrido".
- **Bancada de layout do painel**: `npm run dev` → `/dev-admin.html` monta lista, editor, config e
  prévia com dados de exemplo. O painel real exige login com Google, o que impede conferir telas
  estreitas durante o desenvolvimento. Não entra no build (o Vite só empacota o `index.html`).

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

# Deploy completo: build+testes do front → Cloud Run → shell no GCS → Hosting → refresh do cache
./deploy.sh        # carrega o .env sozinho (set -a); firebase via npx firebase-tools@14

# Blog: migrar posts antigos (uso único) e forçar uma batida do agendador
cd api && GOOGLE_CLOUD_PROJECT=rodrigo-matheus python migrate_posts.py --dry
curl -X POST "https://rodrigomatheus.com.br/api/blog/tick?key=$BLOG_TICK_KEY"

# Rebuild do cache do GitHub
curl "https://rodrigomatheus.com.br/api/refresh?key=$REFRESH_KEY"
```

## Armadilhas reais (verificadas no código)

- **O `deploy.sh` carrega o `.env` sozinho** (`set -a; source .env; set +a`). Antes era preciso
  `source .env` antes de chamar — e como o arquivo usa `KEY=valor` sem `export`, as variáveis não
  atravessavam para o subshell e o passo de env vars era pulado **em silêncio**. Já mordeu uma vez.
- **`gcloud run deploy --source` reseta as env vars.** Por isso o `deploy.sh` as reaplica num segundo passo (`services update`). Não junte os dois passos.
- **O README está desatualizado:** documenta `GET /api/repos`, mas a rota real em `api/server.py` é `GET /api/data`. `/api/repos` dá 404 no Flask.
- **O blog não usa mais `web/public/blog/posts.json`** — os posts vivem no Firestore. O arquivo foi
  removido; `migrate_posts.py` levou os três antigos para lá.
- **Textos do site não estão no HTML.** A cópia pt/en vive em `api/i18n/*.json` e chega pelo `/api/data` — mudar texto é alteração de **backend**, e exige redeploy do Cloud Run.
- **Cache é a fonte da verdade.** `/api/data` nunca chama o GitHub; só lê o cache. Dados novos só aparecem após `/api/refresh`.
- `site/index.html` e `site/blog/index.html` têm CSS e JS **inline**. Não existe bundler — edite no lugar.
- `github_cache.json` na raiz é artefato local e está no `.gitignore`.

## Testes

```bash
cd api && source .venv/bin/activate && pytest      # 204 testes
cd web && npm test                                  # 195 testes
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
- **Toda passagem loop ↔ clipe é UMA rampa só.** Quem varia de opacidade é sempre só o clipe: ele
  esmaece para dentro sobre a origem e para fora sobre o destino, mesma duração nas duas pontas
  (`CLIP_FADE_MS` em `src/stage/timing.ts`, sincronizado com o CSS por `timing.test.ts`). O que está
  embaixo já está opaco — garantido por `src/stage/layerPlan.ts` (puro, testado; `Stage` não decide
  visibilidade sozinho), cuja invariante é "o que está debaixo do clipe é o destino dele".
  **Duas rampas sobrepostas com durações diferentes é o bug a evitar** — foi o que o PO reportou como
  "efeito de iluminação". Corolário: o destino só é revelado quando o clipe está OPACO (`clipCovering`,
  não `clipStarted`), senão a cena de chegada pisca antes da viagem.
- **A camada do clipe de transição não tem still por baixo — se o `<video>` dela ficar transparente, a
  viagem inteira some e vira corte seco.** Foi o bug que escondeu TODAS as transições: `.stage-video
  { opacity: 0 }` vem depois de `.stage-trans-video { opacity: 1 }` com a mesma especificidade e vencia.
  Hoje `.stage-trans .stage-video` (duas classes) garante o `opacity: 1`, com regressão em
  `src/styles/stage-css.test.ts`. **Lição de depuração:** "o vídeo está tocando" não prova que ele
  aparece — confira o `opacity` computado do `<video>`, não só o da camada.
- **Todo CSS próprio vive em `@layer`** (`base` para elementos, `components` para `.panel/.chip/.cta`…).
  Fora de layer ele vence as utilities do Tailwind v4 e quebra `md:hidden`, `text-*`, `!bg-*` em silêncio.
- **`backdrop-filter` vira containing block de `fixed`.** Overlays (menu mobile) saem por `createPortal(document.body)`.
- **`.cta-primary` precisa vencer o `.cta` glass.** A regra glass é `.cta:not(.cta-primary)`; se
  voltar a ser `.cta` puro, o LinkedIn fica branco no branco de novo.
- **Screenshot full-page do Chrome mente nesta página** (hero `100svh` + `body::before` fixo).
  Verifique por viewport ou fatie em tiles.
- **A câmera REFAZ o caminho na volta.** `stepToward(from, to)` devolve UM passo, e a máquina emenda o
  próximo a cada pouso: da última seção para a primeira ela anda mãos → punho → cérebro → coração →
  pescoço → olhos, em vez de cortar para o busto e pular. Verificado em produção. Só o topo da página
  (hero) é alcançado pelo clipe parte → busto, porque é o clipe que existe. Custo: a volta inteira leva
  ~16 s de vídeo (5 trechos), o que é o ponto — é uma viagem, não um corte.
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
- **Cada take do Veo custa dinheiro — um rejeitado custa igual a um aprovado.** 8 s ≈ US$ 3 (~R$ 17);
  o projeto já gastou ~R$ 430 em 23 takes, ~R$ 50 deles em takes descartados. Antes de gerar: escreva o
  prompt com percurso explícito (a câmera nunca para, com pontos de passagem) e negative prompt com
  `dissolve, cross-fade, static camera, slow motion`. Depois de gerar: **sempre**
  `node scripts/contact-sheet.mjs /tmp/sheet.jpg .gen/<take>.mp4` e olhe os 6 quadros — se o meio repete
  as pontas, o Veo fez um dissolver, não uma viagem, e o clipe não serve. Interpolar/reempacotar com
  ffmpeg é de graça; regerar não é.
- **A chave do Gemini é do projeto `rodrigo-matheus`, criada por API e restrita ao Gemini**
  (`gcloud`/REST em `apikeys.googleapis.com`, display name `blog-gemini`). Vive em `web/.env.local`
  (scripts locais), em `.env` (deploy) e como env var do Cloud Run — nunca em flag de CLI, nunca no
  código. **O teto de gastos é por PROJETO:** uma chave de outro projeto ignora o limite ajustado no
  AI Studio de `rodrigo-matheus` e volta 429 dizendo "monthly spending cap" — foi exatamente o que
  aconteceu, porque a chave original pertencia a outro projeto. Ao ver esse 429, confira de qual
  projeto é a chave ANTES de mexer no limite.
