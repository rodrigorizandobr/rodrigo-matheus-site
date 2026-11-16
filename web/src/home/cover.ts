import { clipUrl, coverUrl, type Post } from '../blog/types'

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A capa que a home mostra para um post — ou `null`. Capa da casa (a maquete com o fio vermelho) entra;
 * quadro de vídeo de terceiros, não: é miniatura de YouTube, com rosto e letreiro de outro canal, e
 * quebra a direção de arte da página. A API pública não diz de onde a capa veio (de propósito), então o
 * sinal é o que a rotina de recorte deixa: post com recorte pronto cuja descrição da imagem é o próprio
 * título. Paliativo: some quando esses posts ganharem capa própria.
 */
export function homeCover(post: Post): string | null {
  const image = post.image ?? null
  if (!image) return null
  const isVideoFrame = !!clipUrl(post.clip) && (same(image.alt, post.i18n?.pt?.title) || same(image.alt, post.i18n?.en?.title))
  return isVideoFrame ? null : coverUrl(image)
}
