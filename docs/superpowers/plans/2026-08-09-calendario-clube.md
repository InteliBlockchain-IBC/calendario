# Calendário do Clube — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma plataforma web onde a diretoria do Inteli Blockchain mantém o calendário do clube uma única vez, espelhado no Google Agenda, com página pública, embed para a landing e feed `.ics`.

**Architecture:** App Next.js único (App Router, full-stack) rodando como container de processo longo, com Postgres na rede interna da VPS. A plataforma é a fonte da verdade e escreve no Google Agenda em toda operação; o Google devolve mudanças por sincronização disparada na leitura de rotas públicas. A separação entre campos "do Google" e campos "da plataforma" no modelo `Event` é o que faz a sincronização não ter conflito.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Prisma 6, Postgres 15, Auth.js (NextAuth v5), `googleapis`, `ics`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-08-calendario-clube-design.md` — leia antes de começar. As referências `§N` neste plano apontam para ele.

---

## Global Constraints

Estas regras valem para **todas** as tarefas. Não repetidas em cada uma.

- **Idioma:** documentação, textos de UI e mensagens de commit em **português**. Código, nomes de variáveis, funções, tipos e arquivos em **inglês**.
- **Commits:** conventional commits com descrição em português — `feat: adiciona feed .ics`, `fix: corrige janela de sync`.
- **Git:** `develop` é a branch padrão e alvo de todo PR. `main` é produção e push nela dispara o deploy. **Nunca commitar direto em `main` nem em `develop`.** Trabalho de agente em `git worktree add .worktrees/<slug> -b <tipo>/<slug> develop`.
- **Testes — limite de memória da máquina:** esta máquina tem 12 núcleos mas apenas ~15 GB de RAM, frequentemente com pouca folga. Runner de teste sem limite de workers já causou OOM-kill aqui. **Sempre** rodar via `npm test`, que está capado em 2 forks. Nunca invocar `vitest` direto sem `--pool=forks --poolOptions.forks.maxForks=2`.
- **Privacidade (regra dura):** `Event.attendees` e a tabela `Contact` **nunca** aparecem em resposta de rota pública — nem no JSON, nem na página do evento, nem no `.ics`. O filtro mora na consulta e no tipo, nunca na renderização.
- **Multi-inquilino:** toda consulta é escopada por `calendarId`. Nenhuma query global. Nenhuma variável de ambiente específica de inquilino — o que varia por calendário mora no banco.
- **Datas:** persistidas em UTC no Postgres. Formatação para exibição usa `Intl.DateTimeFormat` com `timeZone: calendar.timezone`. Nenhuma biblioteca de data é necessária.
- **Node:** 22 LTS.

### Constantes do sistema (valores exatos)

Definidas em `src/lib/sync/constants.ts` na Task 3 e importadas por todos os consumidores. Nunca duplicar o número:

```ts
export const STALE_AFTER_MS = 10 * 60 * 1000        // 10 min
export const BLOCKING_AFTER_MS = 24 * 60 * 60 * 1000 // 24 h
export const SYNC_LOCK_MS = 2 * 60 * 1000            // 2 min
export const DEFAULT_SYNC_PAST_DAYS = 90
export const DEFAULT_SYNC_FUTURE_DAYS = 365
export const GOOGLE_MAX_RESULTS = 2500
export const RESERVED_SLUGS = ['admin', 'api', 'embed', 'c', 'login', 'auth'] as const
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024      // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
```

---

## Estrutura de arquivos

Mapa do que existe ao fim do plano. Cada arquivo tem uma responsabilidade.

```
calendario/
├── CLAUDE.md                                  T0
├── README.md                                  T0
├── Dockerfile                                 T12
├── docker-compose.yml                         T0
├── vitest.config.ts                           T0
├── .env.example                               T0
├── .github/workflows/deploy.yml               T12
├── prisma/
│   ├── schema.prisma                          T1
│   └── seed.ts                                T1
├── docs/                                      T13
└── src/
    ├── app/
    │   ├── (public)/c/[slug]/page.tsx         T10
    │   ├── (public)/c/[slug]/e/[id]/page.tsx  T10
    │   ├── embed/[slug]/page.tsx              T11
    │   ├── admin/[slug]/page.tsx              T7
    │   ├── admin/[slug]/actions.ts            T7,T8,T9
    │   ├── admin/[slug]/EventForm.tsx         T8
    │   ├── admin/[slug]/conectar/**           T5b
    │   ├── admin/[slug]/contatos/page.tsx     T9
    │   └── api/
    │       ├── auth/[...nextauth]/route.ts    T2
    │       ├── calendars/[slug]/events/route.ts   T11
    │       ├── calendars/[slug]/ics/route.ts      T11
    │       ├── calendars/[slug]/sync/route.ts     T6
    │       ├── calendars/[slug]/upload/route.ts   T7
    │       └── uploads/[...path]/route.ts         T7
    ├── auth.ts                                T2
    ├── lib/
    │   ├── db.ts                              T1
    │   ├── google/oauth.ts                    T5b
    │   ├── calendar/create-calendar.ts        T1
    │   ├── auth/guard.ts                      T2
    │   ├── google/map-event.ts                T4
    │   ├── google/client.ts                   T5
    │   ├── google/list-events.ts              T5
    │   ├── google/write-event.ts              T8
    │   ├── sync/constants.ts                  T3
    │   ├── sync/types.ts                      T3
    │   ├── sync/reconcile.ts                  T3
    │   ├── sync/decide-sync.ts                T3
    │   ├── sync/run-sync.ts                   T6
    │   ├── public/serialize.ts                T11
    │   ├── public/ics.ts                      T11
    │   └── public/load-calendar.ts            T6
    └── components/
        ├── EventList.tsx                      T10
        ├── MonthGrid.tsx                      T10
        └── CalendarView.tsx                   T10
```

**Ordem de dependência:** T3 (lógica pura) e T4 (mapper puro) não dependem de nada e são a espinha dorsal — vêm antes de qualquer chamada real ao Google, como manda o §9 do spec.

---

## Task 0: Esqueleto do repositório

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `docker-compose.yml`, `README.md`, `CLAUDE.md`
- Create: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: nada
- Produces: projeto Next.js que builda, `npm test` capado em 2 forks, Postgres local via docker-compose

- [ ] **Step 1: Criar o projeto Next.js**

Na raiz de `projetos/calendario` (o repo git já existe):

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm
```

Se o comando reclamar que o diretório não está vazio por causa de `docs/` e `.git/`, responda que sim para prosseguir — nenhum dos dois é sobrescrito.

- [ ] **Step 2: Instalar as dependências do projeto**

```bash
npm install @prisma/client next-auth@beta googleapis ics
npm install -D prisma vitest @vitejs/plugin-react tsx
```

- [ ] **Step 3: Configurar o Vitest com o limite de workers**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

Em `package.json`, substituir/adicionar os scripts. **O cap de forks não é opcional** — ver Global Constraints:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run --pool=forks --poolOptions.forks.maxForks=2",
    "test:watch": "vitest --pool=forks --poolOptions.forks.maxForks=2",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 4: Verificar que o runner funciona**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('ambiente de teste', () => {
  it('roda', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS, 1 teste.

Depois apague `src/lib/smoke.test.ts` — ele só existiu para provar que o runner está de pé.

- [ ] **Step 5: Postgres local**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: calendario
      POSTGRES_PASSWORD: calendario
      POSTGRES_DB: calendario
    ports:
      - '5433:5432'
    volumes:
      - calendario_pgdata:/var/lib/postgresql/data

volumes:
  calendario_pgdata:
```

Porta `5433` no host de propósito: evita colidir com o Postgres do `gestao_pessoas` se os dois estiverem rodando.

Run: `docker compose up -d db`
Expected: container `db` em estado `running` (`docker compose ps`).

- [ ] **Step 6: Variáveis de ambiente**

Create `.env.example`:

```
# Banco — conexão direta, sem pooler (§4.1)
DATABASE_URL="postgresql://calendario:calendario@localhost:5433/calendario"

# Auth.js
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# Volume das artes de evento (§4.1)
UPLOAD_DIR="./uploads"

# Base pública, usada no snippet de embed e no feed .ics
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Copiar para `.env` e gerar o secret: `npx auth secret` (ou `openssl rand -base64 32`).

- [ ] **Step 7: `.gitignore`**

Create `.gitignore` (copia a convenção do `gestao_pessoas` — §11.1):

```
node_modules/
.next/
out/
build/
*.tsbuildinfo

.env
.env*.local

# IA — artefatos de sessão, não versionados
docs/superpowers/
.claude/
.agents/
ai/
contexts/

# Worktrees de agente
.worktrees/

# Uploads locais
uploads/

.DS_Store
```

**Atenção:** `docs/superpowers/` passa a ser ignorado, mas o spec e este plano já estão commitados. Removê-los do índice mantendo os arquivos em disco:

```bash
git rm -r --cached docs/superpowers
```

- [ ] **Step 8: `CLAUDE.md`**

Create `CLAUDE.md`:

```markdown
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
3. **O `Event` tem dois blocos de campos com donos distintos.** O sync sobrescreve os campos do Google e **nunca** toca `isPublic`, `publicTitle`, `publicDescription`, `imageUrl`, `area`, `signupUrl`.
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
```

- [ ] **Step 9: `README.md`**

Create `README.md`:

```markdown
# Calendário — Inteli Blockchain

Plataforma de gestão do calendário do clube. A diretoria mantém a agenda em um lugar só; a plataforma espelha no Google Agenda e publica no site o que for marcado como público.

## Stack

Next.js 16 (App Router, full-stack) · React 19 · Tailwind v4 · Prisma 6 · Postgres 15 · Auth.js · Google Calendar API

## Pré-requisitos

- Node 22
- Docker (para o Postgres local)
- Um OAuth client no Google Cloud com a Calendar API habilitada

## Setup local

```bash
docker compose up -d db
cp .env.example .env
npx auth secret            # preenche AUTH_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

App em `http://localhost:3000`. Admin em `/admin/ibc`.

## Comandos

| Comando | O quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm test` | testes (capado em 2 workers — ver `CLAUDE.md`) |
| `npm run db:migrate` | aplica migrations |
| `npm run db:seed` | cria o calendário e os admins iniciais |
| `npm run db:studio` | Prisma Studio |

## Documentação

| Doc | Responde |
|---|---|
| `docs/ARCHITECTURE.md` | o que o sistema é: schema, rotas, sync, auth |
| `docs/PRODUCT.md` | por que ele é assim, e o que foi cortado de propósito |
| `docs/DEPLOY.md` | como colocar no ar |
| `docs/DESIGN_SYSTEM.md` | cor, tipografia e componentes |
```

- [ ] **Step 10: Verificar que o build passa**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 11: Criar as branches e commitar**

```bash
git add -A
git commit -m "feat: cria esqueleto do projeto Next.js"
git branch -M main
git checkout -b develop
```

---

## Task 1: Schema, `createCalendar()` e seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`, `src/lib/calendar/create-calendar.ts`, `src/lib/calendar/create-calendar.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `prisma` (cliente singleton) de `@/lib/db`
  - `createCalendar(input: CreateCalendarInput): Promise<Calendar>` de `@/lib/calendar/create-calendar`
  - `validateSlug(slug: string): void` — lança `Error` com mensagem em português
  - Tipos gerados do Prisma: `Calendar`, `Event`, `Contact`, `ContactGroup`, `CalendarAdmin`, `GoogleConnection`, enums `Area`, `EventStatus`, `CalendarStatus`

- [ ] **Step 1: Escrever o schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Area {
  EDUCATIONAL
  PROJECTS
  MARKETING
  PEOPLE
  GENERAL
}

enum EventStatus {
  CONFIRMED
  CANCELLED
}

enum CalendarStatus {
  ACTIVE
  DISABLED
}

model Calendar {
  id               String         @id @default(uuid())
  slug             String         @unique
  name             String
  timezone         String         @default("America/Sao_Paulo")
  allowedDomain    String?
  ownerEmail       String
  status           CalendarStatus @default(ACTIVE)
  googleCalendarId String?
  syncPastDays     Int            @default(90)
  syncFutureDays   Int            @default(365)
  lastSyncedAt     DateTime?
  syncingAt        DateTime?
  lastSyncError    String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  admins           CalendarAdmin[]
  googleConnection GoogleConnection?
  events           Event[]
  contacts         Contact[]
  contactGroups    ContactGroup[]
}

model GoogleConnection {
  id           String    @id @default(uuid())
  calendarId   String    @unique
  googleEmail  String
  refreshToken String
  accessToken  String?
  expiresAt    DateTime?

  calendar Calendar @relation(fields: [calendarId], references: [id], onDelete: Cascade)
}

model CalendarAdmin {
  id         String @id @default(uuid())
  calendarId String
  email      String

  calendar Calendar @relation(fields: [calendarId], references: [id], onDelete: Cascade)

  @@unique([calendarId, email])
}

model Contact {
  id         String   @id @default(uuid())
  calendarId String
  name       String?
  email      String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  calendar Calendar       @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  groups   ContactGroup[] @relation("ContactToGroup")

  @@unique([calendarId, email])
}

model ContactGroup {
  id         String @id @default(uuid())
  calendarId String
  name       String

  calendar Calendar  @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  contacts Contact[] @relation("ContactToGroup")

  @@unique([calendarId, name])
}

model Event {
  id         String @id @default(uuid())
  calendarId String

  // --- Campos do Google: sobrescritos a cada sync ---
  googleEventId    String
  title            String
  description      String?
  startsAt         DateTime
  endsAt           DateTime
  allDay           Boolean     @default(false)
  location         String?
  status           EventStatus @default(CONFIRMED)
  recurringEventId String?
  attendees        Json        @default("[]")

  // --- Campos da plataforma: o sync NUNCA toca ---
  isPublic          Boolean @default(false)
  publicTitle       String?
  publicDescription String?
  imageUrl          String?
  area              Area?
  signupUrl         String?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  syncedAt  DateTime?

  calendar Calendar @relation(fields: [calendarId], references: [id], onDelete: Cascade)

  @@unique([calendarId, googleEventId])
  @@index([calendarId, startsAt])
}
```

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
npx prisma migrate dev --name inicial
```

Expected: migration criada em `prisma/migrations/` e aplicada; cliente Prisma gerado.

- [ ] **Step 3: Cliente Prisma singleton**

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Escrever o teste de validação de slug (falhando)**

Create `src/lib/calendar/create-calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateSlug } from './create-calendar'

describe('validateSlug', () => {
  it('aceita slug válido', () => {
    expect(() => validateSlug('ibc')).not.toThrow()
    expect(() => validateSlug('inteli-blockchain')).not.toThrow()
  })

  it('rejeita slug reservado', () => {
    for (const reserved of ['admin', 'api', 'embed', 'c', 'login', 'auth']) {
      expect(() => validateSlug(reserved)).toThrow(/reservado/i)
    }
  })

  it('rejeita slug com formato inválido', () => {
    expect(() => validateSlug('IBC')).toThrow(/formato/i)
    expect(() => validateSlug('com espaço')).toThrow(/formato/i)
    expect(() => validateSlug('a')).toThrow(/formato/i)
    expect(() => validateSlug('com_underscore')).toThrow(/formato/i)
  })
})
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — `validateSlug` não existe.

- [ ] **Step 6: Implementar `createCalendar()`**

Create `src/lib/calendar/create-calendar.ts`:

```ts
import { prisma } from '@/lib/db'
import type { Calendar } from '@prisma/client'
import { RESERVED_SLUGS } from '@/lib/sync/constants'

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,39}$/

export type CreateCalendarInput = {
  slug: string
  name: string
  ownerEmail: string
  timezone?: string
  allowedDomain?: string | null
  adminEmails?: string[]
}

export function validateSlug(slug: string): void {
  if (!SLUG_FORMAT.test(slug)) {
    throw new Error(
      `Slug "${slug}" tem formato inválido: use 2 a 40 caracteres, apenas letras minúsculas, números e hífen.`,
    )
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    throw new Error(`Slug "${slug}" é reservado pelo sistema e não pode ser usado.`)
  }
}

/**
 * Ponto único de criação de calendário. Hoje só o seed chama; uma rota de
 * cadastro self-service chamaria a mesma função (§3.1).
 */
export async function createCalendar(input: CreateCalendarInput): Promise<Calendar> {
  validateSlug(input.slug)

  return prisma.calendar.create({
    data: {
      slug: input.slug,
      name: input.name,
      ownerEmail: input.ownerEmail,
      timezone: input.timezone ?? 'America/Sao_Paulo',
      allowedDomain: input.allowedDomain ?? null,
      admins: {
        create: (input.adminEmails ?? []).map((email) => ({ email })),
      },
    },
  })
}
```

`RESERVED_SLUGS` vive em `src/lib/sync/constants.ts`, criado na Task 3. Para esta task passar antes disso, crie o arquivo agora com apenas essa constante — a Task 3 adiciona as demais:

Create `src/lib/sync/constants.ts`:

```ts
export const RESERVED_SLUGS = ['admin', 'api', 'embed', 'c', 'login', 'auth'] as const
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npm test`
Expected: PASS, 3 testes.

- [ ] **Step 8: Escrever o seed**

Create `prisma/seed.ts`:

```ts
import { createCalendar } from '../src/lib/calendar/create-calendar'
import { prisma } from '../src/lib/db'

async function main() {
  const existing = await prisma.calendar.findUnique({ where: { slug: 'ibc' } })
  if (existing) {
    console.log('Calendário "ibc" já existe — nada a fazer.')
    return
  }

  const calendar = await createCalendar({
    slug: 'ibc',
    name: 'Inteli Blockchain',
    ownerEmail: 'messias.olivindo@sou.inteli.edu.br',
    allowedDomain: 'sou.inteli.edu.br',
    adminEmails: ['messias.olivindo@sou.inteli.edu.br'],
  })

  console.log(`Calendário criado: ${calendar.name} (/${calendar.slug})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

**Nota para quem executar:** confirme com o Messias os e-mails que devem entrar em `adminEmails` antes de rodar em produção. Localmente, o próprio e-mail basta.

- [ ] **Step 9: Rodar o seed**

Run: `npm run db:seed`
Expected: `Calendário criado: Inteli Blockchain (/ibc)`

Rodar de novo e confirmar que é idempotente:

Run: `npm run db:seed`
Expected: `Calendário "ibc" já existe — nada a fazer.`

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/db.ts src/lib/calendar src/lib/sync/constants.ts package.json
git commit -m "feat: adiciona schema, createCalendar e seed"
```

---

## Task 2: Auth.js com Google e guarda do admin

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/auth/guard.ts`, `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `prisma` de `@/lib/db`
- Produces:
  - `auth()`, `signIn()`, `signOut()`, `handlers` de `@/auth`
  - `requireCalendarAdmin(slug: string): Promise<{ calendar: Calendar; email: string }>` de `@/lib/auth/guard` — redireciona para `/login` se não autenticado, chama `notFound()` se o e-mail não for admin daquele calendário

- [ ] **Step 1: Configurar o Auth.js**

Create `src/auth.ts`:

```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
})
```

Sessão em JWT de propósito: o login serve apenas para identificar **quem** é o admin. A autorização real é sempre consultada no banco (`CalendarAdmin`), nunca lida do token — mesmo princípio do `gestao_pessoas`, onde o header de role é ignorado pelo backend.

- [ ] **Step 2: Handler da rota**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/auth'
```

- [ ] **Step 3: Guarda de admin**

Create `src/lib/auth/guard.ts`:

```ts
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import type { Calendar } from '@prisma/client'

/**
 * Autorização é sempre consultada no banco. O token diz apenas quem é a
 * pessoa; ele nunca decide o que ela pode fazer.
 */
export async function requireCalendarAdmin(
  slug: string,
): Promise<{ calendar: Calendar; email: string }> {
  const session = await auth()
  const email = session?.user?.email

  if (!email) redirect(`/login?next=/admin/${slug}`)

  const calendar = await prisma.calendar.findUnique({ where: { slug } })
  if (!calendar || calendar.status !== 'ACTIVE') notFound()

  if (calendar.allowedDomain && !email.endsWith(`@${calendar.allowedDomain}`)) {
    notFound()
  }

  const isAdmin = await prisma.calendarAdmin.findUnique({
    where: { calendarId_email: { calendarId: calendar.id, email } },
  })
  if (!isAdmin) notFound()

  return { calendar, email }
}
```

`notFound()` em vez de uma tela de "acesso negado" é deliberado: para quem não é admin, o painel de um calendário simplesmente não existe — não confirmamos que o recurso existe para quem não pode vê-lo.

- [ ] **Step 4: Página de login**

Create `src/app/login/page.tsx`:

```tsx
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
```

- [ ] **Step 5: Configurar o OAuth client no Google Cloud**

Manual, no console do Google Cloud, no projeto do clube:

1. Habilitar a **Google Calendar API**.
2. Em *OAuth consent screen*, criar como **External**, deixar em modo **Testing** (§4.3 do spec). Adicionar os e-mails da diretoria em *Test users* — sem isso o login falha.
3. Em *Credentials*, criar um OAuth client do tipo *Web application*.
4. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (e depois o domínio de produção).
5. Copiar client ID e secret para `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` no `.env`.

- [ ] **Step 6: Verificar o login de ponta a ponta**

Run: `npm run dev`, abrir `http://localhost:3000/login`, entrar com o e-mail que está no seed.
Expected: redireciona de volta autenticado, sem erro no console.

- [ ] **Step 7: Commit**

```bash
git add src/auth.ts src/app/api/auth src/lib/auth src/app/login
git commit -m "feat: adiciona login Google e guarda de admin do calendário"
```

---

## Task 3: Lógica pura de sincronização

Esta é a espinha dorsal do sistema e a única lógica não-trivial (§9 do spec). Nenhuma chamada ao Google acontece aqui — tudo é função pura, testável sem rede e sem banco.

**Files:**
- Modify: `src/lib/sync/constants.ts`
- Create: `src/lib/sync/types.ts`, `src/lib/sync/reconcile.ts`, `src/lib/sync/reconcile.test.ts`, `src/lib/sync/decide-sync.ts`, `src/lib/sync/decide-sync.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `reconcile(args: ReconcileArgs): ReconcileResult`
  - `decideSync(args: DecideSyncArgs): SyncDecision` onde `SyncDecision = 'skip' | 'background' | 'blocking'`
  - Tipos `GoogleEventInput`, `ExistingEvent`, `Attendee`, `ReconcileResult`

- [ ] **Step 1: Completar as constantes**

Modify `src/lib/sync/constants.ts` — adicionar às linhas existentes:

```ts
export const RESERVED_SLUGS = ['admin', 'api', 'embed', 'c', 'login', 'auth'] as const

export const STALE_AFTER_MS = 10 * 60 * 1000
export const BLOCKING_AFTER_MS = 24 * 60 * 60 * 1000
export const SYNC_LOCK_MS = 2 * 60 * 1000

export const DEFAULT_SYNC_PAST_DAYS = 90
export const DEFAULT_SYNC_FUTURE_DAYS = 365
export const GOOGLE_MAX_RESULTS = 2500

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
```

- [ ] **Step 2: Definir os tipos**

Create `src/lib/sync/types.ts`:

```ts
import type { Area, EventStatus } from '@prisma/client'

export type Attendee = {
  email: string
  name: string | null
  responseStatus: string
}

/** Evento vindo do Google, já normalizado pelo mapper (Task 4). */
export type GoogleEventInput = {
  googleEventId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  location: string | null
  status: EventStatus
  recurringEventId: string | null
  attendees: Attendee[]
}

/** Só o que a reconciliação precisa saber de uma linha já existente. */
export type ExistingEvent = {
  id: string
  googleEventId: string
  startsAt: Date
  status: EventStatus
}

/** Campos do Google. Note a ausência de todo campo da plataforma. */
export type GoogleFields = Omit<GoogleEventInput, 'googleEventId'> & {
  googleEventId: string
}

export type ReconcileResult = {
  creates: GoogleFields[]
  updates: { id: string; data: GoogleFields }[]
  cancels: string[]
  counts: { created: number; updated: number; cancelled: number }
}

export type ReconcileArgs = {
  incoming: GoogleEventInput[]
  existing: ExistingEvent[]
  /**
   * 'full' — varredura da janela inteira; ausência implica cancelamento.
   * 'incremental' — só o que mudou; ausência não significa nada.
   */
  mode: 'full' | 'incremental'
  window: { from: Date; to: Date }
}
```

`GoogleFields` não contém `isPublic`, `publicTitle`, `publicDescription`, `imageUrl`, `area` nem `signupUrl`. **Isso é proposital e é a garantia principal do desenho:** o tipo torna impossível a reconciliação sobrescrever um campo da plataforma, mesmo por engano.

- [ ] **Step 3: Escrever os testes da reconciliação (falhando)**

Create `src/lib/sync/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reconcile } from './reconcile'
import type { GoogleEventInput, ExistingEvent } from './types'

const WINDOW = {
  from: new Date('2026-05-01T00:00:00Z'),
  to: new Date('2027-08-01T00:00:00Z'),
}

function googleEvent(over: Partial<GoogleEventInput> = {}): GoogleEventInput {
  return {
    googleEventId: 'g1',
    title: 'Aula de Tokenização',
    description: 'link do meet',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: 'Sala 401',
    status: 'CONFIRMED',
    recurringEventId: null,
    attendees: [],
    ...over,
  }
}

function existingEvent(over: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: 'row-1',
    googleEventId: 'g1',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    status: 'CONFIRMED',
    ...over,
  }
}

describe('reconcile', () => {
  it('evento novo do Google vira criação', () => {
    const result = reconcile({
      incoming: [googleEvent()],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates).toHaveLength(1)
    expect(result.creates[0].googleEventId).toBe('g1')
    expect(result.counts.created).toBe(1)
  })

  it('criação nunca carrega campo da plataforma', () => {
    const result = reconcile({
      incoming: [googleEvent()],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    const created = result.creates[0] as Record<string, unknown>
    for (const platformField of [
      'isPublic',
      'publicTitle',
      'publicDescription',
      'imageUrl',
      'area',
      'signupUrl',
    ]) {
      expect(created).not.toHaveProperty(platformField)
    }
  })

  it('evento existente vira atualização, sem tocar campo da plataforma', () => {
    const result = reconcile({
      incoming: [googleEvent({ title: 'Aula de Tokenização (nova sala)' })],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].id).toBe('row-1')
    expect(result.updates[0].data.title).toBe('Aula de Tokenização (nova sala)')

    const data = result.updates[0].data as Record<string, unknown>
    for (const platformField of [
      'isPublic',
      'publicTitle',
      'publicDescription',
      'imageUrl',
      'area',
      'signupUrl',
    ]) {
      expect(data).not.toHaveProperty(platformField)
    }
  })

  it('atualização sobrescreve horário e local vindos do Google', () => {
    const result = reconcile({
      incoming: [
        googleEvent({
          startsAt: new Date('2026-08-12T23:00:00Z'),
          endsAt: new Date('2026-08-13T01:00:00Z'),
          location: 'Auditório',
        }),
      ],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.updates[0].data.startsAt).toEqual(new Date('2026-08-12T23:00:00Z'))
    expect(result.updates[0].data.location).toBe('Auditório')
  })

  it('evento cancelado no Google é marcado, não apagado', () => {
    const result = reconcile({
      incoming: [googleEvent({ status: 'CANCELLED' })],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.updates[0].data.status).toBe('CANCELLED')
    expect(result.counts.cancelled).toBe(1)
    expect(result.counts.updated).toBe(0)
  })

  it('ocorrência de série recorrente preserva recurringEventId', () => {
    const result = reconcile({
      incoming: [googleEvent({ googleEventId: 'g1_20260812', recurringEventId: 'g1' })],
      existing: [],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.creates[0].recurringEventId).toBe('g1')
    expect(result.creates[0].googleEventId).toBe('g1_20260812')
  })

  // --- O par crítico: varredura completa vs incremental ---

  it('varredura COMPLETA cancela evento local ausente dentro da janela', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent()],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual(['row-1'])
    expect(result.counts.cancelled).toBe(1)
  })

  it('varredura INCREMENTAL não toca evento local ausente', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent()],
      mode: 'incremental',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
    expect(result.updates).toEqual([])
    expect(result.counts.cancelled).toBe(0)
  })

  it('varredura completa não cancela evento fora da janela', () => {
    const result = reconcile({
      incoming: [],
      existing: [
        existingEvent({ id: 'antigo', startsAt: new Date('2020-01-01T00:00:00Z') }),
      ],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
  })

  it('varredura completa não cancela quem já está cancelado', () => {
    const result = reconcile({
      incoming: [],
      existing: [existingEvent({ status: 'CANCELLED' })],
      mode: 'full',
      window: WINDOW,
    })

    expect(result.cancels).toEqual([])
    expect(result.counts.cancelled).toBe(0)
  })
})
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `reconcile` não existe.

- [ ] **Step 5: Implementar `reconcile`**

Create `src/lib/sync/reconcile.ts`:

```ts
import type { ReconcileArgs, ReconcileResult, GoogleFields, GoogleEventInput } from './types'

function toGoogleFields(e: GoogleEventInput): GoogleFields {
  // Enumerado campo a campo de propósito: um spread aqui abriria a porta
  // para um campo da plataforma vazar para dentro da atualização.
  return {
    googleEventId: e.googleEventId,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    location: e.location,
    status: e.status,
    recurringEventId: e.recurringEventId,
    attendees: e.attendees,
  }
}

/**
 * Decide o que criar, atualizar e cancelar. Função pura: sem rede, sem banco.
 *
 * A distinção entre `mode: 'full'` e `mode: 'incremental'` é a regra mais
 * perigosa do sistema. Na varredura incremental o Google devolve apenas o que
 * mudou, então "ausente" não significa nada. Tratar ausência como cancelamento
 * ali cancelaria o calendário inteiro (§6.4).
 */
export function reconcile(args: ReconcileArgs): ReconcileResult {
  const { incoming, existing, mode, window } = args

  const existingByGoogleId = new Map(existing.map((e) => [e.googleEventId, e]))
  const seenGoogleIds = new Set<string>()

  const creates: GoogleFields[] = []
  const updates: { id: string; data: GoogleFields }[] = []
  const cancels: string[] = []

  let created = 0
  let updated = 0
  let cancelled = 0

  for (const event of incoming) {
    seenGoogleIds.add(event.googleEventId)
    const match = existingByGoogleId.get(event.googleEventId)
    const data = toGoogleFields(event)

    if (!match) {
      // Evento cancelado que nunca existimos localmente: nada a fazer.
      if (event.status === 'CANCELLED') continue
      creates.push(data)
      created++
      continue
    }

    updates.push({ id: match.id, data })
    if (event.status === 'CANCELLED' && match.status !== 'CANCELLED') cancelled++
    else updated++
  }

  if (mode === 'full') {
    for (const row of existing) {
      if (seenGoogleIds.has(row.googleEventId)) continue
      if (row.status === 'CANCELLED') continue
      if (row.startsAt < window.from || row.startsAt > window.to) continue
      cancels.push(row.id)
      cancelled++
    }
  }

  return { creates, updates, cancels, counts: { created, updated, cancelled } }
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 10 testes de `reconcile`.

- [ ] **Step 7: Escrever os testes da decisão de sync (falhando)**

Create `src/lib/sync/decide-sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideSync } from './decide-sync'

const NOW = new Date('2026-08-09T12:00:00Z')

function minutesAgo(n: number) {
  return new Date(NOW.getTime() - n * 60 * 1000)
}
function hoursAgo(n: number) {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000)
}

describe('decideSync', () => {
  it('sincronizado há 5 min: não faz nada', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(5), syncingAt: null, now: NOW }),
    ).toBe('skip')
  })

  it('sincronizado há 30 min: sincroniza em segundo plano', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(30), syncingAt: null, now: NOW }),
    ).toBe('background')
  })

  it('sincronizado há 2 dias: sincroniza bloqueando a resposta', () => {
    expect(
      decideSync({ lastSyncedAt: hoursAgo(48), syncingAt: null, now: NOW }),
    ).toBe('blocking')
  })

  it('nunca sincronizado: sincroniza bloqueando a resposta', () => {
    expect(decideSync({ lastSyncedAt: null, syncingAt: null, now: NOW })).toBe('blocking')
  })

  it('lock recente bloqueia um segundo disparo', () => {
    expect(
      decideSync({ lastSyncedAt: hoursAgo(48), syncingAt: minutesAgo(1), now: NOW }),
    ).toBe('skip')
  })

  it('lock antigo não bloqueia', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(30), syncingAt: minutesAgo(5), now: NOW }),
    ).toBe('background')
  })

  it('exatamente no limite de 10 min ainda não dispara', () => {
    expect(
      decideSync({ lastSyncedAt: minutesAgo(10), syncingAt: null, now: NOW }),
    ).toBe('skip')
  })
})
```

- [ ] **Step 8: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `decideSync` não existe.

- [ ] **Step 9: Implementar `decideSync`**

Create `src/lib/sync/decide-sync.ts`:

```ts
import { STALE_AFTER_MS, BLOCKING_AFTER_MS, SYNC_LOCK_MS } from './constants'

export type SyncDecision = 'skip' | 'background' | 'blocking'

export type DecideSyncArgs = {
  lastSyncedAt: Date | null
  syncingAt: Date | null
  now: Date
}

/**
 * O lock vence qualquer coisa: se já existe sync em andamento, não dispara
 * outro. Sem isso, um pico de acessos simultâneos vira uma tempestade de
 * chamadas ao Google.
 */
export function decideSync({ lastSyncedAt, syncingAt, now }: DecideSyncArgs): SyncDecision {
  if (syncingAt && now.getTime() - syncingAt.getTime() < SYNC_LOCK_MS) return 'skip'

  if (!lastSyncedAt) return 'blocking'

  const age = now.getTime() - lastSyncedAt.getTime()

  if (age > BLOCKING_AFTER_MS) return 'blocking'
  if (age > STALE_AFTER_MS) return 'background'
  return 'skip'
}
```

- [ ] **Step 10: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 20 testes no total.

- [ ] **Step 11: Commit**

```bash
git add src/lib/sync
git commit -m "feat: adiciona reconciliação e decisão de sync com testes"
```

---

## Task 4: Mapper de evento do Google

**Files:**
- Create: `src/lib/google/map-event.ts`, `src/lib/google/map-event.test.ts`

**Interfaces:**
- Consumes: `GoogleEventInput` de `@/lib/sync/types`
- Produces: `mapGoogleEvent(raw: calendar_v3.Schema$Event): GoogleEventInput | null` — devolve `null` para evento sem id ou sem data utilizável

- [ ] **Step 1: Escrever os testes (falhando)**

Create `src/lib/google/map-event.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapGoogleEvent } from './map-event'

describe('mapGoogleEvent', () => {
  it('mapeia evento com horário', () => {
    const result = mapGoogleEvent({
      id: 'g1',
      summary: 'Aula de Tokenização',
      description: 'link do meet',
      location: 'Sala 401',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result).not.toBeNull()
    expect(result!.googleEventId).toBe('g1')
    expect(result!.title).toBe('Aula de Tokenização')
    expect(result!.allDay).toBe(false)
    expect(result!.startsAt.toISOString()).toBe('2026-08-12T22:00:00.000Z')
    expect(result!.status).toBe('CONFIRMED')
  })

  it('mapeia evento de dia inteiro', () => {
    const result = mapGoogleEvent({
      id: 'g2',
      summary: 'Semana de projetos',
      status: 'confirmed',
      start: { date: '2026-08-17' },
      end: { date: '2026-08-22' },
    })

    expect(result!.allDay).toBe(true)
    expect(result!.startsAt.toISOString()).toBe('2026-08-17T00:00:00.000Z')
  })

  it('mapeia evento cancelado', () => {
    const result = mapGoogleEvent({
      id: 'g3',
      status: 'cancelled',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.status).toBe('CANCELLED')
  })

  it('mapeia convidados com RSVP', () => {
    const result = mapGoogleEvent({
      id: 'g4',
      summary: 'Reunião',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T20:00:00-03:00' },
      attendees: [
        { email: 'a@sou.inteli.edu.br', displayName: 'Ana', responseStatus: 'accepted' },
        { email: 'b@sou.inteli.edu.br', responseStatus: 'needsAction' },
      ],
    })

    expect(result!.attendees).toEqual([
      { email: 'a@sou.inteli.edu.br', name: 'Ana', responseStatus: 'accepted' },
      { email: 'b@sou.inteli.edu.br', name: null, responseStatus: 'needsAction' },
    ])
  })

  it('preserva recurringEventId de ocorrência de série', () => {
    const result = mapGoogleEvent({
      id: 'g5_20260812',
      recurringEventId: 'g5',
      summary: 'Aula semanal',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.recurringEventId).toBe('g5')
  })

  it('usa título de fallback quando o evento não tem summary', () => {
    const result = mapGoogleEvent({
      id: 'g6',
      status: 'confirmed',
      start: { dateTime: '2026-08-12T19:00:00-03:00' },
      end: { dateTime: '2026-08-12T21:00:00-03:00' },
    })

    expect(result!.title).toBe('(sem título)')
  })

  it('descarta evento sem id', () => {
    expect(mapGoogleEvent({ summary: 'órfão' })).toBeNull()
  })

  it('descarta evento sem data de início', () => {
    expect(mapGoogleEvent({ id: 'g7', summary: 'sem data' })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `mapGoogleEvent` não existe.

- [ ] **Step 3: Implementar o mapper**

Create `src/lib/google/map-event.ts`:

```ts
import type { calendar_v3 } from 'googleapis'
import type { GoogleEventInput, Attendee } from '@/lib/sync/types'

function parsePoint(p?: calendar_v3.Schema$EventDateTime | null): { at: Date; allDay: boolean } | null {
  if (!p) return null
  if (p.dateTime) return { at: new Date(p.dateTime), allDay: false }
  // Evento de dia inteiro vem como 'YYYY-MM-DD'. Ancorado em UTC de propósito:
  // a data é a informação, não o instante.
  if (p.date) return { at: new Date(`${p.date}T00:00:00Z`), allDay: true }
  return null
}

function mapAttendees(raw?: calendar_v3.Schema$EventAttendee[] | null): Attendee[] {
  if (!raw) return []
  return raw
    .filter((a): a is calendar_v3.Schema$EventAttendee & { email: string } => Boolean(a.email))
    .map((a) => ({
      email: a.email,
      name: a.displayName ?? null,
      responseStatus: a.responseStatus ?? 'needsAction',
    }))
}

/**
 * Normaliza um evento cru da API do Google. Devolve `null` para o que não dá
 * para representar — evento sem id ou sem data. Filtrar aqui mantém a
 * reconciliação (Task 3) livre de defensiva.
 */
export function mapGoogleEvent(raw: calendar_v3.Schema$Event): GoogleEventInput | null {
  if (!raw.id) return null

  const start = parsePoint(raw.start)
  if (!start) return null

  const end = parsePoint(raw.end) ?? start

  return {
    googleEventId: raw.id,
    title: raw.summary ?? '(sem título)',
    description: raw.description ?? null,
    startsAt: start.at,
    endsAt: end.at,
    allDay: start.allDay,
    location: raw.location ?? null,
    status: raw.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    recurringEventId: raw.recurringEventId ?? null,
    attendees: mapAttendees(raw.attendees),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 28 testes no total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google/map-event.ts src/lib/google/map-event.test.ts
git commit -m "feat: adiciona mapper de evento do Google"
```

---

## Task 5: Cliente do Google e leitura de eventos

**Files:**
- Create: `src/lib/google/client.ts`, `src/lib/google/list-events.ts`

**Interfaces:**
- Consumes: `prisma`, `mapGoogleEvent`, constantes
- Produces:
  - `getCalendarClient(calendarId: string): Promise<calendar_v3.Calendar>`
  - `listEvents(args: ListEventsArgs): Promise<GoogleEventInput[]>` onde `ListEventsArgs = { calendarId: string; googleCalendarId: string; from: Date; to: Date; updatedMin: Date | null }`

- [ ] **Step 1: Cliente autenticado**

Create `src/lib/google/client.ts`:

```ts
import { google, type calendar_v3 } from 'googleapis'
import { prisma } from '@/lib/db'

export class GoogleNotConnectedError extends Error {
  constructor(calendarId: string) {
    super(`Calendário ${calendarId} não tem conexão com o Google.`)
    this.name = 'GoogleNotConnectedError'
  }
}

/**
 * Autentica sempre pela GoogleConnection do calendário — nunca pela sessão de
 * quem está logado. Assim todos os eventos aparecem no Google como criados
 * pela conta oficial do clube, e nenhum admin precisa da senha dela (§5).
 */
export async function getCalendarClient(calendarId: string): Promise<calendar_v3.Calendar> {
  const connection = await prisma.googleConnection.findUnique({ where: { calendarId } })
  if (!connection) throw new GoogleNotConnectedError(calendarId)

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2.setCredentials({ refresh_token: connection.refreshToken })

  // A biblioteca renova o access token sozinha; guardamos o novo para
  // economizar uma ida ao Google na próxima chamada.
  oauth2.on('tokens', (tokens) => {
    if (!tokens.access_token) return
    void prisma.googleConnection.update({
      where: { calendarId },
      data: {
        accessToken: tokens.access_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    })
  })

  return google.calendar({ version: 'v3', auth: oauth2 })
}
```

- [ ] **Step 2: Leitura com janela e paginação**

Create `src/lib/google/list-events.ts`:

```ts
import { getCalendarClient } from './client'
import { mapGoogleEvent } from './map-event'
import { GOOGLE_MAX_RESULTS } from '@/lib/sync/constants'
import type { GoogleEventInput } from '@/lib/sync/types'

export type ListEventsArgs = {
  calendarId: string
  googleCalendarId: string
  from: Date
  to: Date
  /** Presente = varredura incremental. Ausente = varredura completa da janela. */
  updatedMin: Date | null
}

/**
 * Busca eventos da janela. Não usa syncToken de propósito: ele é incompatível
 * com timeMin/timeMax, e varrer a agenda inteira com singleEvents=true tem
 * volume indefinido diante de recorrência sem data de fim (§6.3).
 */
export async function listEvents(args: ListEventsArgs): Promise<GoogleEventInput[]> {
  const calendar = await getCalendarClient(args.calendarId)

  const events: GoogleEventInput[] = []
  let pageToken: string | undefined

  do {
    const response = await calendar.events.list({
      calendarId: args.googleCalendarId,
      timeMin: args.from.toISOString(),
      timeMax: args.to.toISOString(),
      singleEvents: true,
      showDeleted: true,
      maxResults: GOOGLE_MAX_RESULTS,
      ...(args.updatedMin ? { updatedMin: args.updatedMin.toISOString() } : {}),
      ...(pageToken ? { pageToken } : {}),
    })

    for (const raw of response.data.items ?? []) {
      const mapped = mapGoogleEvent(raw)
      if (mapped) events.push(mapped)
    }

    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return events
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google/client.ts src/lib/google/list-events.ts
git commit -m "feat: adiciona cliente Google e leitura de eventos por janela"
```

---

## Task 5b: Conectar a agenda do Google

Sem esta task nada funciona: `GoogleConnection` é o que autentica toda leitura e escrita, e nenhuma outra parte do plano a cria. O login da Task 2 identifica **quem** é o admin; esta task autoriza **a conta do clube** a ceder acesso à agenda.

**Files:**
- Create: `src/lib/google/oauth.ts`, `src/app/admin/[slug]/conectar/page.tsx`, `src/app/admin/[slug]/conectar/start/route.ts`, `src/app/admin/[slug]/conectar/callback/route.ts`, `src/app/admin/[slug]/conectar/actions.ts`

**Interfaces:**
- Consumes: `requireCalendarAdmin`, `prisma`, `getCalendarClient`
- Produces:
  - `buildOAuthClient(slug: string)` de `@/lib/google/oauth`
  - `selectGoogleCalendar(slug: string, googleCalendarId: string): Promise<void>`
  - Uma linha em `GoogleConnection` e `Calendar.googleCalendarId` preenchido

- [ ] **Step 1: Cliente OAuth para o fluxo de conexão**

Create `src/lib/google/oauth.ts`:

```ts
import { google } from 'googleapis'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

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
```

- [ ] **Step 2: Rota que inicia o consentimento**

Create `src/app/admin/[slug]/conectar/start/route.ts`:

```ts
import { redirect } from 'next/navigation'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient, CALENDAR_SCOPE } from '@/lib/google/oauth'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireCalendarAdmin(slug)

  const url = buildOAuthClient(slug).generateAuthUrl({
    // offline + consent são obrigatórios: sem os dois o Google não devolve
    // refresh_token, e a conexão morre em uma hora.
    access_type: 'offline',
    prompt: 'consent',
    scope: [CALENDAR_SCOPE],
  })

  redirect(url)
}
```

- [ ] **Step 3: Rota de callback que grava a conexão**

Create `src/app/admin/[slug]/conectar/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { buildOAuthClient } from '@/lib/google/oauth'
import { prisma } from '@/lib/db'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const code = new URL(request.url).searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=sem-codigo`,
    )
  }

  const oauth2 = buildOAuthClient(slug)
  const { tokens } = await oauth2.getToken(code)

  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar?erro=sem-refresh-token`,
    )
  }

  oauth2.setCredentials(tokens)
  const { data: profile } = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get()

  await prisma.googleConnection.upsert({
    where: { calendarId: calendar.id },
    create: {
      calendarId: calendar.id,
      googleEmail: profile.email ?? 'desconhecido',
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      googleEmail: profile.email ?? 'desconhecido',
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${slug}/conectar`)
}
```

- [ ] **Step 4: Action que escolhe qual agenda usar**

Create `src/app/admin/[slug]/conectar/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'

export async function selectGoogleCalendar(slug: string, googleCalendarId: string) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.calendar.update({
    where: { id: calendar.id },
    // lastSyncedAt volta a nulo: trocar de agenda invalida tudo que veio da
    // anterior, e o próximo sync precisa ser uma varredura completa.
    data: { googleCalendarId, lastSyncedAt: null, lastSyncError: null },
  })

  revalidatePath(`/admin/${slug}`)
}
```

- [ ] **Step 5: Tela de conexão**

Create `src/app/admin/[slug]/conectar/page.tsx`:

```tsx
import Link from 'next/link'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getCalendarClient } from '@/lib/google/client'
import { selectGoogleCalendar } from './actions'

const ERROS: Record<string, string> = {
  'sem-codigo': 'O Google não devolveu um código de autorização. Tente de novo.',
  'sem-refresh-token':
    'O Google não devolveu um refresh token. Revogue o acesso do app na conta e conecte de novo.',
}

export default async function ConectarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { slug } = await params
  const { erro } = await searchParams
  const { calendar } = await requireCalendarAdmin(slug)

  const connection = await prisma.googleConnection.findUnique({
    where: { calendarId: calendar.id },
  })

  let agendas: { id: string; summary: string }[] = []
  if (connection) {
    const client = await getCalendarClient(calendar.id)
    const { data } = await client.calendarList.list()
    agendas = (data.items ?? [])
      .filter((c): c is typeof c & { id: string } => Boolean(c.id))
      .map((c) => ({ id: c.id, summary: c.summary ?? c.id }))
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Conexão com o Google Agenda</h1>

      {erro && ERROS[erro] && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
          {ERROS[erro]}
        </p>
      )}

      {!connection ? (
        <>
          <p className="text-sm opacity-70">
            Conecte com a <strong>conta oficial do clube</strong>, dona da agenda. Todos os
            eventos criados aqui aparecerão no Google como criados por ela — nenhum admin
            precisa da senha.
          </p>
          <Link
            href={`/admin/${slug}/conectar/start`}
            className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white"
          >
            Conectar agenda do Google
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">
            Conectado como <strong>{connection.googleEmail}</strong>.
          </p>
          <div className="space-y-2">
            <p className="font-medium">Qual agenda este calendário usa?</p>
            {agendas.map((agenda) => (
              <form
                key={agenda.id}
                action={async () => {
                  'use server'
                  await selectGoogleCalendar(slug, agenda.id)
                }}
              >
                <button
                  type="submit"
                  className={`w-full rounded-lg border p-3 text-left ${
                    calendar.googleCalendarId === agenda.id ? 'border-neutral-900 bg-neutral-50' : ''
                  }`}
                >
                  {agenda.summary}
                  {calendar.googleCalendarId === agenda.id && (
                    <span className="ml-2 text-xs opacity-60">— em uso</span>
                  )}
                </button>
              </form>
            ))}
          </div>
          <Link href={`/admin/${slug}/conectar/start`} className="text-sm underline">
            Reconectar com outra conta
          </Link>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Registrar a redirect URI no Google Cloud**

Manual: adicionar `http://localhost:3000/admin/ibc/conectar/callback` como *Authorized redirect URI* no OAuth client (além da que a Task 2 já registrou para o login). Em produção, a equivalente com o domínio real.

- [ ] **Step 7: Verificar de ponta a ponta**

Run: `npm run dev`, abrir `http://localhost:3000/admin/ibc/conectar`, conectar com a conta do clube e escolher uma agenda.
Expected: volta para a tela mostrando o e-mail conectado, a lista de agendas aparece, e a escolhida fica marcada como "em uso".

Confirmar no banco: `npm run db:studio` → `GoogleConnection` tem uma linha com `refreshToken` preenchido, e `Calendar.googleCalendarId` está setado.

- [ ] **Step 8: Commit**

```bash
git add src/lib/google/oauth.ts src/app/admin/\[slug\]/conectar
git commit -m "feat: adiciona conexão da agenda do Google"
```

---

## Task 6: Orquestração do sync

**Files:**
- Create: `src/lib/sync/run-sync.ts`, `src/lib/public/load-calendar.ts`, `src/app/api/calendars/[slug]/sync/route.ts`

**Interfaces:**
- Consumes: `reconcile`, `decideSync`, `listEvents`, `prisma`
- Produces:
  - `runSync(calendarId: string, mode: 'full' | 'incremental'): Promise<SyncCounts>` onde `SyncCounts = { created: number; updated: number; cancelled: number }`
  - `loadCalendarBySlug(slug: string): Promise<Calendar>` — chama `notFound()` se ausente ou `DISABLED`, e aplica a decisão de sync (§6.2)

- [ ] **Step 1: Implementar `runSync`**

Create `src/lib/sync/run-sync.ts`:

```ts
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { listEvents } from '@/lib/google/list-events'
import { reconcile } from './reconcile'
import type { ExistingEvent } from './types'

export type SyncCounts = { created: number; updated: number; cancelled: number }

function windowFor(pastDays: number, futureDays: number, now: Date) {
  const day = 24 * 60 * 60 * 1000
  return { from: new Date(now.getTime() - pastDays * day), to: new Date(now.getTime() + futureDays * day) }
}

/**
 * Executa uma varredura. `mode: 'full'` ignora updatedMin e reconcilia
 * ausências como cancelamento; `mode: 'incremental'` traz só o que mudou
 * desde lastSyncedAt e nunca cancela por ausência (§6.4).
 */
export async function runSync(
  calendarId: string,
  mode: 'full' | 'incremental',
): Promise<SyncCounts> {
  const now = new Date()

  const calendar = await prisma.calendar.findUniqueOrThrow({ where: { id: calendarId } })
  if (!calendar.googleCalendarId) {
    throw new Error('Calendário não está conectado a uma agenda do Google.')
  }

  // Lock antes de qualquer chamada externa.
  await prisma.calendar.update({ where: { id: calendarId }, data: { syncingAt: now } })

  try {
    const window = windowFor(calendar.syncPastDays, calendar.syncFutureDays, now)

    const incoming = await listEvents({
      calendarId,
      googleCalendarId: calendar.googleCalendarId,
      from: window.from,
      to: window.to,
      updatedMin: mode === 'incremental' ? calendar.lastSyncedAt : null,
    })

    const existing: ExistingEvent[] = await prisma.event.findMany({
      where: { calendarId },
      select: { id: true, googleEventId: true, startsAt: true, status: true },
    })

    const result = reconcile({ incoming, existing, mode, window })

    // `attendees` é Attendee[] no domínio e Json no Prisma. O cast é local e
    // explícito de propósito: manter o tipo forte na lógica de reconciliação
    // vale mais do que evitar duas linhas de conversão aqui.
    const toRow = (data: (typeof result.creates)[number]) => ({
      ...data,
      attendees: data.attendees as unknown as Prisma.InputJsonValue,
    })

    await prisma.$transaction([
      ...result.creates.map((data) =>
        prisma.event.create({ data: { ...toRow(data), calendarId, syncedAt: now } }),
      ),
      ...result.updates.map((u) =>
        prisma.event.update({ where: { id: u.id }, data: { ...toRow(u.data), syncedAt: now } }),
      ),
      prisma.event.updateMany({
        where: { id: { in: result.cancels } },
        data: { status: 'CANCELLED', syncedAt: now },
      }),
      prisma.calendar.update({
        where: { id: calendarId },
        data: { lastSyncedAt: now, syncingAt: null, lastSyncError: null },
      }),
    ])

    return result.counts
  } catch (error) {
    // Registrar o erro é o que impede o pior modo de falha do sistema: token
    // revogado faz o sync falhar em silêncio, o site congela no último dado
    // bom e continua parecendo correto (§6.5).
    const message = error instanceof Error ? error.message : String(error)
    await prisma.calendar.update({
      where: { id: calendarId },
      data: { syncingAt: null, lastSyncError: message },
    })
    throw error
  }
}
```

- [ ] **Step 2: Carregador público com disparo de sync**

Create `src/lib/public/load-calendar.ts`:

```ts
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { decideSync } from '@/lib/sync/decide-sync'
import { runSync } from '@/lib/sync/run-sync'
import type { Calendar } from '@prisma/client'

/**
 * Todo caminho de leitura pública passa por aqui. É este ponto que substitui
 * o cron: o sync acontece proporcional ao uso de cada calendário, sem
 * agendamento externo e sem nenhum job que enumere inquilinos (§6.2).
 */
export async function loadCalendarBySlug(slug: string): Promise<Calendar> {
  const calendar = await prisma.calendar.findUnique({ where: { slug } })
  if (!calendar || calendar.status !== 'ACTIVE') notFound()

  if (!calendar.googleCalendarId) return calendar

  const decision = decideSync({
    lastSyncedAt: calendar.lastSyncedAt,
    syncingAt: calendar.syncingAt,
    now: new Date(),
  })

  if (decision === 'blocking') {
    // Dado velho demais para ser servido com cara de atual. Vale a espera.
    try {
      await runSync(calendar.id, 'incremental')
      return prisma.calendar.findUniqueOrThrow({ where: { id: calendar.id } })
    } catch {
      // Falha de sync não pode derrubar a página pública: o erro já ficou
      // registrado em lastSyncError e aparece no admin.
      return calendar
    }
  }

  if (decision === 'background') {
    after(async () => {
      try {
        await runSync(calendar.id, 'incremental')
      } catch {
        // Idem: registrado em lastSyncError pelo runSync.
      }
    })
  }

  return calendar
}
```

- [ ] **Step 3: Rota do botão "Sincronizar agora"**

Create `src/app/api/calendars/[slug]/sync/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { runSync } from '@/lib/sync/run-sync'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  try {
    // Botão do admin faz varredura COMPLETA: é o modo que reconcilia
    // ausências e corrige um evento movido para fora da janela (§6.4).
    const counts = await runSync(calendar.id, 'full')
    return NextResponse.json({
      message: `${counts.created} novos, ${counts.updated} atualizados, ${counts.cancelled} cancelados.`,
      counts,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return NextResponse.json({ message: `Falha ao sincronizar: ${message}` }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, 28 testes — nada quebrou.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/run-sync.ts src/lib/public/load-calendar.ts src/app/api/calendars
git commit -m "feat: adiciona orquestração de sync e disparo por obsolescência"
```

---

## Task 7: Admin — listagem, publicação e campos públicos

**Files:**
- Create: `src/app/admin/[slug]/page.tsx`, `src/app/admin/[slug]/actions.ts`, `src/app/api/calendars/[slug]/upload/route.ts`, `src/app/api/uploads/[...path]/route.ts`

**Interfaces:**
- Consumes: `requireCalendarAdmin`, `prisma`, constantes de upload
- Produces:
  - Server actions `togglePublic(eventId, isPublic)`, `updatePublicFields(eventId, fields)` de `@/app/admin/[slug]/actions`
  - `POST /api/calendars/[slug]/upload` → `{ url: string }`
  - `GET /api/uploads/[...path]` serve o arquivo do volume

- [ ] **Step 1: Server actions dos campos da plataforma**

Create `src/app/admin/[slug]/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import type { Area } from '@prisma/client'

export type PublicFields = {
  publicTitle: string | null
  publicDescription: string | null
  imageUrl: string | null
  area: Area | null
  signupUrl: string | null
}

/**
 * Estas actions mexem SÓ em campos da plataforma. Não chamam o Google, porque
 * nada aqui existe do lado de lá (§6.1).
 */
export async function togglePublic(slug: string, eventId: string, isPublic: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.event.update({
    where: { id: eventId, calendarId: calendar.id },
    data: { isPublic },
  })

  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function updatePublicFields(slug: string, eventId: string, fields: PublicFields) {
  const { calendar } = await requireCalendarAdmin(slug)

  await prisma.event.update({
    where: { id: eventId, calendarId: calendar.id },
    data: fields,
  })

  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}
```

O `where` combina `id` e `calendarId` de propósito: sem isso, um admin de um calendário poderia editar evento de outro passando um id qualquer.

- [ ] **Step 2: Rota de upload**

Create `src/app/api/calendars/[slug]/upload/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { MAX_UPLOAD_BYTES, ALLOWED_IMAGE_TYPES } from '@/lib/sync/constants'

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Nenhum arquivo enviado.' }, { status: 400 })
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { message: 'Formato não aceito. Use JPG, PNG ou WebP.' },
      { status: 400 },
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: 'Arquivo maior que 5 MB.' }, { status: 400 })
  }

  // Nome sempre gerado. Usar o nome enviado pelo cliente permitiria
  // travessia de diretório e sobrescrita de arquivo alheio.
  const filename = `${randomUUID()}.${EXTENSION[file.type]}`
  const dir = path.join(process.env.UPLOAD_DIR ?? './uploads', calendar.id)

  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/api/uploads/${calendar.id}/${filename}` })
}
```

- [ ] **Step 3: Rota que serve o arquivo**

Create `src/app/api/uploads/[...path]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params

  // Segunda barreira contra travessia de diretório: o nome é gerado no
  // upload, mas a rota é pública e não pode confiar na URL.
  if (segments.some((s) => s.includes('..') || s.includes('/'))) {
    return NextResponse.json({ message: 'Caminho inválido.' }, { status: 400 })
  }

  const base = path.resolve(process.env.UPLOAD_DIR ?? './uploads')
  const target = path.resolve(base, ...segments)
  if (!target.startsWith(base + path.sep)) {
    return NextResponse.json({ message: 'Caminho inválido.' }, { status: 400 })
  }

  try {
    const file = await readFile(target)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': CONTENT_TYPE[path.extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ message: 'Arquivo não encontrado.' }, { status: 404 })
  }
}
```

- [ ] **Step 4: Tela do admin**

Create `src/app/admin/[slug]/page.tsx`:

```tsx
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { togglePublic } from './actions'

export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const events = await prisma.event.findMany({
    where: { calendarId: calendar.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 100,
  })

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: calendar.timezone,
  })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{calendar.name}</h1>
        <span className="text-sm opacity-60">/{calendar.slug}</span>
      </header>

      {calendar.lastSyncError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <strong>A última sincronização falhou.</strong> O calendário abaixo pode estar
          desatualizado. Erro: {calendar.lastSyncError}
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Evento</th>
            <th className="py-2">Quando</th>
            <th className="py-2">No site</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t">
              <td className="py-3">
                {event.publicTitle ?? event.title}
                {event.status === 'CANCELLED' && (
                  <span className="ml-2 text-xs text-red-700">cancelado</span>
                )}
              </td>
              <td className="py-3">{formatter.format(event.startsAt)}</td>
              <td className="py-3">
                <form
                  action={async () => {
                    'use server'
                    await togglePublic(slug, event.id, !event.isPublic)
                  }}
                >
                  <button type="submit" className="rounded border px-3 py-1">
                    {event.isPublic ? 'Publicado' : 'Rascunho'}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {events.length === 0 && (
        <p className="py-8 text-center opacity-60">
          Nenhum evento futuro. Sincronize com o Google ou crie um evento.
        </p>
      )}

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">Embutir no site</h2>
        <p className="text-sm opacity-70">
          Cole este código na página onde o calendário deve aparecer.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">
          {`<iframe src="${process.env.NEXT_PUBLIC_APP_URL}/embed/${calendar.slug}" style="width:100%;border:0" height="600"></iframe>`}
        </pre>
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`, abrir `http://localhost:3000/admin/ibc` logado com o e-mail do seed.
Expected: tela carrega, tabela vazia com a mensagem de estado vazio.

Abrir `/admin/qualquer-outra-coisa`.
Expected: 404.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin src/app/api/calendars src/app/api/uploads
git commit -m "feat: adiciona painel admin com publicação e upload de arte"
```

---

## Task 8: Escrita para o Google

**Files:**
- Create: `src/lib/google/write-event.ts`
- Modify: `src/app/admin/[slug]/actions.ts`

**Interfaces:**
- Consumes: `getCalendarClient`, `mapGoogleEvent`, `prisma`
- Produces:
  - `createGoogleEvent(args): Promise<GoogleEventInput>`
  - `updateGoogleEvent(args): Promise<GoogleEventInput>`
  - `deleteGoogleEvent(args): Promise<void>`
  - Server actions `createEvent`, `updateGoogleFields`, `deleteEvent`

- [ ] **Step 1: Wrapper de escrita**

Create `src/lib/google/write-event.ts`:

```ts
import { getCalendarClient } from './client'
import { mapGoogleEvent } from './map-event'
import type { GoogleEventInput } from '@/lib/sync/types'

export type EventDraft = {
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  location: string | null
  attendeeEmails: string[]
}

export type WriteArgs = {
  calendarId: string
  googleCalendarId: string
  timezone: string
  draft: EventDraft
  notify: boolean
}

function toGooglePayload(draft: EventDraft, timezone: string) {
  const point = (d: Date) =>
    draft.allDay
      ? { date: d.toISOString().slice(0, 10) }
      : { dateTime: d.toISOString(), timeZone: timezone }

  return {
    summary: draft.title,
    description: draft.description ?? undefined,
    location: draft.location ?? undefined,
    start: point(draft.startsAt),
    end: point(draft.endsAt),
    attendees: draft.attendeeEmails.map((email) => ({ email })),
  }
}

/** `all` dispara e-mail do Google; `none` só insere na agenda (§6.7). */
function sendUpdates(notify: boolean): 'all' | 'none' {
  return notify ? 'all' : 'none'
}

export async function createGoogleEvent(args: WriteArgs): Promise<GoogleEventInput> {
  const calendar = await getCalendarClient(args.calendarId)

  const response = await calendar.events.insert({
    calendarId: args.googleCalendarId,
    sendUpdates: sendUpdates(args.notify),
    requestBody: toGooglePayload(args.draft, args.timezone),
  })

  const mapped = mapGoogleEvent(response.data)
  if (!mapped) throw new Error('O Google devolveu um evento que não pôde ser interpretado.')
  return mapped
}

export async function updateGoogleEvent(
  args: WriteArgs & { googleEventId: string },
): Promise<GoogleEventInput> {
  const calendar = await getCalendarClient(args.calendarId)

  const response = await calendar.events.patch({
    calendarId: args.googleCalendarId,
    eventId: args.googleEventId,
    sendUpdates: sendUpdates(args.notify),
    requestBody: toGooglePayload(args.draft, args.timezone),
  })

  const mapped = mapGoogleEvent(response.data)
  if (!mapped) throw new Error('O Google devolveu um evento que não pôde ser interpretado.')
  return mapped
}

export async function deleteGoogleEvent(args: {
  calendarId: string
  googleCalendarId: string
  googleEventId: string
  notify: boolean
}): Promise<void> {
  const calendar = await getCalendarClient(args.calendarId)
  await calendar.events.delete({
    calendarId: args.googleCalendarId,
    eventId: args.googleEventId,
    sendUpdates: sendUpdates(args.notify),
  })
}
```

- [ ] **Step 2: Actions que escrevem nos dois lados**

Modify `src/app/admin/[slug]/actions.ts` — adicionar ao fim do arquivo:

```ts
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  type EventDraft,
} from '@/lib/google/write-event'

/**
 * O Google é chamado ANTES de gravar. Se ele falhar, a exceção sobe e nada é
 * escrito no banco — um evento nunca existe só de um lado (§6.1).
 */
export async function createEvent(slug: string, draft: EventDraft, notify: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const google = await createGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    timezone: calendar.timezone,
    draft,
    notify,
  })

  await prisma.event.create({
    data: {
      calendarId: calendar.id,
      googleEventId: google.googleEventId,
      title: google.title,
      description: google.description,
      startsAt: google.startsAt,
      endsAt: google.endsAt,
      allDay: google.allDay,
      location: google.location,
      status: google.status,
      recurringEventId: google.recurringEventId,
      attendees: google.attendees,
      syncedAt: new Date(),
    },
  })

  await upsertContactsFromEmails(calendar.id, draft.attendeeEmails)
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function updateGoogleFields(
  slug: string,
  eventId: string,
  draft: EventDraft,
  notify: boolean,
) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const event = await prisma.event.findFirstOrThrow({
    where: { id: eventId, calendarId: calendar.id },
  })

  const google = await updateGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    googleEventId: event.googleEventId,
    timezone: calendar.timezone,
    draft,
    notify,
  })

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: google.title,
      description: google.description,
      startsAt: google.startsAt,
      endsAt: google.endsAt,
      allDay: google.allDay,
      location: google.location,
      status: google.status,
      attendees: google.attendees,
      syncedAt: new Date(),
    },
  })

  await upsertContactsFromEmails(calendar.id, draft.attendeeEmails)
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}

export async function deleteEvent(slug: string, eventId: string, notify: boolean) {
  const { calendar } = await requireCalendarAdmin(slug)
  if (!calendar.googleCalendarId) throw new Error('Calendário não conectado ao Google.')

  const event = await prisma.event.findFirstOrThrow({
    where: { id: eventId, calendarId: calendar.id },
  })

  await deleteGoogleEvent({
    calendarId: calendar.id,
    googleCalendarId: calendar.googleCalendarId,
    googleEventId: event.googleEventId,
    notify,
  })

  await prisma.event.delete({ where: { id: eventId } })
  revalidatePath(`/admin/${slug}`)
  revalidatePath(`/c/${slug}`)
}
```

`upsertContactsFromEmails` é criada na Task 9. Para esta task compilar antes, adicione o stub agora no mesmo arquivo e substitua na Task 9:

```ts
async function upsertContactsFromEmails(_calendarId: string, _emails: string[]) {
  // Implementado na Task 9.
}
```

- [ ] **Step 3: Formulário de criação de evento**

Create `src/app/admin/[slug]/EventForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createEvent } from './actions'

export function EventForm({
  slug,
  contactEmails,
}: {
  slug: string
  contactEmails: string[]
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border px-4 py-2">
        Criar evento
      </button>
    )
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    try {
      const allDay = formData.get('allDay') === 'on'
      await createEvent(
        slug,
        {
          title: String(formData.get('title')),
          description: (formData.get('description') as string) || null,
          startsAt: new Date(String(formData.get('startsAt'))),
          endsAt: new Date(String(formData.get('endsAt'))),
          allDay,
          location: (formData.get('location') as string) || null,
          attendeeEmails: String(formData.get('attendees') ?? '')
            .split(/[,\s]+/)
            .map((e) => e.trim())
            .filter(Boolean),
        },
        formData.get('notify') === 'on',
      )
      setOpen(false)
    } catch (e) {
      // O evento não foi criado em lugar nenhum: se o Google falha, a action
      // lança antes de gravar no banco (§6.1).
      setError(e instanceof Error ? e.message : 'Falha ao criar o evento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-xl border p-4">
      <input name="title" required placeholder="Título" className="w-full rounded border p-2" />
      <div className="flex gap-3">
        <input
          name="startsAt"
          type="datetime-local"
          required
          className="flex-1 rounded border p-2"
        />
        <input
          name="endsAt"
          type="datetime-local"
          required
          className="flex-1 rounded border p-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="allDay" type="checkbox" /> Dia inteiro
      </label>
      <input name="location" placeholder="Local" className="w-full rounded border p-2" />
      <textarea
        name="description"
        placeholder="Descrição (vai para o Google)"
        className="w-full rounded border p-2"
      />
      <div>
        <input
          name="attendees"
          list="contatos"
          placeholder="Convidados: e-mails separados por vírgula"
          className="w-full rounded border p-2"
        />
        <datalist id="contatos">
          {contactEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
      </div>
      {/* Ligado por padrão ao CRIAR: criar sem avisar torna o convite
          inútil. Ao editar, o padrão é desligado (§6.7). */}
      <label className="flex items-center gap-2 text-sm">
        <input name="notify" type="checkbox" defaultChecked /> Notificar convidados por e-mail
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Criar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Ligar o formulário e o botão de sincronizar na tela do admin**

Modify `src/app/admin/[slug]/page.tsx` — adicionar os imports e carregar os contatos:

```tsx
import { EventForm } from './EventForm'
```

Dentro do componente, após carregar `events`:

```tsx
  const contacts = await prisma.contact.findMany({
    where: { calendarId: calendar.id },
    select: { email: true },
    orderBy: { email: 'asc' },
  })
```

E logo abaixo do `<header>`, antes do aviso de erro de sync:

```tsx
      <div className="flex items-center gap-2">
        <EventForm slug={slug} contactEmails={contacts.map((c) => c.email)} />
        <form
          action={async () => {
            'use server'
            const { runSync } = await import('@/lib/sync/run-sync')
            await runSync(calendar.id, 'full')
          }}
        >
          <button type="submit" className="rounded-lg border px-4 py-2">
            Sincronizar agora
          </button>
        </form>
      </div>
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/google/write-event.ts src/app/admin/\[slug\]
git commit -m "feat: adiciona escrita de eventos no Google com convidados"
```

---

## Task 9: Contatos e grupos

**Files:**
- Create: `src/app/admin/[slug]/contatos/page.tsx`, `src/app/admin/[slug]/contatos/actions.ts`
- Modify: `src/app/admin/[slug]/actions.ts` (substituir o stub)

**Interfaces:**
- Consumes: `requireCalendarAdmin`, `prisma`
- Produces:
  - `upsertContactsFromEmails(calendarId: string, emails: string[]): Promise<void>`
  - `saveContact`, `deleteContact`, `expandGroup(slug, groupId): Promise<string[]>`

- [ ] **Step 1: Implementar a criação de contato pelo uso**

Modify `src/app/admin/[slug]/actions.ts` — substituir o stub:

```ts
/**
 * Contato nasce do uso: e-mail digitado num evento vira contato sem nome, que
 * o admin completa depois. Não existe cadastro prévio a ser feito antes de a
 * ferramenta ser útil — que é justamente o passo que ninguém dá (§6.7).
 */
async function upsertContactsFromEmails(calendarId: string, emails: string[]) {
  if (emails.length === 0) return

  await prisma.contact.createMany({
    data: emails.map((email) => ({ calendarId, email })),
    skipDuplicates: true,
  })
}
```

- [ ] **Step 2: Actions de contatos e grupos**

Create `src/app/admin/[slug]/contatos/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireCalendarAdmin } from '@/lib/auth/guard'

export async function saveContact(
  slug: string,
  input: { id?: string; name: string | null; email: string; groupNames: string[] },
) {
  const { calendar } = await requireCalendarAdmin(slug)

  // Grupos são criados inline ao digitar um nome novo — sem tela dedicada.
  const groups = await Promise.all(
    input.groupNames.map((name) =>
      prisma.contactGroup.upsert({
        where: { calendarId_name: { calendarId: calendar.id, name } },
        create: { calendarId: calendar.id, name },
        update: {},
      }),
    ),
  )

  await prisma.contact.upsert({
    where: { calendarId_email: { calendarId: calendar.id, email: input.email } },
    create: {
      calendarId: calendar.id,
      email: input.email,
      name: input.name,
      groups: { connect: groups.map((g) => ({ id: g.id })) },
    },
    update: {
      name: input.name,
      groups: { set: groups.map((g) => ({ id: g.id })) },
    },
  })

  revalidatePath(`/admin/${slug}/contatos`)
}

export async function deleteContact(slug: string, contactId: string) {
  const { calendar } = await requireCalendarAdmin(slug)
  await prisma.contact.delete({ where: { id: contactId, calendarId: calendar.id } })
  revalidatePath(`/admin/${slug}/contatos`)
}

/**
 * Grupo expande no momento da escrita: o evento guarda pessoas, não o grupo.
 * Se guardasse o grupo, mudar a composição dele reescreveria silenciosamente
 * a lista de convidados de eventos que já foram enviados (§6.7).
 */
export async function expandGroup(slug: string, groupId: string): Promise<string[]> {
  const { calendar } = await requireCalendarAdmin(slug)

  const group = await prisma.contactGroup.findFirst({
    where: { id: groupId, calendarId: calendar.id },
    include: { contacts: { select: { email: true } } },
  })

  return group?.contacts.map((c) => c.email) ?? []
}
```

- [ ] **Step 3: Tela de contatos**

Create `src/app/admin/[slug]/contatos/page.tsx`:

```tsx
import { requireCalendarAdmin } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { deleteContact } from './actions'

export default async function ContatosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { calendar } = await requireCalendarAdmin(slug)

  const contacts = await prisma.contact.findMany({
    where: { calendarId: calendar.id },
    include: { groups: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Contatos</h1>
      <p className="text-sm opacity-70">
        Contatos são criados automaticamente quando você convida um e-mail novo para um
        evento. Aqui você completa o nome, organiza em grupos e apaga erros de digitação.
      </p>

      <table className="w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Nome</th>
            <th className="py-2">E-mail</th>
            <th className="py-2">Grupos</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-t">
              <td className="py-3">{contact.name ?? <span className="opacity-40">—</span>}</td>
              <td className="py-3">{contact.email}</td>
              <td className="py-3">{contact.groups.map((g) => g.name).join(', ') || '—'}</td>
              <td className="py-3 text-right">
                <form
                  action={async () => {
                    'use server'
                    await deleteContact(slug, contact.id)
                  }}
                >
                  <button type="submit" className="text-red-700 underline">
                    Apagar
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {contacts.length === 0 && (
        <p className="py-8 text-center opacity-60">
          Nenhum contato ainda. Convide alguém para um evento e ele aparece aqui.
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` e `npm test`
Expected: sem erros de tipo; 28 testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/[slug]/contatos src/app/admin/[slug]/actions.ts
git commit -m "feat: adiciona contatos e grupos"
```

---

## Task 10: Página pública

**Files:**
- Create: `src/components/EventList.tsx`, `src/components/MonthGrid.tsx`, `src/components/CalendarView.tsx`, `src/app/(public)/c/[slug]/page.tsx`, `src/app/(public)/c/[slug]/e/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadCalendarBySlug`, `prisma`, `PublicEvent` (Task 11 define o tipo — criar `serialize.ts` aqui se ainda não existir; a Task 11 adiciona os testes)
- Produces: componentes `EventList`, `MonthGrid`, `CalendarView`

- [ ] **Step 1: Serializador público**

Create `src/lib/public/serialize.ts`:

```ts
import type { Event, Area } from '@prisma/client'

/**
 * Formato público de um evento. Note a ausência de `attendees`, `description`
 * crua do Google e qualquer outro campo interno: o tipo é a garantia de que
 * dado pessoal não vaza para fora (§8).
 */
export type PublicEvent = {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
  area: Area | null
  imageUrl: string | null
  signupUrl: string | null
}

export function toPublicEvent(event: Event): PublicEvent {
  return {
    id: event.id,
    title: event.publicTitle ?? event.title,
    // A descrição do Google costuma ter link de meet e nota interna. Só a
    // descrição pública, escrita de propósito para o site, é exposta.
    description: event.publicDescription,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    allDay: event.allDay,
    location: event.location,
    area: event.area,
    imageUrl: event.imageUrl,
    signupUrl: event.signupUrl,
  }
}
```

- [ ] **Step 2: Lista de eventos**

Create `src/components/EventList.tsx`:

```tsx
import Link from 'next/link'
import type { PublicEvent } from '@/lib/public/serialize'

const AREA_LABEL: Record<string, string> = {
  EDUCATIONAL: 'Educacional',
  PROJECTS: 'Projetos',
  MARKETING: 'Marketing',
  PEOPLE: 'Pessoas',
  GENERAL: 'Geral',
}

export function EventList({
  events,
  timezone,
  slug,
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
}) {
  const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: timezone })
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: timezone })
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  if (events.length === 0) {
    return <p className="py-12 text-center opacity-60">Nenhum evento por enquanto.</p>
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const start = new Date(event.startsAt)
        return (
          <li key={event.id}>
            <Link
              href={`/c/${slug}/e/${event.id}`}
              className="flex gap-4 rounded-xl border p-4 transition hover:bg-neutral-50"
            >
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-neutral-100 py-2">
                <span className="text-xl font-semibold leading-none">{day.format(start)}</span>
                <span className="text-xs uppercase opacity-60">{month.format(start)}</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium">{event.title}</p>
                <p className="text-sm opacity-70">
                  {event.allDay ? 'Dia inteiro' : time.format(start)}
                  {event.location && ` · ${event.location}`}
                </p>
                {event.area && (
                  <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                    {AREA_LABEL[event.area]}
                  </span>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 3: Grade de mês**

Create `src/components/MonthGrid.tsx`:

```tsx
import Link from 'next/link'
import type { PublicEvent } from '@/lib/public/serialize'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Chave YYYY-MM-DD no fuso do calendário, não no do servidor. */
function dayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function MonthGrid({
  events,
  timezone,
  slug,
  month,
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
  /** Primeiro dia do mês exibido. */
  month: Date
}) {
  const byDay = new Map<string, PublicEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, timezone)
    byDay.set(key, [...(byDay.get(key) ?? []), event])
  }

  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month)

  return (
    <div>
      <p className="mb-3 text-center font-medium capitalize">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-neutral-200">
        {WEEKDAYS.map((label, i) => (
          <div key={i} className="bg-neutral-50 py-2 text-center text-xs opacity-60">
            {label}
          </div>
        ))}
        {cells.map((dayNumber, i) => {
          const key =
            dayNumber === null
              ? null
              : `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
          const dayEvents = key ? (byDay.get(key) ?? []) : []

          return (
            <div key={i} className="min-h-20 bg-white p-1">
              {dayNumber && <span className="text-xs opacity-60">{dayNumber}</span>}
              <ul className="mt-1 space-y-0.5">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/c/${slug}/e/${event.id}`}
                      className="block truncate rounded bg-neutral-900 px-1 py-0.5 text-[10px] text-white"
                    >
                      {event.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Alternância entre as duas visões**

Create `src/components/CalendarView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { EventList } from './EventList'
import { MonthGrid } from './MonthGrid'
import type { PublicEvent } from '@/lib/public/serialize'

export function CalendarView({
  events,
  timezone,
  slug,
  initialView = 'lista',
}: {
  events: PublicEvent[]
  timezone: string
  slug: string
  initialView?: 'lista' | 'mes'
}) {
  const [view, setView] = useState<'lista' | 'mes'>(initialView)

  const now = new Date()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1" role="tablist">
        {(['mes', 'lista'] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              view === option ? 'bg-neutral-900 text-white' : 'border'
            }`}
          >
            {option === 'mes' ? 'Mês' : 'Lista'}
          </button>
        ))}
      </div>

      {/* Grade some no celular: sete colunas não cabem em tela estreita. */}
      {view === 'mes' ? (
        <>
          <div className="hidden sm:block">
            <MonthGrid events={events} timezone={timezone} slug={slug} month={month} />
          </div>
          <div className="sm:hidden">
            <EventList events={events} timezone={timezone} slug={slug} />
          </div>
        </>
      ) : (
        <EventList events={events} timezone={timezone} slug={slug} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Página do calendário**

Create `src/app/(public)/c/[slug]/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import { CalendarView } from '@/components/CalendarView'

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: 'asc' },
  })

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{calendar.name}</h1>
      <CalendarView
        events={events.map(toPublicEvent)}
        timezone={calendar.timezone}
        slug={slug}
      />
    </main>
  )
}
```

- [ ] **Step 6: Página do evento**

Create `src/app/(public)/c/[slug]/e/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const calendar = await loadCalendarBySlug(slug)

  const row = await prisma.event.findFirst({
    where: { id, calendarId: calendar.id, isPublic: true, status: 'CONFIRMED' },
  })
  if (!row) notFound()

  const event = toPublicEvent(row)
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: event.allDay ? undefined : 'short',
    timeZone: calendar.timezone,
  })

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt="" className="w-full rounded-xl" />
      )}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="opacity-70">{formatter.format(new Date(event.startsAt))}</p>
        {event.location && <p className="opacity-70">{event.location}</p>}
      </header>
      {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}
      {event.signupUrl && (
        <a
          href={event.signupUrl}
          className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-white"
        >
          Inscreva-se
        </a>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Verificar no navegador**

Run: `npm run dev`, abrir `http://localhost:3000/c/ibc`
Expected: página carrega com o nome do calendário e o estado vazio. Alternar entre Mês e Lista funciona.

- [ ] **Step 8: Commit**

```bash
git add src/components src/app/\(public\) src/lib/public/serialize.ts
git commit -m "feat: adiciona página pública com grade e lista"
```

---

## Task 11: Embed, JSON público e feed .ics

Esta task carrega os dois testes de privacidade. São eles que impedem o pior modo de falha do sistema: vazar e-mail de membro num arquivo aberto na internet.

**Files:**
- Create: `src/app/embed/[slug]/page.tsx`, `src/app/api/calendars/[slug]/events/route.ts`, `src/app/api/calendars/[slug]/ics/route.ts`, `src/lib/public/ics.ts`, `src/lib/public/privacy.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `toPublicEvent`, `PublicEvent`, `loadCalendarBySlug`
- Produces: `buildIcs(args: { name: string; events: PublicEvent[]; baseUrl: string; slug: string }): string`

- [ ] **Step 1: Escrever os testes de privacidade (falhando)**

Create `src/lib/public/privacy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toPublicEvent } from './serialize'
import { buildIcs } from './ics'
import type { Event } from '@prisma/client'

const SECRET_EMAIL = 'membro.secreto@sou.inteli.edu.br'

function eventWithAttendees(): Event {
  return {
    id: 'evt-1',
    calendarId: 'cal-1',
    googleEventId: 'g1',
    title: 'Reunião de diretoria',
    description: 'Meet: https://meet.google.com/xyz — notas internas',
    startsAt: new Date('2026-08-12T22:00:00Z'),
    endsAt: new Date('2026-08-13T00:00:00Z'),
    allDay: false,
    location: 'Sala 401',
    status: 'CONFIRMED',
    recurringEventId: null,
    attendees: [
      { email: SECRET_EMAIL, name: 'Membro', responseStatus: 'accepted' },
    ] as unknown as Event['attendees'],
    isPublic: true,
    publicTitle: 'Reunião aberta',
    publicDescription: 'Venha participar',
    imageUrl: null,
    area: 'PEOPLE',
    signupUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncedAt: new Date(),
  }
}

describe('privacidade das saídas públicas', () => {
  it('o JSON público de um evento com convidados não contém nenhum e-mail', () => {
    const serialized = JSON.stringify(toPublicEvent(eventWithAttendees()))

    expect(serialized).not.toContain(SECRET_EMAIL)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('attendees')
  })

  it('o JSON público não expõe a descrição interna do Google', () => {
    const result = toPublicEvent(eventWithAttendees())

    expect(result.description).toBe('Venha participar')
    expect(JSON.stringify(result)).not.toContain('meet.google.com')
  })

  it('o .ics de um evento com convidados não contém linha ATTENDEE nem e-mail', () => {
    const ics = buildIcs({
      name: 'Inteli Blockchain',
      slug: 'ibc',
      baseUrl: 'https://calendario.exemplo.org',
      events: [toPublicEvent(eventWithAttendees())],
    })

    expect(ics).not.toContain('ATTENDEE')
    expect(ics).not.toContain(SECRET_EMAIL)
    expect(ics).not.toContain('meet.google.com')
  })

  it('o .ics contém o evento publicado', () => {
    const ics = buildIcs({
      name: 'Inteli Blockchain',
      slug: 'ibc',
      baseUrl: 'https://calendario.exemplo.org',
      events: [toPublicEvent(eventWithAttendees())],
    })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Reunião aberta')
    expect(ics).toContain('END:VCALENDAR')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `buildIcs` não existe.

- [ ] **Step 3: Implementar o gerador de .ics**

Create `src/lib/public/ics.ts`:

```ts
import { createEvents, type EventAttributes } from 'ics'
import type { PublicEvent } from './serialize'

function toDateArray(iso: string): [number, number, number, number, number] {
  const d = new Date(iso)
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ]
}

/**
 * Recebe `PublicEvent`, nunca `Event`. O tipo é a barreira: o formato .ics tem
 * linha ATTENDEE, e montar o arquivo a partir da linha crua do banco
 * publicaria a lista de e-mails dos membros num arquivo aberto na internet,
 * sem erro e sem log (§8).
 */
export function buildIcs(args: {
  name: string
  slug: string
  baseUrl: string
  events: PublicEvent[]
}): string {
  const attributes: EventAttributes[] = args.events.map((event) => ({
    uid: `${event.id}@${args.slug}`,
    title: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    url: `${args.baseUrl}/c/${args.slug}/e/${event.id}`,
    start: toDateArray(event.startsAt),
    startInputType: 'utc',
    end: toDateArray(event.endsAt),
    endInputType: 'utc',
    calName: args.name,
    productId: 'inteli-blockchain/calendario',
  }))

  const { error, value } = createEvents(attributes)
  if (error) throw error
  return value ?? 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 32 testes no total.

- [ ] **Step 5: Rota do JSON público**

Create `src/app/api/calendars/[slug]/events/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import type { Area } from '@prisma/client'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)

  const area = new URL(request.url).searchParams.get('area')?.toUpperCase()

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
      ...(area ? { area: area as Area } : {}),
    },
    orderBy: { startsAt: 'asc' },
  })

  return NextResponse.json(
    {
      calendar: { name: calendar.name, slug: calendar.slug, timezone: calendar.timezone },
      events: events.map(toPublicEvent),
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}
```

`Access-Control-Allow-Origin: *` é intencional: a landing é estática e em outro domínio, e a resposta só contém dado já público.

- [ ] **Step 6: Rota do feed .ics**

Create `src/app/api/calendars/[slug]/ics/route.ts`:

```ts
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import { buildIcs } from '@/lib/public/ics'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const calendar = await loadCalendarBySlug(slug)

  const events = await prisma.event.findMany({
    where: { calendarId: calendar.id, isPublic: true, status: 'CONFIRMED' },
    orderBy: { startsAt: 'asc' },
  })

  const ics = buildIcs({
    name: calendar.name,
    slug: calendar.slug,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    events: events.map(toPublicEvent),
  })

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${calendar.slug}.ics"`,
    },
  })
}
```

- [ ] **Step 7: Página de embed**

Create `src/app/embed/[slug]/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { loadCalendarBySlug } from '@/lib/public/load-calendar'
import { toPublicEvent } from '@/lib/public/serialize'
import { CalendarView } from '@/components/CalendarView'
import type { Area } from '@prisma/client'

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ view?: string; area?: string }>
}) {
  const { slug } = await params
  const { view, area } = await searchParams
  const calendar = await loadCalendarBySlug(slug)

  const normalizedArea = area?.toUpperCase()

  const events = await prisma.event.findMany({
    where: {
      calendarId: calendar.id,
      isPublic: true,
      status: 'CONFIRMED',
      endsAt: { gte: new Date() },
      ...(normalizedArea ? { area: normalizedArea as Area } : {}),
    },
    orderBy: { startsAt: 'asc' },
  })

  return (
    <div className="p-3">
      <CalendarView
        events={events.map(toPublicEvent)}
        timezone={calendar.timezone}
        slug={slug}
        initialView={view === 'mes' ? 'mes' : 'lista'}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const post = () => parent.postMessage(
              { type: 'calendario:height', height: document.documentElement.scrollHeight },
              '*'
            );
            new ResizeObserver(post).observe(document.documentElement);
            post();
          `,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 8: Liberar o embed em iframe**

Modify `next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Padrão restritivo em todo o site...
      {
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      // ...menos no embed, cuja razão de existir é ser colocado em iframe
      // por outro domínio. Sem esta exceção o embed quebra em silêncio.
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 9: Verificar**

Run: `npm test`
Expected: PASS, 32 testes.

Run: `npm run dev`, abrir `http://localhost:3000/api/calendars/ibc/ics`
Expected: baixa/exibe um `.ics` válido começando em `BEGIN:VCALENDAR`.

- [ ] **Step 10: Commit**

```bash
git add src/app/embed src/app/api/calendars src/lib/public next.config.ts
git commit -m "feat: adiciona embed, JSON público e feed .ics"
```

---

## Task 12: Deploy

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `.github/workflows/deploy.yml`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: nada
- Produces: imagem publicada no GHCR a cada push em `main`

- [ ] **Step 1: Ativar o output standalone**

Modify `next.config.ts` — adicionar ao objeto `nextConfig`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() { /* ... inalterado ... */ },
}
```

- [ ] **Step 2: Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Migration roda no start do container, como no gestao_pessoas.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

Create `.dockerignore`:

```
node_modules
.next
.git
.worktrees
docs
uploads
.env*
```

- [ ] **Step 3: Workflow de deploy**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Disparar deploy no EasyPanel
        run: curl -fsSL -X POST "${{ secrets.EASYPANEL_DEPLOY_HOOK }}"
```

- [ ] **Step 4: Configurar o EasyPanel**

Manual, na VPS:

1. Criar um serviço **Postgres** no projeto (ou um database novo no Postgres existente).
2. Criar um **App** apontando para *Docker Image* `ghcr.io/InteliBlockchain-IBC/calendario:latest`.
3. Adicionar um **volume** montado em `/app/uploads`.
4. Variáveis de ambiente do app: `DATABASE_URL` (host = nome do serviço Postgres, rede interna), `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `UPLOAD_DIR=/app/uploads`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL` (mesma URL pública).
5. Copiar o **deploy hook** do app e salvar como secret `EASYPANEL_DEPLOY_HOOK` no GitHub.
6. Tornar o pacote do GHCR público, ou configurar credencial de registry no EasyPanel.
7. Adicionar as duas URLs de produção como *Authorized redirect URI* no OAuth client: `https://<dominio>/api/auth/callback/google` (login) e `https://<dominio>/admin/ibc/conectar/callback` (conexão da agenda).

- [ ] **Step 5: Verificar o build da imagem localmente**

Run: `docker build -t calendario-test .`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore .github next.config.ts
git commit -m "feat: adiciona Dockerfile e workflow de deploy para o EasyPanel"
```

---

## Task 13: Documentação versionada

Última task de propósito: os docs descrevem o que **existe**, não o que se pretendia construir. Escrevê-los antes seria escrever ficção.

**Files:**
- Create: `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/DEPLOY.md`, `docs/DESIGN_SYSTEM.md`

**Interfaces:**
- Consumes: o spec e o código pronto
- Produces: documentação versionada; o spec deixa de ser fonte de verdade

- [ ] **Step 1: `docs/ARCHITECTURE.md`**

Escrever a partir do código implementado, cobrindo, nesta ordem: visão geral, stack, estrutura de pastas, modelos do Prisma (todos os campos, com a separação Google/plataforma explicada), enums, rotas (públicas, admin, API), fluxo de auth, fluxo de sync (as duas portas de disparo, os dois modos de varredura, a janela, a guarda de concorrência) e deploy.

Copiar da seção §5 e §6 do spec, **ajustando para o que o código realmente faz** — se algum detalhe divergiu durante a implementação, o documento segue o código.

- [ ] **Step 2: `docs/PRODUCT.md`**

Escrever a partir das seções §1, §2, §3, §3.1 e §10 do spec: o problema observado na gestão, o objetivo, as decisões fundadoras com o motivo de cada uma, as costuras de multi-inquilino que existem e as que não existem, e a lista do que ficou de fora do MVP **com a razão**.

A última parte é a razão de o arquivo existir: impedir que alguém reimplemente com boa intenção algo que foi cortado de propósito.

- [ ] **Step 3: `docs/DEPLOY.md`**

Escrever a partir da Task 12: secrets do GitHub, configuração do app e do volume no EasyPanel, variáveis de ambiente de runtime, configuração do OAuth client no Google Cloud (incluindo a lista de test users, §4.3), e o passo a passo do primeiro deploy.

- [ ] **Step 4: `docs/DESIGN_SYSTEM.md`**

Enxuto, cobrindo apenas o que as telas usam: paleta derivada do guia de estilos do clube (`design/Guia de Estilos - Blockchain 2026 (1).pdf` no workspace), tipografia, o card de evento, a grade de mês e as cores por área. **Não copiar** o documento do `gestao_pessoas` — ele foi escrito para telas internas e os dois divergiriam.

- [ ] **Step 5: Verificar as referências cruzadas**

Confirmar que `README.md` e `CLAUDE.md` apontam para os quatro documentos e que nenhum deles referencia `docs/superpowers/`, que é gitignored.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: adiciona documentação versionada do sistema"
```

---

## Verificação final

- [ ] `npm test` → 32 testes passando
- [ ] `npx tsc --noEmit` → sem erros
- [ ] `npm run build` → build conclui
- [ ] `docker build -t calendario-test .` → imagem builda
- [ ] Login com conta fora da allowlist em `/admin/ibc` → 404
- [ ] `/api/calendars/ibc/events` de um evento com convidados → nenhum e-mail na resposta
- [ ] `/api/calendars/ibc/ics` → sem linha `ATTENDEE`
- [ ] `/embed/ibc` dentro de um `<iframe>` de outra origem → renderiza
- [ ] Abrir PR de `develop` para `main` → deploy dispara
