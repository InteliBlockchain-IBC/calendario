import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { togglePublic } from './actions'
import { EventForm } from './EventForm'

export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const events = await prisma.event.findMany({
    where: { calendarId: calendar.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 100,
  })

  const contacts = await prisma.contact.findMany({
    where: { calendarId: calendar.id },
    select: { email: true },
    orderBy: { email: 'asc' },
  })

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: calendar.timezone,
  })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{calendar.name}</h1>
        <span className="text-sm opacity-60">/{calendar.slug}</span>
      </header>

      <div className="flex items-center gap-2">
        <EventForm
          slug={slug}
          contactEmails={contacts.map((c) => c.email)}
          isConnected={Boolean(calendar.googleCalendarId)}
          timezone={calendar.timezone}
        />
        <form
          action={async () => {
            'use server'
            // A Server Action é um endpoint HTTP por si só — o check no
            // render da página não protege a invocação direta da action,
            // por isso repete aqui (mesmo padrão de togglePublic/deleteContact).
            await requireCalendarAdmin(slug)
            const { runSync } = await import('@/lib/sync/run-sync')
            await runSync(calendar.id, 'full')
          }}
        >
          <button type="submit" className="rounded-lg border px-4 py-2">
            Sincronizar agora
          </button>
        </form>
      </div>

      {calendar.lastSyncError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <strong>A última sincronização falhou.</strong> O calendário abaixo pode estar
          desatualizado. Erro: {calendar.lastSyncError}
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Evento</th>
            <th className="py-2">Quando</th>
            <th className="py-2">No site</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t">
              <td className="py-3">
                {event.publicTitle ?? event.title}
                {event.status === 'CANCELLED' && (
                  <span className="ml-2 text-xs text-red-700">cancelado</span>
                )}
              </td>
              <td className="py-3">{formatter.format(event.startsAt)}</td>
              <td className="py-3">
                <form
                  action={async () => {
                    'use server'
                    await togglePublic(slug, event.id, !event.isPublic)
                  }}
                >
                  <button type="submit" className="rounded border px-3 py-1">
                    {event.isPublic ? 'Publicado' : 'Rascunho'}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {events.length === 0 && (
        <p className="py-8 text-center opacity-60">
          Nenhum evento futuro. Sincronize com o Google ou crie um evento.
        </p>
      )}

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">Embutir no site</h2>
        <p className="text-sm opacity-70">
          Cole este código na página onde o calendário deve aparecer.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">
          {`<iframe src="${process.env.NEXT_PUBLIC_APP_URL}/embed/${calendar.slug}" style="width:100%;border:0" height="600"></iframe>`}
        </pre>
      </section>
    </main>
  )
}
