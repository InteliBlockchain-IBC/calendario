import { STALE_AFTER_MS, BLOCKING_AFTER_MS, SYNC_LOCK_MS } from './constants'

export type SyncDecision = 'skip' | 'background' | 'blocking'

export type DecideSyncArgs = {
  lastSyncedAt: Date | null
  syncingAt: Date | null
  now: Date
}

/**
 * O lock vence qualquer coisa: se já existe sync em andamento, não dispara
 * outro. Sem isso, um pico de acessos simultâneos vira uma tempestade de
 * chamadas ao Google.
 */
export function decideSync({ lastSyncedAt, syncingAt, now }: DecideSyncArgs): SyncDecision {
  if (syncingAt && now.getTime() - syncingAt.getTime() < SYNC_LOCK_MS) return 'skip'

  if (!lastSyncedAt) return 'blocking'

  const age = now.getTime() - lastSyncedAt.getTime()

  if (age > BLOCKING_AFTER_MS) return 'blocking'
  if (age > STALE_AFTER_MS) return 'background'
  return 'skip'
}
