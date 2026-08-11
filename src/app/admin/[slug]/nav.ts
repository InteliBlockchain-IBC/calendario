import type { IconName } from '@/components/icons'

export type NavItem = { href: string; label: string; icon: IconName }
export type NavGroup = { label: string; items: NavItem[] }

/**
 * Só rota que existe. A spec §6.2 desenha também "Labels" e "Aparência", mas
 * as duas telas são da Fase 3: item de menu apontando para rota inexistente é
 * exatamente o beco sem saída que esta fase existe para eliminar. A Fase 3
 * acrescenta os dois itens junto das telas.
 *
 * Dados serializáveis de propósito (`icon` é string, não componente): estes
 * grupos atravessam a fronteira servidor → client component.
 */
export function navGroups(slug: string): NavGroup[] {
  return [
    {
      label: 'Calendário',
      items: [{ href: `/admin/${slug}`, label: 'Eventos', icon: 'calendar' }],
    },
    {
      label: 'Configurações',
      items: [
        { href: `/admin/${slug}/contatos`, label: 'Contatos', icon: 'users' },
        { href: `/admin/${slug}/conectar`, label: 'Google Agenda', icon: 'link' },
      ],
    },
  ]
}

/**
 * Item ativo é o de href **mais longo** que casa com o pathname.
 *
 * Duas armadilhas moram nesta função. Sem a regra do mais longo,
 * `/admin/<slug>` (Eventos) casa com toda rota do admin e dois itens acendem
 * juntos. E o `/` no prefixo é obrigatório: com `startsWith(href)` puro,
 * `/admin/ibc-2` casaria com `/admin/ibc`.
 */
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null

  for (const group of groups) {
    for (const item of group.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
      if (matches && item.href.length > (best?.length ?? -1)) best = item.href
    }
  }

  return best
}
