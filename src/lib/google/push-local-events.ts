import { prisma } from '@/lib/db'
import { createGoogleEvent } from './write-event'

export type LocalEvent = {
  id: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  location: string | null
}

export type PushResult = { pushed: number; failed: number }

/**
 * Núcleo testável: recebe as dependências em vez de alcançá-las. Sequencial
 * de propósito — o limite do Google é por usuário, e um lote paralelo de
 * dezenas de eventos o estoura. Uma falha individual é contada e o lote
 * continua: como só toca eventos ainda sem googleEventId, repetir resolve o
 * que ficou para trás (ARCHITECTURE.md §8.7).
 */
export async function pushEvents(
  events: LocalEvent[],
  push: (event: LocalEvent) => Promise<string>,
  save: (eventId: string, googleEventId: string) => Promise<void>,
): Promise<PushResult> {
  let pushed = 0
  let failed = 0

  for (const event of events) {
    let googleEventId: string
    try {
      googleEventId = await push(event)
    } catch (error) {
      failed++
      console.error(`Falha ao enviar o evento ${event.id} para o Google:`, error)
      continue
    }

    try {
      await save(event.id, googleEventId)
      pushed++
    } catch (error) {
      failed++
      // Pior caso do lote: o evento existe no Google mas continua sem
      // googleEventId aqui. Repetir criaria uma duplicata na agenda real,
      // então isto precisa ser visível em vez de virar só um número.
      console.error(
        `ÓRFÃO: evento ${event.id} criado no Google como ${googleEventId}, mas não gravado localmente:`,
        error,
      )
    }
  }

  return { pushed, failed }
}

/**
 * Sobe para o Google todo evento que só existe aqui. Idempotente: roda de
 * novo e só toca o que continua sem googleEventId.
 */
export async function pushLocalEvents(calendarId: string): Promise<PushResult> {
  const calendar = await prisma.calendar.findUniqueOrThrow({ where: { id: calendarId } })
  if (!calendar.googleCalendarId) {
    throw new Error('Calendário não está conectado a uma agenda do Google.')
  }
  const googleCalendarId = calendar.googleCalendarId

  const events = await prisma.event.findMany({
    where: { calendarId, googleEventId: null },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      location: true,
    },
    orderBy: { startsAt: 'asc' },
  })

  return pushEvents(
    events,
    async (event) => {
      const google = await createGoogleEvent({
        calendarId,
        googleCalendarId,
        timezone: calendar.timezone,
        draft: {
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          location: event.location,
          // Sem convidados: o evento nasceu local, então ninguém foi
          // convidado por ele. Subir sem attendees evita disparar convite
          // retroativo para gente que nunca soube deste evento.
          attendeeEmails: [],
        },
        notify: false,
      })
      return google.googleEventId
    },
    async (eventId, googleEventId) => {
      await prisma.event.update({
        where: { id: eventId },
        data: { googleEventId, syncedAt: new Date() },
      })
    },
  )
}
