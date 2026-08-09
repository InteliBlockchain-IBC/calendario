import Link from 'next/link'
import type { PublicEvent } from '@/lib/public/serialize'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Chave YYYY-MM-DD no fuso do calendário, não no do servidor. */
function dayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function MonthGrid({
  events,
  timezone,
  slug,
  month,
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
  /** Primeiro dia do mês exibido. */
  month: Date
}) {
  const byDay = new Map<string, PublicEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, timezone)
    byDay.set(key, [...(byDay.get(key) ?? []), event])
  }

  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month)

  return (
    <div>
      <p className="mb-3 text-center font-medium capitalize">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-neutral-200">
        {WEEKDAYS.map((label, i) => (
          <div key={i} className="bg-neutral-50 py-2 text-center text-xs opacity-60">
            {label}
          </div>
        ))}
        {cells.map((dayNumber, i) => {
          const key =
            dayNumber === null
              ? null
              : `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
          const dayEvents = key ? (byDay.get(key) ?? []) : []

          return (
            <div key={i} className="min-h-20 bg-white p-1">
              {dayNumber && <span className="text-xs opacity-60">{dayNumber}</span>}
              <ul className="mt-1 space-y-0.5">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/c/${slug}/e/${event.id}`}
                      className="block truncate rounded bg-neutral-900 px-1 py-0.5 text-[10px] text-white"
                    >
                      {event.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
