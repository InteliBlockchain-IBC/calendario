import { createCalendar } from '../src/lib/calendar/create-calendar'
import { prisma } from '../src/lib/db'

async function main() {
  const existing = await prisma.calendar.findUnique({ where: { slug: 'ibc' } })
  if (existing) {
    console.log('Calendário "ibc" já existe — nada a fazer.')
    return
  }

  const calendar = await createCalendar({
    slug: 'ibc',
    name: 'Inteli Blockchain',
    ownerEmail: 'messias.olivindo@sou.inteli.edu.br',
    allowedDomain: 'sou.inteli.edu.br',
    adminEmails: ['messias.olivindo@sou.inteli.edu.br'],
  })

  console.log(`Calendário criado: ${calendar.name} (/${calendar.slug})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
