'use client'

import Link from 'next/link'
import { ErrorScreen, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ErrorScreen'

/**
 * `error.message` de propósito NÃO aparece: mensagem de exceção de servidor
 * costuma carregar caminho de arquivo, nome de coluna e trecho de query. O
 * `digest` é o identificador que o Next põe também no log do servidor, e é o
 * que permite achar o erro real sem expor nada.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorScreen
      title="Algo deu errado"
      actions={
        <>
          <button type="button" onClick={reset} className={PRIMARY_BUTTON}>
            Tentar de novo
          </button>
          <Link href="/" className={SECONDARY_BUTTON}>
            Ir para o início
          </Link>
        </>
      }
    >
      Não conseguimos carregar esta página.
      {error.digest && (
        <>
          {' '}
          Se acontecer de novo, informe o código <code>{error.digest}</code>.
        </>
      )}
    </ErrorScreen>
  )
}
