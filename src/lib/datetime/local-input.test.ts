import { describe, it, expect } from 'vitest'
import { toLocalInput, fromLocalInput } from './local-input'

const SP = 'America/Sao_Paulo' // UTC-3, sem horário de verão desde 2019
const NY = 'America/New_York' // UTC-4 no verão, UTC-5 no inverno

describe('fromLocalInput', () => {
  it('lê o texto como hora de parede do calendário, não do ambiente', () => {
    // O bug: `new Date('2026-08-12T19:00')` usa o fuso de quem está rodando.
    // Um admin em Lisboa digitando 19:00 gravava 18:00Z, que é 15:00 em São
    // Paulo — o evento aparecia quatro horas antes na agenda do clube.
    expect(fromLocalInput('2026-08-12T19:00', SP).toISOString()).toBe('2026-08-12T22:00:00.000Z')
  })

  it('respeita o horário de verão do fuso do calendário', () => {
    expect(fromLocalInput('2026-07-01T12:00', NY).toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(fromLocalInput('2026-01-15T12:00', NY).toISOString()).toBe('2026-01-15T17:00:00.000Z')
  })

  it('aceita valor com segundos, que alguns navegadores enviam', () => {
    expect(fromLocalInput('2026-08-12T19:00:00', SP).toISOString()).toBe(
      '2026-08-12T22:00:00.000Z',
    )
  })

  it('recusa texto que não tem a forma de um datetime-local', () => {
    // Checar só `Number.isNaN(new Date(x).getTime())` não basta: o parser
    // leniente do V8 aceita ':00Z' e 'amanhã:00Z' e devolve
    // 2000-01-01T00:00:00Z em vez de Invalid Date — um campo vazio gravaria
    // um evento no ano 2000 sem erro nenhum.
    expect(() => fromLocalInput('', SP)).toThrow()
    expect(() => fromLocalInput('amanhã', SP)).toThrow()
    expect(() => fromLocalInput('13:00', SP)).toThrow()
    expect(() => fromLocalInput('2026-08-12T25:00', SP)).toThrow()
  })
})

describe('toLocalInput', () => {
  it('mostra a hora de parede do calendário, não a UTC', () => {
    expect(toLocalInput(new Date('2026-08-12T22:00:00Z'), SP)).toBe('2026-08-12T19:00')
  })

  it('meia-noite é 00:00, não 24:00', () => {
    // `hour12: false` devolve '24' para meia-noite em parte das versões do
    // ICU, e '2026-08-12T24:00' é valor inválido para o input.
    expect(toLocalInput(new Date('2026-08-12T03:00:00Z'), SP)).toBe('2026-08-12T00:00')
  })

  it('a data pode ser outra no fuso do calendário', () => {
    // 01:00Z de 13/08 ainda é 22:00 de 12/08 em São Paulo.
    expect(toLocalInput(new Date('2026-08-13T01:00:00Z'), SP)).toBe('2026-08-12T22:00')
  })

  it('respeita o horário de verão do fuso do calendário', () => {
    expect(toLocalInput(new Date('2026-07-01T16:00:00Z'), NY)).toBe('2026-07-01T12:00')
    expect(toLocalInput(new Date('2026-01-15T17:00:00Z'), NY)).toBe('2026-01-15T12:00')
  })
})

describe('ida e volta', () => {
  it('não perde o instante', () => {
    for (const timezone of [SP, NY]) {
      const at = new Date('2026-06-15T18:45:00Z')
      expect(fromLocalInput(toLocalInput(at, timezone), timezone).toISOString()).toBe(
        at.toISOString(),
      )
    }
  })
})
