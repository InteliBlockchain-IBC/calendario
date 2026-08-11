import { describe, it, expect } from 'vitest'
import { decideAccess } from './access'

const ATIVO = { status: 'ACTIVE' as const, allowedDomain: null }

describe('decideAccess', () => {
  it('calendário inexistente é "not-found"', () => {
    expect(decideAccess({ calendar: null, email: 'a@x.com', isAdmin: true })).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('calendário desativado é "disabled" mesmo para quem é admin', () => {
    // A ordem importa: se a checagem de admin viesse antes, um admin de
    // calendário desligado entraria e veria uma tela que não deveria existir.
    expect(
      decideAccess({
        calendar: { status: 'DISABLED', allowedDomain: null },
        email: 'a@x.com',
        isAdmin: true,
      }),
    ).toEqual({ ok: false, reason: 'disabled' })
  })

  it('e-mail fora do domínio permitido é "domain", e devolve o domínio exigido', () => {
    expect(
      decideAccess({
        calendar: { status: 'ACTIVE', allowedDomain: 'sou.inteli.edu.br' },
        email: 'alguem@gmail.com',
        isAdmin: true,
      }),
    ).toEqual({ ok: false, reason: 'domain', allowedDomain: 'sou.inteli.edu.br' })
  })

  it('domínio restrito aceita e-mail daquele domínio', () => {
    expect(
      decideAccess({
        calendar: { status: 'ACTIVE', allowedDomain: 'sou.inteli.edu.br' },
        email: 'messias@sou.inteli.edu.br',
        isAdmin: true,
      }),
    ).toEqual({ ok: true })
  })

  it('sem allowedDomain, qualquer domínio serve', () => {
    expect(decideAccess({ calendar: ATIVO, email: 'alguem@gmail.com', isAdmin: true })).toEqual({
      ok: true,
    })
  })

  it('sem linha em CalendarAdmin é "not-admin"', () => {
    expect(decideAccess({ calendar: ATIVO, email: 'alguem@gmail.com', isAdmin: false })).toEqual({
      ok: false,
      reason: 'not-admin',
    })
  })

  it('quando domínio E allowlist falham, a explicação é o domínio', () => {
    // Dizer "você não administra este calendário" mandaria a pessoa pedir um
    // acesso que a restrição de domínio recusaria de todo jeito.
    expect(
      decideAccess({
        calendar: { status: 'ACTIVE', allowedDomain: 'sou.inteli.edu.br' },
        email: 'alguem@gmail.com',
        isAdmin: false,
      }),
    ).toEqual({ ok: false, reason: 'domain', allowedDomain: 'sou.inteli.edu.br' })
  })
})
