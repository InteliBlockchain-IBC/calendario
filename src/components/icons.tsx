import type { ReactElement } from 'react'

/** Ícones que a navegação do admin usa hoje. */
export type IconName = 'calendar' | 'users' | 'link'

/**
 * Ícones à mão, não biblioteca. São formas geométricas simples em 16px;
 * instalar um pacote de mil ícones para seis glifos é a mesma troca que a
 * spec recusou ao dispensar o primitivo de sidebar do shadcn (§3).
 */
const SVG = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'shrink-0',
} as const

export function CalendarIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <rect x="2" y="3.5" width="12" height="11" rx="2" />
      <path d="M2 7h12M5.5 1.5v3M10.5 1.5v3" />
    </svg>
  )
}

export function UsersIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5" />
      <path d="M11.5 4.8a2 2 0 010 3.9M14.5 13.5c0-1.5-.5-2.5-1.5-3.1" />
    </svg>
  )
}

export function LinkIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <path d="M6.2 9.8l3.6-3.6" />
      <path d="M9 4.6l1-1a2.6 2.6 0 013.7 3.7l-1 1" />
      <path d="M7 11.4l-1 1A2.6 2.6 0 012.3 8.7l1-1" />
    </svg>
  )
}

export function ChevronLeftIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  )
}

export function ChevronRightIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  )
}

export function MenuIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  )
}

export function CloseIcon(): ReactElement {
  return (
    <svg {...SVG}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export const NAV_ICONS: Record<IconName, () => ReactElement> = {
  calendar: CalendarIcon,
  users: UsersIcon,
  link: LinkIcon,
}
