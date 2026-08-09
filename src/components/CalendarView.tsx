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

  const now = new Date()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

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
