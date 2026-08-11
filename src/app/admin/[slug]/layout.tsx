import type { ReactNode } from 'react'
import { checkCalendarAdmin } from '@/lib/auth/guard'
import { navGroups } from './nav'
import { Sidebar } from './Sidebar'

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const access = await checkCalendarAdmin(slug)

  // Quando a guarda nega, a página filha renderiza a tela que explica; o
  // layout não pode envolvê-la na navegação de um calendário que a pessoa não
  // administra — e nem tem o nome dele para mostrar. A checagem repetida
  // (layout + página) custa duas consultas indexadas e mantém a decisão em um
  // lugar só.
  if (!access.ok) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        slug={slug}
        calendarName={access.calendar.name}
        email={access.email}
        accentColor={access.calendar.accentColor}
        groups={navGroups(slug)}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
