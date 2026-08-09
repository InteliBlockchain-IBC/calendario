import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { deleteContact } from './actions'

export default async function ContatosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const contacts = await prisma.contact.findMany({
    where: { calendarId: calendar.id },
    include: { groups: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Contatos</h1>
      <p className="text-sm opacity-70">
        Contatos são criados automaticamente quando você convida um e-mail novo para um
        evento. Aqui você completa o nome, organiza em grupos e apaga erros de digitação.
      </p>

      <table className="w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Nome</th>
            <th className="py-2">E-mail</th>
            <th className="py-2">Grupos</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-t">
              <td className="py-3">{contact.name ?? <span className="opacity-40">—</span>}</td>
              <td className="py-3">{contact.email}</td>
              <td className="py-3">{contact.groups.map((g) => g.name).join(', ') || '—'}</td>
              <td className="py-3 text-right">
                <form
                  action={async () => {
                    'use server'
                    await deleteContact(slug, contact.id)
                  }}
                >
                  <button type="submit" className="text-red-700 underline">
                    Apagar
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {contacts.length === 0 && (
        <p className="py-8 text-center opacity-60">
          Nenhum contato ainda. Convide alguém para um evento e ele aparece aqui.
        </p>
      )}
    </main>
  )
}
