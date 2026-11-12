/** Quanto os preços subiram do início do plano até o mês `mes`. */
export const fatorPreco = (mes: number, ipcaAno: number): number => Math.pow(1 + ipcaAno / 100, mes / 12)

/** Um valor do mês `mes` trazido para o poder de compra de hoje. */
export const emReaisDeHoje = (valor: number, mes: number, ipcaAno: number): number => valor / fatorPreco(mes, ipcaAno)
