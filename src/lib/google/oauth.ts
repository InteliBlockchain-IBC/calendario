import { google } from 'googleapis'

// O callback busca o e-mail da conta conectada via `oauth2.userinfo.get()`
// (para exibir "conectado como X" e gravar em GoogleConnection.googleEmail) —
// sem o escopo de userinfo essa chamada volta 401, mesmo com o token de
// calendar válido, porque o Google nega por escopo insuficiente, não por
// token ausente.
export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
]

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
