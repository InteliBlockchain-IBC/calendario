'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'

export async function saveContact(
  slug: string,
  input: { id?: string; name: string | null; email: string; groupNames: string[] },
) {
  const { calendar } = await requireCalendarAdmin(slug)

  // Grupos são criados inline ao digitar um nome novo — sem tela dedicada.
  const groups = await Promise.all(
    input.groupNames.map((name) =>
      prisma.contactGroup.upsert({
        where: { calendarId_name: { calendarId: calendar.id, name } },
        create: { calendarId: calendar.id, name },
        update: {},
      }),
    ),
  )

  if (input.id) {
    // Edição de contato existente: escopado por calendarId, nunca só por id.
    await prisma.contact.update({
      where: { id: input.id, calendarId: calendar.id },
      data: {
        name: input.name,
        email: input.email,
        groups: { set: groups.map((g) => ({ id: g.id })) },
      },
    })
  } else {
    // Contato nasce do uso: e-mail digitado num evento, sem id ainda.
    await prisma.contact.upsert({
      where: { calendarId_email: { calendarId: calendar.id, email: input.email } },
      create: {
        calendarId: calendar.id,
        email: input.email,
        name: input.name,
        groups: { connect: groups.map((g) => ({ id: g.id })) },
      },
      update: {
        name: input.name,
        groups: { set: groups.map((g) => ({ id: g.id })) },
      },
    })
  }

  revalidatePath(`/admin/${slug}/contatos`)
}

export async function deleteContact(slug: string, contactId: string) {
  const { calendar } = await requireCalendarAdmin(slug)
  await prisma.contact.delete({ where: { id: contactId, calendarId: calendar.id } })
  revalidatePath(`/admin/${slug}/contatos`)
}

/**
 * Grupo expande no momento da escrita: o evento guarda pessoas, não o grupo.
 * Se guardasse o grupo, mudar a composição dele reescreveria silenciosamente
 * a lista de convidados de eventos que já foram enviados (§6.7).
 */
export async function expandGroup(slug: string, groupId: string): Promise<string[]> {
  const { calendar } = await requireCalendarAdmin(slug)

  const group = await prisma.contactGroup.findFirst({
    where: { id: groupId, calendarId: calendar.id },
    include: { contacts: { select: { email: true } } },
  })

  return group?.contacts.map((c) => c.email) ?? []
}
