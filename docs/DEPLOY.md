# DEPLOY.md

Como colocar o sistema no ar. Mesma infraestrutura do `gestao_pessoas`: GitHub Actions builda a imagem, publica no GHCR e chama o webhook de deploy do EasyPanel.

> Estado atual: o Dockerfile e o workflow existem e foram exercitados localmente (`docker build`), mas o **primeiro deploy real no EasyPanel ainda não aconteceu** — é configuração pendente, documentada aqui para quando for feita. Ver `PRODUCT.md` §6.

## 1. Visão geral do pipeline

```
push em main (ou workflow_dispatch)
  → GitHub Actions builda a imagem Docker
  → publica ghcr.io/<repo>:latest e :<sha>
  → chama EASYPANEL_DEPLOY_HOOK via curl
  → EasyPanel puxa a imagem nova e reinicia o container
  → container roda `npx prisma migrate deploy && node server.js`
```

Definido em `.github/workflows/deploy.yml`. Só dispara em `push` para `main` — abrir ou atualizar um PR **não** dispara o deploy; é o merge (que gera o push em `main`) que dispara.

## 2. Secrets do GitHub

Configurar em Settings → Secrets and variables → Actions do repositório:

| Secret | Uso |
|---|---|
| `EASYPANEL_DEPLOY_HOOK` | URL do webhook de deploy do app no EasyPanel. Chamado por `curl -fsSL -X POST` ao final do workflow. |

`GITHUB_TOKEN` (para publicar no GHCR) é automático — não precisa ser criado.

## 3. Configuração do app no EasyPanel

1. Criar um app do tipo **imagem Docker**, apontando para `ghcr.io/<owner>/<repo>:latest` (nome em minúsculas — o workflow já normaliza isso).
2. Se o pacote no GHCR for privado, configurar o EasyPanel com credenciais de pull (um PAT do GitHub com escopo `read:packages`).
3. Porta do container: `3000` (definida por `EXPOSE 3000` e `ENV PORT=3000` no `Dockerfile`).
4. Copiar a URL de webhook de deploy gerada pelo EasyPanel para o secret `EASYPANEL_DEPLOY_HOOK` (§2).

### Volume

O container grava as artes de evento em `UPLOAD_DIR` (default `./uploads` dentro do container). Montar um **volume persistente** do EasyPanel nesse caminho — sem isso, cada redeploy apaga as imagens já enviadas.

```
Caminho no container: /app/uploads   (ou o que UPLOAD_DIR apontar)
```

### Banco

Postgres roda como outro serviço no mesmo EasyPanel, **na mesma rede interna da VPS** — sem porta pública, sem `sslmode`, conexão direta (sem pooler). Ver `ARCHITECTURE.md` §2 para o porquê.

## 4. Variáveis de ambiente de runtime

Configurar no app do EasyPanel (não em `.env` — esse arquivo é só para desenvolvimento local):

```
DATABASE_URL=       # conexão direta ao Postgres, rede interna do EasyPanel
AUTH_SECRET=        # gerar com `npx auth secret`
AUTH_URL=           # URL pública do app (mesma de NEXT_PUBLIC_APP_URL). Obrigatória em produção
                     # atrás do reverse proxy do EasyPanel — sem ela, Auth.js v5 recusa o host
                     # com UntrustedHost e todo login falha.
AUTH_GOOGLE_ID=     # client id do OAuth app do Google Cloud (§5)
AUTH_GOOGLE_SECRET= # client secret do mesmo app
UPLOAD_DIR=         # caminho do volume montado no container (§3)
NEXT_PUBLIC_APP_URL= # URL pública do app — usada no snippet de embed, no feed .ics e nos redirects do OAuth
```

Nenhuma variável é específica de calendário/inquilino — o que varia por calendário mora no banco (`Calendar.*`).

## 5. OAuth client no Google Cloud

O mesmo client (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`) serve dois propósitos: login de admin (Auth.js) e conexão de escrita/leitura na agenda do clube (`src/lib/google/oauth.ts`, `src/lib/google/client.ts`).

### 5.1 Escopos

- `openid email profile` — login via Auth.js.
- `https://www.googleapis.com/auth/calendar` — conexão do calendário (leitura + escrita), pedido em `/admin/[slug]/conectar/start`.

### 5.2 Tipo de app e modo

Criar o consent screen como **External, em modo Testing**. Decisão consciente, não provisória por esquecimento:

- Um app **Internal** só aceita contas do Workspace de uma organização específica. Nenhuma instituição de fora conseguiria autorizar, e abrir depois significa criar app novo e reautorizar todo mundo.
- **External em Testing** funciona com até **100 contas** cadastradas na lista de teste — cobre o clube e os primeiros parceiros com folga, sem exigir nada do Google.
- A verificação do Google (necessária para publicar External sem o limite de 100) fica para quando existir um segundo cliente real: o escopo `calendar` é sensível e a revisão pede política de privacidade publicada, domínio verificado e vídeo demonstrativo — semanas de processo. Quando chegar a hora, nada precisa ser refeito, só submetido.

Consequência prática: quem faz login vê o aviso "app não verificado", e **cada conta que for usar o sistema precisa constar na lista de teste do projeto no Google Cloud** — tanto quem faz login como admin quanto a conta oficial do clube que autoriza a agenda.

### 5.3 Test users

Em Google Cloud Console → APIs & Services → OAuth consent screen → Test users, adicionar:

- Todos os e-mails de `CalendarAdmin` de todo calendário ativo (precisam logar em `/admin/[slug]`).
- O e-mail da conta oficial do clube que vai autorizar a conexão em `/admin/[slug]/conectar` (a conta dona da agenda do Google).

Sem constar na lista, o Google recusa o login/consentimento com erro `access_denied` antes mesmo de chegar ao app.

### 5.4 Redirect URIs autorizadas

Cadastrar no client OAuth (Authorized redirect URIs):

```
<NEXT_PUBLIC_APP_URL>/api/auth/callback/google        # Auth.js (login)
<NEXT_PUBLIC_APP_URL>/admin/<slug>/conectar/callback   # conexão da agenda (uma por calendário existente)
```

`redirectUri()` em `src/lib/google/oauth.ts` monta a segunda URL dinamicamente a partir de `NEXT_PUBLIC_APP_URL` e do `slug` — cada calendário novo precisa da própria URI cadastrada no Google Cloud antes de conseguir conectar a agenda.

### 5.5 APIs a habilitar no projeto Google Cloud

- Google Calendar API.
- Google People API / OAuth2 API (usada em `google.oauth2({version:'v2'}).userinfo.get()` no callback, para descobrir o e-mail da conta conectada).

## 6. Primeiro deploy — passo a passo

1. Criar o projeto no Google Cloud, habilitar as APIs (§5.5), criar o OAuth client External/Testing (§5.2), cadastrar as redirect URIs (§5.4) e os test users (§5.3).
2. No EasyPanel: criar o serviço Postgres, criar o app Docker apontando para a imagem GHCR (§3), montar o volume de uploads (§3), preencher as variáveis de ambiente (§4).
3. No GitHub: cadastrar `EASYPANEL_DEPLOY_HOOK` (§2). Confirmar que o pacote GHCR terá visibilidade compatível com o pull configurado no EasyPanel.
4. Dar push (ou merge) em `main` — o workflow builda, publica a imagem e chama o webhook. Acompanhar os logs do app no EasyPanel: o `CMD` do container roda `npx prisma migrate deploy` antes de subir o servidor, então a primeira subida já aplica todas as migrations.
5. Rodar o seed uma vez (`npm run db:seed`, apontando `DATABASE_URL` para o Postgres de produção, ou via shell dentro do container) para criar o calendário inicial (`slug: "ibc"`) e o primeiro `CalendarAdmin`.
6. Logar em `/admin/ibc` com uma conta que conste na lista de test users (§5.3) e que bata com o `allowedDomain` do calendário (se definido).
7. Ir em `/admin/ibc/conectar`, autorizar com a conta oficial do clube (precisa estar na lista de test users) e escolher a agenda do Google a usar.
8. Clicar em "Sincronizar agora" para confirmar que a varredura completa funciona e que os eventos aparecem na tabela do admin.
9. Publicar um evento (toggle "no site") e confirmar em `/c/ibc` que ele aparece.

## 7. Verificação pós-deploy

- Login com conta fora da allowlist de `/admin/ibc` → 404.
- `/api/calendars/ibc/events` de um evento com convidados → nenhum e-mail na resposta.
- `/api/calendars/ibc/ics` → sem linha `ATTENDEE`.
- `/embed/ibc` dentro de um `<iframe>` de outra origem → renderiza (headers de `next.config.ts` liberam `frame-ancestors` só em `/embed/*`).
