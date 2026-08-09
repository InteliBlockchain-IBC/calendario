import type { Area, EventStatus } from '@prisma/client'

export type Attendee = {
  email: string
  name: string | null
  responseStatus: string
}

/** Evento vindo do Google, já normalizado pelo mapper (Task 4). */
export type GoogleEventInput = {
  googleEventId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  location: string | null
  status: EventStatus
  recurringEventId: string | null
  attendees: Attendee[]
}

/** Só o que a reconciliação precisa saber de uma linha já existente. */
export type ExistingEvent = {
  id: string
  googleEventId: string
  startsAt: Date
  status: EventStatus
}

/** Campos do Google. Note a ausência de todo campo da plataforma. */
export type GoogleFields = Omit<GoogleEventInput, 'googleEventId'> & {
  googleEventId: string
}

export type ReconcileResult = {
  creates: GoogleFields[]
  updates: { id: string; data: GoogleFields }[]
  cancels: string[]
  counts: { created: number; updated: number; cancelled: number }
}

export type ReconcileArgs = {
  incoming: GoogleEventInput[]
  existing: ExistingEvent[]
  /**
   * 'full' — varredura da janela inteira; ausência implica cancelamento.
   * 'incremental' — só o que mudou; ausência não significa nada.
   */
  mode: 'full' | 'incremental'
  window: { from: Date; to: Date }
}
