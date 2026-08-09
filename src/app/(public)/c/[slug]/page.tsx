import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import { CalendarView } from '@/components/CalendarView'

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
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
  })

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{calendar.name}</h1>
      <CalendarView
        events={events.map(toPublicEvent)}
        timezone={calendar.timezone}
        slug={slug}
      />
    </main>
  )
}
