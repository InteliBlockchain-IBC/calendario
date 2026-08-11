import { describe, it, expect } from 'vitest'
import { toExistingEvents } from './to-existing-events'

const BASE = {
  startsAt: new Date('2026-08-12T22:00:00Z'),
  status: 'CONFIRMED' as const,
}

describe('toExistingEvents', () => {
  it('mantém eventos que vieram do Google', () => {
    const result = toExistingEvents([
      { id: 'a', googleEventId: 'g1', ...BASE },
      { id: 'b', googleEventId: 'g2', ...BASE },
    ])

    expect(result).toHaveLength(2)
    expect(result.map((e) => e.googleEventId)).toEqual(['g1', 'g2'])
  })

  it('DESCARTA evento local (googleEventId nulo)', () => {
    // A regra mais cara desta fase. Um evento nativo nunca volta do Google,
    // então se entrasse na lista a varredura completa o marcaria CANCELLED
    // e ele sumiria do site sem ninguém entender por quê (§5.1).
    const result = toExistingEvents([
      { id: 'do-google', googleEventId: 'g1', ...BASE },
      { id: 'local', googleEventId: null, ...BASE },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('do-google')
    expect(result.map((e) => e.id)).not.toContain('local')
  })

  it('lista só de eventos locais devolve vazio', () => {
    const result = toExistingEvents([
      { id: 'local-1', googleEventId: null, ...BASE },
      { id: 'local-2', googleEventId: null, ...BASE },
    ])

    expect(result).toEqual([])
  })

  it('preserva startsAt e status, que a reconciliação usa', () => {
    const result = toExistingEvents([
      { id: 'a', googleEventId: 'g1', startsAt: BASE.startsAt, status: 'CANCELLED' },
    ])

    expect(result[0].startsAt).toEqual(BASE.startsAt)
    expect(result[0].status).toBe('CANCELLED')
  })
})
