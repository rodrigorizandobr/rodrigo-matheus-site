/**
 * O fio sublinha o FIM da manchete. Para isso as últimas palavras ficam num bloco que não quebra de
 * linha — e por isso o bloco é curto: no celular a manchete é enorme e um bloco comprido estouraria a tela.
 */
const MAX_TAIL = 14

export function splitTail(title: string): [string, string] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['', '']
  let cut = words.length - 1
  let size = words[cut].length
  while (cut > 0 && size + 1 + words[cut - 1].length <= MAX_TAIL) {
    cut--
    size += 1 + words[cut].length
  }
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
}
