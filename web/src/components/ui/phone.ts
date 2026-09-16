/**
 * Telefone de contato em pedaços, pelo mesmo motivo do e-mail (ver `email.ts`).
 *
 * Robô de spam e de discagem varre o HTML servido atrás de `tel:` e de sequências
 * com cara de telefone. Guardando em partes — e sem o `+55` nem o bloco `9418`
 * inteiro em lugar nenhum do arquivo —, o número só existe depois que o React
 * monta o link no navegador.
 */
export const PHONE_PARTS = { country: '5' + '5', area: '11', first: '941', second: '80', third: '07' + '66' } as const

const digits = (): string =>
  `${PHONE_PARTS.country}${PHONE_PARTS.area}${PHONE_PARTS.first}${PHONE_PARTS.second}${PHONE_PARTS.third}`

/** Como se lê: +55 11 94180-0766 */
export const assemblePhone = (): string =>
  `+${PHONE_PARTS.country} ${PHONE_PARTS.area} ${PHONE_PARTS.first}${PHONE_PARTS.second}-${PHONE_PARTS.third}`

export const telHref = (): string => `tel:+${digits()}`

export const whatsappHref = (): string => `https://wa.me/${digits()}`
