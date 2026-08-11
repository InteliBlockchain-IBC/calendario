import { describe, it, expect } from 'vitest'
import { toPublicEvent } from './serialize'
import { buildIcs } from './ics'
import type { Event } from '@prisma/client'

const SECRET_EMAIL = 'membro.secreto@sou.inteli.edu.br'

// A fixture usa o modelo `Event` bruto do Prisma (que tem `labelId`, não a
// relação carregada); intersecta com `label` só para poder passar por
// `toPublicEvent`, que espera o formato de `publicEventSelect`.
function eventWithAttendees(): Event & { label: { name: string; color: string } | null } {
  return {
    id: 'evt-1',
    calendarId: 'cal-1',
    googleEventId: 'g1',
    title: 'Reunião de diretoria',
    description: 'Meet: https://meet.google.com/xyz — notas internas',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: 'Sala 401',
    status: 'CONFIRMED',
    recurringEventId: null,
    attendees: [
      { email: SECRET_EMAIL, name: 'Membro', responseStatus: 'accepted' },
    ] as unknown as Event['attendees'],
    isPublic: true,
    publicTitle: 'Reunião aberta',
    publicDescription: 'Venha participar',
    imageUrl: null,
    labelId: null,
    colorOverride: null,
    label: null,
    signupUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncedAt: new Date(),
  }
}

describe('privacidade das saídas públicas', () => {
  it('o JSON público de um evento com convidados não contém nenhum e-mail', () => {
    const serialized = JSON.stringify(toPublicEvent(eventWithAttendees(), { accentColor: '#0F172A' }))

    expect(serialized).not.toContain(SECRET_EMAIL)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('attendees')
  })

  it('o JSON público não expõe a descrição interna do Google', () => {
    const result = toPublicEvent(eventWithAttendees(), { accentColor: '#0F172A' })

    expect(result.description).toBe('Venha participar')
    expect(JSON.stringify(result)).not.toContain('meet.google.com')
  })

  it('o .ics de um evento com convidados não contém linha ATTENDEE nem e-mail', () => {
    const ics = buildIcs({
      name: 'Inteli Blockchain',
      slug: 'ibc',
      baseUrl: 'https://calendario.exemplo.org',
      events: [toPublicEvent(eventWithAttendees(), { accentColor: '#0F172A' })],
    })

    expect(ics).not.toContain('ATTENDEE')
    expect(ics).not.toContain(SECRET_EMAIL)
    expect(ics).not.toContain('meet.google.com')
  })

  it('o .ics contém o evento publicado', () => {
    const ics = buildIcs({
      name: 'Inteli Blockchain',
      slug: 'ibc',
      baseUrl: 'https://calendario.exemplo.org',
      events: [toPublicEvent(eventWithAttendees(), { accentColor: '#0F172A' })],
    })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Reunião aberta')
    expect(ics).toContain('END:VCALENDAR')
  })
})
