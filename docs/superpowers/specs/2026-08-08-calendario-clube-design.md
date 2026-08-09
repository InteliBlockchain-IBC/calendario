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
5. Convites para os membros, com confirmação de presença.

Configuração restrita a admins do clube; visualização aberta.

## 3. Decisões fundadoras

| Decisão | Escolha | Motivo |
|---|---|---|
| Fonte da verdade | **A plataforma** | O Google Agenda está subutilizado; exigir que a diretoria adote o hábito do GCal primeiro faria o sistema nascer vazio. |
| Espelhamento no Google | **Obrigatório, na criação** | Quem já vive no Google continua vendo tudo; ninguém é forçado a trocar de ferramenta para *consumir*. |
| Visibilidade | **Uma agenda Google só + flag `isPublic`** | Evento interno vai para a mesma agenda (que a diretoria já acessa) e simplesmente não aparece no site. |
| Onde mora o código | **Projeto novo, standalone** | Precisa ser embutível na landing hoje e, potencialmente, no `gestao_pessoas` depois. Um serviço com embed serve os dois. |
| Escala futura | **Costura, não feature** | Modelo de dados já multi-inquilino; sem onboarding, cobrança ou tema por cliente. |
| Convites | **Delegados ao Google** | Convidado em evento do Google não é campo de texto: o Google envia o convite, insere o evento na agenda do convidado, manda lembrete e registra o RSVP. A plataforma escreve a lista e lê as respostas. |

Essa última linha elimina três features do escopo: servidor de e-mail, controle de entrega e tela de confirmação de presença. Detalhe em §6.7.

### 3.1 Sobre escalar para outros clubes/instituições

O objetivo declarado é que a solução possa, no futuro, servir outras instituições. A abordagem é preparar as **costuras baratas** agora e não construir o produto multi-inquilino.

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
| App OAuth criado como **External** (§4.3) | Um app Internal não pode ser aberto depois — exige app novo e reautorização de todos. |

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
| Hospedagem do app | Container Docker no **EasyPanel** da VPS, via GHCR |
| Banco | Postgres no mesmo EasyPanel, rede interna, **conexão direta** |
| Imagens | Volume montado no container |
| Disparo do sync | Sob demanda, na leitura, via `after()` do Next.js |

Mesma infraestrutura do `gestao_pessoas`: GitHub Actions builda a imagem, publica no GHCR e chama o webhook de deploy do EasyPanel.

**Por que sync sob demanda e não cron:** um cron externo (GitHub Actions, Vercel Cron) é uma dependência de runtime morando fora do serviço — quem quisesse subir esta plataforma precisaria configurar agendamento à parte para a agenda simplesmente funcionar. Contradiz "plataforma independente". Pior, um cron único que varre todos os calendários é justamente a peça que não sobrevive a multi-inquilino. O disparo por leitura elimina a infra externa, e o sync passa a acontecer por calendário, proporcional ao uso de cada um. Detalhe em §6.2.

*(Vercel Cron também não serviria pelo lado prático: no plano Hobby executa no máximo uma vez por dia.)*

### 4.1 Container, e por que não há pooler

O app roda como **container de processo longo**, não como função serverless. Isso resolve por construção o que seria o maior problema de infraestrutura do projeto.

Em serverless, cada invocação abre a própria conexão com o Postgres; com `max_connections` no padrão de 100, algumas centenas de requisições concorrentes esgotam o banco e o app passa a errar sem aviso. A correção exigiria PgBouncer entre app e banco, o banco exposto publicamente com TLS (a Vercel não dá IP fixo para restringir) e duas URLs no Prisma, uma delas com `?pgbouncer=true` — cuja ausência gera erro intermitente de *prepared statement* que só aparece sob carga.

Nada disso existe aqui. Um processo Node longo mantém um pool estável, e o Prisma já o administra. A conexão é **direta, pela rede interna da VPS**, sem pooler e sem `sslmode` — exatamente o que o `gestao_pessoas` faz hoje.

Consequências:

- Uma variável de ambiente para o banco, não duas.
- O Postgres não precisa de porta pública.
- Sem serviço de pooling para manter.
- `after()` roda num processo comum, sem teto de duração de função.

*(Quando o pooler voltaria a ser necessário: mais de uma instância do app, ou volta para hospedagem serverless. Nenhum dos dois está no horizonte, e ambos são mudança de operação, não de código.)*

**Uploads em volume, não em blob de terceiro.** As artes dos eventos vão para um volume montado no container, servidas por uma rota do próprio app. É a opção com menos peças: nenhum serviço novo, nenhum token de terceiro. *(Teto conhecido: backup do volume é manual, junto com o do Postgres, e a solução não sobrevive a múltiplas instâncias. Storage S3-compatível é o caminho de melhoria, se algum dia qualquer um dos dois importar.)*

### 4.2 Variáveis de ambiente

```
DATABASE_URL=              # conexão direta, rede interna da VPS
AUTH_SECRET=               # Auth.js
AUTH_GOOGLE_ID=            # OAuth client do projeto Google Cloud do clube
AUTH_GOOGLE_SECRET=
UPLOAD_DIR=                # caminho do volume montado para as artes
NEXT_PUBLIC_APP_URL=       # base usada no snippet de embed e no feed .ics
```

Nenhuma variável é específica de inquilino — o que varia por calendário mora no banco.

### 4.3 App OAuth no Google Cloud

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

### `Contact`

A agenda de contatos do calendário — de onde saem os convidados dos eventos.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `name` | string? | opcional; contato criado pelo uso nasce sem nome |
| `email` | string | único junto com `calendarId` |
| `groups` | relação N:N com `ContactGroup` | |
| `createdAt` / `updatedAt` | datetime | |

### `ContactGroup`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `calendarId` | uuid | |
| `name` | string | único junto com `calendarId` — "Diretoria", "Turma 2026" |
| `contacts` | relação N:N com `Contact` | |

Grupos são livres e um contato pertence a quantos precisar. A tabela de junção é a implícita do Prisma — nenhum modelo extra a manter.

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
| `attendees` | json — lista de `{email, name, responseStatus}` (§6.7) |

**Campos da plataforma** (o sync **nunca** toca):

| Campo | Tipo | Nota |
|---|---|---|
| `isPublic` | boolean, default `false` | controla a aparição no site |
| `publicTitle` | string? | sobrescreve `title` no site |
| `publicDescription` | text? | sobrescreve `description` no site |
| `imageUrl` | string? | arte do evento, servida do volume (§4.1) |
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

A lista de convidados vai junto, no campo `attendees` da API, e o parâmetro `sendUpdates` decide se o Google dispara e-mail (§6.7).

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

**Porta 2 — botão "Sincronizar agora"** no admin, para quando se quer ver a mudança na hora. Execução síncrona, resultado em texto, e **modo de varredura diferente** — ver §6.4.

**Guarda de concorrência:** antes de sincronizar, grava `syncingAt`. Se já existe um `syncingAt` de menos de 2 minutos atrás, o disparo é ignorado. *(Teto conhecido: se o container reiniciar no meio do sync, o lock segura até 2 minutos a mais que o necessário. Advisory lock do Postgres é o caminho de melhoria, se algum dia incomodar.)*

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

**O gargalo seria o banco, se fosse serverless.** Exaustão de conexão chega muito antes de qualquer quota do Google — e é justamente o que rodar em container elimina (§4.1). A latência da página pública não depende do sync: é uma consulta indexada por `(calendarId, startsAt)`, e o `after()` roda depois da resposta ter saído.

### 6.7 Convidados e contatos

**O Google faz o trabalho.** Escrever `attendees` no evento faz o Google enviar o convite, inserir o evento na agenda de cada convidado, mandar lembrete e registrar a resposta. A plataforma escreve a lista e lê o `responseStatus` de volta no sync. Não há servidor de e-mail, controle de entrega nem tela de confirmação de presença — o admin simplesmente passa a exibir "12 convidados · 8 confirmaram" sem nenhum código de RSVP.

**Convidados são dado do Google.** `Event.attendees` é campo JSON no bloco do Google (§5), sobrescrito a cada sync, porque o RSVP muda lá e não aqui. Não é tabela: no MVP nunca se pergunta "de quais eventos esta pessoa participou", e normalizar antes dessa pergunta existir é estrutura sem uso.

**Notificação é escolha por evento.** Checkbox "notificar convidados" na tela do evento, mapeado para o parâmetro `sendUpdates` da API:

| Checkbox | `sendUpdates` | Padrão |
|---|---|---|
| marcado | `all` | ligado ao **criar** |
| desmarcado | `none` | desligado ao **editar** |

Os padrões invertidos são deliberados: criar evento sem avisar ninguém torna o convite inútil, e corrigir uma vírgula na descrição disparando quarenta e-mails de "evento atualizado" faz as pessoas pararem de ler os avisos que importam. Quem quiser notificar uma edição relevante — mudança de horário — marca a caixa.

**Contatos se constroem pelo uso.** O campo de convidados tem autocomplete sobre `Contact` e aceita e-mail digitado na hora. E-mail novo confirmado entra no evento **e** vira contato, com nome vazio. Não existe cadastro prévio a ser feito antes de a ferramenta ser útil — o que é justamente o passo que ninguém dá. A tela de contatos serve para completar nomes, agrupar e apagar erro de digitação.

**Grupos são livres.** `ContactGroup` nomeado pelo admin, N:N com `Contact`, criado inline ao digitar um nome novo no contato — sem tela dedicada de gestão de grupos. Convidar um grupo expande para os e-mails dos seus contatos no momento da escrita; o evento guarda pessoas, não o grupo. Assim, mudar a composição de um grupo não reescreve silenciosamente a lista de convidados de eventos que já saíram.

**E-mail de convidado nunca sai em rota pública.** Ver §8 — é regra de consulta, não de renderização, e tem teste próprio (§9).

## 7. Rotas e telas

| Rota | Acesso | Descrição |
|---|---|---|
| `/c/[slug]` | público | Página do calendário. Grade de mês ⇄ lista, alternável por botão. Lista é o padrão no celular. |
| `/c/[slug]/e/[id]` | público | Página do evento: arte, descrição pública, data/hora/local, botão de inscrição. É o link compartilhável. `[id]` é o `Event.id` da plataforma, nunca o `googleEventId`. |
| `/embed/[slug]` | público | Mesmo calendário sem cabeçalho/rodapé, para iframe. Aceita `?view=mes\|lista` e `?area=educational`. |
| `/api/calendars/[slug]/events` | público | JSON dos eventos publicados. |
| `/api/calendars/[slug]/ics` | público | Feed `.ics` assinável. |
| `/admin/[slug]` | allowlist do calendário | Gestão do calendário. |
| `/admin/[slug]/contatos` | allowlist do calendário | Lista de contatos: nome, e-mail, grupos. |
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
- Botão de editar abre painel lateral com os quatro campos públicos, o upload da arte e a lista de convidados.
- Convidados: autocomplete sobre `Contact`, aceita e-mail novo, permite adicionar um `ContactGroup` inteiro de uma vez, e mostra o RSVP vindo do Google ("12 convidados · 8 confirmaram"). Checkbox "notificar convidados" conforme §6.7.
- Botão **"Criar evento"** (avulso — recorrência se cria no Google).
- Botão **"Sincronizar agora"** com o resultado em texto, e aviso persistente se `lastSyncError` estiver preenchido (§6.5).
- Bloco com o snippet de embed pronto para copiar.

Sem dashboard, sem gráficos, sem histórico de alterações.

## 8. Segurança

- **Login:** Auth.js + Google, restrito por `Calendar.allowedDomain`. O e-mail ainda precisa constar em `CalendarAdmin` **daquele calendário** para acessar `/admin/[slug]` — pertencer ao domínio não basta. Admin de um calendário não é admin de outro.
- **`/api/calendars/[slug]/sync`:** exige sessão de admin do calendário. Não existe segredo compartilhado, porque não existe chamador automatizado externo (§6.2).
- **Sync disparado por leitura:** roda dentro do `after()` da própria requisição, sem endpoint exposto. Não há superfície nova a proteger.
- **Rotas públicas:** devolvem apenas eventos com `isPublic = true` e `status = CONFIRMED`, de um `Calendar` com `status = ACTIVE`. Calendário desligado responde 404 em todas as rotas públicas. Os filtros moram na camada de query, não na renderização.
- **`attendees` e `Contact` nunca aparecem em rota pública.** Nem no JSON, nem na página do evento, nem no `.ics`. São dados pessoais de membros do clube, e a única razão de estarem no sistema é alimentar o convite do Google. A consulta pública seleciona campos explicitamente — nunca devolve a linha inteira do `Event`.
- **O `.ics` é o risco silencioso.** O formato tem linha `ATTENDEE`, e gerar o arquivo "completo" a partir do evento publicaria a lista de e-mails dos membros num arquivo aberto na internet, sem nenhum erro visível. O gerador do feed monta apenas os campos públicos, e isso está em §9 como teste.
- **Upload:** valida content-type de imagem e tamanho máximo antes de gravar no volume; o nome do arquivo é gerado, nunca o enviado pelo cliente.
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

E o vazamento de dado pessoal, que é a outra forma de o sistema falhar de modo grave e silencioso (§8):

10. A resposta do JSON público de um evento com convidados não contém nenhum e-mail.
11. O `.ics` gerado para um evento com convidados não contém linha `ATTENDEE` nem qualquer e-mail.

São os únicos testes do MVP. O resto é CRUD e renderização.

## 10. Fora de escopo (MVP)

Registrado para não voltar por inércia:

- Criar evento **recorrente** pela plataforma (lê recorrentes do Google; cria apenas avulsos).
- RSVP próprio e lista de presença — o RSVP dos convidados vem pronto do Google (§6.7); o que fica de fora é presença de quem não foi convidado.
- Importação de contatos em massa (CSV, colar lista) e integração com a base de membros do `gestao_pessoas` — a lista se constrói pelo uso (§6.7); importar volta se o cadastro manual doer.
- Notificações e lembretes.
- Integração com o `gestao_pessoas`.
- Papéis além de admin/público.
- Aprovação em duas etapas para publicar.
- Tela de cadastro self-service, cobrança, tema por cliente, domínio por cliente — as costuras estão prontas (§3.1), a interface não.
- Verificação do app OAuth junto ao Google (§4.3).

Cada um volta quando doer de verdade.

## 11. Repositório e fluxo de trabalho

Espelha o `gestao_pessoas`, com uma diferença: lá são dois deploys (`frontend/` + `backend/`), aqui é **um app Next.js só** — não há monorepo a montar.

### 11.1 Estrutura

```
calendario/
├── CLAUDE.md                    ← regras para agentes; roteia para os docs
├── README.md                    ← setup e comandos
├── Dockerfile
├── docker-compose.yml           ← Postgres local
├── .github/workflows/deploy.yml ← build → GHCR → webhook do EasyPanel
├── docs/
│   ├── ARCHITECTURE.md          ← verdade versionada do sistema
│   ├── PRODUCT.md               ← problema, decisões e o que ficou de fora
│   ├── DEPLOY.md                ← GHCR + EasyPanel, env vars, primeiro deploy
│   ├── DESIGN_SYSTEM.md         ← enxuto, só o que as telas usam
│   └── superpowers/             ← gitignored: specs e planos de sessão
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── src/
    ├── app/                     ← (public)/, admin/, embed/, api/
    ├── lib/                     ← google/, sync/, db
    └── components/
```

`.gitignore` copia a convenção do `gestao_pessoas`: `docs/superpowers/`, `.claude/`, `.agents/`, `.worktrees/`, `data/` ficam fora do versionamento.

### 11.2 Papel de cada documento

| Doc | Responde | Muda quando |
|---|---|---|
| `README.md` | como rodar isto na minha máquina | comando ou dependência muda |
| `CLAUDE.md` | como um agente deve trabalhar aqui | convenção de trabalho muda |
| `docs/ARCHITECTURE.md` | o que o sistema é hoje: schema, rotas, sync, auth | schema, endpoint ou arquitetura muda |
| `docs/PRODUCT.md` | por que ele é assim, e o que foi cortado de propósito | decisão de produto muda |
| `docs/DEPLOY.md` | como colocar no ar | infra ou variável muda |
| `docs/DESIGN_SYSTEM.md` | cor, tipografia e os poucos componentes | identidade visual muda |

**A regra que importa mais**, herdada do `gestao_pessoas`: a verdade do sistema mora no `ARCHITECTURE.md`. Spec e plano são artefatos de sessão, não são versionados, e nada essencial pode viver só neles. Mudou schema, endpoint ou arquitetura? Atualiza o `ARCHITECTURE.md` na mesma PR.

`PRODUCT.md` não existe no `gestao_pessoas` e é adição deliberada: separa o "por quê" do "como". É o documento que impede alguém — pessoa ou agente — de reimplementar com boa intenção algo que foi cortado de propósito (§10).

`DESIGN_SYSTEM.md` é **próprio e enxuto**, não cópia dos 23 KB do `gestao_pessoas`: deriva do guia de estilos do clube, mas cobre só o que estas telas usam — cor, tipografia, card de evento, grade de mês. O outro foi escrito para telas internas de plataforma, e duplicá-lo criaria dois arquivos destinados a divergir.

### 11.3 Fluxo de git

`develop` é a branch padrão e alvo de todo PR. `main` é produção — push nela dispara o build e o deploy. **Nunca commitar direto em nenhuma das duas.**

Trabalho de agente roda em worktree isolada, para não disputar a árvore de trabalho:

```bash
git worktree add .worktrees/<slug> -b <tipo>/<slug> develop
```

`develop` → `main` é decisão de release, não de feature. Conventional commits com descrição em português (`feat: adiciona feed .ics`).

Fluxo superpowers obrigatório para feature ou fix não-trivial: `brainstorming` → spec → `writing-plans` → plano → execução. Pular só para typo, ajuste óbvio em um arquivo, ou exploração.

## 12. Ordem sugerida de construção

Para o plano de implementação detalhar:

0. Esqueleto do repo: estrutura de §11.1, `.gitignore`, `CLAUDE.md`, `README.md`, `docker-compose.yml`, branches `main` e `develop`.
1. Projeto, schema, migração, `createCalendar()` e seed do `Calendar` + `CalendarAdmin`.
2. App OAuth no Google Cloud como External/Testing (§4.3), Auth.js + Google, guarda do `/admin/[slug]`, conexão OAuth do calendário.
3. Função de reconciliação + testes (antes de qualquer chamada real ao Google).
4. Sync de volta: busca por janela, os dois modos de varredura (§6.4), lock por `syncingAt`, botão "Sincronizar agora".
5. Admin: listagem, toggle de publicação, edição dos campos públicos, upload.
6. Escrita para o Google: criar/editar/apagar evento, com convidados e `sendUpdates`.
6b. Contatos e grupos: tela `/admin/[slug]/contatos`, autocomplete e criação pelo uso (§6.7).
7. Página pública: lista, grade, alternância, página do evento — com o disparo de sync por obsolescência (§6.2) no lugar.
8. Embed, JSON público e feed `.ics`.
9. Deploy: Dockerfile, workflow GHCR, app e volume no EasyPanel, snippet na landing.
10. Documentação versionada: `ARCHITECTURE.md`, `PRODUCT.md`, `DEPLOY.md`, `DESIGN_SYSTEM.md` — escritos a partir deste spec, que a partir daí deixa de ser a fonte de verdade.
