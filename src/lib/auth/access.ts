import type { CalendarStatus } from '@prisma/client'

/**
 * Por que esta conta não administra este calendário. Cada motivo vira uma
 * tela diferente (§6.1): os três primeiros caíam no mesmo 404 mudo na v1, e
 * um admin logado com a conta errada não tinha como saber o que fazer.
 */
export type AccessDenial =
  | { reason: 'not-found' }
  | { reason: 'disabled' }
  | { reason: 'domain'; allowedDomain: string }
  | { reason: 'not-admin' }

export type AccessDecision = { ok: true } | ({ ok: false } & AccessDenial)

/**
 * Regra de autorização, pura e sem banco. A consulta mora em
 * `checkCalendarAdmin`; a decisão mora aqui para ter teste próprio — é o
 * ponto do sistema onde um "simplifica isso" custa acesso indevido.
 *
 * A ordem das checagens é parte da regra, não acidente.
 */
export function decideAccess(input: {
  calendar: { status: CalendarStatus; allowedDomain: string | null } | null
  email: string
  isAdmin: boolean
}): AccessDecision {
  const { calendar, email, isAdmin } = input

  if (!calendar) return { ok: false, reason: 'not-found' }

  // Antes da allowlist: calendário desligado não abre para ninguém, nem para
  // quem o administra.
  if (calendar.status !== 'ACTIVE') return { ok: false, reason: 'disabled' }

  // Antes de "não é admin": quando as duas coisas falham, o domínio é a
  // explicação verdadeira, e a única acionável pela pessoa.
  if (calendar.allowedDomain && !email.endsWith(`@${calendar.allowedDomain}`)) {
    return { ok: false, reason: 'domain', allowedDomain: calendar.allowedDomain }
  }

  if (!isAdmin) return { ok: false, reason: 'not-admin' }

  return { ok: true }
}
