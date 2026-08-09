'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import type { Area } from '@prisma/client'

export type PublicFields = {
  publicTitle: string | null
  publicDescription: string | null
  imageUrl: string | null
  area: Area | null
  signupUrl: string | null
}

/**
 * Estas actions mexem SÓ em campos da plataforma. Não chamam o Google, porque
 * nada aqui existe do lado de lá (§6.1).
 */
export async function togglePublic(slug: string, eventId: string, isPublic: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.event.update({
    where: { id: eventId, calendarId: calendar.id },
    data: { isPublic },
  })

  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function updatePublicFields(slug: string, eventId: string, fields: PublicFields) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.event.update({
    where: { id: eventId, calendarId: calendar.id },
    data: fields,
  })

  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}
