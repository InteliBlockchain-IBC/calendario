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
