import { describe, it, expect } from 'vitest'
import { adminPath, parseAdminPath, previewPath, resolvePreview } from './adminRoute'

describe('URL do painel', () => {
  it.each([
    ['/admin', { tab: 'posts', editId: null, previewId: null }],
    ['/admin/', { tab: 'posts', editId: null, previewId: null }],
    ['/admin/midia', { tab: 'media', editId: null, previewId: null }],
    ['/admin/configuracao', { tab: 'config', editId: null, previewId: null }],
    ['/admin/editar/abc123', { tab: 'posts', editId: 'abc123', previewId: null }],
    ['/admin/visualizar/abc123', { tab: 'posts', editId: null, previewId: 'abc123' }],
  ])('%s', (path, view) => {
    expect(parseAdminPath(path)).toEqual(view)
  })

  it('caminho desconhecido cai na lista de posts', () => {
    expect(parseAdminPath('/admin/qualquer/coisa')).toEqual({ tab: 'posts', editId: null, previewId: null })
  })

  it('ida e volta', () => {
    for (const p of ['/admin', '/admin/midia', '/admin/configuracao', '/admin/editar/x1', '/admin/visualizar/x1']) {
      expect(adminPath(parseAdminPath(p))).toBe(p)
    }
  })

  it('id com caractere estranho é codificado', () => {
    expect(previewPath('a/b')).toBe('/admin/visualizar/a%2Fb')
    expect(parseAdminPath('/admin/visualizar/a%2Fb').previewId).toBe('a/b')
  })
})

describe('prévia: texto não salvo da cópia, o resto do servidor', () => {
  const pending = { id: '1', clip: { status: 'pending' }, i18n: { pt: { title: 'velho' } }, tags: ['a'] }
  const ready = { id: '1', clip: { status: 'ready', hash: 'abc' }, i18n: { pt: { title: 'salvo' } }, tags: ['a'] }

  it('recorte que ficou pronto depois de a cópia ser guardada aparece na prévia', () => {
    const out = resolvePreview(ready, pending)
    expect(out?.clip).toEqual({ status: 'ready', hash: 'abc' })
  })

  it('o texto digitado e não salvo vem da cópia', () => {
    const out = resolvePreview(ready, { ...pending, i18n: { pt: { title: 'rascunho digitado' } }, tags: ['b'] })
    expect(out?.i18n).toEqual({ pt: { title: 'rascunho digitado' } })
    expect(out?.tags).toEqual(['b'])
  })

  it('sem cópia, vale o post do servidor; sem servidor ainda, vale a cópia; sem nada, nulo', () => {
    expect(resolvePreview(ready, null)).toBe(ready)
    expect(resolvePreview(undefined, pending)).toBe(pending)
    expect(resolvePreview(undefined, null)).toBeNull()
  })
})
