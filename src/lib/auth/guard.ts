import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import type { Calendar } from '@prisma/client'

/**
 * Autorização é sempre consultada no banco. O token diz apenas quem é a
 * pessoa; ele nunca decide o que ela pode fazer.
 */
export async function requireCalendarAdmin(
  slug: string,
): Promise<{ calendar: Calendar; email: string }> {
  const session = await auth()
  const email = session?.user?.email

  if (!email) redirect(`/login?next=/admin/${slug}`)

  const calendar = await prisma.calendar.findUnique({ where: { slug } })
  if (!calendar || calendar.status !== 'ACTIVE') notFound()

  if (calendar.allowedDomain && !email.endsWith(`@${calendar.allowedDomain}`)) {
    notFound()
  }

  const isAdmin = await prisma.calendarAdmin.findUnique({
    where: { calendarId_email: { calendarId: calendar.id, email } },
  })
  if (!isAdmin) notFound()

  return { calendar, email }
}
