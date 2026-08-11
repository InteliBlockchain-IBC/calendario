import Link from 'next/link'
import { signIn } from '@/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // Padrão `/meus`: quem acabou de entrar quer o próprio painel, não a página
  // pública (§9). O destino não é validado aqui porque o Auth.js já restringe
  // `callbackUrl` ao próprio host — ver a nota de segurança no topo do plano.
  const redirectTo = next ?? '/meus'

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Calendário Inteli Blockchain</h1>
        <p className="text-sm opacity-70">
          Entre com a conta do clube para gerenciar o calendário.
        </p>
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo })
          }}
        >
          <button type="submit" className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-white">
            Entrar com Google
          </button>
        </form>
        <Link href="/" className="inline-block text-sm underline opacity-70">
          Voltar ao calendário
        </Link>
      </div>
    </main>
  )
}
