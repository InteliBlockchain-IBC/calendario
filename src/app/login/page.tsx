import { signIn } from '@/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: next ?? '/' })
        }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Calendário Inteli Blockchain</h1>
        <p className="text-sm opacity-70">
          Entre com a conta do clube para gerenciar o calendário.
        </p>
        <button
          type="submit"
          className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-white"
        >
          Entrar com Google
        </button>
      </form>
    </main>
  )
}
