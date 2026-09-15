/**
 * Endereço de contato em pedaços.
 *
 * Coletor de spam varre o HTML servido atrás de `mailto:` e de qualquer coisa com
 * arroba. Como o HTML entregue é o shell do SPA, basta o endereço nunca existir
 * inteiro nele: ele é montado no navegador, depois que o React monta o link. Não é
 * criptografia — é tirar o alvo da varredura barata, que é de onde vem quase todo spam.
 */
export const EMAIL_PARTS = { user: 'rodrigorizando', domain: 'gmail', tld: 'com' } as const

export const assembleEmail = (): string =>
  `${EMAIL_PARTS.user}@${EMAIL_PARTS.domain}.${EMAIL_PARTS.tld}`

export const mailtoHref = (subject?: string): string =>
  `mailto:${assembleEmail()}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
