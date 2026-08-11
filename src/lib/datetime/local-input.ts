/**
 * Ponte entre o `<input type="datetime-local">` (hora de parede, sem fuso) e o
 * banco (instante em UTC).
 *
 * `new Date('2026-08-12T19:00')` interpreta o texto no fuso de **quem está
 * rodando** — o navegador do admin, não o do calendário. Um admin em Lisboa
 * digitando 19:00 gravava 18:00Z, que é 15:00 em São Paulo: o evento aparecia
 * quatro horas antes na agenda do clube. É a mesma armadilha que
 * `dateInTimezone` em `src/lib/google/write-event.ts` já evita do outro lado.
 */

function partsIn(at: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const out: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value
  }
  return out
}

/** Instante UTC → `'YYYY-MM-DDTHH:mm'` na hora de parede do calendário. */
export function toLocalInput(at: Date, timezone: string): string {
  const p = partsIn(at, timezone)
  // `hour12: false` devolve '24' para meia-noite em parte das versões do ICU,
  // e '24:00' é valor inválido para o input.
  const hour = String(Number(p.hour) % 24).padStart(2, '0')
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`
}

/** Forma exata que o `<input type="datetime-local">` produz. */
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** `'YYYY-MM-DDTHH:mm'` na hora de parede do calendário → instante UTC. */
export function fromLocalInput(value: string, timezone: string): Date {
  // Alguns navegadores mandam segundos; o resto é ignorado.
  const minutes = value.slice(0, 16)

  // A checagem de forma é obrigatória, e `Number.isNaN(getTime())` sozinho não
  // a substitui: o parser leniente do V8 aceita ':00Z' e 'amanhã:00Z' e
  // devolve 2000-01-01T00:00:00Z. Sem o regex, um campo vazio gravaria um
  // evento no ano 2000 sem erro nenhum.
  if (!LOCAL_INPUT.test(minutes)) {
    throw new Error(`Data inválida: "${value}".`)
  }

  // Lê o texto como se fosse UTC e desconta o deslocamento do fuso.
  const asUtc = new Date(`${minutes}:00Z`)
  // Pega hora ou minuto fora de faixa ('25:00'). Dia inexistente com forma
  // válida ('2026-02-31T10:00') rola para o mês seguinte em vez de falhar — o
  // input do navegador não produz esse valor, e o efeito é uma data adjacente.
  if (Number.isNaN(asUtc.getTime())) {
    throw new Error(`Data inválida: "${value}".`)
  }

  const p = partsIn(asUtc, timezone)
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  )

  // ponytail: usa o deslocamento vigente no instante lido como UTC, não no
  // instante final. Diverge em uma hora só para valor que caia exatamente na
  // virada do horário de verão do fuso; America/Sao_Paulo não tem horário de
  // verão desde 2019. Se um calendário em fuso com DST reclamar, a correção é
  // recalcular o deslocamento uma segunda vez sobre o resultado.
  return new Date(asUtc.getTime() - (wall - asUtc.getTime()))
}
