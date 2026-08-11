# DESIGN_SYSTEM.md

Enxuto de propósito: cobre só o que as telas deste projeto usam hoje. Não é cópia do `DESIGN_SYSTEM.md` do `gestao_pessoas` (escrito para telas internas de outra plataforma) nem uma extração formal do guia de estilos em PDF do clube (`design/Guia de Estilos - Blockchain 2026 (1).pdf`, fora deste repositório) — deriva das classes Tailwind já usadas no código real. Se o guia de estilos formal for extraído para markdown algum dia, este arquivo deve ser revisado contra ele.

## 1. Base

Tailwind v4, sem tema customizado em `tailwind.config` — as únicas variáveis de tema são as duas do `globals.css`:

```css
--background: #ffffff   /* claro */
--foreground: #171717
```

```css
--background: #0a0a0a   /* @media (prefers-color-scheme: dark) */
--foreground: #ededed
```

Fonte: `Geist` (sans) e `Geist Mono`, via `next/font/google`, aplicadas em `layout.tsx`. Corpo do texto usa a escala padrão do Tailwind (`text-sm`, `text-2xl` etc.), sem tokens próprios de tipografia.

**Estado real:** as telas hoje usam paleta neutra (`neutral-*`) e vermelho de sistema (`red-*`) para erro — nenhuma cor de marca (verde/roxo/o que o guia de estilos definir) foi aplicada ainda. Ver §4.

## 2. Cores usadas

Só neutros e vermelho de alerta aparecem no código atual:

| Uso | Classe |
|---|---|
| Texto principal / botão primário | `neutral-900` (fundo de botão + `text-white`) |
| Fundo de card / hover sutil | `neutral-50`, `neutral-100` |
| Borda de grade e divisores | `neutral-200`, `border` (cor padrão do Tailwind) |
| Texto secundário | `opacity-60` / `opacity-70` / `opacity-40` sobre o texto padrão, em vez de uma cor cinza fixa |
| Erro / alerta (`lastSyncError`, formulário de conexão Google) | `red-300` (borda), `red-50` (fundo), `red-700`/`red-900` (texto) |

A cor de evento (resolvida no servidor pela cascata `colorOverride ?? label.color ?? calendar.accentColor`, ver `ARCHITECTURE.md` §4.1) só aparece hoje como o ponto colorido ao lado do nome da label na lista (§3) — ver §4.

## 3. Componentes

### Botão primário

```
rounded-lg bg-neutral-900 px-4 py-2 text-white
```

Usado em: "Entrar com Google" (`/login`), "Conectar agenda do Google" (`/admin/[slug]/conectar`), "Inscreva-se" (página do evento).

### Botão secundário / outline

```
rounded-lg border px-4 py-2
```

Usado em: "Sincronizar agora", ações menos centrais do admin.

### Card de evento (lista)

`src/components/EventList.tsx`. Um `<li>` por evento, link inteiro clicável:

```
flex gap-4 rounded-xl border p-4 transition hover:bg-neutral-50
```

- Bloco de data à esquerda, largura fixa (`w-14`), fundo `bg-neutral-100`, dia em destaque (`text-xl font-semibold`) e mês abreviado abaixo (`text-xs uppercase opacity-60`).
- Título em `font-medium`.
- Linha de horário/local em `text-sm opacity-70` (mostra "Dia inteiro" quando `allDay`).
- Tag de label (se `event.label` estiver definido): `inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs`, com um ponto (`size-2 rounded-full`) na cor resolvida (`event.color`, via `style={{ backgroundColor }}`) e o nome da label (`event.label.name`) ao lado. É o único lugar da UI que usa a cor da cascata — ver §4.

### Grade de mês

`src/components/MonthGrid.tsx`. Grid de 7 colunas com `gap-px` sobre fundo `bg-neutral-200`, simulando as bordas entre células:

```
grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-neutral-200
```

- Cabeçalho dos dias da semana: `bg-neutral-50 py-2 text-center text-xs opacity-60`.
- Célula de dia: `min-h-20 bg-white p-1`, número do dia em `text-xs opacity-60`.
- Evento dentro da célula: pílula truncada, sempre na mesma cor neutra fixa, independente da label ou da cor resolvida (§4):
  ```
  block truncate rounded bg-neutral-900 px-1 py-0.5 text-[10px] text-white
  ```
- Some no celular (`hidden sm:block` no componente pai `CalendarView`) — a lista assume no lugar, porque sete colunas não cabem em tela estreita.

### Alternador Grade/Lista

`src/components/CalendarView.tsx`, `role="tablist"` com dois `role="tab"`:

```
rounded-lg px-3 py-1.5 text-sm
# selecionado:   bg-neutral-900 text-white
# não selecionado: border
```

### Alerta / erro

```
role="alert" rounded-lg border border-red-300 bg-red-50 p-4 text-sm
```

Usado para `lastSyncError` no admin e para os erros do fluxo de conexão OAuth (`ERROS` em `conectar/page.tsx`).

### Sidebar do admin

`src/app/admin/[slug]/Sidebar.tsx`. Coluna `w-60` (`w-14` colapsada), `border-r`. Rótulo de grupo: `text-[11px] font-semibold uppercase tracking-wide opacity-50`. Item de navegação: `flex items-center gap-2 rounded-lg px-2 py-2 text-sm`, inativo com `hover:bg-neutral-100`, ativo com `style={{ backgroundColor: accent + '1a', color: accent }}` — wash de ~10% (sufixo `1a` é o canal alfa do hex de 8 dígitos) da cor de destaque do calendário (`Calendar.accentColor`), validada por `isValidHex` antes de entrar no `style` (`ARCHITECTURE.md` §9). Rodapé com e-mail da conta e botão "Sair". Abaixo de `md`, vira drawer (`fixed inset-0 z-50`) acionado por um botão de menu no topo.

### Ícones

`src/components/icons.tsx`. Sete SVGs de 16px próprios, `stroke="currentColor"`, `strokeWidth: 1.5`: `CalendarIcon`/`UsersIcon`/`LinkIcon` (itens da navegação, mapeados em `NAV_ICONS`) e `ChevronLeftIcon`/`ChevronRightIcon`/`MenuIcon`/`CloseIcon` (colapso e drawer da sidebar).

### Tela de parede

`src/components/ErrorScreen.tsx`. Casca de toda tela sem conteúdo — 404, erro, e as quatro telas de negativa do admin (`AccessDenied.tsx`):

```
mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center
```

Título, texto opcional (`text-sm opacity-70`) e uma área de ações. `PRIMARY_BUTTON`/`SECONDARY_BUTTON` são exportados do mesmo arquivo — as classes de botão primário/secundário (acima) já eram repetidas inline em cada tela; aqui viraram constante única para as telas de saída.

## 4. Cor por label — estado real

O enum fixo `Area` (departamentos do clube) foi substituído pela tabela `Label` por calendário, com cor própria (`ARCHITECTURE.md` §4, §4.1). A cor final de um evento é resolvida no servidor (`colorOverride ?? label.color ?? calendar.accentColor`) e já chega pronta em `PublicEvent.color`.

Hoje essa cor só é usada na **lista** (`EventList.tsx`): o ponto ao lado do nome da label, `style={{ backgroundColor: event.color }}`. A **grade de mês** (`MonthGrid.tsx`) ainda não usa `event.color` — a pílula do evento é sempre `bg-neutral-900`, cor fixa, para todo evento, com ou sem label. Se a grade ganhar cor por evento depois, o ponto de entrada é a pílula em `MonthGrid.tsx`, trocando a classe fixa por um `style` com `event.color` (mesmo padrão já usado em `EventList.tsx`).

## 5. O que não existe (de propósito, por ora)

- Dark mode aplicado de fato às telas do produto: só o esqueleto (`globals.css` `@media (prefers-color-scheme: dark)`) existe; nenhuma tela testa contraste no escuro.
- Biblioteca de ícones: nenhuma está instalada. `src/components/icons.tsx` (§3) tem sete SVGs próprios para a navegação do admin, feitos à mão — não é o mesmo que ter um pacote de ícones geral disponível para qualquer tela.
- Animações além de `transition` no hover do card.
- Componente de botão/input reutilizável — cada tela escreve as classes Tailwind inline. Com o inventário de componentes deste tamanho (um card, uma grade, dois botões), extrair um componente compartilhado seria abstração sem uso hoje.
