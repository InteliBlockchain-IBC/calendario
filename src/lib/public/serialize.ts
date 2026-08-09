import type { Prisma } from '@prisma/client'
import { Area } from '@prisma/client'

/**
 * `?area=` de rota pública vem de query string — texto arbitrário do usuário,
 * não um `Area` validado pelo TypeScript. Um valor que não bate com o enum
 * (ex.: `?area=lixo`) faz o Prisma lançar e a rota devolve 500 sem essa
 * checagem; filtrar aqui faz o valor inválido virar "sem filtro" em vez de erro.
 */
export function parseAreaParam(value: string | null | undefined): Area | undefined {
  const upper = value?.toUpperCase()
  return upper && (Object.values(Area) as string[]).includes(upper) ? (upper as Area) : undefined
}

/**
 * `select` único para toda consulta pública de evento. `attendees` e a
 * `description` crua do Google ficam de fora por construção — nunca chegam
 * à memória do servidor. Regra de consulta *e* de tipo, não de renderização
 * (§8, CLAUDE.md regra 2): uma única lista de campos, reusada em toda rota
 * pública, para não duplicá-la (e arriscar divergir) em cinco lugares.
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
  area: true,
  imageUrl: true,
  signupUrl: true,
  status: true,
  isPublic: true,
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
  area: Area | null
  imageUrl: string | null
  signupUrl: string | null
}

export function toPublicEvent(event: PublicEventSource): PublicEvent {
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
