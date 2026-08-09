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
| Banco | **Neon** (Postgres gerenciado, pooler embutido) |
| Imagens | Vercel Blob |
| Disparo do sync | Sob demanda, na leitura, via `after()` do Next.js |

**Por que Neon e não o Postgres da VPS.** A VPS que roda o `gestao_pessoas` tem Postgres sem pooler. Função serverless abre uma conexão por invocação, e com `max_connections` no padrão de 100 isso esgota em poucas centenas de requisições concorrentes — um teto muito abaixo de qualquer limite da API do Google (§6.6), e o gargalo real do sistema. O Neon tem pooler nativo, o *free tier* cobre a carga do clube com folga, e uma instância por inquilino no futuro é trivial. PgBouncer na VPS resolveria igual, ao custo de mais uma peça de infra para manter.

**Por que sync sob demanda e não cron:** um cron externo (GitHub Actions, Vercel Cron) é uma dependência de runtime morando fora do serviço — quem quisesse subir esta plataforma precisaria configurar agendamento à parte para a agenda simplesmente funcionar. Contradiz "plataforma independente". Pior, um cron único que varre todos os calendários é justamente a peça que não sobrevive a multi-inquilino. O disparo por leitura elimina a infra externa, e o sync passa a acontecer por calendário, proporcional ao uso de cada um. Detalhe em §6.2.

*(Vercel Cron também não serviria pelo lado prático: no plano Hobby executa no máximo uma vez por dia.)*


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
| `syncPastDays` | int, default `90` | quanto passado a busca no Google cobre (§6.3) |
| `syncFutureDays` | int, default `365` | quanto futuro a busca no Google cobre (§6.3) |
| `lastSyncedAt` | datetime? | obsolescência (§6.2) e `updatedMin` da varredura incremental (§6.4) |
| `syncingAt` | datetime? | lock de sync em andamento (§6.2) |
| `lastSyncError` | string? | último erro de sync, exibido no admin (§6.5) |
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

**Porta 1 — obsolescência na leitura (o mecanismo principal).** Toda rota de leitura de um calendário (`/c/[slug]`, `/embed/[slug]`, o JSON público e o feed `.ics`) checa `lastSyncedAt` e escolhe entre três caminhos:

| `lastSyncedAt` | Comportamento |
|---|---|
| menos de 10 min | serve direto, não sincroniza |
| entre 10 min e 24 h | serve direto e sincroniza em segundo plano via `after()` |
| mais de 24 h, ou nulo | **sincroniza antes de responder** |

Nos dois primeiros casos o visitante nunca espera pelo Google, e o próximo já pega atualizado. O terceiro existe porque um calendário sem visitas há dias tem dado velho demais para ser servido com cara de atual — e é justamente o cenário em que alguém abre o site pela primeira vez em semanas. Vale a espera de um segundo.

Três propriedades que fazem disso a escolha certa e não só a mais barata:

- **Nenhuma infra externa.** Clonar, dar deploy e funcionar. Não há agendamento a configurar em lugar nenhum — o que é o requisito de uma plataforma independente.
- **Escala por inquilino automaticamente.** Calendário movimentado sincroniza com frequência; calendário sem visita não sincroniza, e não precisa, porque ninguém está olhando. Nenhum job precisa enumerar inquilinos.
- **O `.ics` também é leitura.** Google e Apple buscam o feed dos assinantes periodicamente por conta própria, então um calendário sem tráfego no site continua sendo sincronizado por quem o assinou no celular.

**Porta 2 — botão "Sincronizar agora"** no admin, para quando se quer ver a mudança na hora. Execução síncrona, resultado em texto, e **modo de varredura diferente** — ver §6.3.

**Guarda de concorrência:** antes de sincronizar, grava `syncingAt`. Se já existe um `syncingAt` de menos de 2 minutos atrás, o disparo é ignorado. *(Teto conhecido: se o processo serverless for encerrado no meio do sync, o lock segura até 2 minutos a mais que o necessário. Advisory lock do Postgres é o caminho de melhoria, se algum dia incomodar.)*

### 6.3 Janela de sincronização

A busca é **sempre limitada a uma janela de datas**, nunca à agenda inteira:

```
timeMin       = agora − Calendar.syncPastDays     (padrão 90)
timeMax       = agora + Calendar.syncFutureDays   (padrão 365)
singleEvents  = true      # expande séries recorrentes em ocorrências
showDeleted   = true      # para receber cancelamentos
maxResults    = 2500      # paginado por pageToken
updatedMin    = lastSyncedAt   # SOMENTE na varredura incremental
```

**Por que janela e não a agenda inteira.** O comportamento de `singleEvents=true` sem `timeMax` diante de uma recorrência **sem data de fim** ("toda quinta, indefinidamente") não é especificado na documentação da API. Agendas institucionais têm eventos assim com frequência, então o volume de uma varredura sem janela é imprevisível — não dá para dimensionar nem testar. A janela troca um comportamento indefinido por um limite explícito.

**Por que os dias são coluna e não constante.** Fixar "3 meses" no código seria trocar um problema por outro: cada instituição tem uma noção diferente de quanto passado importa. `syncPastDays` e `syncFutureDays` vivem no `Calendar`, com padrão razoável e ajuste por inquilino.

**Por que o padrão futuro é generoso.** O custo da janela é plano, não linear: `maxResults` é 2.500 por página, então uma janela de 180 dias e uma de 455 dias custam a mesma **única** chamada para qualquer calendário realista (§6.6). Encolher não economiza nada. Já uma janela curta demais falha em silêncio — um evento marcado para daqui a 14 meses simplesmente não aparece no site, sem erro e sem log, e ninguém descobre o motivo. A janela não precisa refletir quanto uma instituição costuma planejar à frente; precisa ser maior que isso.

**A janela não decide o que o site mostra.** São dois controles independentes, e é bom que sejam: a janela limita o que a plataforma busca no Google; `isPublic` e a consulta da página pública decidem o que aparece. Evento que sai da janela deixa de ser atualizado, mas permanece no banco — o link `/c/[slug]/e/[id]` continua funcionando.

**Consequência de largar o `syncToken`.** O token é incompatível com `timeMin`/`timeMax` (documentado), então janela e sync por token são mutuamente exclusivos. Escolhida a janela, o incremental passa a ser por `updatedMin`, que compõe com ela sem conflito e cujo contrato cobre o caso crítico: *"When specified, entries deleted since this time will always be included regardless of showDeleted"*. Some junto o tratamento de **410 Gone** e o fallback de token expirado.

### 6.4 Dois modos de varredura

As duas portas de disparo fazem coisas deliberadamente diferentes:

| | Fundo (leitura obsoleta) | Botão "Sincronizar agora" |
|---|---|---|
| `updatedMin` | sim | **não** |
| Traz | só o que mudou desde `lastSyncedAt` | a janela inteira |
| Custo | mínimo | uma varredura limitada |
| Reconcilia sumiços | não | **sim** |

A última linha fecha o único furo do modelo por janela: se alguém mover um evento no Google para fora da janela, ele para de voltar nas respostas e a plataforma ficaria exibindo dado velho. Na **varredura completa**, todo evento local com `startsAt` dentro da janela que não voltou do Google é marcado `CANCELLED` e some do site.

**Primeiro sync após conectar a agenda:** `lastSyncedAt` é nulo, então não há `updatedMin` e a varredura é completa por consequência natural da regra — sem caso especial no código, e já limitada pela janela.

**Essa regra vale exclusivamente na varredura completa.** Aplicá-la na incremental cancelaria o calendário inteiro, já que a incremental retorna apenas o que mudou. É um bug que passa despercebido em revisão e destrói dado em produção — por isso está em §9 como caso de teste explícito.

### 6.5 Regras da reconciliação

1. Evento novo vindo do Google entra com **`isPublic = false`**. Nada aparece no site sem alguém publicar deliberadamente. Este é o ponto central: a agenda do Google contém reunião interna, compromisso pessoal, o que for — o site mostra só o que foi curado.
2. Evento existente: atualiza somente os campos do Google. Descrição pública, título público, arte, tag e link de inscrição sobrevivem intactos.
3. Cancelado ou apagado no Google (`status: cancelled`): marcado `CANCELLED`, some do site, continua visível no admin.
4. Escrita da plataforma que volta no sync seguinte sobrescreve os campos do Google com dados idênticos — inofensivo, e não toca os campos da plataforma.
5. Na varredura completa, ausência dentro da janela equivale a cancelamento (§6.4).

O resultado do sync é reportado em texto no admin: `"3 novos, 1 atualizado, 1 cancelado"`.

**Falha de sync.** Erro em qualquer varredura grava `Calendar.lastSyncError` e o admin exibe um aviso visível até o próximo sync bem-sucedido, que limpa o campo. Sem isso o pior modo de falha do sistema fica invisível: se o refresh token for revogado, a varredura de fundo falha dentro do `after()` sem ninguém para ver, o site congela no último dado bom e continua **parecendo** correto. Falha silenciosa num calendário é pior que erro na tela.

### 6.6 Capacidade e limites

Números apurados na documentação da API (quotas) e estimados a partir do padrão de uso (volumes e tempos).

**Custo por operação.** O ponto que domina tudo: a varredura de fundo pergunta ao Google "o que mudou desde `lastSyncedAt`?", e como ela roda no máximo a cada 10 minutos, a resposta é quase sempre vazia.

| Operação | Chamadas | Tempo estimado |
|---|---|---|
| Sync de fundo, nada mudou (caso comum) | 1 | ~200–400 ms, zero escrita |
| Sync de fundo, poucos eventos alterados | 1 | ~400 ms |
| Varredura completa, calendário do clube (~300 eventos) | 1 | < 1 s |
| Varredura completa, instituição movimentada (~1.300 eventos) | 1 | ~1–3 s |

Só passa de uma chamada acima de 2.500 ocorrências na janela — o que exige cerca de 55 eventos por semana sustentados. E aí são duas.

**Quotas do Google** (documentadas): 1.000.000 requisições/dia por projeto, 10.000/min por projeto, 600/min por usuário.

Consumo por calendário: no teto, 144 syncs/dia (um a cada 10 min) mais o botão manual ≈ **150 chamadas/dia**.

- 1.000.000 ÷ 150 ≈ **6.600 calendários** antes de encostar na quota diária.
- No pico, 6.600 calendários geram ~660 req/min contra o teto de 10.000/min.
- O limite de 600/min *por usuário* não é compartilhado: cada inquilino autoriza com a própria conta Google.

**O teto real de multi-inquilino** é a quota diária do projeto, porque o app OAuth é um só. Ele fica na casa dos milhares de instituições, e é ampliável mediante solicitação ao Google.

**O gargalo não é o Google, é o banco.** Conexões de Postgres esgotam muito antes de qualquer quota — é o motivo do Neon em §4. A latência da página pública não depende do sync: é uma consulta indexada por `(calendarId, startsAt)`, e o `after()` roda depois da resposta ter saído.

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
- Botão **"Sincronizar agora"** com o resultado em texto, e aviso persistente se `lastSyncError` estiver preenchido (§6.5).
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

Mais os dois casos que separam varredura completa de incremental (§6.4) — o par mais importante da lista, porque errar o segundo apaga o calendário inteiro do site:

6. Varredura **completa**: evento local dentro da janela ausente no retorno do Google é marcado `CANCELLED`.
7. Varredura **incremental**: evento local ausente no retorno **não** é tocado.

Mais a guarda de disparo, que evita uma tempestade de syncs se o calendário receber muitos acessos simultâneos:

8. `lastSyncedAt` de menos de 10 min não dispara sync; entre 10 min e 24 h dispara em segundo plano; acima de 24 h ou nulo dispara de forma bloqueante.
9. `syncingAt` de menos de 2 minutos atrás bloqueia um segundo disparo.

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
4. Sync de volta: busca por janela, os dois modos de varredura (§6.4), lock por `syncingAt`, botão "Sincronizar agora".
5. Admin: listagem, toggle de publicação, edição dos campos públicos, upload.
6. Escrita para o Google: criar/editar/apagar evento.
7. Página pública: lista, grade, alternância, página do evento — com o disparo de sync por obsolescência (§6.2) no lugar.
8. Embed, JSON público e feed `.ics`.
9. Deploy na Vercel, banco no Neon, snippet na landing.
