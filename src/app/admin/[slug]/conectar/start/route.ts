import { redirect } from 'next/navigation'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient, CALENDAR_SCOPE } from '@/lib/google/oauth'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireCalendarAdmin(slug)

  const url = buildOAuthClient(slug).generateAuthUrl({
    // offline + consent são obrigatórios: sem os dois o Google não devolve
    // refresh_token, e a conexão morre em uma hora.
    access_type: 'offline',
    prompt: 'consent',
    scope: [CALENDAR_SCOPE],
  })

  redirect(url)
}
