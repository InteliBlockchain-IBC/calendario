import { getCalendarClient } from './client'
import { mapGoogleEvent } from './map-event'
import { GOOGLE_MAX_RESULTS } from '@/lib/sync/constants'
import type { GoogleEventInput } from '@/lib/sync/types'

export type ListEventsArgs = {
  calendarId: string
  googleCalendarId: string
  from: Date
  to: Date
  /** Presente = varredura incremental. Ausente = varredura completa da janela. */
  updatedMin: Date | null
}

/**
 * Busca eventos da janela. Não usa syncToken de propósito: ele é incompatível
 * com timeMin/timeMax, e varrer a agenda inteira com singleEvents=true tem
 * volume indefinido diante de recorrência sem data de fim (§6.3).
 */
export async function listEvents(args: ListEventsArgs): Promise<GoogleEventInput[]> {
  const calendar = await getCalendarClient(args.calendarId)

  const events: GoogleEventInput[] = []
  let pageToken: string | undefined

  do {
    const response = await calendar.events.list({
      calendarId: args.googleCalendarId,
      timeMin: args.from.toISOString(),
      timeMax: args.to.toISOString(),
      singleEvents: true,
      showDeleted: true,
      maxResults: GOOGLE_MAX_RESULTS,
      ...(args.updatedMin ? { updatedMin: args.updatedMin.toISOString() } : {}),
      ...(pageToken ? { pageToken } : {}),
    })

    for (const raw of response.data.items ?? []) {
      const mapped = mapGoogleEvent(raw)
      if (mapped) events.push(mapped)
    }

    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return events
}
