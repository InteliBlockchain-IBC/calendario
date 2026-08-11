import { describe, it, expect, vi } from 'vitest'
import { pushEvents } from './push-local-events'
import type { LocalEvent } from './push-local-events'

function localEvent(id: string): LocalEvent {
  return {
    id,
    title: `Evento ${id}`,
    description: null,
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: null,
  }
}

describe('pushEvents', () => {
  it('envia cada evento e grava o id retornado', async () => {
    const push = vi.fn(async (e: LocalEvent) => `g-${e.id}`)
    const save = vi.fn(async () => {})

    const result = await pushEvents([localEvent('a'), localEvent('b')], push, save)

    expect(result).toEqual({ pushed: 2, failed: 0 })
    expect(save).toHaveBeenCalledWith('a', 'g-a')
    expect(save).toHaveBeenCalledWith('b', 'g-b')
  })

  it('envia sequencialmente, para respeitar o limite de requisições', async () => {
    const ordem: string[] = []
    const push = vi.fn(async (e: LocalEvent) => {
      ordem.push(`inicio-${e.id}`)
      await new Promise((r) => setTimeout(r, 5))
      ordem.push(`fim-${e.id}`)
      return `g-${e.id}`
    })

    await pushEvents([localEvent('a'), localEvent('b')], push, async () => {})

    expect(ordem).toEqual(['inicio-a', 'fim-a', 'inicio-b', 'fim-b'])
  })

  it('uma falha não aborta o lote e é contada', async () => {
    const push = vi.fn(async (e: LocalEvent) => {
      if (e.id === 'b') throw new Error('Google recusou')
      return `g-${e.id}`
    })
    const save = vi.fn(async () => {})

    const result = await pushEvents(
      [localEvent('a'), localEvent('b'), localEvent('c')],
      push,
      save,
    )

    expect(result).toEqual({ pushed: 2, failed: 1 })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalledWith('b', expect.anything())
  })

  it('save falhando depois de um push bem-sucedido conta failed e o lote continua', async () => {
    const push = vi.fn(async (e: LocalEvent) => `g-${e.id}`)
    const save = vi.fn(async (eventId: string) => {
      if (eventId === 'b') throw new Error('banco indisponível')
    })

    const result = await pushEvents(
      [localEvent('a'), localEvent('b'), localEvent('c')],
      push,
      save,
    )

    // O evento 'b' foi criado no Google (push teve sucesso) mas não foi
    // gravado localmente (save falhou): é o caso órfão, contado em failed.
    expect(result).toEqual({ pushed: 2, failed: 1 })
    expect(push).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenCalledWith('a', 'g-a')
    expect(save).toHaveBeenCalledWith('b', 'g-b')
    expect(save).toHaveBeenCalledWith('c', 'g-c')
  })

  it('lista vazia não chama o Google', async () => {
    const push = vi.fn()
    const result = await pushEvents([], push, async () => {})

    expect(result).toEqual({ pushed: 0, failed: 0 })
    expect(push).not.toHaveBeenCalled()
  })
})
