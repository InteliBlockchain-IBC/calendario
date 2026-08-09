import { prisma } from '@/lib/db'
import type { Calendar } from '@prisma/client'
import { RESERVED_SLUGS } from '@/lib/sync/constants'

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,39}$/

export type CreateCalendarInput = {
  slug: string
  name: string
  ownerEmail: string
  timezone?: string
  allowedDomain?: string | null
  adminEmails?: string[]
}

export function validateSlug(slug: string): void {
  // ponytail: checagem de reservado vem antes do formato — "c" tem 1 caractere
  // e falharia no regex de formato antes de chegar na lista de reservados.
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    throw new Error(`Slug "${slug}" é reservado pelo sistema e não pode ser usado.`)
  }
  if (!SLUG_FORMAT.test(slug)) {
    throw new Error(
      `Slug "${slug}" tem formato inválido: use 2 a 40 caracteres, apenas letras minúsculas, números e hífen.`,
    )
  }
}

/**
 * Ponto único de criação de calendário. Hoje só o seed chama; uma rota de
 * cadastro self-service chamaria a mesma função (§3.1).
 */
export async function createCalendar(input: CreateCalendarInput): Promise<Calendar> {
  validateSlug(input.slug)

  return prisma.calendar.create({
    data: {
      slug: input.slug,
      name: input.name,
      ownerEmail: input.ownerEmail,
      timezone: input.timezone ?? 'America/Sao_Paulo',
      allowedDomain: input.allowedDomain ?? null,
      admins: {
        create: (input.adminEmails ?? []).map((email) => ({ email })),
      },
    },
  })
}
