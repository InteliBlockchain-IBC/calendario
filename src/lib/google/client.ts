import { google, type calendar_v3 } from 'googleapis'
import { prisma } from '@/lib/db'

export class GoogleNotConnectedError extends Error {
  constructor(calendarId: string) {
    super(`Calendário ${calendarId} não tem conexão com o Google.`)
    this.name = 'GoogleNotConnectedError'
  }
}

/**
 * Autentica sempre pela GoogleConnection do calendário — nunca pela sessão de
 * quem está logado. Assim todos os eventos aparecem no Google como criados
 * pela conta oficial do clube, e nenhum admin precisa da senha dela (§5).
 */
export async function getCalendarClient(calendarId: string): Promise<calendar_v3.Calendar> {
  const connection = await prisma.googleConnection.findUnique({ where: { calendarId } })
  if (!connection) throw new GoogleNotConnectedError(calendarId)

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2.setCredentials({ refresh_token: connection.refreshToken })

  // A biblioteca renova o access token sozinha; guardamos o novo para
  // economizar uma ida ao Google na próxima chamada.
  oauth2.on('tokens', (tokens) => {
    if (!tokens.access_token) return
    void prisma.googleConnection
      .update({
        where: { calendarId },
        data: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      })
      // Best-effort: cache do access token. Se falhar, a próxima chamada renova de novo.
      .catch((err) => console.error('Falha ao salvar access token renovado:', err))
  })

  return google.calendar({ version: 'v3', auth: oauth2 })
}
