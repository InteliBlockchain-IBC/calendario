import Link from 'next/link'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getCalendarClient } from '@/lib/google/client'
import { selectGoogleCalendar } from './actions'

const ERROS: Record<string, string> = {
  'sem-codigo': 'O Google não devolveu um código de autorização. Tente de novo.',
  'sem-refresh-token':
    'O Google não devolveu um refresh token. Revogue o acesso do app na conta e conecte de novo.',
  'state-invalido':
    'A verificação de segurança da conexão falhou. Tente conectar de novo a partir desta página.',
  'falha-troca-token': 'Não foi possível concluir a conexão com o Google. Tente de novo.',
}

export default async function ConectarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { slug } = await params
  const { erro } = await searchParams
  const { calendar } = await requireCalendarAdmin(slug)

  const connection = await prisma.googleConnection.findUnique({
    where: { calendarId: calendar.id },
  })

  let agendas: { id: string; summary: string }[] = []
  let agendasError = false
  if (connection) {
    try {
      const client = await getCalendarClient(calendar.id)
      const { data } = await client.calendarList.list()
      agendas = (data.items ?? [])
        .filter((c): c is typeof c & { id: string } => Boolean(c.id))
        .map((c) => ({ id: c.id, summary: c.summary ?? c.id }))
    } catch (err) {
      // Refresh token revogado ou Google fora do ar: mostramos a tela mesmo
      // assim, com aviso, em vez de derrubar a página inteira.
      console.error('Falha ao listar agendas do Google:', err)
      agendasError = true
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Conexão com o Google Agenda</h1>

      {erro && ERROS[erro] && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
          {ERROS[erro]}
        </p>
      )}

      {!connection ? (
        <>
          <p className="text-sm opacity-70">
            Conecte com a <strong>conta oficial do clube</strong>, dona da agenda. Todos os
            eventos criados aqui aparecerão no Google como criados por ela — nenhum admin
            precisa da senha.
          </p>
          <Link
            href={`/admin/${slug}/conectar/start`}
            className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white"
          >
            Conectar agenda do Google
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">
            Conectado como <strong>{connection.googleEmail}</strong>.
          </p>
          {agendasError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
              Não foi possível listar as agendas — a conexão pode ter sido revogada. Reconecte.
            </p>
          )}
          <div className="space-y-2">
            <p className="font-medium">Qual agenda este calendário usa?</p>
            {agendas.map((agenda) => (
              <form
                key={agenda.id}
                action={async () => {
                  'use server'
                  await selectGoogleCalendar(slug, agenda.id)
                }}
              >
                <button
                  type="submit"
                  className={`w-full rounded-lg border p-3 text-left ${
                    calendar.googleCalendarId === agenda.id ? 'border-neutral-900 bg-neutral-50' : ''
                  }`}
                >
                  {agenda.summary}
                  {calendar.googleCalendarId === agenda.id && (
                    <span className="ml-2 text-xs opacity-60">— em uso</span>
                  )}
                </button>
              </form>
            ))}
          </div>
          <Link href={`/admin/${slug}/conectar/start`} className="text-sm underline">
            Reconectar com outra conta
          </Link>
        </>
      )}
    </main>
  )
}
