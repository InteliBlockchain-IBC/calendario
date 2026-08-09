'use client'

import { useState } from 'react'
import { EventList } from './EventList'
import { MonthGrid } from './MonthGrid'
import type { PublicEvent } from '@/lib/public/serialize'

export function CalendarView({
  events,
  timezone,
  slug,
  initialView = 'lista',
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
  initialView?: 'lista' | 'mes'
}) {
  const [view, setView] = useState<'lista' | 'mes'>(initialView)

  // "Hoje" precisa ser calculado no fuso do calendário, não no do servidor/UTC:
  // perto da virada do mês os dois divergem por até ~14h dependendo do offset.
  const now = new Date()
  const [year, monthNum] = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: timezone,
  })
    .format(now)
    .split('-')
    .map(Number)
  const month = new Date(Date.UTC(year, monthNum - 1, 1))

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1" role="tablist">
        {(['mes', 'lista'] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              view === option ? 'bg-neutral-900 text-white' : 'border'
            }`}
          >
            {option === 'mes' ? 'Mês' : 'Lista'}
          </button>
        ))}
      </div>

      {/* Grade some no celular: sete colunas não cabem em tela estreita. */}
      {view === 'mes' ? (
        <>
          <div className="hidden sm:block">
            <MonthGrid events={events} timezone={timezone} slug={slug} month={month} />
          </div>
          <div className="sm:hidden">
            <EventList events={events} timezone={timezone} slug={slug} />
          </div>
        </>
      ) : (
        <EventList events={events} timezone={timezone} slug={slug} />
      )}
    </div>
  )
}
