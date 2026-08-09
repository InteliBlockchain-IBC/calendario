# Calendário do clube — design

**Data:** 2026-08-08
**Projeto:** `projetos/calendario` (repo novo, sugestão: `InteliBlockchain-IBC/calendario`)
**Status:** desenho aprovado, pronto para virar plano de implementação

---

## 1. Problema

O calendário do Inteli Blockchain mora hoje num board do Canva. Consequências observadas na gestão:

- Cada mudança de agenda exige refazer arte manualmente.
- O clube já trocou três vezes de plataforma de calendário.
- Membros e parte da diretoria não conseguem visualizar a agenda com clareza.
- O Google Agenda do clube existe, mas está desatualizado e pouco usado — a verdade real mora no Canva.

O problema não é técnico, é de **fonte única**: não existe um lugar onde a agenda seja mantida uma vez e apareça em todos os canais.

## 2. Objetivo

Uma plataforma web onde a diretoria mantém o calendário do clube uma única vez, e de onde saem:

1. Uma página pública clara do calendário.
2. Um embed para a landing page do clube.
3. Um feed `.ics` assinável no celular do membro.
4. Os eventos espelhados no Google Agenda do clube.

Configuração restrita a admins do clube; visualização aberta.

## 3. Decisões fundadoras

| Decisão | Escolha | Motivo |
|---|---|---|
| Fonte da verdade | **A plataforma** | O Google Agenda está subutilizado; exigir que a diretoria adote o hábito do GCal primeiro faria o sistema nascer vazio. |
| Espelhamento no Google | **Obrigatório, na criação** | Quem já vive no Google continua vendo tudo; ninguém é forçado a trocar de ferramenta para *consumir*. |
| Visibilidade | **Uma agenda Google só + flag `isPublic`** | Evento interno vai para a mesma agenda (que a diretoria já acessa) e simplesmente não aparece no site. |
| Onde mora o código | **Projeto novo, standalone** | Precisa ser embutível na landing hoje e, potencialmente, no `gestao_pessoas` depois. Um serviço com embed serve os dois. |
| Escala futura | **Costura, não feature** | Modelo de dados já multi-inquilino; sem onboarding, cobrança ou tema por cliente. |

### 3.1 Sobre escalar para outros clubes/instituições

O objetivo declarado é que a solução possa, no futuro, servir outras instituições. A abordagem é preparar as **costuras baratas** agora e não construir o produto multi-inquilino:

O critério é o custo relativo: entra agora o que é barato agora **e** caro depois; fica de fora o que custa o mesmo hoje ou daqui a um ano.

**Incluído agora (barato agora, caro depois):**

| Costura | Por que não dá para deixar pra depois |
|---|---|
| Todo conteúdo pendura em `calendarId`; nenhuma query global | Reescrever query por query é o trabalho clássico de migração multi-inquilino. |
| `Calendar.slug` como identificador público em todas as rotas | Rota sem namespace de inquilino quebra link salvo quando ganha um. |
| `/admin/[slug]`, não `/admin` | Idem — agora é o nome de uma pasta. |
| `createCalendar()` como função de domínio, chamada pelo seed | O seed usa hoje; uma rota de signup usa amanhã. Criação espalhada no seed vira arqueologia. |
| Slugs reservados (`admin`, `api`, `embed`, `c`, `login`) | Depois que existirem slugs em uso, reservar vira migração de dados. |
| `Calendar.ownerEmail` e `Calendar.status` | Self-service precisa saber de quem é o calendário e desligá-lo sem apagar. Duas colunas. |
| Admins em tabela (`CalendarAdmin`), não em env var | Env var é global por natureza; não existe env var por inquilino. |
| `allowedDomain` como coluna do `Calendar` | Cada instituição tem o seu domínio. |
| `GoogleConnection` por calendário | Cada inquilino autoriza a própria agenda. |
| Sync disparado por calendário, nunca global (§6.2) | Um job global que enumera inquilinos é a peça que apodrece primeiro. |
| App OAuth criado como **External** (§4.2) | Um app Internal não pode ser aberto depois — exige app novo e reautorização de todos. |

**Explicitamente fora:**
- Tela de cadastro self-service e verificação de e-mail.
- Cobrança/planos.
- Tema, cores ou logo por cliente.
- Subdomínio ou domínio próprio por cliente.

Nenhum desses fica mais caro por esperar, e cada um decidido sem um segundo usuário na frente é chute.

## 4. Stack e infraestrutura

App **Next.js único** (App Router, full-stack), sem backend separado — o sistema tem três superfícies pequenas e uma rotina de sync.

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Estilo | Tailwind v4 |
| ORM / banco | Prisma 6 + Postgres |
| Auth | Auth.js (NextAuth v5) com provider Google |
| API do Google | `googleapis` (Calendar API v3) |
| Geração de .ics | pacote `ics` |
| Hospedagem do app | Vercel |
| Banco | Novo *database* no Postgres da VPS que já roda o `gestao_pessoas` |
| Imagens | Vercel Blob |
| Disparo do sync | Sob demanda, na leitura, via `after()` do Next.js |

**Por que sync sob demanda e não cron:** um cron externo (GitHub Actions, Vercel Cron) é uma dependência de runtime morando fora do serviço — quem quisesse subir esta plataforma precisaria configurar agendamento à parte para a agenda simplesmente funcionar. Contradiz "plataforma independente". Pior, um cron único que varre todos os calendários é justamente a peça que não sobrevive a multi-inquilino. O disparo por leitura elimina a infra externa, e o sync passa a acontecer por calendário, proporcional ao uso de cada um. Detalhe em §6.2.

*(Vercel Cron também não serviria pelo lado prático: no plano Hobby executa no máximo uma vez por dia.)*

**Por que a VPS existente:** o Postgres do `gestao_pessoas` já está de pé e ocioso para essa carga. Um database novo no mesmo servidor custa zero e não acopla os dois sistemas (schemas independentes, sem foreign key entre eles). Se um dia for preciso isolar, Neon free serve como alternativa direta.

### 4.1 Variáveis de ambiente

```
DATABASE_URL=              # Postgres (database próprio, separado do gestao_pessoas)
AUTH_SECRET=               # Auth.js
AUTH_GOOGLE_ID=            # OAuth client do projeto Google Cloud do clube
AUTH_GOOGLE_SECRET=
BLOB_READ_WRITE_TOKEN=     # Vercel Blob
NEXT_PUBLIC_APP_URL=       # base usada no snippet de embed e no feed .ics
```

Nenhuma variável é específica de inquilino — o que varia por calendário mora no banco.

### 4.2 App OAuth no Google Cloud

Escopos: `openid email profile` para login; `https://www.googleapis.com/auth/calendar` para a conexão do calendário (leitura + escrita).

O consent screen é criado como **External, em modo Testing**. Isso importa e é decisão consciente:

- Um app **Internal** só aceita contas do Workspace do Inteli. Nenhuma instituição de fora conseguiria autorizar, e abrir depois significa criar app novo e reautorizar todo mundo — o item mais caro-depois do projeto inteiro.
- **External em Testing** funciona com até 100 contas cadastradas na lista de teste, o que cobre o clube e os primeiros parceiros com folga, e não exige nada do Google.
- A verificação do Google (necessária para publicar External sem o limite de 100) fica para quando existir um segundo cliente real. O escopo `calendar` é sensível e a revisão pede política de privacidade publicada, domínio verificado e vídeo demonstrativo, levando semanas. Quando chegar a hora, nada precisa ser refeito — só submetido.

Consequência prática hoje: quem faz login vê o aviso de "app não verificado" e cada conta precisa constar na lista de teste do projeto no Google Cloud.

## 5. Modelo de dados

Quatro tabelas de domínio, mais as do Auth.js (`User`, `Account`, `Session`, `VerificationToken`).

### `Calendar`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `slug` | string, único | identificador público (`ibc`) — usado em `/c/[slug]`, `/admin/[slug]` e no embed |
| `name` | string | "Inteli Blockchain" |
| `timezone` | string | `America/Sao_Paulo` |
| `allowedDomain` | string? | `sou.inteli.edu.br`; null = qualquer domínio |
| `ownerEmail` | string | quem criou/responde pelo calendário |
| `status` | enum `ACTIVE \| DISABLED` | desligar sem apagar |
| `googleCalendarId` | string? | id da agenda no Google |
| `syncToken` | string? | token de sync incremental do Google |
| `lastSyncedAt` | datetime? | usado pela checagem de obsolescência (§6.2) |
| `syncingAt` | datetime? | lock de sync em andamento (§6.2) |
| `createdAt` / `updatedAt` | datetime | |

Uma linha no MVP, criada pelo seed através de `createCalendar()` — a mesma função que uma rota de cadastro chamaria no futuro. Multi-calendário é mais linhas, não reescrita.

**Slugs reservados:** `admin`, `api`, `embed`, `c`, `login`, `auth`. Validados em `createCalendar()`.

### `GoogleConnection`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid, único | 1:1 com `Calendar` |
| `googleEmail` | string | conta que autorizou (a oficial do clube) |
| `refreshToken` | text | |
| `accessToken` | text? | cache |
| `expiresAt` | datetime? | |

**Separada do login por decisão de desenho.** Quem entra no admin é qualquer admin da allowlist com a própria conta; toda escrita no Google usa esta conexão única. Assim ninguém precisa da senha da conta do clube, e os eventos não aparecem no Google como criados por pessoas diferentes.

### `CalendarAdmin`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `email` | string | único junto com `calendarId` |

Semeada com os e-mails da diretoria. Adicionar admin não exige redeploy.

### `Event`

Dois blocos de campos, com donos distintos. É essa separação que faz a sincronização não ter conflito.

**Campos do Google** (sobrescritos a cada sync):

| Campo | Tipo |
|---|---|
| `googleEventId` | string, único junto com `calendarId` |
| `title` | string |
| `description` | text? |
| `startsAt` | datetime (UTC) |
| `endsAt` | datetime (UTC) |
| `allDay` | boolean |
| `location` | string? |
| `status` | enum `CONFIRMED \| CANCELLED` |
| `recurringEventId` | string? — preenchido quando é ocorrência de uma série |

**Campos da plataforma** (o sync **nunca** toca):

| Campo | Tipo | Nota |
|---|---|---|
| `isPublic` | boolean, default `false` | controla a aparição no site |
| `publicTitle` | string? | sobrescreve `title` no site |
| `publicDescription` | text? | sobrescreve `description` no site |
| `imageUrl` | string? | arte do evento (Vercel Blob) |
| `area` | enum `Area?` | |
| `signupUrl` | string? | link do botão "Inscreva-se" |

Mais `calendarId`, `createdAt`, `updatedAt`, `syncedAt`.

Índices: `(calendarId, startsAt)` para as listagens, `(calendarId, googleEventId)` único para o sync.

### `Area` (enum)

`EDUCATIONAL | PROJECTS | MARKETING | PEOPLE | GENERAL` — espelha as áreas do clube (mesmos valores do `Department` no `gestao_pessoas`, mais `GENERAL`).

## 6. Sincronização

### 6.1 Ida — plataforma → Google

Criar, editar ou apagar evento no admin chama a API do Google na mesma requisição:

- criar → `events.insert`, guarda o `googleEventId` retornado
- editar campos do Google → `events.patch`
- apagar → `events.delete`

**Se a chamada ao Google falhar, a operação inteira falha** e nada é gravado no banco. Um evento nunca existe só de um lado. Editar *apenas* campos da plataforma (`isPublic`, arte, tag) não toca o Google.

### 6.2 Volta — Google → plataforma

`events.list` com **sync incremental**, disparado por duas portas para o mesmo código.

**Porta 1 — obsolescência na leitura (o mecanismo principal).** Toda rota de leitura de um calendário (`/c/[slug]`, `/embed/[slug]`, o JSON público e o feed `.ics`) checa `lastSyncedAt`. Se passou de **10 minutos**, a rota:

1. responde imediatamente com o dado que já está no banco;
2. dispara o sync em segundo plano via `after()` do Next.js.

O visitante nunca espera pelo Google. O próximo já pega atualizado.

Três propriedades que fazem disso a escolha certa e não só a mais barata:

- **Nenhuma infra externa.** Clonar, dar deploy e funcionar. Não há agendamento a configurar em lugar nenhum — o que é o requisito de uma plataforma independente.
- **Escala por inquilino automaticamente.** Calendário movimentado sincroniza com frequência; calendário sem visita não sincroniza, e não precisa, porque ninguém está olhando. Nenhum job precisa enumerar inquilinos.
- **O `.ics` também é leitura.** Google e Apple buscam o feed dos assinantes periodicamente por conta própria, então um calendário sem tráfego no site continua sendo sincronizado por quem o assinou no celular.

**Porta 2 — botão "Sincronizar agora"** no admin, para quando se quer ver a mudança na hora. Mesma função, execução síncrona, resultado em texto.

**Guarda de concorrência:** antes de sincronizar, grava `syncingAt`. Se já existe um `syncingAt` de menos de 2 minutos atrás, o disparo é ignorado. *(Teto conhecido: se o processo serverless for encerrado no meio do sync, o lock segura até 2 minutos a mais que o necessário. Advisory lock do Postgres é o caminho de melhoria, se algum dia incomodar.)*

Parâmetros da chamada: `singleEvents=true` (expande séries recorrentes em ocorrências individuais), `showDeleted=true` (para receber cancelamentos), `syncToken` quando existir.

**Restrição real da API do Google:** `syncToken` é incompatível com `timeMin`, `timeMax`, `updatedMin`, `q` e `orderBy`. O sync inicial portanto varre a agenda inteira, sem janela de data — aceitável para um calendário de clube (centenas de eventos). Os demais parâmetros precisam ser idênticos entre a chamada inicial e as incrementais.

**Regras da reconciliação:**

1. Evento novo vindo do Google entra com **`isPublic = false`**. Nada aparece no site sem alguém publicar deliberadamente. Este é o ponto central: a agenda do Google contém reunião interna, compromisso pessoal, o que for — o site mostra só o que foi curado.
2. Evento existente: atualiza somente os campos do Google. Descrição pública, título público, arte, tag e link de inscrição sobrevivem intactos.
3. Cancelado ou apagado no Google (`status: cancelled`): marcado `CANCELLED`, some do site, continua visível no admin.
4. `syncToken` inválido (Google devolve **410 Gone**, tipicamente após semanas sem sync): descarta o token e refaz varredura completa.
5. Escrita da plataforma que volta no próximo sync sobrescreve os campos do Google com dados idênticos — inofensivo, e não toca os campos da plataforma.

O resultado do sync é reportado em texto no admin: `"3 novos, 1 atualizado, 1 cancelado"`.

## 7. Rotas e telas

| Rota | Acesso | Descrição |
|---|---|---|
| `/c/[slug]` | público | Página do calendário. Grade de mês ⇄ lista, alternável por botão. Lista é o padrão no celular. |
| `/c/[slug]/e/[id]` | público | Página do evento: arte, descrição pública, data/hora/local, botão de inscrição. É o link compartilhável. `[id]` é o `Event.id` da plataforma, nunca o `googleEventId`. |
| `/embed/[slug]` | público | Mesmo calendário sem cabeçalho/rodapé, para iframe. Aceita `?view=mes\|lista` e `?area=educational`. |
| `/api/calendars/[slug]/events` | público | JSON dos eventos publicados. |
| `/api/calendars/[slug]/ics` | público | Feed `.ics` assinável. |
| `/admin/[slug]` | allowlist do calendário | Gestão do calendário. |
| `/api/calendars/[slug]/sync` | sessão admin | Sync incremental (botão "Sincronizar agora"). |
| `/api/auth/*` | — | Auth.js. |

### 7.1 Página pública

Duas visões sobre o mesmo dado:

- **Grade de mês** — visão macro, equivalente ao board do Canva que substitui. Navegação `‹ AGOSTO 2026 ›`.
- **Lista** — cards em ordem cronológica, com data em destaque, horário, local e tag de área.

Alternância por botão; a lista é o padrão em telas estreitas. Cor do card vem da tag de área — evento sem tag usa a cor de `GENERAL`.

### 7.2 Embed

Padrão iframe, porque a landing é um site estático e isso funciona sem build do lado dela:

```html
<iframe src="https://<app>/embed/ibc" style="width:100%;border:0" height="600"></iframe>
```

Junto vai um `postMessage` de altura e um `<script>` opcional de uma linha para altura automática.

**Detalhe de implementação:** se forem adicionados headers de segurança globais, `/embed/*` precisa ser exceção — `X-Frame-Options` ou `frame-ancestors` restritivos quebram o embed silenciosamente.

A rota de JSON existe para o caso de a landing nova preferir renderizar o calendário com a própria tipografia e cores. Duas saídas, mesma fonte de dados.

### 7.3 Feed .ics

Ataca diretamente a dor "membros não conseguem visualizar o calendário": o membro assina a URL uma vez no Google Agenda ou no Apple Calendário do celular e a agenda do clube passa a aparecer junto com a dele, atualizando sozinha. Contém apenas eventos publicados.

### 7.4 Admin

Uma tela só:

- Tabela de eventos, próximos primeiro, passados atrás de um filtro.
- Cada linha: título, data, área, e um toggle **"no site"**.
- Botão de editar abre painel lateral com os quatro campos públicos e o upload da arte.
- Botão **"Criar evento"** (avulso — recorrência se cria no Google).
- Botão **"Sincronizar agora"** com o resultado em texto.
- Bloco com o snippet de embed pronto para copiar.

Sem dashboard, sem gráficos, sem histórico de alterações.

## 8. Segurança

- **Login:** Auth.js + Google, restrito por `Calendar.allowedDomain`. O e-mail ainda precisa constar em `CalendarAdmin` **daquele calendário** para acessar `/admin/[slug]` — pertencer ao domínio não basta. Admin de um calendário não é admin de outro.
- **`/api/calendars/[slug]/sync`:** exige sessão de admin do calendário. Não existe segredo compartilhado, porque não existe chamador automatizado externo (§6.2).
- **Sync disparado por leitura:** roda dentro do `after()` da própria requisição, sem endpoint exposto. Não há superfície nova a proteger.
- **Rotas públicas:** devolvem apenas eventos com `isPublic = true` e `status = CONFIRMED`, de um `Calendar` com `status = ACTIVE`. Calendário desligado responde 404 em todas as rotas públicas. Os filtros moram na camada de query, não na renderização.
- **Upload:** valida content-type de imagem e tamanho máximo antes de enviar ao Blob.
- **`refreshToken` em texto plano no banco.** Risco aceito conscientemente: o banco não é exposto publicamente e o token concede escrita apenas na agenda do clube. Caminho de melhoria, quando houver mais de um inquilino: criptografia em coluna com chave em env var.

## 9. Verificação

A única lógica não-trivial do sistema é a **função de reconciliação do sync**: dado um evento do Google e a linha existente (ou ausente), qual linha resulta. Ela é pura e concentra as duas formas de o sistema falhar de modo visível — o site mentir sobre o que vai acontecer, ou vazar um evento interno.

Um arquivo de teste cobrindo:

1. Evento novo do Google nasce com `isPublic = false`.
2. Atualização do Google preserva `publicTitle`, `publicDescription`, `imageUrl`, `area`, `signupUrl`.
3. Atualização do Google sobrescreve `title`, `startsAt`, `endsAt`, `location`.
4. `status: cancelled` marca `CANCELLED` em vez de apagar a linha.
5. Ocorrência de série recorrente é tratada como evento individual, com `recurringEventId` preenchido.
6. Resposta 410 do Google descarta o `syncToken` e sinaliza varredura completa.

Mais a guarda de disparo, que é a outra pequena decisão com ramificação — e a que evita uma tempestade de syncs se o calendário receber muitos acessos simultâneos:

7. `lastSyncedAt` recente não dispara sync; antigo dispara.
8. `syncingAt` de menos de 2 minutos atrás bloqueia um segundo disparo.

São os únicos testes do MVP. O resto é CRUD e renderização.

## 10. Fora de escopo (MVP)

Registrado para não voltar por inércia:

- Criar evento **recorrente** pela plataforma (lê recorrentes do Google; cria apenas avulsos).
- RSVP, inscrição interna ou lista de presença.
- Notificações e lembretes.
- Integração com o `gestao_pessoas`.
- Papéis além de admin/público.
- Aprovação em duas etapas para publicar.
- Tela de cadastro self-service, cobrança, tema por cliente, domínio por cliente — as costuras estão prontas (§3.1), a interface não.
- Verificação do app OAuth junto ao Google (§4.2).

Cada um volta quando doer de verdade.

## 11. Ordem sugerida de construção

Para o plano de implementação detalhar:

1. Projeto, schema, migração, `createCalendar()` e seed do `Calendar` + `CalendarAdmin`.
2. App OAuth no Google Cloud como External/Testing (§4.2), Auth.js + Google, guarda do `/admin/[slug]`, conexão OAuth do calendário.
3. Função de reconciliação + testes (antes de qualquer chamada real ao Google).
4. Sync de volta: função de sync, lock por `syncingAt`, botão "Sincronizar agora".
5. Admin: listagem, toggle de publicação, edição dos campos públicos, upload.
6. Escrita para o Google: criar/editar/apagar evento.
7. Página pública: lista, grade, alternância, página do evento — com o disparo de sync por obsolescência (§6.2) no lugar.
8. Embed, JSON público e feed `.ics`.
9. Deploy na Vercel, banco na VPS, snippet na landing.
