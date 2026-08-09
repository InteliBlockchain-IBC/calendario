import type { calendar_v3 } from 'googleapis'
import type { GoogleEventInput, Attendee } from '@/lib/sync/types'

function parsePoint(p?: calendar_v3.Schema$EventDateTime | null): { at: Date; allDay: boolean } | null {
  if (!p) return null
  if (p.dateTime) return { at: new Date(p.dateTime), allDay: false }
  // Evento de dia inteiro vem como 'YYYY-MM-DD'. Ancorado em UTC de propósito:
  // a data é a informação, não o instante.
  if (p.date) return { at: new Date(`${p.date}T00:00:00Z`), allDay: true }
  return null
}

function mapAttendees(raw?: calendar_v3.Schema$EventAttendee[] | null): Attendee[] {
  if (!raw) return []
  return raw
    .filter((a): a is calendar_v3.Schema$EventAttendee & { email: string } => Boolean(a.email))
    .map((a) => ({
      email: a.email,
      name: a.displayName ?? null,
      responseStatus: a.responseStatus ?? 'needsAction',
    }))
}

/**
 * Normaliza um evento cru da API do Google. Devolve `null` para o que não dá
 * para representar — evento sem id ou sem data. Filtrar aqui mantém a
 * reconciliação (Task 3) livre de defensiva.
 */
export function mapGoogleEvent(raw: calendar_v3.Schema$Event): GoogleEventInput | null {
  if (!raw.id) return null

  const start = parsePoint(raw.start)
  if (!start) return null

  const end = parsePoint(raw.end) ?? start

  return {
    googleEventId: raw.id,
    title: raw.summary ?? '(sem título)',
    description: raw.description ?? null,
    startsAt: start.at,
    endsAt: end.at,
    allDay: start.allDay,
    location: raw.location ?? null,
    status: raw.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    recurringEventId: raw.recurringEventId ?? null,
    attendees: mapAttendees(raw.attendees),
  }
}
