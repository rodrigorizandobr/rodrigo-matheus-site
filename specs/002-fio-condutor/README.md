# 002 — Fio condutor (site v4)

Aprovado pelo PO em 2026-11-16, depois de ver o protótipo e mais três direções (bancada,
manchete por tela, robô em tomada única). Protótipo: https://claude.ai/artifact/9NBWQ2avtbcgj9y15xtpYE

## A ideia

O site abre no post mais recente. Um único fio vermelho, desenhado pelo navegador, desce a
página inteira: sublinha a manchete, contorna a capa, prende cada post num alfinete, vira a
curva do simulador e a linha da carreira, e termina emendado no fio da foto (a mão do androide).
Nada de vídeo emendado: a diferença de tom entre clipes do robô era o problema que motivou a troca.

Ordem da home: **blog → utilitários → currículo**.

## Decisões

| Tema | Decisão |
|---|---|
| Home do robô | Sai. O androide fica como foto no fim da home. Os vídeos de transição são aposentados. |
| Seções antigas (sobre, experiência completa, projetos, formação, contato) | Vão para `/curriculo`, sem perder conteúdo. |
| Assuntos do "puxe um fio" | Saem das tags dos posts (as mais frequentes), sem cadastro manual. |
| Prévia do simulador | Usa o motor real (`simulateMonthly` + `aplicarRegras`), carregado sob demanda. |
| Idioma | pt e en, como o resto do site. Sem escolha salva, segue o idioma do navegador. |
| Movimento | Fio desenhado conforme a rolagem; o ponteiro dedilha (mola). `prefers-reduced-motion`: fio inteiro, parado. |
| Som | Mesmo botão do cabeçalho; a corda só toca com o som ligado. |
| Capas | Todo post novo leva um fio vermelho (feito em 2026-11-16, commit `642197e`). |

## Peças

| Peça | Onde | Papel |
|---|---|---|
| Geometria do fio | `web/src/thread/geometry.ts` | Pura e testada: trechos, caminho SVG, quanto revelar, mola, cruzamento do ponteiro. |
| Fio | `web/src/thread/Thread.tsx` | SVG por cima da página; laço de animação que dorme quando nada se mexe. |
| Rota do fio | `web/src/thread/routes.ts` | Lê os elementos marcados com `data-fio` e devolve os pontos, em ordem. |
| Home | `web/src/pages/HomePage.tsx` + `web/src/home/` | Capa, lista, utilitários, carreira, final. |
| Assuntos | `web/src/home/topics.ts` | Pura e testada. |
| Marcos da carreira | `web/src/home/career.ts` | Pura e testada; os textos vêm do i18n. |
| Prévia | `web/src/home/previa.ts` | Embrulha o motor do simulador. |
| Currículo | `web/src/pages/CurriculoPage.tsx` | As seções antigas da home. |

## Etapas

1. **Home nova no ar** (esta entrega): fio, home, cabeçalho, `/curriculo`, pt/en.
2. **Leitura do post**: fio acompanhando o texto, pergunta final em destaque, "Responder no LinkedIn"
   apontando para o post (exige expor o link do LinkedIn na API pública) e lista `/blog` no visual novo.
3. **Limpeza**: remover `src/stage/`, o hero antigo, os vídeos em `public/` e os testes deles; imagem de
   prévia de link (OG) nova.

## Fora de escopo

Áudio do post com voz clonada (ideia registrada, sem data). Redesenho dos simuladores e do painel.
