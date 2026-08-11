import { describe, it, expect } from 'vitest'
import { toPublicEvent, parseLabelParam } from './serialize'
import type { PublicEventSource } from './serialize'

const CALENDAR = { accentColor: '#0F172A' }

function source(over: Partial<PublicEventSource> = {}): PublicEventSource {
  return {
    id: 'evt-1',
    title: 'Aula de Tokenização',
    publicTitle: null,
    publicDescription: 'Venha participar',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: 'Sala 401',
    imageUrl: null,
    signupUrl: null,
    status: 'CONFIRMED',
    isPublic: true,
    colorOverride: null,
    label: null,
    ...over,
  } as PublicEventSource
}

describe('toPublicEvent', () => {
  it('sem label, usa a cor de destaque do calendário e devolve label nula', () => {
    const result = toPublicEvent(source(), CALENDAR)
    expect(result.label).toBeNull()
    expect(result.color).toBe('#0F172A')
  })

  it('com label, expõe nome e cor da label', () => {
    const result = toPublicEvent(
      source({ label: { name: 'Educacional', color: '#3B82F6' } }),
      CALENDAR,
    )
    expect(result.label).toEqual({ name: 'Educacional', color: '#3B82F6' })
    expect(result.color).toBe('#3B82F6')
  })

  it('override do evento vence a cor da label, mas a label continua exibida', () => {
    const result = toPublicEvent(
      source({
        label: { name: 'Educacional', color: '#3B82F6' },
        colorOverride: '#EF4444',
      }),
      CALENDAR,
    )
    expect(result.color).toBe('#EF4444')
    expect(result.label?.name).toBe('Educacional')
  })

  it('não expõe nenhum campo interno', () => {
    const serialized = JSON.stringify(toPublicEvent(source(), CALENDAR))
    expect(serialized).not.toContain('attendees')
    expect(serialized).not.toContain('labelId')
    expect(serialized).not.toContain('isPublic')
  })
})

describe('parseLabelParam', () => {
  it('normaliza para minúsculas e apara espaços', () => {
    expect(parseLabelParam('Educacional')).toBe('educacional')
    expect(parseLabelParam('  PROJETOS  ')).toBe('projetos')
  })

  it('devolve undefined para valor ausente ou vazio', () => {
    expect(parseLabelParam(null)).toBeUndefined()
    expect(parseLabelParam(undefined)).toBeUndefined()
    expect(parseLabelParam('')).toBeUndefined()
    expect(parseLabelParam('   ')).toBeUndefined()
  })
})
