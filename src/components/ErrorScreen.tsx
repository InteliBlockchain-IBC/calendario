import type { ReactNode } from 'react'

export const PRIMARY_BUTTON = 'rounded-lg bg-neutral-900 px-4 py-2 text-white'
export const SECONDARY_BUTTON = 'rounded-lg border px-4 py-2'

/**
 * Casca de toda tela de parede do produto: título que diz o que houve,
 * explicação em uma frase e **pelo menos uma saída**. Nenhum erro pode
 * terminar sem link (§6.3) — era o que fazia todo 404 do Next virar beco sem
 * saída.
 */
export function ErrorScreen({
  title,
  children,
  actions,
}: {
  title: string
  children?: ReactNode
  actions: ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <div className="text-sm opacity-70">{children}</div>}
      <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
    </main>
  )
}
