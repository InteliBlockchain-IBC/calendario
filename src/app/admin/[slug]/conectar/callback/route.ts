import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient } from '@/lib/google/oauth'
import { prisma } from '@/lib/db'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const searchParams = new URL(request.url).searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete({ name: 'oauth_state', path: `/admin/${slug}/conectar` })

  // Compara com o cookie httpOnly gravado em /start antes de trocar qualquer
  // code — sem isso o callback aceitaria um code de qualquer origem (CSRF de
  // login OAuth).
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=state-invalido`,
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=sem-codigo`,
    )
  }

  const oauth2 = buildOAuthClient(slug)

  try {
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=sem-refresh-token`,
      )
    }

    oauth2.setCredentials(tokens)
    const { data: profile } = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get()

    await prisma.googleConnection.upsert({
      where: { calendarId: calendar.id },
      create: {
        calendarId: calendar.id,
        googleEmail: profile.email ?? 'desconhecido',
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        googleEmail: profile.email ?? 'desconhecido',
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    })
  } catch (err) {
    console.error('Falha ao trocar código por token / buscar perfil do Google:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=falha-troca-token`,
    )
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar`)
}
