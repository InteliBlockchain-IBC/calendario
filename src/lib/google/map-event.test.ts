import { describe, it, expect } from 'vitest'
import { mapGoogleEvent } from './map-event'

describe('mapGoogleEvent', () => {
  it('mapeia evento com horário', () => {
    const result = mapGoogleEvent({
      id: 'g1',
      summary: 'Aula de Tokenização',
      description: 'link do meet',
      location: 'Sala 401',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result).not.toBeNull()
    expect(result!.googleEventId).toBe('g1')
    expect(result!.title).toBe('Aula de Tokenização')
    expect(result!.allDay).toBe(false)
    expect(result!.startsAt.toISOString()).toBe('2026-08-12T22:00:00.000Z')
    expect(result!.status).toBe('CONFIRMED')
  })

  it('mapeia evento de dia inteiro', () => {
    const result = mapGoogleEvent({
      id: 'g2',
      summary: 'Semana de projetos',
      status: 'confirmed',
      start: { date: '2026-08-17' },
      end: { date: '2026-08-22' },
    })

    expect(result!.allDay).toBe(true)
    expect(result!.startsAt.toISOString()).toBe('2026-08-17T00:00:00.000Z')
  })

  it('mapeia evento cancelado', () => {
    const result = mapGoogleEvent({
      id: 'g3',
      status: 'cancelled',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.status).toBe('CANCELLED')
  })

  it('mapeia convidados com RSVP', () => {
    const result = mapGoogleEvent({
      id: 'g4',
      summary: 'Reunião',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T20:00:00-03:00' },
      attendees: [
        { email: 'a@sou.inteli.edu.br', displayName: 'Ana', responseStatus: 'accepted' },
        { email: 'b@sou.inteli.edu.br', responseStatus: 'needsAction' },
      ],
    })

    expect(result!.attendees).toEqual([
      { email: 'a@sou.inteli.edu.br', name: 'Ana', responseStatus: 'accepted' },
      { email: 'b@sou.inteli.edu.br', name: null, responseStatus: 'needsAction' },
    ])
  })

  it('preserva recurringEventId de ocorrência de série', () => {
    const result = mapGoogleEvent({
      id: 'g5_20260812',
      recurringEventId: 'g5',
      summary: 'Aula semanal',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.recurringEventId).toBe('g5')
  })

  it('usa título de fallback quando o evento não tem summary', () => {
    const result = mapGoogleEvent({
      id: 'g6',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.title).toBe('(sem título)')
  })

  it('descarta evento sem id', () => {
    expect(mapGoogleEvent({ summary: 'órfão' })).toBeNull()
  })

  it('descarta evento sem data de início', () => {
    expect(mapGoogleEvent({ id: 'g7', summary: 'sem data' })).toBeNull()
  })
})
