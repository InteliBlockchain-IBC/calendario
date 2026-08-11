import { describe, it, expect } from 'vitest'
import { navGroups, activeHref } from './nav'

const GRUPOS = navGroups('ibc')

describe('navGroups', () => {
  it('todo href é escopado no calendário', () => {
    // Item de menu apontando para fora de /admin/<slug> levaria o admin de um
    // calendário para o de outro, ou para rota que não existe.
    const allItems = GRUPOS.flatMap((g) => g.items)
    expect(allItems.length).toBe(3)

    for (const group of GRUPOS) {
      for (const item of group.items) {
        expect(item.href === '/admin/ibc' || item.href.startsWith('/admin/ibc/')).toBe(true)
      }
    }
  })
})

describe('activeHref', () => {
  it('acende o item cujo href é exatamente o pathname', () => {
    expect(activeHref('/admin/ibc/contatos', GRUPOS)).toBe('/admin/ibc/contatos')
  })

  it('entre dois itens que casam, ganha o mais específico', () => {
    // '/admin/ibc' (Eventos) também casa com '/admin/ibc/contatos' por
    // prefixo. Sem a regra do href mais longo, dois itens acendem juntos.
    expect(activeHref('/admin/ibc/conectar', GRUPOS)).toBe('/admin/ibc/conectar')
  })

  it('subrota sem item próprio acende o item mais próximo', () => {
    // É o que mantém "Eventos" aceso na tela de editar evento
    // (/admin/ibc/eventos/<id>, criada na Parte 2) e no fluxo de OAuth.
    expect(activeHref('/admin/ibc/eventos/evt-1', GRUPOS)).toBe('/admin/ibc')
    expect(activeHref('/admin/ibc/conectar/start', GRUPOS)).toBe('/admin/ibc/conectar')
  })

  it('calendário parecido não acende nada', () => {
    // Sem a barra no prefixo, '/admin/ibc-2' casaria com '/admin/ibc' e o
    // menu de um calendário apareceria aceso dentro de outro.
    expect(activeHref('/admin/ibc-2', GRUPOS)).toBeNull()
    expect(activeHref('/admin/ibc-2/contatos', GRUPOS)).toBeNull()
  })

  it('rota fora do admin não acende nada', () => {
    expect(activeHref('/meus', GRUPOS)).toBeNull()
  })
})
