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

import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  type EventDraft,
} from '@/lib/google/write-event'

/**
 * O Google é chamado ANTES de gravar. Se ele falhar, a exceção sobe e nada é
 * escrito no banco — um evento nunca existe só de um lado (§6.1).
 */
export async function createEvent(slug: string, draft: EventDraft, notify: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const google = await createGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    timezone: calendar.timezone,
    draft,
    notify,
  })

  await prisma.event.create({
    data: {
      calendarId: calendar.id,
      googleEventId: google.googleEventId,
      title: google.title,
      description: google.description,
      startsAt: google.startsAt,
      endsAt: google.endsAt,
      allDay: google.allDay,
      location: google.location,
      status: google.status,
      recurringEventId: google.recurringEventId,
      attendees: google.attendees,
      syncedAt: new Date(),
    },
  })

  await upsertContactsFromEmails(calendar.id, draft.attendeeEmails)
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function updateGoogleFields(
  slug: string,
  eventId: string,
  draft: EventDraft,
  notify: boolean,
) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const event = await prisma.event.findFirstOrThrow({
    where: { id: eventId, calendarId: calendar.id },
  })

  const google = await updateGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    googleEventId: event.googleEventId,
    timezone: calendar.timezone,
    draft,
    notify,
  })

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: google.title,
      description: google.description,
      startsAt: google.startsAt,
      endsAt: google.endsAt,
      allDay: google.allDay,
      location: google.location,
      status: google.status,
      attendees: google.attendees,
      syncedAt: new Date(),
    },
  })

  await upsertContactsFromEmails(calendar.id, draft.attendeeEmails)
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function deleteEvent(slug: string, eventId: string, notify: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const event = await prisma.event.findFirstOrThrow({
    where: { id: eventId, calendarId: calendar.id },
  })

  await deleteGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    googleEventId: event.googleEventId,
    notify,
  })

  await prisma.event.delete({ where: { id: eventId } })
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

/**
 * Contato nasce do uso: e-mail digitado num evento vira contato sem nome, que
 * o admin completa depois. Não existe cadastro prévio a ser feito antes de a
 * ferramenta ser útil — que é justamente o passo que ninguém dá (§6.7).
 */
async function upsertContactsFromEmails(calendarId: string, emails: string[]) {
  if (emails.length === 0) return

  await prisma.contact.createMany({
    data: emails.map((email) => ({ calendarId, email })),
    skipDuplicates: true,
  })
}
