import { describe, it, expect } from 'vitest'
import { decideSync } from './decide-sync'

const NOW = new Date('2026-08-09T12:00:00Z')

function minutesAgo(n: number) {
  return new Date(NOW.getTime() - n * 60 * 1000)
}
function hoursAgo(n: number) {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000)
}

describe('decideSync', () => {
  it('sincronizado há 5 min: não faz nada', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(5), syncingAt: null, now: NOW }),
    ).toBe('skip')
  })

  it('sincronizado há 30 min: sincroniza em segundo plano', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(30), syncingAt: null, now: NOW }),
    ).toBe('background')
  })

  it('sincronizado há 2 dias: sincroniza bloqueando a resposta', () => {
    expect(
      decideSync({ lastSyncedAt: hoursAgo(48), syncingAt: null, now: NOW }),
    ).toBe('blocking')
  })

  it('nunca sincronizado: sincroniza bloqueando a resposta', () => {
    expect(decideSync({ lastSyncedAt: null, syncingAt: null, now: NOW })).toBe('blocking')
  })

  it('lock recente bloqueia um segundo disparo', () => {
    expect(
      decideSync({ lastSyncedAt: hoursAgo(48), syncingAt: minutesAgo(1), now: NOW }),
    ).toBe('skip')
  })

  it('lock antigo não bloqueia', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(30), syncingAt: minutesAgo(5), now: NOW }),
    ).toBe('background')
  })

  it('exatamente no limite de 10 min ainda não dispara', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(10), syncingAt: null, now: NOW }),
    ).toBe('skip')
  })
})
