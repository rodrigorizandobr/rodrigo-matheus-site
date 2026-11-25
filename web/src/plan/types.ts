/** O que as duas páginas de utilitário (imóveis e previdência) têm em comum com o servidor. */
export type TokenGetter = () => Promise<string>

/** O padrão que um visitante vê ao abrir a página. Leitura pública. */
export type DefaultsDoc<P> = { params: P; updatedAt: string | null; custom: boolean }

/** O plano de uma conta. `saved: false` = a conta nunca salvou (os parâmetros são o padrão). */
export type PlanDoc<P> = { params: P; updatedAt: string | null; saved: boolean; isAdmin: boolean }

export type PlanApi<P> = {
  /** Sem login e sem prova do navegador. `fresh` fura a borda de 1 minuto (o administrador editando). */
  getDefaults(fresh?: boolean): Promise<DefaultsDoc<P>>
  getPlan(): Promise<PlanDoc<P>>
  savePlan(params: P): Promise<unknown>
  /** Só o administrador. SUBSTITUI o padrão inteiro. */
  saveDefaults(params: P): Promise<DefaultsDoc<P>>
}
