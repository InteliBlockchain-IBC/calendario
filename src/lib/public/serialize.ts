import type { Event, Area } from '@prisma/client'

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
  area: Area | null
  imageUrl: string | null
  signupUrl: string | null
}

export function toPublicEvent(event: Event): PublicEvent {
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
    area: event.area,
    imageUrl: event.imageUrl,
    signupUrl: event.signupUrl,
  }
}
