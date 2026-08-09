import { createEvents, type EventAttributes } from 'ics'
import type { PublicEvent } from './serialize'

function toDateArray(iso: string): [number, number, number, number, number] {
  const d = new Date(iso)
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ]
}

/**
 * Recebe `PublicEvent`, nunca `Event`. O tipo é a barreira: o formato .ics tem
 * linha ATTENDEE, e montar o arquivo a partir da linha crua do banco
 * publicaria a lista de e-mails dos membros num arquivo aberto na internet,
 * sem erro e sem log (§8).
 */
export function buildIcs(args: {
  name: string
  slug: string
  baseUrl: string
  events: PublicEvent[]
}): string {
  const attributes: EventAttributes[] = args.events.map((event) => ({
    uid: `${event.id}@${args.slug}`,
    title: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    url: `${args.baseUrl}/c/${args.slug}/e/${event.id}`,
    start: toDateArray(event.startsAt),
    startInputType: 'utc',
    end: toDateArray(event.endsAt),
    endInputType: 'utc',
    calName: args.name,
    productId: 'inteli-blockchain/calendario',
  }))

  const { error, value } = createEvents(attributes)
  if (error) throw error
  return value ?? 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
}
