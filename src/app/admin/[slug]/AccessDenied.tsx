import Link from 'next/link'
import { ErrorScreen, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ErrorScreen'
import { signOutAction } from '@/lib/auth/actions'
import type { AdminAccess } from '@/lib/auth/guard'

/**
 * Cada motivo de negativa vira uma tela diferente. Na v1 os quatro caíam no
 * mesmo 404 mudo, e um admin logado com a conta pessoal via uma parede
 * indistinguível de "essa página não existe" (§1, §6.1).
 */
export function AccessDenied({
  access,
  slug,
}: {
  access: Extract<AdminAccess, { ok: false }>
  slug: string
}) {
  const inicio = (
    <Link href="/" className={SECONDARY_BUTTON}>
      Ir para o início
    </Link>
  )
  const meus = (
    <Link href="/meus" className={SECONDARY_BUTTON}>
      Ver meus calendários
    </Link>
  )
  // `.bind` é como se passa argumento para Server Action; o destino continua
  // sendo entrada de usuário e é validado dentro de signOutAction.
  const outraConta = (
    <form action={signOutAction.bind(null, `/login?next=/admin/${slug}`)}>
      <button type="submit" className={PRIMARY_BUTTON}>
        Entrar com outra conta
      </button>
    </form>
  )

  switch (access.reason) {
    case 'not-found':
      return (
        <ErrorScreen
          title="Esse calendário não existe"
          actions={
            <>
              {meus}
              {inicio}
            </>
          }
        >
          Nenhum calendário responde por <code>/{slug}</code>. Confira o link — ele pode estar
          digitado errado.
        </ErrorScreen>
      )

    case 'disabled':
      return (
        <ErrorScreen
          title="Esse calendário está desativado"
          actions={
            <>
              {meus}
              {inicio}
            </>
          }
        >
          O calendário <code>/{slug}</code> existe, mas foi desligado por quem o administra.
          Nada foi apagado: reativá-lo devolve tudo.
        </ErrorScreen>
      )

    case 'domain':
      return (
        <ErrorScreen
          title="Este calendário aceita só contas do domínio dele"
          actions={
            <>
              {outraConta}
              {meus}
            </>
          }
        >
          Você está conectado como <strong>{access.email}</strong>, mas <code>/{slug}</code> só
          aceita contas <strong>@{access.allowedDomain}</strong>.
        </ErrorScreen>
      )

    case 'not-admin':
      return (
        <ErrorScreen
          title="Você não administra este calendário"
          actions={
            <>
              {outraConta}
              {meus}
            </>
          }
        >
          Você está conectado como <strong>{access.email}</strong>, mas esse e-mail não está na
          lista de admins de <code>/{slug}</code>. Peça a quem administra para incluir você, ou
          entre com a conta certa.
        </ErrorScreen>
      )
  }
}
