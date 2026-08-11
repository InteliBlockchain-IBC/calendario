import Link from 'next/link'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent, publicEventSelect } from '@/lib/public/serialize'
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
    select: publicEventSelect,
  })

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{calendar.name}</h1>
        {/* Visitante não precisa disso; é a única porta de entrada para quem
            administra e chegou por aqui, não por /admin/<slug> direto. */}
        <Link href="/login" className="text-sm underline opacity-60">
          Entrar
        </Link>
      </header>
      <CalendarView
        events={events.map((event) => toPublicEvent(event, calendar))}
        timezone={calendar.timezone}
        slug={slug}
      />
    </main>
  )
}
