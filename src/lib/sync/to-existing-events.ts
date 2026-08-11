import type { EventStatus } from '@prisma/client'
import type { ExistingEvent } from './types'

/** Linha como sai do banco: `googleEventId` pode ser nulo (evento local). */
export type EventRow = {
  id: string
  googleEventId: string | null
  startsAt: Date
  status: EventStatus
}

/**
 * Converte linhas do banco no que a reconciliação aceita, descartando os
 * eventos nativos.
 *
 * Um evento local (`googleEventId` nulo) nunca volta de uma consulta ao
 * Google. Se ele entrasse na lista de existentes, a varredura completa —
 * que trata ausência como cancelamento — o marcaria CANCELLED e ele sumiria
 * do site. É o modo de falha mais caro desta fase (§5.1).
 *
 * O `flatMap` também estreita o tipo: `ExistingEvent.googleEventId` é
 * `string` não-nulo, então esquecer o descarte vira erro de compilação em
 * vez de bug silencioso.
 */
export function toExistingEvents(rows: EventRow[]): ExistingEvent[] {
  return rows.flatMap((row) =>
    row.googleEventId ? [{ ...row, googleEventId: row.googleEventId }] : [],
  )
}
