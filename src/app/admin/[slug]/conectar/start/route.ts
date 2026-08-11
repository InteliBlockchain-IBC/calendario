import { redirect } from 'next/navigation'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient, OAUTH_SCOPES } from '@/lib/google/oauth'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireCalendarAdmin(slug)

  // state protege contra OAuth login CSRF: sem isso, alguém pode iniciar o
  // consentimento fora do app, capturar o code emitido para este redirect_uri
  // (previsível) e mandar o link para um admin logado, que acabaria
  // conectando a agenda do clube à conta Google do atacante.
  const state = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutos — só precisa sobreviver ao round-trip com o Google
    path: `/admin/${slug}/conectar`,
  })

  const url = buildOAuthClient(slug).generateAuthUrl({
    // offline + consent são obrigatórios: sem os dois o Google não devolve
    // refresh_token, e a conexão morre em uma hora.
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    state,
  })

  redirect(url)
}
