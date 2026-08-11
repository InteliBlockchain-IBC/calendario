import type { Prisma } from '@prisma/client'
import { eventColor } from '@/lib/labels/color'

/**
 * `select` único para toda consulta pública de evento. `attendees` e a
 * `description` crua do Google ficam de fora por construção — nunca chegam
 * à memória do servidor. Regra de consulta *e* de tipo, não de renderização
 * (§8, CLAUDE.md regra 2).
 */
export const publicEventSelect = {
  id: true,
  title: true,
  publicTitle: true,
  publicDescription: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  location: true,
  imageUrl: true,
  signupUrl: true,
  status: true,
  isPublic: true,
  colorOverride: true,
  label: { select: { name: true, color: true } },
} satisfies Prisma.EventSelect

/** Formato exato que sai de `prisma.event.findMany({ select: publicEventSelect })`. */
export type PublicEventSource = Prisma.EventGetPayload<{ select: typeof publicEventSelect }>

/**
 * Formato público de um evento. Note a ausência de `attendees`, `description`
 * crua do Google e qualquer outro campo interno: o tipo é a garantia de que
 * dado pessoal não vaza para fora (§8).
 */
export type PublicEvent = {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
  imageUrl: string | null
  signupUrl: string | null
  label: { name: string; color: string } | null
  /** Cor já resolvida pela cascata — o cliente não precisa conhecer a regra. */
  color: string
}

export function toPublicEvent(
  event: PublicEventSource,
  calendar: { accentColor: string },
): PublicEvent {
  return {
    id: event.id,
    title: event.publicTitle ?? event.title,
    // A descrição do Google costuma ter link de meet e nota interna. Só a
    // descrição pública, escrita de propósito para o site, é exposta.
    description: event.publicDescription,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    allDay: event.allDay,
    location: event.location,
    imageUrl: event.imageUrl,
    signupUrl: event.signupUrl,
    label: event.label,
    color: eventColor(event, calendar),
  }
}

/**
 * `?label=` de rota pública vem de query string — texto arbitrário. Normaliza
 * para comparar com o nome da label sem depender de caixa ou espaço; valor
 * vazio vira "sem filtro" em vez de filtro que não casa com nada.
 */
export function parseLabelParam(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : undefined
}
