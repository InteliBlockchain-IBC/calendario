import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient } from '@/lib/google/oauth'
import { prisma } from '@/lib/db'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const code = new URL(request.url).searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=sem-codigo`,
    )
  }

  const oauth2 = buildOAuthClient(slug)
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

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar`)
}
