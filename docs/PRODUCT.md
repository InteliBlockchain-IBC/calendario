# PRODUCT.md

Por que este sistema é assim, e o que ficou de fora **de propósito**. Antes de "melhorar" algo, confira esta última seção — pode já ter sido cortado com um motivo escrito.

## 1. Problema

O calendário do Inteli Blockchain morava num board do Canva. Consequências observadas na gestão:

- Cada mudança de agenda exigia refazer arte manualmente.
- O clube já trocou três vezes de plataforma de calendário.
- Membros e parte da diretoria não conseguiam visualizar a agenda com clareza.
- O Google Agenda do clube existia, mas estava desatualizado e pouco usado — a verdade real morava no Canva.

O problema não era técnico, era de **fonte única**: não existia um lugar onde a agenda fosse mantida uma vez e aparecesse em todos os canais.

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
| Fonte da verdade | **A plataforma** | O Google Agenda estava subutilizado; exigir que a diretoria adotasse o hábito do GCal primeiro faria o sistema nascer vazio. |
| Espelhamento no Google | **Obrigatório, na criação** | Quem já vive no Google continua vendo tudo; ninguém é forçado a trocar de ferramenta para *consumir*. |
| Visibilidade | **Uma agenda Google só + flag `isPublic`** | Evento interno vai para a mesma agenda (que a diretoria já acessa) e simplesmente não aparece no site. |
| Onde mora o código | **Projeto novo, standalone** | Precisa ser embutível na landing hoje e, potencialmente, no `gestao_pessoas` depois. Um serviço com embed serve os dois. |
| Escala futura | **Costura, não feature** | Modelo de dados já multi-inquilino; sem onboarding, cobrança ou tema por cliente. |
| Convites | **Delegados ao Google** | Convidado em evento do Google não é campo de texto: o Google envia o convite, insere o evento na agenda do convidado, manda lembrete e registra o RSVP. A plataforma escreve a lista e lê as respostas. |

Essa última linha elimina três features do escopo: servidor de e-mail, controle de entrega e tela de confirmação de presença.

**Como isso apareceu na implementação:** `Event.attendees` é campo JSON no bloco "do Google" (nunca tabela — ver `ARCHITECTURE.md` §4), sobrescrito a cada sync porque o RSVP muda no Google, não aqui. `src/lib/google/write-event.ts` mapeia o checkbox "notificar convidados" para o parâmetro `sendUpdates` da API (`all`/`none`), com padrão **ligado ao criar** e **desligado ao editar** — criar evento sem avisar ninguém torna o convite inútil, e corrigir uma vírgula na descrição disparando quarenta e-mails faz as pessoas pararem de ler avisos que importam.

## 3.1 Sobre escalar para outros clubes/instituições

O objetivo declarado é que a solução possa, no futuro, servir outras instituições. A abordagem foi preparar as **costuras baratas** agora e não construir o produto multi-inquilino.

Critério: entra agora o que é barato agora **e** caro depois; fica de fora o que custaria o mesmo hoje ou daqui a um ano.

### Costuras que existem (implementadas)

| Costura | Onde está no código | Por que não dava para deixar pra depois |
|---|---|---|
| Todo conteúdo pendura em `calendarId`; nenhuma query global | Toda query em `src/lib/`, `src/app/` filtra por `calendarId` | Reescrever query por query é o trabalho clássico de migração multi-inquilino |
| `Calendar.slug` como identificador público em todas as rotas | `/c/[slug]`, `/admin/[slug]`, `/embed/[slug]`, `/api/calendars/[slug]/*` | Rota sem namespace de inquilino quebra link salvo quando ganha um |
| `/admin/[slug]`, não `/admin` | mesma estrutura acima | Idem — hoje é o nome de uma pasta |
| `createCalendar()` como função de domínio | `src/lib/calendar/create-calendar.ts`, chamada por `prisma/seed.ts` | O seed usa hoje; uma rota de signup usaria a mesma função amanhã |
| Slugs reservados (`admin`, `api`, `embed`, `c`, `login`, `auth`) | `RESERVED_SLUGS` em `src/lib/sync/constants.ts`, validado em `validateSlug()` | Depois que existirem slugs em uso, reservar vira migração de dados |
| `Calendar.ownerEmail` e `Calendar.status` | schema | Self-service precisaria saber de quem é o calendário e desligá-lo sem apagar |
| Admins em tabela (`CalendarAdmin`), não em env var | schema + `requireCalendarAdmin` | Env var é global por natureza; não existe env var por inquilino |
| `allowedDomain` como coluna do `Calendar` | schema + `requireCalendarAdmin` | Cada instituição teria o seu domínio |
| `GoogleConnection` por calendário | schema, 1:1 com `Calendar` | Cada inquilino autorizaria a própria agenda |
| Sync disparado por calendário, nunca global | `loadCalendarBySlug`, `runSync(calendarId, ...)` | Um job global que enumera inquilinos é a peça que apodrece primeiro |
| App OAuth criado como **External** (não Internal) | configuração no Google Cloud, ver `DEPLOY.md` | Um app Internal não pode ser aberto depois — exige app novo e reautorização de todos |

### Explicitamente fora (não implementado, e não deve ser)

- Tela de cadastro self-service e verificação de e-mail.
- Cobrança/planos.
- Tema, cores ou logo por cliente.
- Subdomínio ou domínio próprio por cliente.

Nenhum desses fica mais caro por esperar, e cada um decidido sem um segundo usuário na frente seria chute.

## 4. Regras de negócio que não têm exceção

Estas regras vieram do problema original e estão codificadas em testes (`decide-sync.test.ts`, `reconcile.test.ts`, `privacy.test.ts`) — não são preferência de estilo:

1. Evento novo vindo do Google nasce com `isPublic = false`. A agenda do Google contém reunião interna, compromisso pessoal, o que for — o site mostra só o que foi curado.
2. `attendees` e `Contact` nunca saem em rota pública — são dados pessoais de membros, cuja única razão de estar no sistema é alimentar o convite do Google.
3. "Ausência = cancelado" vale só na varredura completa. Aplicá-la na incremental cancelaria o calendário inteiro — é o bug que passa despercebido em revisão e destrói dado em produção.
4. Falha de sync nunca é silenciosa: fica em `Calendar.lastSyncError`, visível no admin até o próximo sync bem-sucedido. Sem isso, um refresh token revogado faria o site congelar no último dado bom e continuar parecendo correto.

## 5. Fora de escopo do MVP (com a razão)

Registrado para não voltar por inércia — cada item aqui foi considerado e cortado deliberadamente, não esquecido.

| Cortado | Razão |
|---|---|
| Criar evento **recorrente** pela plataforma | A plataforma lê recorrentes do Google (`recurringEventId` preenchido na ocorrência) e cria apenas eventos avulsos. Recorrência se cria no Google. |
| RSVP próprio e lista de presença | O RSVP dos convidados já vem pronto do Google (§3). O que fica de fora é presença de quem **não** foi convidado — não há tela de confirmação própria. |
| Importação de contatos em massa (CSV, colar lista) | A lista de contatos se constrói pelo uso: e-mail digitado num evento vira `Contact`. Importar volta se o cadastro manual doer de verdade. |
| Integração com a base de membros do `gestao_pessoas` | Mesma razão acima — nenhuma ponte entre os dois projetos hoje. |
| Notificações e lembretes (da plataforma) | O Google já lembra quem foi convidado; a plataforma não duplica esse mecanismo. |
| Papéis além de admin/público | Não existe "editor sem publicar" nem hierarquia dentro do admin — qualquer linha em `CalendarAdmin` tem acesso completo àquele calendário. |
| Aprovação em duas etapas para publicar | `isPublic` é um toggle direto, sem fluxo de revisão. |
| Cadastro self-service, cobrança, tema por cliente, domínio por cliente | As costuras estão prontas (§3.1); a interface para usá-las não existe. |
| Verificação do app OAuth junto ao Google | O app roda em modo **External + Testing** (até 100 contas na lista de teste). A verificação formal (necessária para publicar sem esse limite) fica para quando existir um segundo cliente real — exige política de privacidade publicada, domínio verificado e vídeo demonstrativo, e leva semanas. Ver `DEPLOY.md` §4. |

Cada um volta quando doer de verdade — não antes.

## 6. Peças pendentes de ação humana

Três partes do sistema estão implementadas em código mas dependem de uma ação fora do repositório para funcionar em produção. Não confundir com "fora de escopo": todas **serão** feitas, só não estão feitas ainda.

- **Cadastro dos admins como test users no Google Cloud.** O app OAuth roda em modo External + Testing (`DEPLOY.md` §5.2); login em `/admin/[slug]` só funciona para e-mails cadastrados na lista de test users do projeto (`DEPLOY.md` §5.3). Sem isso, o Google recusa o login com `access_denied` antes de chegar ao app — todo `CalendarAdmin` novo precisa ser adicionado lá manualmente.
- **Conexão OAuth real com a agenda do clube.** O fluxo (`/admin/[slug]/conectar`) está implementado e testável, mas nenhum admin autorizou de fato a conta oficial do clube até o momento desta documentação. Até isso acontecer, `Calendar.googleCalendarId` é nulo e `loadCalendarBySlug`/`runSync` não têm o que sincronizar.
- **Primeiro deploy real no EasyPanel.** Dockerfile, workflow do GitHub Actions e instruções estão prontos (`DEPLOY.md`), mas a configuração do app/volume no EasyPanel e o primeiro `push` para `main` ainda não aconteceram.

## 6.1 Pendências de implementação (não é ação humana — é código sem UI)

**Metade resolvida:** a navegação do admin passou a existir — a sidebar (`Sidebar.tsx`, `ARCHITECTURE.md` §3) lista Eventos, Contatos e Google Agenda, então `/admin/[slug]/contatos` e `/admin/[slug]/conectar` deixaram de ser rotas órfãs, dá para chegar nelas clicando, não só digitando a URL. Chegar na tela não é a mesma coisa que ter o que fazer nela — a outra metade segue pendente:

- **Edição de evento e campos públicos pelo admin** (arte, área, link de inscrição, editar/apagar evento). As server actions e rotas seguem sem interface — `updatePublicFields`, `updateGoogleFields`, `deleteEvent`, `saveContact`, `expandGroup` (`src/app/admin/[slug]/actions.ts`, `.../contatos/actions.ts`) e `POST /api/calendars/[slug]/upload` — passam por `requireCalendarAdmin` e têm cobertura de teste, mas **nenhuma tela as chama ainda**. Hoje o admin só cria evento, alterna publicado/rascunho e sincroniza; a tela de contatos só apaga. Pendente da Parte 2 desta fase.
