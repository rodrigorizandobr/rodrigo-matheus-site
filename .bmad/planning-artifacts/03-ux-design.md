# 03 — UX & Direção de Arte: "Character Sheet"

> Fase 3 do fluxo BMAD. Deriva do PRD (02). Referência visual: motionsites "Robot Battle Arena" (Game UI) traduzida para portfólio executivo.

## 1. Princípios
1. **HUD é DOM.** Tudo que é texto/número/botão é HTML semântico sobre o canvas. Canvas é decoração de alto impacto, nunca portador de informação.
2. **Recrutador em 5s.** Cargo, anos, LinkedIn e CV visíveis acima da dobra, sem depender do 3D carregar.
3. **Uma ideia forte.** O robô. Sem partículas genéricas, sem 3 tipos de glow. Cada efeito precisa justificar-se pela metáfora "ficha de personagem".
4. **Motion com propósito.** Toda animação comunica estado (selecionou classe → robô reage; scroll → próxima "tela").
5. **Degrada com elegância.** Poster estático + HUD idêntico quando não há WebGL.

## 2. Sistema visual

### 2.1 Cor (tokens)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0a0a0f` | fundo (mantido) |
| `--surface` | `#111118` / `--surface-2: #16161f` | painéis do HUD (mantido) |
| `--line` | `#1e1e2e` | bordas finas (mantido) |
| `--text` / `--heading` / `--muted` | `#d4d4dc` / `#eeeef4` / `#6e6e82` | texto (mantido) |
| `--cyan` | `#00f0ff` | **dados**: sparklines, labels técnicos, links |
| `--red` | `#ff2d2d` | **energia/ação**: olhos do robô, classe ativa, barras de stat, CTA primário |
| `--magenta` | `#ff2daa` | acento raro (hover secundário) |
| `--white-armor` | `#e8e8ee` | material do robô, títulos do HUD |

Regra: **vermelho manda no hero, cyan manda nas seções de dados.** Nunca os dois competindo na mesma área.

### 2.2 Tipografia
| Papel | Fonte | Peso/estilo |
|---|---|---|
| HUD display / títulos de seção | **Chakra Petch** | 600–700, uppercase, `letter-spacing: .12em` |
| Números grandes (LEVEL, stats) | **Chakra Petch** | 700, `font-variant-numeric: tabular-nums` |
| Corpo | **Inter** | 400/500 (mantido) |
| Labels técnicos, código, datas | **Fira Code** | 400/500 (mantido — continuidade) |

### 2.3 Formas
- Painéis do HUD: cantos **chanfrados** (clip-path 45° em 1 canto), borda 1px `--line`, fundo `--surface` 70% + `backdrop-blur(8px)`.
- Barras de stat: trilho 2px `--line`, preenchimento `--red` com brilho `0 0 12px --red/40`.
- Marcadores decorativos: `▸`, `//`, `[ ]`, `—` (herdados da estética atual).

## 3. Layout — Hero "Character Select" (desktop ≥ 1024px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ rodrigo_matheus            ABOUT  CAMPAIGNS  ARENA  TRAINING  LOGS   PT │  header sticky
├──────────────┬──────────────────────────────────────┬────────────────────┤
│ CLASSES S—A  │                                      │  LEVEL        22   │
│ ┌──────────┐ │                                      │  ─────────────     │
│ │▸ ENG.    │ │            [ ROBÔ 3D ]               │  RODRIGO MATHEUS   │
│ │  MANAGER │ │        idle · olha o cursor          │  Engineering Mgr   │
│ │  ACTIVE  │ │        olhos vermelhos + bloom       │  Class S           │
│ ├──────────┤ │                                      │                    │
│ │  AI      │ │                                      │  LEADERSHIP ███ 40+│
│ │  STRATEG.│ │                                      │  COMMAND    ███ 16+│
│ ├──────────┤ │                                      │  AI/ML      ██░ ▲  │
│ │  PLATFORM│ │                                      │  ARCHITECT. ███    │
│ │  ARCHIT. │ │                                      │                    │
│ ├──────────┤ │                                      │  SKILLS            │
│ │  FINTECH │ │                                      │  [◆][◆][◆]         │
│ └──────────┘ │                                      │                    │
│              │                                      │  [LINKEDIN][CV][GH]│
│              │          "Strong engineering, clear  │                    │
│              │           direction, measurable      │                    │
│              │           results."                  │        [ START ▶ ] │
└──────────────┴──────────────────────────────────────┴────────────────────┘
```

- Canvas ocupa a coluna central inteira (e vaza por baixo dos painéis com blur).
- Título (H1) fica **no DOM**, sobreposto na base da coluna central — é o LCP textual.
- Coluna esquerda: `<nav aria-label="Classes">` com `<button aria-pressed>`.
- Coluna direita: `<section aria-live="polite">` — troca de classe atualiza texto.

### 3.1 Tablet (768–1023px)
Grade 2 colunas: robô em cima (60vh), HUD esquerdo vira **chips horizontais** roláveis, HUD direito embaixo.

### 3.2 Mobile (< 768px)
- Robô: 45vh, câmera mais próxima (busto). GPU tier ≤ 1 → poster.
- Classes: chips horizontais com scroll-snap.
- Stats: lista vertical compacta. CTAs full-width, empilhados.
- `START` some; scroll natural.

## 4. Interações do hero

| Gatilho | Resposta (canvas) | Resposta (DOM) | GA |
|---|---|---|---|
| Carregou | Robô entra com fade + `Idle`; HUD faz stagger de 60ms por painel; barras preenchem em 900ms `power3.out` | — | `page_view` |
| Mouse move | Cabeça segue cursor (lerp 0.08, limite ±35°) | — | — |
| Hover classe | Robô vira levemente para o painel | Painel eleva 2px, borda `--red` | — |
| Click classe | Gesto curto (`Wave`/`ThumbsUp`/`Punch` conforme classe) então volta a `Idle` | Painel direito re-anima (texto + barras) | `class_select {class}` |
| Click robô | `Jump` ou `Dance` (easter egg, 1× por sessão com toast) | — | `robot_interact` |
| Click START | — | Lenis scroll → About | `cta_start` |
| Idle 12s | Robô faz `Yes`/olha em volta | — | — |
| Tab/foco teclado | igual hover | outline `--red` 2px | — |
| `prefers-reduced-motion` | Só `Idle`, sem head-tracking | Sem stagger | — |

## 5. Seções (as "telas")

| Seção | Título HUD | Padrão | Motion (ScrollTrigger) |
|---|---|---|---|
| About | `// BIO` | Foto real (cutout atual) à esquerda em moldura chanfrada; lead; grade de 10 SKILLS com ícone | Foto: clip-path reveal; pills: stagger 40ms |
| Experience | `// CAMPAIGNS · 16` | Timeline vertical, linha central `--line`, cards alternados; card atual com badge `ACTIVE` pulsando `--red` | Cada card: `y:40→0, opacity` ao entrar em 80% do viewport; linha "desenha" com scrub |
| Projects | `// ARENA` | Grid responsivo de cards de loot: nome, descrição, linguagem (cor por linguagem = "elemento"), stars = raridade (★ 0–2 comum, 3–9 raro, 10+ lendário — borda dourada), sparkline cyan, 5 commits ao expandir | Cards: scale `.96→1` stagger; sparkline "desenha" (`stroke-dashoffset`) |
| Education | `// TRAINING` | 4 cards em linha, ícone de instituição | fade-up |
| Contact | `// JOIN PARTY` | Card centralizado, botão e-mail `--red` | fade-up |
| Blog | `// LOGS` | Lista com data mono + título; página de post com prosa `max-width: 68ch` | fade-up |
| Footer | `rodrigo.matheus // engineering · ai · strategy` | mantido | — |

## 6. Estados
- **Loading do GLB:** HUD já visível; no centro, barra fina `--red` com `%` (drei `useProgress`) e texto mono `LOADING PILOT…`. Nunca tela cheia bloqueando.
- **Sem WebGL / GPU fraca / reduced-motion:** `<img>` poster do robô (mesmo enquadramento) com leve parallax CSS. HUD idêntico.
- **`/api/data` falhou:** Arena mostra `// ARENA OFFLINE — retry` com botão; resto do site funciona (i18n vem embutido no build como fallback).
- **Repo sem commits 28d:** sparkline plana com label `dormant`.

## 7. Acessibilidade
- Canvas `aria-hidden="true"`; parágrafo visually-hidden descreve: "Robô 3D branco com olhos vermelhos, avatar de Rodrigo".
- Ordem de foco: header → classes → stats/CTAs → START → conteúdo.
- Contraste: `--muted` sobre `--surface` ajustado para ≥ 4.5:1 (hoje 3.9:1 — **corrigir**: `#8a8aa0`).
- Todas as animações respeitam `prefers-reduced-motion`.
- Idioma: `<html lang>` troca com o toggle; conteúdo alternativo não é escondido do leitor de tela.

## 8. Poster/LCP
- Gerado no build (Playwright screenshot da cena a 1200×900, WebP + PNG fallback) → `public/robot-poster.webp`.
- É a imagem LCP no mobile e o `og:image` do site.
