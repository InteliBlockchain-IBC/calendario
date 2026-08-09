import { google } from 'googleapis'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export function redirectUri(slug: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar/callback`
}

export function buildOAuthClient(slug: string) {
  return new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    redirectUri(slug),
  )
}
