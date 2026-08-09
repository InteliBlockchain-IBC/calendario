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

/** Data YYYY-MM-DD no fuso do CALENDÁRIO, não no do servidor — mesmo padrão de
 * `dayKey` em `src/components/MonthGrid.tsx`. `d.toISOString()` sozinho converte
 * para UTC e erra a data perto da virada do dia em fusos negativos. */
function dateInTimezone(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(d)
}

/** `end.date` de evento allDay é EXCLUSIVO na API do Google: um evento de um
 * dia só precisa `end.date` = dia seguinte a `start.date`, senão o Google
 * responde 400 ("the specified time range is empty") quando início e fim
 * caem no mesmo dia — o caso mais comum. Fácil de esquecer de novo. */
function nextDateInTimezone(d: Date, timezone: string): string {
  const [year, month, day] = dateInTimezone(d, timezone).split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}

/** Exportado só para teste direto (evita mockar o SDK do Google). */
export function toGooglePayload(draft: EventDraft, timezone: string) {
  return {
    summary: draft.title,
    description: draft.description ?? undefined,
    location: draft.location ?? undefined,
    start: draft.allDay
      ? { date: dateInTimezone(draft.startsAt, timezone) }
      : { dateTime: draft.startsAt.toISOString(), timeZone: timezone },
    end: draft.allDay
      ? { date: nextDateInTimezone(draft.endsAt, timezone) }
      : { dateTime: draft.endsAt.toISOString(), timeZone: timezone },
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
