# ARCHITECTURE.md

Verdade versionada do sistema. Descreve o que o código **faz** hoje. Se este documento e o comportamento real divergirem, o código está certo e este arquivo desatualizado — corrija-o na mesma PR que mudar schema, rota ou fluxo de sync (ver `CLAUDE.md`).

## 1. Visão geral

Plataforma de calendário do clube Inteli Blockchain. A diretoria mantém a agenda em um lugar só (esta plataforma); ela espelha os eventos no Google Agenda do clube e publica no site o que for marcado como público.

Saídas: página pública (`/c/[slug]`), embed para a landing (`/embed/[slug]`), JSON público (`/api/calendars/[slug]/events`) e feed `.ics` assinável (`/api/calendars/[slug]/ics`).

Configuração restrita a admins do calendário; visualização aberta a qualquer um.

## 2. Stack

App **Next.js único** (App Router, full-stack) — não há backend separado.

| Camada | Escolha |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Estilo | Tailwind v4 |
| ORM / banco | Prisma 6 + Postgres |
| Auth | Auth.js (NextAuth v5, beta) com provider Google, sessão **JWT** |
| API do Google | `googleapis` (Calendar API v3) |
| Geração de `.ics` | pacote `ics` |
| Testes | Vitest, capado em 2 forks (`npm test` — ver `CLAUDE.md`) |
| Hospedagem | Container Docker no EasyPanel da VPS, imagem publicada no GHCR via GitHub Actions |
| Banco | Postgres no mesmo EasyPanel, rede interna, conexão direta (sem pooler) |
| Imagens de evento | Volume montado no container, servido por rota própria (`/api/uploads/[...path]`) |
| Disparo do sync | Sob demanda, na leitura, via `after()` do Next.js — sem cron |

**Por que sem pooler.** O app roda como container de processo longo, não função serverless: um único processo Node mantém um pool de conexões estável, sem PgBouncer, sem `sslmode`, sem segunda URL de banco.

## 3. Estrutura de pastas

```
calendario/
├── docs/                          ← este arquivo e os outros três
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                    ← cria o calendário "ibc" via createCalendar()
├── src/
│   ├── app/
│   │   ├── (public)/c/[slug]/     ← página do calendário e do evento
│   │   ├── embed/[slug]/          ← versão para iframe
│   │   ├── admin/[slug]/          ← gestão, conexão Google, contatos
│   │   ├── api/calendars/[slug]/  ← events, ics, sync, upload
│   │   ├── api/uploads/[...path]/ ← serve as imagens do volume
│   │   ├── api/auth/[...nextauth]/
│   │   └── login/
│   ├── components/                ← CalendarView, MonthGrid, EventList
│   ├── lib/
│   │   ├── auth/guard.ts          ← requireCalendarAdmin
│   │   ├── calendar/create-calendar.ts
│   │   ├── google/                ← client, oauth, list-events, write-event, map-event
│   │   ├── public/                ← load-calendar, serialize, ics
│   │   ├── sync/                  ← decide-sync, reconcile, run-sync, constants, types
│   │   └── db.ts
│   └── auth.ts
├── Dockerfile
└── .github/workflows/deploy.yml
```

## 4. Modelo de dados

Prisma 6 + Postgres. **Sem tabelas de Auth.js** (`User`, `Account`, `Session`): a sessão usa estratégia **JWT** (`src/auth.ts`), sem `PrismaAdapter` — nada do login é persistido no banco. Isso diverge do desenho original, que previa as tabelas padrão do Auth.js; na implementação real elas nunca foram necessárias.

### `Calendar`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `slug` | string, único | identificador público (`ibc`) — usado em `/c/[slug]`, `/admin/[slug]`, `/embed/[slug]` |
| `name` | string | |
| `timezone` | string | default `America/Sao_Paulo` |
| `allowedDomain` | string? | restringe o domínio de e-mail aceito no login do admin; `null` = qualquer domínio |
| `ownerEmail` | string | |
| `status` | enum `CalendarStatus` | `ACTIVE` \| `DISABLED` — desligar sem apagar |
| `googleCalendarId` | string? | id da agenda no Google, escolhido em `/admin/[slug]/conectar` |
| `syncPastDays` | int | default `90` |
| `syncFutureDays` | int | default `365` |
| `lastSyncedAt` | datetime? | usada para decidir obsolescência (§6) e como `updatedMin` da varredura incremental |
| `syncingAt` | datetime? | lock de sync em andamento (§6) |
| `lastSyncError` | string? | último erro de sync, exibido no admin |
| `createdAt` / `updatedAt` | datetime | |

Relações: `admins` (`CalendarAdmin[]`), `googleConnection` (`GoogleConnection?`), `events` (`Event[]`), `contacts` (`Contact[]`), `contactGroups` (`ContactGroup[]`).

### `GoogleConnection`

1:1 com `Calendar` (`calendarId` único). Separada do login por decisão de desenho: quem entra no admin é qualquer admin da allowlist com a própria conta; toda escrita no Google usa esta conexão única, autorizada pela conta oficial do clube.

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `calendarId` | uuid, único |
| `googleEmail` | string |
| `refreshToken` | text |
| `accessToken` | text? |
| `expiresAt` | datetime? |

### `CalendarAdmin`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `email` | string | único junto com `calendarId` |

Tabela, não env var — adicionar admin não exige redeploy.

### `Contact`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `name` | string? | contato criado pelo uso nasce sem nome |
| `email` | string | único junto com `calendarId` |
| `groups` | N:N com `ContactGroup` | tabela de junção implícita (`_ContactToGroup`) |
| `createdAt` / `updatedAt` | datetime | |

### `ContactGroup`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `name` | string | único junto com `calendarId` |
| `contacts` | N:N com `Contact` | |

### `Event`

Dois blocos de campos com donos distintos — é essa separação que faz a sincronização não ter conflito.

**Campos do Google** (`runSync` sobrescreve a cada sync, sempre campo a campo, nunca por spread — ver `reconcile.ts`):

| Campo | Tipo |
|---|---|
| `googleEventId` | string, único junto com `calendarId` |
| `title` | string |
| `description` | text? |
| `startsAt` | datetime (UTC) |
| `endsAt` | datetime (UTC) |
| `allDay` | boolean, default `false` |
| `location` | string? |
| `status` | enum `EventStatus`: `CONFIRMED` \| `CANCELLED` |
| `recurringEventId` | string? |
| `attendees` | json — `{email, name, responseStatus}[]` |

**Campos da plataforma** (o sync **nunca** toca):

| Campo | Tipo | Nota |
|---|---|---|
| `isPublic` | boolean, default `false` | controla a aparição no site |
| `publicTitle` | string? | sobrescreve `title` no site |
| `publicDescription` | text? | sobrescreve `description` no site |
| `imageUrl` | string? | arte do evento, servida do volume |
| `area` | enum `Area?` | |
| `signupUrl` | string? | link do botão "Inscreva-se" |

Mais `calendarId`, `createdAt`, `updatedAt`, `syncedAt`.

Índices: `@@unique([calendarId, googleEventId])`, `@@index([calendarId, startsAt])`.

## 5. Enums

- **`Area`**: `EDUCATIONAL | PROJECTS | MARKETING | PEOPLE | GENERAL` — espelha as áreas do clube, mais `GENERAL`.
- **`EventStatus`**: `CONFIRMED | CANCELLED`.
- **`CalendarStatus`**: `ACTIVE | DISABLED`.

## 6. Rotas

### Públicas

| Rota | Descrição |
|---|---|
| `GET /c/[slug]` | Página do calendário: grade de mês ⇄ lista. |
| `GET /c/[slug]/e/[id]` | Página do evento (`id` = `Event.id` da plataforma, nunca `googleEventId`). |
| `GET /embed/[slug]` | Mesma UI sem cabeçalho/rodapé, para iframe. Aceita `?view=mes\|lista` e `?area=<AREA>`. |
| `GET /api/calendars/[slug]/events` | JSON dos eventos publicados. CORS aberto (`Access-Control-Allow-Origin: *`). Aceita `?area=<AREA>`. |
| `GET /api/calendars/[slug]/ics` | Feed `.ics`. |
| `GET /api/uploads/[...path]` | Serve as imagens do volume; valida contra travessia de diretório. |

Todas as quatro primeiras passam por `loadCalendarBySlug` (§7) e retornam **404** se `Calendar.status !== ACTIVE`.

### Admin (exige `requireCalendarAdmin`, §8)

| Rota | Descrição |
|---|---|
| `GET /admin/[slug]` | Tabela de eventos futuros, toggle de publicação, botão "Sincronizar agora", snippet de embed. |
| `GET /admin/[slug]/contatos` | Lista de contatos com nome, e-mail e grupos. |
| `GET /admin/[slug]/conectar` | Tela de conexão OAuth com o Google; lista as agendas da conta conectada. |
| `GET /admin/[slug]/conectar/start` | Inicia o fluxo OAuth (gera `state`, grava cookie, redireciona ao Google). |
| `GET /admin/[slug]/conectar/callback` | Troca o `code` por tokens, valida `state`, grava `GoogleConnection`. |
| `POST /api/calendars/[slug]/sync` | Dispara **varredura completa** (`runSync(id, 'full')`), devolve contagem em texto. |
| `POST /api/calendars/[slug]/upload` | Recebe a arte do evento (JPG/PNG/WebP, até 5 MB), grava no volume com nome gerado. |

Server Actions em `src/app/admin/[slug]/actions.ts` (`togglePublic`, `updatePublicFields`, `createEvent`, `updateGoogleFields`, `deleteEvent`) e `.../contatos/actions.ts` (`saveContact`, `deleteContact`, `expandGroup`) — todas chamam `requireCalendarAdmin` internamente.

### API

| Rota | Descrição |
|---|---|
| `/api/auth/[...nextauth]` | Handlers do Auth.js (login/logout/callback do Google). |

## 7. Fluxo de auth

Auth.js (NextAuth v5) com provider Google, sessão **JWT**, sem adapter de banco (`src/auth.ts`).

`requireCalendarAdmin(slug)` (`src/lib/auth/guard.ts`) é o único ponto de autorização e roda em duas etapas:

1. **Autenticação:** `auth()` lê a sessão. Sem e-mail na sessão → `redirect('/login?next=/admin/[slug]')`.
2. **Autorização, sempre consultada no banco** (o token diz quem a pessoa é; nunca decide o que ela pode fazer):
   - `Calendar` não existe ou `status !== ACTIVE` → 404.
   - `allowedDomain` definido e e-mail não termina em `@<allowedDomain>` → 404.
   - E-mail sem linha em `CalendarAdmin` para **aquele** `calendarId` → 404.

Login fora da allowlist do calendário (mesmo que autenticado com sucesso no Google) sempre resulta em 404, nunca em 403 — não revela se o e-mail seria válido para outro calendário.

Admin de um calendário não é automaticamente admin de outro: a checagem é sempre escopada por `calendarId`.

## 8. Fluxo de sync

### 8.1 Ida — plataforma → Google (`src/app/admin/[slug]/actions.ts`, `src/lib/google/write-event.ts`)

Criar, editar ou apagar evento no admin chama a API do Google **antes** de gravar no banco:

- criar → `events.insert`, guarda o `googleEventId` retornado;
- editar campos do Google → `events.patch`;
- apagar → `events.delete`.

**Se a chamada ao Google falhar, a exceção sobe e nada é gravado no banco** — um evento nunca existe só de um lado. Editar apenas campos da plataforma (`togglePublic`, `updatePublicFields`) nunca chama o Google.

A lista de convidados vai no campo `attendees` do payload; `sendUpdates` (`'all'` ou `'none'`) decide se o Google dispara e-mail. Padrão: **ligado ao criar**, **desligado ao editar** — checkbox "notificar convidados" na tela do evento inverte o padrão por operação.

### 8.2 Volta — Google → plataforma: duas portas de disparo

Ambas chamam o mesmo `runSync(calendarId, mode)` (`src/lib/sync/run-sync.ts`).

**Porta 1 — obsolescência na leitura**, o mecanismo principal (`loadCalendarBySlug`, `src/lib/public/load-calendar.ts`). Toda rota pública de leitura (`/c/[slug]`, `/c/[slug]/e/[id]`, `/embed/[slug]`, o JSON e o `.ics`) chama essa função, que decide via `decideSync()` (`src/lib/sync/decide-sync.ts`):

| Condição | Decisão | Comportamento |
|---|---|---|
| `syncingAt` há menos de 2 min | `skip` | serve o que está no banco, não sincroniza (lock vence tudo) |
| `lastSyncedAt` nulo, ou há mais de 24 h | `blocking` | **sincroniza antes de responder** (`await runSync(..., 'incremental')`) |
| `lastSyncedAt` entre 10 min e 24 h | `background` | serve direto e sincroniza depois via `after()` |
| `lastSyncedAt` há menos de 10 min | `skip` | serve direto, não sincroniza |

Se `Calendar.googleCalendarId` for nulo, `loadCalendarBySlug` retorna sem tentar sincronizar. Falha de sync no caminho `blocking` ou `background` nunca derruba a página: o erro fica em `lastSyncError` e a função retorna o `calendar` já carregado.

**Porta 2 — botão "Sincronizar agora"** (`POST /api/calendars/[slug]/sync`, exige sessão admin). Execução síncrona, resultado em texto (`"N novos, N atualizados, N cancelados"`).

### 8.3 Dois modos de varredura

| | Porta 1 (fundo/bloqueante) | Porta 2 (botão) |
|---|---|---|
| `mode` passado a `runSync` | `'incremental'` | `'full'` |
| `updatedMin` na chamada ao Google | `calendar.lastSyncedAt` | ausente |
| Traz | só o que mudou desde `lastSyncedAt` | a janela inteira |
| Reconcilia sumiços (ausência = cancelamento) | **não** | **sim** |

A regra "ausência dentro da janela = `CANCELLED`" (`reconcile.ts`, bloco `if (mode === 'full')`) existe só para fechar o furo do modelo por janela: um evento movido no Google para fora da janela para de voltar nas respostas. Aplicá-la no modo incremental cancelaria o calendário inteiro, porque o incremental só retorna o que mudou — é o caso de teste mais importante do sistema (`reconcile.test.ts`).

Primeiro sync após conectar a agenda: `lastSyncedAt` é nulo → `decideSync` já devolve `'blocking'`, e como não há `lastSyncedAt`, `runSync` roda sem `updatedMin` — varredura completa por consequência natural da regra, sem caso especial no código.

### 8.4 Janela de sincronização

`listEvents()` (`src/lib/google/list-events.ts`) busca sempre dentro de uma janela, nunca a agenda inteira:

```
timeMin      = agora − Calendar.syncPastDays    (default 90)
timeMax      = agora + Calendar.syncFutureDays  (default 365)
singleEvents = true    # expande séries recorrentes em ocorrências
showDeleted  = true     # recebe cancelamentos
maxResults   = 2500     # paginado por pageToken
updatedMin   = lastSyncedAt   # só no modo 'incremental'
```

Sem `syncToken`: incompatível com `timeMin`/`timeMax` (documentado pela API). O incremental usa `updatedMin` no lugar, que compõe com a janela sem conflito.

A janela não decide o que o site mostra — são dois controles independentes. Evento que sai da janela deixa de ser atualizado mas permanece no banco; `/c/[slug]/e/[id]` continua funcionando.

### 8.5 Guarda de concorrência

`runSync` grava `syncingAt = now` **antes** de qualquer chamada ao Google (lock otimista, sem transação com o resto). Se `decideSync` encontrar `syncingAt` há menos de `SYNC_LOCK_MS` (2 minutos), devolve `'skip'` e nenhum novo sync dispara.

Constantes (`src/lib/sync/constants.ts`):

```
STALE_AFTER_MS    = 10 * 60 * 1000   // 10 min
BLOCKING_AFTER_MS = 24 * 60 * 60 * 1000  // 24 h
SYNC_LOCK_MS      = 2 * 60 * 1000    // 2 min
```

Ao final (sucesso ou erro), `runSync` sempre grava `syncingAt: null` — sucesso limpa também `lastSyncError`; erro grava a mensagem em `lastSyncError` e relança a exceção.

### 8.6 Reconciliação (`src/lib/sync/reconcile.ts`)

Função pura, sem rede nem banco — testada isoladamente em `reconcile.test.ts`.

1. Evento novo do Google (sem match local) entra com `isPublic = false` — nada aparece no site sem publicação deliberada.
2. Evento existente: só os campos do Google são sobrescritos (enumerados campo a campo em `toGoogleFields`, nunca por spread, para não deixar campo da plataforma vazar). `publicTitle`, `publicDescription`, `imageUrl`, `area`, `signupUrl` sobrevivem intactos.
3. `status: cancelled` no Google → linha marcada `CANCELLED`, some do site, continua visível no admin.
4. Evento cancelado no Google sem linha local correspondente é ignorado (nada a fazer).
5. No modo `'full'`, toda linha local com `startsAt` dentro da janela que não veio na resposta é marcada `CANCELLED`.

`run-sync.ts` aplica o resultado numa única `prisma.$transaction`: criações, atualizações, cancelamentos em massa e a atualização de `Calendar.lastSyncedAt`/`syncingAt`/`lastSyncError` — tudo ou nada.

## 9. Segurança (resumo — detalhe em `PRODUCT.md`)

- `attendees` e `Contact` nunca saem em rota pública: `publicEventSelect` (`src/lib/public/serialize.ts`) é o único `select` usado nas quatro rotas públicas, e não inclui `attendees`. `PublicEvent` (o tipo de saída) não tem o campo — garantia de tipo, não só de query.
- `buildIcs()` recebe `PublicEvent[]`, nunca `Event[]` — o tipo é a barreira contra vazar `ATTENDEE` no `.ics`.
- Upload: valida `content-type` (JPG/PNG/WebP) e tamanho (5 MB); nome do arquivo sempre gerado (`randomUUID`), nunca o do cliente.
- `/api/uploads/[...path]`: rejeita segmento com `..` ou `/`, e valida que o caminho resolvido continua dentro de `UPLOAD_DIR` — segunda barreira contra travessia de diretório, independente do nome gerado no upload.
- Fluxo OAuth (`conectar/start` e `conectar/callback`): `state` aleatório em cookie `httpOnly`, comparado no callback antes de trocar qualquer `code` — protege contra OAuth CSRF.
- `refreshToken` fica em texto plano no banco (`GoogleConnection`). Risco aceito: o Postgres não é exposto publicamente e o token só concede escrita na agenda do clube.

## 10. Deploy

Ver `DEPLOY.md` para o passo a passo completo. Resumo:

- `Dockerfile` multi-stage (deps → builder → runner, `node:22-alpine`), build `output: 'standalone'` do Next. `CMD` roda `npx prisma migrate deploy` antes de `node server.js`.
- `.github/workflows/deploy.yml`: dispara em `push` para `main` (ou `workflow_dispatch`), builda e publica `ghcr.io/<repo>:latest` e `:<sha>`, depois chama `EASYPANEL_DEPLOY_HOOK` via `curl`.
- Runtime: container no EasyPanel, Postgres no mesmo EasyPanel (rede interna, sem porta pública), volume montado para `UPLOAD_DIR`.
