import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { signOutAction } from '@/lib/auth/actions'
import { SECONDARY_BUTTON } from '@/components/ErrorScreen'

export default async function MeusCalendariosPage() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) redirect('/login?next=/meus')

  // Lista pelo mesmo critério que a guarda exige para deixar entrar: uma
  // linha em CalendarAdmin para aquele calendário. Listar por `ownerEmail`
  // mostraria calendário cujo /admin negaria a entrada — beco sem saída novo.
  //
  // Calendário DISABLED aparece de propósito: escondê-lo tornaria
  // inalcançável um calendário que a pessoa administra, e clicar nele leva à
  // tela que explica que está desativado (Task 4).
  const calendars = await prisma.calendar.findMany({
    where: { admins: { some: { email } } },
    orderBy: { name: 'asc' },
    select: { slug: true, name: true, status: true },
  })

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Meus calendários</h1>
        <p className="text-sm opacity-70">
          Você está conectado como <strong>{email}</strong>.
        </p>
      </header>

      {calendars.length === 0 ? (
        <div className="space-y-3 rounded-xl border p-6 text-sm">
          <p className="font-medium">Nenhum calendário ainda.</p>
          <p className="opacity-70">
            Você entra num calendário quando quem o administra adiciona o seu e-mail (
            {email}) à lista de admins. Peça a inclusão para quem cuida do calendário.
          </p>
          <Link href="/" className="inline-block underline">
            Ver o calendário público do clube
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {calendars.map((calendar) => (
            <li key={calendar.slug} className="rounded-xl border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/admin/${calendar.slug}`} className="font-medium underline">
                  {calendar.name}
                </Link>
                <span className="text-xs opacity-60">/{calendar.slug}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-sm opacity-70">
                <Link href={`/c/${calendar.slug}`} className="underline">
                  ver página pública
                </Link>
                {calendar.status !== 'ACTIVE' && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                    desativado
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={signOutAction.bind(null, '/login')}>
        <button type="submit" className={SECONDARY_BUTTON}>
          Sair
        </button>
      </form>
    </main>
  )
}
