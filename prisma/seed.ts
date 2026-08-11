import { createCalendar } from '../src/lib/calendar/create-calendar'
import { prisma } from '../src/lib/db'

const LABELS = [
  { name: 'Educacional', color: '#3B82F6' },
  { name: 'Projetos', color: '#22C55E' },
  { name: 'Marketing', color: '#EC4899' },
  { name: 'Pessoas', color: '#F59E0B' },
  { name: 'Geral', color: '#6366F1' },
]

async function main() {
  let calendar = await prisma.calendar.findUnique({ where: { slug: 'ibc' } })

  if (!calendar) {
    calendar = await createCalendar({
      slug: 'ibc',
      name: 'Inteli Blockchain',
      ownerEmail: 'messias.olivindo@sou.inteli.edu.br',
      allowedDomain: 'sou.inteli.edu.br',
      adminEmails: ['messias.olivindo@sou.inteli.edu.br'],
    })
    console.log(`Calendário criado: ${calendar.name} (/${calendar.slug})`)
  } else {
    console.log(`Calendário "${calendar.slug}" já existe.`)
  }

  // Idempotente: só cria a label que ainda não existe naquele calendário.
  const created = await prisma.label.createMany({
    data: LABELS.map((label) => ({ ...label, calendarId: calendar.id })),
    skipDuplicates: true,
  })
  console.log(`${created.count} label(s) criada(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
