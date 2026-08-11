'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeHref, type NavGroup } from './nav'
import {
  NAV_ICONS,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
  CloseIcon,
} from '@/components/icons'
import { signOutAction } from '@/lib/auth/actions'
import { isValidHex } from '@/lib/labels/palette'

type PanelProps = {
  slug: string
  calendarName: string
  email: string
  accent: string
  groups: NavGroup[]
  active: string | null
  compact: boolean
  onNavigate?: () => void
  onToggle?: () => void
}

function Panel({
  slug,
  calendarName,
  email,
  accent,
  groups,
  active,
  compact,
  onNavigate,
  onToggle,
}: PanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{calendarName}</p>
            <Link href="/meus" className="text-xs underline opacity-60" onClick={onNavigate}>
              Meus calendários
            </Link>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
            className="rounded-lg border p-1.5"
          >
            {compact ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!compact && (
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon]
              const isActive = item.href === active
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  title={compact ? item.label : undefined}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                    isActive ? 'font-medium' : 'hover:bg-neutral-100'
                  } ${compact ? 'justify-center' : ''}`}
                  // Fundo *wash* (alfa ~10%) + texto na cor de destaque: o
                  // sufixo `1a` é o canal alfa do hex de 8 dígitos.
                  style={isActive ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
                >
                  <Icon />
                  {!compact && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t p-3">
        {!compact && <p className="truncate text-xs opacity-60">{email}</p>}
        <form action={signOutAction.bind(null, `/login?next=/admin/${slug}`)}>
          <button
            type="submit"
            aria-label="Sair"
            className="w-full rounded-lg border px-2 py-1.5 text-xs"
          >
            {compact ? '⏻' : 'Sair'}
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * Sidebar do admin, escrita à mão (§6.2): grupos com rótulo em caixa alta,
 * item ativo com fundo wash na cor de destaque do calendário, colapsável para
 * trilho de ícones no desktop e drawer no mobile.
 *
 * O estado de colapso mora em `useState` e não é persistido: sobrevive à
 * navegação (o layout não remonta) e reseta no recarregamento — cookie de
 * preferência é superfície nova para ganho pequeno.
 */
export function Sidebar({
  slug,
  calendarName,
  email,
  accentColor,
  groups,
}: {
  slug: string
  calendarName: string
  email: string
  accentColor: string
  groups: NavGroup[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const pathname = usePathname()
  const active = activeHref(pathname, groups)

  // A cor vem do banco e entra num `style` inline: aceitar string arbitrária
  // ali é injeção de CSS (§10). Hoje `accentColor` só é escrito pelo default
  // do schema, mas a tela de aparência (Fase 3) o abre para o usuário.
  const accent = isValidHex(accentColor) ? accentColor : '#0F172A'

  const shared = { slug, calendarName, email, accent, groups, active }

  return (
    <>
      <aside
        className={`hidden shrink-0 border-r md:block ${collapsed ? 'w-14' : 'w-60'}`}
        aria-label="Navegação do calendário"
      >
        <div className="sticky top-0 h-screen">
          <Panel {...shared} compact={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </div>
      </aside>

      <div className="md:hidden">
        <div className="flex items-center gap-2 border-b p-3">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            className="rounded-lg border p-1.5"
          >
            <MenuIcon />
          </button>
          <span className="truncate text-sm font-semibold">{calendarName}</span>
        </div>

        {drawer && (
          <div className="fixed inset-0 z-50 flex">
            <div className="w-64 bg-white shadow-xl">
              <Panel {...shared} compact={false} onNavigate={() => setDrawer(false)} />
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawer(false)}
              className="flex-1 bg-neutral-900/40 p-3 text-right text-white"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
