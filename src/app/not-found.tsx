import Link from 'next/link'
import { ErrorScreen, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ErrorScreen'

export default function NotFound() {
  return (
    <ErrorScreen
      title="Essa página não existe"
      actions={
        <>
          <Link href="/" className={PRIMARY_BUTTON}>
            Ir para o início
          </Link>
          <Link href="/meus" className={SECONDARY_BUTTON}>
            Ver meus calendários
          </Link>
        </>
      }
    >
      O endereço pode estar digitado errado, ou o conteúdo pode ter sido removido.
    </ErrorScreen>
  )
}
