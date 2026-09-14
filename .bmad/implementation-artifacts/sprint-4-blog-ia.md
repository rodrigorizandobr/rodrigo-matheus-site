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

## Pendências que dependem do PO

1. **Teto de gastos do Gemini** estourado (o mesmo dos vídeos) — a geração devolve 429 até ser
   ajustado em https://ai.studio/spend. O caminho está validado: o erro vira 502 no painel, com a
   mensagem da cota.
2. **Login com Google** precisa ser habilitado uma vez no console do Firebase: a API exige um
   `client_id` OAuth que só o console cria automaticamente. Identity Platform já foi inicializado e
   os domínios de produção já estão autorizados.
