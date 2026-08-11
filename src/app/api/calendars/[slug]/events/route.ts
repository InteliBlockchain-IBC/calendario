import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent, publicEventSelect } from '@/lib/public/serialize'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: 'asc' },
    select: publicEventSelect,
  })

  return NextResponse.json(
    {
      calendar: { name: calendar.name, slug: calendar.slug, timezone: calendar.timezone },
      events: events.map(toPublicEvent),
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}
