import type { ReconcileArgs, ReconcileResult, GoogleFields, GoogleEventInput } from './types'

function toGoogleFields(e: GoogleEventInput): GoogleFields {
  // Enumerado campo a campo de propósito: um spread aqui abriria a porta
  // para um campo da plataforma vazar para dentro da atualização.
  return {
    googleEventId: e.googleEventId,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    location: e.location,
    status: e.status,
    recurringEventId: e.recurringEventId,
    attendees: e.attendees,
  }
}

/**
 * Decide o que criar, atualizar e cancelar. Função pura: sem rede, sem banco.
 *
 * A distinção entre `mode: 'full'` e `mode: 'incremental'` é a regra mais
 * perigosa do sistema. Na varredura incremental o Google devolve apenas o que
 * mudou, então "ausente" não significa nada. Tratar ausência como cancelamento
 * ali cancelaria o calendário inteiro (§6.4).
 */
export function reconcile(args: ReconcileArgs): ReconcileResult {
  const { incoming, existing, mode, window } = args

  const existingByGoogleId = new Map(existing.map((e) => [e.googleEventId, e]))
  const seenGoogleIds = new Set<string>()

  const creates: GoogleFields[] = []
  const updates: { id: string; data: GoogleFields }[] = []
  const cancels: string[] = []

  let created = 0
  let updated = 0
  let cancelled = 0

  for (const event of incoming) {
    seenGoogleIds.add(event.googleEventId)
    const match = existingByGoogleId.get(event.googleEventId)
    const data = toGoogleFields(event)

    if (!match) {
      // Evento cancelado que nunca existimos localmente: nada a fazer.
      if (event.status === 'CANCELLED') continue
      creates.push(data)
      created++
      continue
    }

    updates.push({ id: match.id, data })
    if (event.status === 'CANCELLED' && match.status !== 'CANCELLED') cancelled++
    else updated++
  }

  if (mode === 'full') {
    for (const row of existing) {
      if (seenGoogleIds.has(row.googleEventId)) continue
      if (row.status === 'CANCELLED') continue
      if (row.startsAt < window.from || row.startsAt > window.to) continue
      cancels.push(row.id)
      cancelled++
    }
  }

  return { creates, updates, cancels, counts: { created, updated, cancelled } }
}
