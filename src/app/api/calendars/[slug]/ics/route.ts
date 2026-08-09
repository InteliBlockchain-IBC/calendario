import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import { buildIcs } from '@/lib/public/ics'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)

  const events = await prisma.event.findMany({
    where: { calendarId: calendar.id, isPublic: true, status: 'CONFIRMED' },
    orderBy: { startsAt: 'asc' },
  })

  const ics = buildIcs({
    name: calendar.name,
    slug: calendar.slug,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    events: events.map(toPublicEvent),
  })

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${calendar.slug}.ics"`,
    },
  })
}
