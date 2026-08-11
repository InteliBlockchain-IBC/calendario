import { describe, it, expect, vi, beforeEach } from 'vitest'

const session = { user: { email: 'admin@sou.inteli.edu.br' } as { email: string | null } }

vi.mock('@/auth', () => ({ auth: vi.fn(async () => session) }))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    calendar: { findUnique: vi.fn() },
    calendarAdmin: { findUnique: vi.fn() },
  },
}))

import { checkCalendarAdmin, requireCalendarAdmin } from './guard'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'

const CALENDAR = {
  id: 'cal-1',
  slug: 'ibc',
  status: 'ACTIVE',
  allowedDomain: 'sou.inteli.edu.br',
}

beforeEach(() => {
  vi.clearAllMocks()
  session.user.email = 'admin@sou.inteli.edu.br'
  vi.mocked(prisma.calendar.findUnique).mockResolvedValue(CALENDAR as never)
  vi.mocked(prisma.calendarAdmin.findUnique).mockResolvedValue({ id: 'adm-1' } as never)
})

describe('checkCalendarAdmin', () => {
  it('devolve o calendário para quem é admin', async () => {
    const access = await checkCalendarAdmin('ibc')

    expect(access.ok).toBe(true)
    if (access.ok) expect(access.calendar.id).toBe('cal-1')
  })

  it('devolve o motivo sem abortar quando o domínio não bate', async () => {
    session.user.email = 'alguem@gmail.com'

    const access = await checkCalendarAdmin('ibc')

    expect(access).toMatchObject({
      ok: false,
      reason: 'domain',
      allowedDomain: 'sou.inteli.edu.br',
      email: 'alguem@gmail.com',
    })
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('requireCalendarAdmin', () => {
  it('ABORTA quando a guarda nega — Server Action não pode seguir', async () => {
    vi.mocked(prisma.calendarAdmin.findUnique).mockResolvedValue(null)

    await expect(requireCalendarAdmin('ibc')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })
})
