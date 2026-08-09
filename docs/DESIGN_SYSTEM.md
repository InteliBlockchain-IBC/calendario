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

Não existe classe de cor por área de evento (`EDUCATIONAL`, `PROJECTS`, `MARKETING`, `PEOPLE`, `GENERAL`) na implementação atual — ver §4.

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
- Tag de área (se `event.area` estiver definido): `inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs`, com o rótulo em português (`AREA_LABEL`). **Uma única cor neutra para todas as áreas** — não há mapeamento de cor por `Area` hoje (§4).

### Grade de mês

`src/components/MonthGrid.tsx`. Grid de 7 colunas com `gap-px` sobre fundo `bg-neutral-200`, simulando as bordas entre células:

```
grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-neutral-200
```

- Cabeçalho dos dias da semana: `bg-neutral-50 py-2 text-center text-xs opacity-60`.
- Célula de dia: `min-h-20 bg-white p-1`, número do dia em `text-xs opacity-60`.
- Evento dentro da célula: pílula truncada, sempre na mesma cor neutra, independente da área:
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

## 4. Cores por área — estado real

O spec original previa "cor do card vem da tag de área — evento sem tag usa a cor de `GENERAL`". **A implementação não fez isso**: `AREA_LABEL` mapeia `Area` só para um rótulo textual em português (Educacional, Projetos, Marketing, Pessoas, Geral); a tag visual usa sempre `bg-neutral-100` / `text-xs`, independente do valor de `area`. Se uma paleta por área for adicionada depois, o ponto de entrada é `AREA_LABEL` em `src/components/EventList.tsx` — trocar por um mapa `Area → classe de cor` e aplicar tanto na tag da lista quanto na pílula da grade de mês (`MonthGrid.tsx`). Isso deve esperar o guia de estilos do clube ser extraído em cores concretas por área (`documentos_projetos`/`design/` não define isso hoje, até onde este projeto tem acesso).

## 5. O que não existe (de propósito, por ora)

- Dark mode aplicado de fato às telas do produto: só o esqueleto (`globals.css` `@media (prefers-color-scheme: dark)`) existe; nenhuma tela testa contraste no escuro.
- Ícones (nenhuma biblioteca de ícones está instalada).
- Animações além de `transition` no hover do card.
- Componente de botão/input reutilizável — cada tela escreve as classes Tailwind inline. Com o inventário de componentes deste tamanho (um card, uma grade, dois botões), extrair um componente compartilhado seria abstração sem uso hoje.
