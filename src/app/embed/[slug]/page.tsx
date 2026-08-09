import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent, publicEventSelect } from '@/lib/public/serialize'
import { CalendarView } from '@/components/CalendarView'
import type { Area } from '@prisma/client'

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ view?: string; area?: string }>
}) {
  const { slug } = await params
  const { view, area } = await searchParams
  const calendar = await loadCalendarBySlug(slug)

  const normalizedArea = area?.toUpperCase()

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
      ...(normalizedArea ? { area: normalizedArea as Area } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: publicEventSelect,
  })

  return (
    <div className="p-3">
      <CalendarView
        events={events.map(toPublicEvent)}
        timezone={calendar.timezone}
        slug={slug}
        initialView={view === 'mes' ? 'mes' : 'lista'}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const post = () => parent.postMessage(
              { type: 'calendario:height', height: document.documentElement.scrollHeight },
              '*'
            );
            new ResizeObserver(post).observe(document.documentElement);
            post();
          `,
        }}
      />
    </div>
  )
}
