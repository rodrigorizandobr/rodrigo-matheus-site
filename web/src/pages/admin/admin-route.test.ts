import { describe, it, expect } from 'vitest'
import { adminPath, parseAdminPath, previewPath } from './adminRoute'

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
