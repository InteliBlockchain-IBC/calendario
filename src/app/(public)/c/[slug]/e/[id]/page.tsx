import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent, publicEventSelect } from '@/lib/public/serialize'

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const calendar = await loadCalendarBySlug(slug)

  const row = await prisma.event.findFirst({
    where: { id, calendarId: calendar.id, isPublic: true, status: 'CONFIRMED' },
    select: publicEventSelect,
  })
  if (!row) notFound()

  const event = toPublicEvent(row, calendar)
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: event.allDay ? undefined : 'short',
    timeZone: calendar.timezone,
  })

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      {/* Esta é a página que se compartilha, e era o beco sem saída mais
          visitado do produto: sem signupUrl não tinha link nenhum (§1). */}
      <Link href={`/c/${slug}`} className="inline-block text-sm underline opacity-70">
        ← Voltar ao calendário
      </Link>
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt="" className="w-full rounded-xl" />
      )}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="opacity-70">{formatter.format(new Date(event.startsAt))}</p>
        {event.location && <p className="opacity-70">{event.location}</p>}
      </header>
      {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}
      {event.signupUrl && (
        <a
          href={event.signupUrl}
          className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white"
        >
          Inscreva-se
        </a>
      )}
    </main>
  )
}
