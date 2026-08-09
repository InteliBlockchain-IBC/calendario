import { describe, it, expect } from 'vitest'
import { validateSlug } from './create-calendar'

describe('validateSlug', () => {
  it('aceita slug válido', () => {
    expect(() => validateSlug('ibc')).not.toThrow()
    expect(() => validateSlug('inteli-blockchain')).not.toThrow()
  })

  it('rejeita slug reservado', () => {
    for (const reserved of ['admin', 'api', 'embed', 'c', 'login', 'auth']) {
      expect(() => validateSlug(reserved)).toThrow(/reservado/i)
    }
  })

  it('rejeita slug com formato inválido', () => {
    expect(() => validateSlug('IBC')).toThrow(/formato/i)
    expect(() => validateSlug('com espaço')).toThrow(/formato/i)
    expect(() => validateSlug('a')).toThrow(/formato/i)
    expect(() => validateSlug('com_underscore')).toThrow(/formato/i)
  })
})
