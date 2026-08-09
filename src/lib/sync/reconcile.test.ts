import { describe, it, expect } from 'vitest'
import { reconcile } from './reconcile'
import type { GoogleEventInput, ExistingEvent } from './types'

const WINDOW = {
  from: new Date('2026-05-01T00:00:00Z'),
  to: new Date('2027-08-01T00:00:00Z'),
}

function googleEvent(over: Partial<GoogleEventInput> = {}): GoogleEventInput {
  return {
    googleEventId: 'g1',
    title: 'Aula de Tokenização',
    description: 'link do meet',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: 'Sala 401',
    status: 'CONFIRMED',
    recurringEventId: null,
    attendees: [],
    ...over,
  }
}

function existingEvent(over: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: 'row-1',
    googleEventId: 'g1',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    status: 'CONFIRMED',
    ...over,
  }
}

describe('reconcile', () => {
  it('evento novo do Google vira criação', () => {
    const result = reconcile({
      incoming: [googleEvent()],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates).toHaveLength(1)
    expect(result.creates[0].googleEventId).toBe('g1')
    expect(result.counts.created).toBe(1)
  })

  it('criação nunca carrega campo da plataforma', () => {
    const result = reconcile({
      incoming: [googleEvent()],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    const created = result.creates[0] as Record<string, unknown>
    for (const platformField of [
      'isPublic',
      'publicTitle',
      'publicDescription',
      'imageUrl',
      'area',
      'signupUrl',
    ]) {
      expect(created).not.toHaveProperty(platformField)
    }
  })

  it('evento existente vira atualização, sem tocar campo da plataforma', () => {
    const result = reconcile({
      incoming: [googleEvent({ title: 'Aula de Tokenização (nova sala)' })],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].id).toBe('row-1')
    expect(result.updates[0].data.title).toBe('Aula de Tokenização (nova sala)')

    const data = result.updates[0].data as Record<string, unknown>
    for (const platformField of [
      'isPublic',
      'publicTitle',
      'publicDescription',
      'imageUrl',
      'area',
      'signupUrl',
    ]) {
      expect(data).not.toHaveProperty(platformField)
    }
  })

  it('atualização sobrescreve horário e local vindos do Google', () => {
    const result = reconcile({
      incoming: [
        googleEvent({
          startsAt: new Date('2026-08-12T23:00:00Z'),
          endsAt: new Date('2026-08-13T01:00:00Z'),
          location: 'Auditório',
        }),
      ],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.updates[0].data.startsAt).toEqual(new Date('2026-08-12T23:00:00Z'))
    expect(result.updates[0].data.location).toBe('Auditório')
  })

  it('evento cancelado no Google é marcado, não apagado', () => {
    const result = reconcile({
      incoming: [googleEvent({ status: 'CANCELLED' })],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.updates[0].data.status).toBe('CANCELLED')
    expect(result.counts.cancelled).toBe(1)
    expect(result.counts.updated).toBe(0)
  })

  it('ocorrência de série recorrente preserva recurringEventId', () => {
    const result = reconcile({
      incoming: [googleEvent({ googleEventId: 'g1_20260812', recurringEventId: 'g1' })],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates[0].recurringEventId).toBe('g1')
    expect(result.creates[0].googleEventId).toBe('g1_20260812')
  })

  // --- O par crítico: varredura completa vs incremental ---

  it('varredura COMPLETA cancela evento local ausente dentro da janela', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent()],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual(['row-1'])
    expect(result.counts.cancelled).toBe(1)
  })

  it('varredura INCREMENTAL não toca evento local ausente', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
    expect(result.updates).toEqual([])
    expect(result.counts.cancelled).toBe(0)
  })

  it('varredura completa não cancela evento fora da janela', () => {
    const result = reconcile({
      incoming: [],
      existing: [
        existingEvent({ id: 'antigo', startsAt: new Date('2020-01-01T00:00:00Z') }),
      ],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
  })

  it('varredura completa não cancela quem já está cancelado', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent({ status: 'CANCELLED' })],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
    expect(result.counts.cancelled).toBe(0)
  })
})
