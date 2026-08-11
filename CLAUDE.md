# CLAUDE.md

Contexto rápido para IA. Para entendimento completo, **sempre ler `docs/ARCHITECTURE.md` primeiro**.

## O que é

Plataforma de calendário do clube **Inteli Blockchain**. A diretoria mantém a agenda aqui; a plataforma espelha tudo no Google Agenda e publica no site o que for marcado como público. Saídas: página pública, embed para a landing, feed `.ics`.

## Stack

App **Next.js único** (App Router, full-stack) — não há backend separado.

- Next.js 16, React 19, Tailwind v4, TypeScript
- Prisma 6 + Postgres (conexão direta, rede interna da VPS — sem pooler)
- Auth.js (NextAuth v5) com Google
- Container Docker no EasyPanel, imagem publicada no GHCR pelo GitHub Actions

## Workflow obrigatório

Fluxo **superpowers**, sem exceção: `brainstorming` → spec → `writing-plans` → plano → execução. Cada etapa espera aprovação antes da seguinte.

- Specs em `docs/superpowers/specs/`, planos em `docs/superpowers/plans/`.
- `docs/superpowers/` é **gitignored** — artefatos de sessão, não documentação do repo.
- A verdade versionada do sistema é o `docs/ARCHITECTURE.md`. Mudou schema, endpoint ou arquitetura? Atualize **esse** arquivo na mesma PR.
- `docs/PRODUCT.md` guarda o porquê e o que foi cortado de propósito. Antes de "melhorar" algo, confira se não está cortado lá.

Pular o fluxo só para: typo, ajuste óbvio em 1 arquivo, exploração.

## Fluxo de git

`develop` é a branch padrão e alvo de **todo** PR. `main` é produção: push nela dispara o deploy.

**Nunca commite direto em `main` nem em `develop`.**

```bash
git worktree add .worktrees/<slug> -b <tipo>/<slug> develop
```

Conventional commits com descrição em português: `feat: adiciona feed .ics`.

## Regras técnicas críticas

1. **Rode testes com `npm test`.** A máquina tem pouca RAM e o script está capado em 2 forks. `vitest` sem cap já causou OOM-kill aqui.
2. **`Event.attendees` e `Contact` nunca saem em rota pública** — nem no JSON, nem na página do evento, nem no `.ics`. É regra de consulta e de tipo, não de renderização.
3. **O `Event` tem dois blocos de campos com donos distintos.** O sync sobrescreve os campos do Google e **nunca** toca `isPublic`, `publicTitle`, `publicDescription`, `imageUrl`, `labelId`, `colorOverride`, `signupUrl`.
4. **Evento novo vindo do Google nasce com `isPublic = false`.** Nada aparece no site sem alguém publicar.
5. **A regra de "ausente = cancelado" vale só na varredura completa.** Aplicá-la na incremental cancela o calendário inteiro.
6. **Toda consulta escopada por `calendarId`.** Nenhuma query global.

## Setup rápido

```bash
docker compose up -d db
cp .env.example .env   # preencher AUTH_* e gerar AUTH_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:3000
```
