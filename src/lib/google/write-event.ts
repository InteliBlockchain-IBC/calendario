import { getCalendarClient } from './client'
import { mapGoogleEvent } from './map-event'
import type { GoogleEventInput } from '@/lib/sync/types'

export type EventDraft = {
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  location: string | null
  attendeeEmails: string[]
}

export type WriteArgs = {
  calendarId: string
  googleCalendarId: string
  timezone: string
  draft: EventDraft
  notify: boolean
}

function toGooglePayload(draft: EventDraft, timezone: string) {
  const point = (d: Date) =>
    draft.allDay
      ? { date: d.toISOString().slice(0, 10) }
      : { dateTime: d.toISOString(), timeZone: timezone }

  return {
    summary: draft.title,
    description: draft.description ?? undefined,
    location: draft.location ?? undefined,
    start: point(draft.startsAt),
    end: point(draft.endsAt),
    attendees: draft.attendeeEmails.map((email) => ({ email })),
  }
}

/** `all` dispara e-mail do Google; `none` só insere na agenda (§6.7). */
function sendUpdates(notify: boolean): 'all' | 'none' {
  return notify ? 'all' : 'none'
}

export async function createGoogleEvent(args: WriteArgs): Promise<GoogleEventInput> {
  const calendar = await getCalendarClient(args.calendarId)

  const response = await calendar.events.insert({
    calendarId: args.googleCalendarId,
    sendUpdates: sendUpdates(args.notify),
    requestBody: toGooglePayload(args.draft, args.timezone),
  })

  const mapped = mapGoogleEvent(response.data)
  if (!mapped) throw new Error('O Google devolveu um evento que não pôde ser interpretado.')
  return mapped
}

export async function updateGoogleEvent(
  args: WriteArgs & { googleEventId: string },
): Promise<GoogleEventInput> {
  const calendar = await getCalendarClient(args.calendarId)

  const response = await calendar.events.patch({
    calendarId: args.googleCalendarId,
    eventId: args.googleEventId,
    sendUpdates: sendUpdates(args.notify),
    requestBody: toGooglePayload(args.draft, args.timezone),
  })

  const mapped = mapGoogleEvent(response.data)
  if (!mapped) throw new Error('O Google devolveu um evento que não pôde ser interpretado.')
  return mapped
}

export async function deleteGoogleEvent(args: {
  calendarId: string
  googleCalendarId: string
  googleEventId: string
  notify: boolean
}): Promise<void> {
  const calendar = await getCalendarClient(args.calendarId)
  await calendar.events.delete({
    calendarId: args.googleCalendarId,
    eventId: args.googleEventId,
    sendUpdates: sendUpdates(args.notify),
  })
}
