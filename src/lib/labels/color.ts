/**
 * A cor de um evento tem três origens possíveis, nesta ordem de precedência.
 * A regra mora aqui e só aqui: a cor é resolvida no servidor e vai pronta
 * para o cliente, então nenhum consumidor (página, embed, JSON) precisa
 * conhecer a cascata (§5.4).
 */
export function eventColor(
  event: { colorOverride: string | null; label: { color: string } | null },
  calendar: { accentColor: string },
): string {
  return event.colorOverride ?? event.label?.color ?? calendar.accentColor
}
