import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Estado do calendário devolvido pela guarda; cada teste ajusta o que precisa. */
const calendar = {
  id: 'cal-1',
  slug: 'ibc',
  timezone: 'America/Sao_Paulo',
  googleCalendarId: null as string | null,
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/auth/guard', () => ({
  requireCalendarAdmin: vi.fn(async () => ({ calendar, email: 'admin@sou.inteli.edu.br' })),
}))

vi.mock('@/lib/google/write-event', () => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    event: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    label: { findFirstOrThrow: vi.fn() },
    contact: { createMany: vi.fn() },
  },
}))

import { createEvent, updateGoogleFields, deleteEvent, updatePublicFields } from './actions'
import { prisma } from '@/lib/db'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '@/lib/google/write-event'

const draft = {
  title: 'Aula de Tokenização',
  description: null,
  startsAt: new Date('2026-08-12T22:00:00Z'),
  endsAt: new Date('2026-08-13T00:00:00Z'),
  allDay: false,
  location: 'Sala 401',
  attendeeEmails: [] as string[],
}

/** Resposta típica do Google, já normalizada pelo mapper. */
const fromGoogle = {
  googleEventId: 'g1',
  title: draft.title,
  description: null,
  startsAt: draft.startsAt,
  endsAt: draft.endsAt,
  allDay: false,
  location: draft.location,
  status: 'CONFIRMED' as const,
  recurringEventId: null,
  attendees: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  calendar.googleCalendarId = null
})

describe('createEvent', () => {
  it('sem conexão: grava só no banco, com googleEventId nulo e sem syncedAt', async () => {
    await createEvent('ibc', draft, true)

    expect(createGoogleEvent).not.toHaveBeenCalled()
    expect(prisma.event.create).toHaveBeenCalledTimes(1)

    const { data } = vi.mocked(prisma.event.create).mock.calls[0][0]
    expect(data.googleEventId).toBeNull()
    expect(data.attendees).toEqual([])
    // syncedAt significa "sincronizado com o Google", o que nunca aconteceu.
    expect(data).not.toHaveProperty('syncedAt')
  })

  it('com conexão: chama o Google ANTES de gravar no banco', async () => {
    calendar.googleCalendarId = 'google-cal-1'
    const ordem: string[] = []
    vi.mocked(createGoogleEvent).mockImplementation(async () => {
      ordem.push('google')
      return fromGoogle
    })
    vi.mocked(prisma.event.create).mockImplementation((async () => {
      ordem.push('banco')
      return {} as never
    }) as never)

    await createEvent('ibc', draft, true)

    expect(ordem).toEqual(['google', 'banco'])
  })

  it('se o Google falhar, nada é gravado no banco', async () => {
    calendar.googleCalendarId = 'google-cal-1'
    vi.mocked(createGoogleEvent).mockRejectedValue(new Error('Google recusou'))

    await expect(createEvent('ibc', draft, true)).rejects.toThrow('Google recusou')
    expect(prisma.event.create).not.toHaveBeenCalled()
  })
})

describe('updateGoogleFields', () => {
  it('CASO MISTO: calendário conectado + evento local não chama o Google', async () => {
    // A razão de a ramificação ser pelo EVENTO, não pelo calendário. Um
    // calendário conectado pode conter eventos criados antes da conexão.
    calendar.googleCalendarId = 'google-cal-1'
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: null,
    } as never)

    await updateGoogleFields('ibc', 'evt-1', draft, false)

    expect(updateGoogleEvent).not.toHaveBeenCalled()
    expect(prisma.event.update).toHaveBeenCalledTimes(1)
  })

  it('evento espelhado em calendário conectado chama o Google', async () => {
    calendar.googleCalendarId = 'google-cal-1'
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: 'g1',
    } as never)
    vi.mocked(updateGoogleEvent).mockResolvedValue(fromGoogle)

    await updateGoogleFields('ibc', 'evt-1', draft, false)

    expect(updateGoogleEvent).toHaveBeenCalledTimes(1)
  })

  it('busca o evento escopada por calendarId', async () => {
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: null,
    } as never)

    await updateGoogleFields('ibc', 'evt-1', draft, false)

    // Sem o calendarId no where, um admin editaria evento de outro calendário.
    expect(prisma.event.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'evt-1', calendarId: 'cal-1' },
    })
  })
})

describe('deleteEvent', () => {
  it('CASO MISTO: calendário conectado + evento local não chama o Google', async () => {
    calendar.googleCalendarId = 'google-cal-1'
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: null,
    } as never)

    await deleteEvent('ibc', 'evt-1', false)

    expect(deleteGoogleEvent).not.toHaveBeenCalled()
    expect(prisma.event.delete).toHaveBeenCalledTimes(1)
  })

  it('se o Google falhar ao apagar, o evento não é apagado do banco', async () => {
    calendar.googleCalendarId = 'google-cal-1'
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: 'g1',
    } as never)
    vi.mocked(deleteGoogleEvent).mockRejectedValue(new Error('Google recusou'))

    await expect(deleteEvent('ibc', 'evt-1', false)).rejects.toThrow('Google recusou')
    // Sumir só daqui faria o evento reaparecer no próximo sync.
    expect(prisma.event.delete).not.toHaveBeenCalled()
  })

  it('busca o evento escopada por calendarId', async () => {
    vi.mocked(prisma.event.findFirstOrThrow).mockResolvedValue({
      id: 'evt-1',
      googleEventId: null,
    } as never)

    await deleteEvent('ibc', 'evt-1', false)

    expect(prisma.event.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'evt-1', calendarId: 'cal-1' },
    })
  })
})

describe('updatePublicFields', () => {
  const publicFields = {
    publicTitle: 'Título público',
    publicDescription: null,
    imageUrl: null,
    labelId: null,
    colorOverride: null,
    signupUrl: null,
  }

  it("colorOverride '' vira null no que é gravado", async () => {
    await updatePublicFields('ibc', 'evt-1', { ...publicFields, colorOverride: '   ' })

    const { data } = vi.mocked(prisma.event.update).mock.calls[0][0]
    expect(data.colorOverride).toBeNull()
  })

  it('colorOverride hex inválido lança e não grava', async () => {
    await expect(
      updatePublicFields('ibc', 'evt-1', { ...publicFields, colorOverride: 'não-é-hex' }),
    ).rejects.toThrow('Cor inválida.')

    expect(prisma.event.update).not.toHaveBeenCalled()
  })

  it('colorOverride hex válido passa e é gravado como veio', async () => {
    await updatePublicFields('ibc', 'evt-1', { ...publicFields, colorOverride: '#FF00AA' })

    const { data } = vi.mocked(prisma.event.update).mock.calls[0][0]
    expect(data.colorOverride).toBe('#FF00AA')
  })

  it('labelId de outro calendário lança', async () => {
    vi.mocked(prisma.label.findFirstOrThrow).mockRejectedValue(new Error('Not found'))

    await expect(
      updatePublicFields('ibc', 'evt-1', { ...publicFields, labelId: 'label-de-outro-cal' }),
    ).rejects.toThrow()

    expect(prisma.label.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'label-de-outro-cal', calendarId: 'cal-1' },
    })
    expect(prisma.event.update).not.toHaveBeenCalled()
  })
})
