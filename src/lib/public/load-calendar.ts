import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { decideSync } from '@/lib/sync/decide-sync'
import { runSync } from '@/lib/sync/run-sync'
import type { Calendar } from '@prisma/client'

/**
 * Todo caminho de leitura pública passa por aqui. É este ponto que substitui
 * o cron: o sync acontece proporcional ao uso de cada calendário, sem
 * agendamento externo e sem nenhum job que enumere inquilinos (§6.2).
 */
export async function loadCalendarBySlug(slug: string): Promise<Calendar> {
  const calendar = await prisma.calendar.findUnique({ where: { slug } })
  if (!calendar || calendar.status !== 'ACTIVE') notFound()

  if (!calendar.googleCalendarId) return calendar

  const decision = decideSync({
    lastSyncedAt: calendar.lastSyncedAt,
    syncingAt: calendar.syncingAt,
    now: new Date(),
  })

  if (decision === 'blocking') {
    // Dado velho demais para ser servido com cara de atual. Vale a espera.
    try {
      await runSync(calendar.id, 'incremental')
      return await prisma.calendar.findUniqueOrThrow({ where: { id: calendar.id } })
    } catch {
      // Falha de sync não pode derrubar a página pública: o erro já ficou
      // registrado em lastSyncError e aparece no admin.
      return calendar
    }
  }

  if (decision === 'background') {
    after(async () => {
      try {
        await runSync(calendar.id, 'incremental')
      } catch {
        // Idem: registrado em lastSyncError pelo runSync.
      }
    })
  }

  return calendar
}
