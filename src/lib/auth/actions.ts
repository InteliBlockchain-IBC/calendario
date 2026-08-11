'use server'

import { signOut } from '@/auth'

/**
 * "Sair" e "entrar com outra conta" são a mesma coisa com destinos
 * diferentes.
 *
 * Sem validação do destino, de propósito: o Auth.js transforma `redirectTo` em
 * `callbackUrl` e o passa pelo callback `redirect`, cujo padrão só aceita
 * caminho do próprio host (`@auth/core/lib/init.js:13-18`). Validar de novo
 * aqui duplicaria garantia da biblioteca.
 */
export async function signOutAction(redirectTo = '/login'): Promise<void> {
  await signOut({ redirectTo })
}
