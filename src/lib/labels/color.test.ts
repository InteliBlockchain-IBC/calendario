import { describe, it, expect } from 'vitest'
import { eventColor } from './color'

const CALENDAR = { accentColor: '#0F172A' }

describe('eventColor', () => {
  it('usa a cor de destaque do calendário quando não há label nem override', () => {
    expect(eventColor({ colorOverride: null, label: null }, CALENDAR)).toBe('#0F172A')
  })

  it('usa a cor da label quando existe label e não há override', () => {
    expect(eventColor({ colorOverride: null, label: { color: '#22C55E' } }, CALENDAR)).toBe(
      '#22C55E',
    )
  })

  it('o override do evento vence a cor da label', () => {
    expect(
      eventColor({ colorOverride: '#EF4444', label: { color: '#22C55E' } }, CALENDAR),
    ).toBe('#EF4444')
  })

  it('o override do evento vence mesmo sem label', () => {
    expect(eventColor({ colorOverride: '#EF4444', label: null }, CALENDAR)).toBe('#EF4444')
  })
})
