import Link from 'next/link'
import type { PublicEvent } from '@/lib/public/serialize'

export function EventList({
  events,
  timezone,
  slug,
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
}) {
  const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: timezone })
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: timezone })
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  if (events.length === 0) {
    return <p className="py-12 text-center opacity-60">Nenhum evento por enquanto.</p>
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const start = new Date(event.startsAt)
        return (
          <li key={event.id}>
            <Link
              href={`/c/${slug}/e/${event.id}`}
              className="flex gap-4 rounded-xl border p-4 transition hover:bg-neutral-50"
            >
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-neutral-100 py-2">
                <span className="text-xl font-semibold leading-none">{day.format(start)}</span>
                <span className="text-xs uppercase opacity-60">{month.format(start)}</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium">{event.title}</p>
                <p className="text-sm opacity-70">
                  {event.allDay ? 'Dia inteiro' : time.format(start)}
                  {event.location && ` · ${event.location}`}
                </p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
