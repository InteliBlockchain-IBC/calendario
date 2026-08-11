import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { decideAccess, type AccessDenial } from './access'
import type { Calendar } from '@prisma/client'

export type AdminAccess =
  | { ok: true; calendar: Calendar; email: string }
  | ({ ok: false; email: string } & AccessDenial)

/**
 * Autorização é sempre consultada no banco. O token diz apenas quem é a
 * pessoa; ele nunca decide o que ela pode fazer.
 *
 * Devolve o motivo em vez de abortar, para a página traduzir em tela (§6.1).
 * Isso só é seguro porque a existência de um calendário deixou de ser
 * segredo: `/c/<slug>` é público (§3).
 */
export async function checkCalendarAdmin(slug: string): Promise<AdminAccess> {
  const session = await auth()
  const email = session?.user?.email

  // Sem sessão continua sendo redirect, não tela: não há nada a explicar a
  // quem ainda não entrou, e o `next` traz a pessoa de volta aqui depois.
  if (!email) redirect(`/login?next=/admin/${slug}`)

  const calendar = await prisma.calendar.findUnique({ where: { slug } })

  const isAdmin = calendar
    ? Boolean(
        await prisma.calendarAdmin.findUnique({
          where: { calendarId_email: { calendarId: calendar.id, email } },
        }),
      )
    : false

  const decision = decideAccess({ calendar, email, isAdmin })
  if (!decision.ok) return { ...decision, email }

  // `decideAccess` só devolve ok com calendário presente; o TypeScript não
  // acompanha essa relação, e um `as Calendar` esconderia a próxima mudança
  // que a quebrasse.
  if (!calendar) throw new Error('decideAccess devolveu ok sem calendário — regra inconsistente.')

  return { ok: true, calendar, email }
}

/**
 * Versão que aborta, para Server Action e rota de API: ali não existe tela a
 * renderizar, e devolver um resultado que o chamador pode ignorar
 * transformaria a autorização em algo opcional.
 */
export async function requireCalendarAdmin(
  slug: string,
): Promise<{ calendar: Calendar; email: string }> {
  const access = await checkCalendarAdmin(slug)
  if (!access.ok) notFound()
  return { calendar: access.calendar, email: access.email }
}
