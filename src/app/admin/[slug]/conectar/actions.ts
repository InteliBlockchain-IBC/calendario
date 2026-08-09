'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'

export async function selectGoogleCalendar(slug: string, googleCalendarId: string) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.calendar.update({
    where: { id: calendar.id },
    // lastSyncedAt volta a nulo: trocar de agenda invalida tudo que veio da
    // anterior, e o próximo sync precisa ser uma varredura completa.
    data: { googleCalendarId, lastSyncedAt: null, lastSyncError: null },
  })

  revalidatePath(`/admin/${slug}`)
}
