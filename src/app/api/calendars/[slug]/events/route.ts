import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent, parseLabelParam, publicEventSelect } from '@/lib/public/serialize'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)
  const label = parseLabelParam(new URL(request.url).searchParams.get('label'))

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
      ...(label ? { label: { is: { name: { equals: label, mode: 'insensitive' } } } } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: publicEventSelect,
  })

  return NextResponse.json(
    {
      calendar: { name: calendar.name, slug: calendar.slug, timezone: calendar.timezone },
      events: events.map((event) => toPublicEvent(event, calendar)),
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}
