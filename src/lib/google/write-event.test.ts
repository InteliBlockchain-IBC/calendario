import { describe, it, expect } from 'vitest'
import { toGooglePayload } from './write-event'

const baseDraft = {
  title: 'Aula de Tokenização',
  description: null,
  location: null,
  attendeeEmails: [],
}

describe('toGooglePayload', () => {
  it('evento com horário usa dateTime + timeZone, sem tocar em date', () => {
    const payload = toGooglePayload(
      {
        ...baseDraft,
        allDay: false,
        startsAt: new Date('2026-08-12T22:00:00.000Z'),
        endsAt: new Date('2026-08-13T00:00:00.000Z'),
      },
      'America/Sao_Paulo',
    )

    expect(payload.start).toEqual({
      dateTime: '2026-08-12T22:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    })
    expect(payload.end).toEqual({
      dateTime: '2026-08-13T00:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
    })
  })

  it('dia inteiro no mesmo dia soma 1 em end.date (end é exclusivo no Google)', () => {
    const payload = toGooglePayload(
      {
        ...baseDraft,
        allDay: true,
        // 21h em America/Sao_Paulo (UTC-3) já é o dia seguinte em UTC —
        // é justamente o caso que quebrava antes do fix.
        startsAt: new Date('2026-08-12T23:30:00.000Z'), // 2026-08-12 20:30 -03:00
        endsAt: new Date('2026-08-12T23:30:00.000Z'),
      },
      'America/Sao_Paulo',
    )

    expect(payload.start).toEqual({ date: '2026-08-12' })
    expect(payload.end).toEqual({ date: '2026-08-13' })
  })

  it('dia inteiro de vários dias soma 1 ao último dia, não ao primeiro', () => {
    const payload = toGooglePayload(
      {
        ...baseDraft,
        allDay: true,
        startsAt: new Date('2026-08-17T12:00:00.000Z'),
        endsAt: new Date('2026-08-19T12:00:00.000Z'),
      },
      'America/Sao_Paulo',
    )

    expect(payload.start).toEqual({ date: '2026-08-17' })
    expect(payload.end).toEqual({ date: '2026-08-20' })
  })

  it('data de dia inteiro é calculada no fuso do calendário, não em UTC', () => {
    // 2026-08-13T02:00:00Z é 2026-08-12 23:00 em America/Sao_Paulo (UTC-3):
    // toISOString().slice(0,10) sozinho erraria para '2026-08-13'.
    const payload = toGooglePayload(
      {
        ...baseDraft,
        allDay: true,
        startsAt: new Date('2026-08-13T02:00:00.000Z'),
        endsAt: new Date('2026-08-13T02:00:00.000Z'),
      },
      'America/Sao_Paulo',
    )

    expect(payload.start).toEqual({ date: '2026-08-12' })
    expect(payload.end).toEqual({ date: '2026-08-13' })
  })
})
