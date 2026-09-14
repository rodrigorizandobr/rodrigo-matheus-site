# Sprint 4 — Blog gerenciado por IA

**Pedido (2026-09-14):** blog totalmente gerenciado pela IA via API do Gemini, sempre Flash Lite,
imagens de banco ou geradas por IA, posts concisos e profundos, área logada com Firebase Auth
(Google, `rodrigorizando@gmail.com`) para gestão completa. Referência de estrutura: `../monster-jobs`.

## Decisões fechadas com o PO

| Tema | Decisão | Motivo |
|---|---|---|
| Banco | **Firestore** (habilitado e criado em `nam5`) | Agendamento pede consulta ("o que vence agora") e escrita concorrente; cabe na cota gratuita. |
| Imagens | **IA com Pixabay como reserva** | Foto de banco destoa do laboratório branco; a IA usa a direção de arte do site. |
| Fluxo | **Rascunho + agendamento configurável** | PO quer escolher publicar em X dias às 8h, ou automático, e a hora de gerar. |
| Idiomas | **pt+en na mesma geração** | O site é bilíngue; duas chamadas dobram o custo e divergem o conteúdo. |

## O que ficou pronto

- `api/blog/` — 7 módulos, **122 testes** novos (145 no total em `api/`).
- `web/src/blog/` + `/admin` — **166 testes** no front; painel em chunk separado (34 kB gzip),
  o bundle principal até **diminuiu** (329 → 308 kB) porque o DOMPurify saiu junto com o HTML dos posts.
- Firestore com regras que **negam todo acesso do cliente** (só a API escreve).
- Cloud Scheduler `blog-tick` de hora em hora.
- `/blog/<slug>` e `/sitemap.xml` servidos pelo Cloud Run com as metatags do momento.
- Os 3 posts da v2 migrados (HTML → seções) e publicados.

## Erro de infraestrutura encontrado no caminho

`source .env && ./deploy.sh` **nunca funcionou** como o `CLAUDE.md` mandava: o `.env` usa
`KEY=valor` sem `export`, então as variáveis não atravessavam para o subshell do script e o passo
de env vars era pulado com um aviso fácil de não ver — o Cloud Run rodava com o que sobrou do deploy
anterior. Agora o `deploy.sh` carrega o arquivo sozinho com `set -a`.

## Pendências resolvidas depois

1. **Login com Google** — habilitado pelo PO no console; confirmado via API (`google.com: enabled`).
2. **429 de cota mesmo após o PO subir o limite para US$ 10.** Causa: a chave em uso pertencia a
   OUTRO projeto, e o teto de gastos é por projeto — o limite ajustado em `rodrigo-matheus` não
   valia para ela. Correção: `generativelanguage` e `apikeys` habilitadas em `rodrigo-matheus` e uma
   chave nova (`blog-gemini`, restrita ao Gemini) criada por API; trocada no `.env`, no
   `web/.env.local` e no Cloud Run. **Nota de gcloud:** `gcloud services api-keys create` falha com
   `SERVICE_DISABLED` apontando um projeto de quota que não é o nosso; o caminho que funciona é o
   REST `apikeys.googleapis.com` com o header `x-goog-user-project`.

## Validação de ponta a ponta (2026-09-14)

Post gerado de verdade: 582 palavras em pt, 534 em en, 4 tags, capa gerada pelo Gemini na direção
de arte do site (laboratório branco, vermelho como único acento), agendado automaticamente para
2 dias depois às 8h de São Paulo, conforme a configuração padrão.

## Revisão de responsividade e prévia (2026-09-14, tarde)

Reportado pelo PO no celular: painel "estourado", falta de botão visualizar, um vazio no topo da
página do post, e a sensação de que o post era "texto corrido" apesar de ter seções.

| Achado | Causa | Correção |
|---|---|---|
| Meia tela de vazio no topo do blog e do painel | `main { padding-top: var(--stage-h) }` valia para TODA página abaixo de 1024px, mas só a home tem a banda do robô | `main[data-stage="true"]` |
| "Texto corrido" | `.prose-log h2` forçava `uppercase`, herdado do blog v2; títulos que são frases viravam 3 linhas em caixa alta e sumiam no meio do parágrafo | `.post-body h2` sem uppercase, com a marca `//` vermelha e respiro maior entre seções |
| Sem visualizar | não existia | Prévia dentro do painel (lista e editor), usando o MESMO renderizador da página pública; funciona em rascunho sem abrir porta pública |
| Editor pesado no celular | uma caixa por seção = 8 caixas para 4 seções em 2 idiomas | Um campo por idioma, `##` abre seção; conversão testada nos dois sentidos |
| Lista espremida | linha única com miniatura + título + 3 botões | Empilha abaixo de `sm`, botões ocupando a largura |

Capa passou para o topo do post, em largura total, como o PO pediu.

Verificado a 390 px com uma bancada de layout nova (`/dev-admin.html`, só em dev): sem rolagem
horizontal e sem elemento estourando, na lista, no editor, na configuração e na prévia.

## Segunda rodada de pedidos do PO (2026-09-14, noite)

1. **"LOGS" → "Posts"** no blog e na home. No caminho apareceu uma regressão minha: a seção do blog
   na home ainda lia `posts.json`, removido na migração para o Firestore — estava vazia. Passou a ler a API.
2. **Publicar/despublicar direto na lista**, sem abrir o editor.
3. **Configuração refeita**: três blocos (sobre o que escrever · pesquisa · quando publicar), cada campo
   com explicação. O PO perguntou o que era "Pauta" — sinal claro de que o rótulo sozinho não bastava.
4. **Aba Mídia**: biblioteca com upload, criação por IA, busca no banco de imagens, edição de legenda e
   exclusão (bloqueada quando a imagem está em uso).
5. **Seletor de capa no post** com as mesmas quatro origens — `ImageSources` é um componente só, usado
   pela aba Mídia e pelo seletor, para nenhuma origem existir só de um lado.
6. **Pesquisa na web opcional** (Serper + leitura de páginas), com escolha por post e padrão na config.
7. **Posts a partir de notícias** dos termos vigiados, editáveis no painel, em rodízio.

Validado em produção: pesquisa real devolveu 13 fontes e 4 páginas lidas; post gerado a partir de
notícias de IA saiu com tese própria, 8 fontes registradas, capa gerada e agendamento automático.

Observação para depois: o post de notícia saiu com 469 palavras, abaixo da faixa de 600–900 pedida no
prompt. Não é erro de código — é calibragem de prompt, e só dá para ajustar vendo mais amostras.

## Terceira rodada (2026-09-14, madrugada)

- **Fontes em ABNT** no fim de todo post (NBR 6023, documento on-line), com link. Posts anteriores,
  que só tinham URLs, continuam citáveis — o site sai do domínio.
- **Serper passou para o endpoint `/news`**, `gl=br`/`hl=pt-br`: a busca web trazia página institucional
  e conteúdo antigo bem ranqueado; agora vêm veículos brasileiros com data ("há 6 horas").
- **Só página lida vira referência.** Antes, todo link consultado era citado — inclusive os que o
  crawler não conseguiu abrir.
- **Pauta removida do produto.** Sem notícia, o material de apoio passou a ser o **currículo**
  (`profile.py`, lido do mesmo i18n do site).
- **Títulos recentes vão no prompt** para a IA não reescrever o mesmo post.
- **Calibragem de tamanho:** a regra "600–900 palavras" vinha produzindo 469 e depois 286 palavras.
  Trocada por estrutura concreta (4 seções × 3 parágrafos × 70–110 palavras) → 1.149 palavras em pt e
  1.054 em en, medidas em post real. Lição: o modelo executa estrutura, não orçamento de palavras.

### Bug de infraestrutura corrigido no caminho
A página do post servia um shell antigo: `page.py` guardava a cópia do GCS por 5 min em memória e o
deploy publicava essa cópia DEPOIS do Cloud Run — uma requisição no meio do deploy congelava o bundle
anterior. Agora o shell vem do próprio site (mesmo documento que o Hosting entrega), TTL de 60 s, e o
deploy publica a cópia de segurança antes de subir o Cloud Run.
