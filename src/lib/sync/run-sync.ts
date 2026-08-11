import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { listEvents } from '@/lib/google/list-events'
import { reconcile } from './reconcile'
import type { ExistingEvent } from './types'

export type SyncCounts = { created: number; updated: number; cancelled: number }

function windowFor(pastDays: number, futureDays: number, now: Date) {
  const day = 24 * 60 * 60 * 1000
  return { from: new Date(now.getTime() - pastDays * day), to: new Date(now.getTime() + futureDays * day) }
}

/**
 * Executa uma varredura. `mode: 'full'` ignora updatedMin e reconcilia
 * ausências como cancelamento; `mode: 'incremental'` traz só o que mudou
 * desde lastSyncedAt e nunca cancela por ausência (§6.4).
 */
export async function runSync(
  calendarId: string,
  mode: 'full' | 'incremental',
): Promise<SyncCounts> {
  const now = new Date()

  const calendar = await prisma.calendar.findUniqueOrThrow({ where: { id: calendarId } })
  if (!calendar.googleCalendarId) {
    throw new Error('Calendário não está conectado a uma agenda do Google.')
  }

  // Lock antes de qualquer chamada externa.
  await prisma.calendar.update({ where: { id: calendarId }, data: { syncingAt: now } })

  try {
    const window = windowFor(calendar.syncPastDays, calendar.syncFutureDays, now)

    const incoming = await listEvents({
      calendarId,
      googleCalendarId: calendar.googleCalendarId,
      from: window.from,
      to: window.to,
      updatedMin: mode === 'incremental' ? calendar.lastSyncedAt : null,
    })

    // `googleEventId` agora é opcional no schema (eventos locais, Task 4). A
    // reconciliação só conhece eventos espelhados no Google — filtra aqui.
    // Temporário: a Task 4 extrai isto para uma `toExistingEvents()` testada.
    const existing: ExistingEvent[] = (
      await prisma.event.findMany({
        where: { calendarId },
        select: { id: true, googleEventId: true, startsAt: true, status: true },
      })
    ).filter((event): event is typeof event & { googleEventId: string } => event.googleEventId !== null)

    const result = reconcile({ incoming, existing, mode, window })

    // `attendees` é Attendee[] no domínio e Json no Prisma. O cast é local e
    // explícito de propósito: manter o tipo forte na lógica de reconciliação
    // vale mais do que evitar duas linhas de conversão aqui.
    const toRow = (data: (typeof result.creates)[number]) => ({
      ...data,
      attendees: data.attendees as unknown as Prisma.InputJsonValue,
    })

    await prisma.$transaction([
      ...result.creates.map((data) =>
        prisma.event.create({ data: { ...toRow(data), calendarId, syncedAt: now } }),
      ),
      ...result.updates.map((u) =>
        prisma.event.update({ where: { id: u.id }, data: { ...toRow(u.data), syncedAt: now } }),
      ),
      prisma.event.updateMany({
        where: { id: { in: result.cancels } },
        data: { status: 'CANCELLED', syncedAt: now },
      }),
      prisma.calendar.update({
        where: { id: calendarId },
        data: { lastSyncedAt: now, syncingAt: null, lastSyncError: null },
      }),
    ])

    return result.counts
  } catch (error) {
    // Registrar o erro é o que impede o pior modo de falha do sistema: token
    // revogado faz o sync falhar em silêncio, o site congela no último dado
    // bom e continua parecendo correto (§6.5).
    const message = error instanceof Error ? error.message : String(error)
    await prisma.calendar.update({
      where: { id: calendarId },
      data: { syncingAt: null, lastSyncError: message },
    })
    throw error
  }
}
