/**
 * Doze cores curadas para labels. São os tons 500 da escala do Tailwind:
 * têm contraste previsível e formam uma família coerente, então um calendário
 * que só usa a paleta nunca fica visualmente quebrado (§3).
 */
export const PALETTE = [
  '#EF4444', // vermelho
  '#F97316', // laranja
  '#F59E0B', // âmbar
  '#EAB308', // amarelo
  '#84CC16', // lima
  '#22C55E', // verde
  '#14B8A6', // turquesa
  '#06B6D4', // ciano
  '#3B82F6', // azul
  '#6366F1', // índigo
  '#A855F7', // roxo
  '#EC4899', // rosa
] as const

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * A cor vai para um `style` inline. Aceitar string arbitrária ali é injeção
 * de CSS — por isso todo hex que vem do usuário passa por aqui antes de ser
 * gravado (§10).
 */
export function isValidHex(value: string): boolean {
  return HEX.test(value)
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Luminância relativa segundo a WCAG. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Decide se o texto sobre esta cor deve ser claro ou escuro, baseado na
 * luminância relativa. É o que impede a liberdade do hex livre de virar chip
 * ilegível (§5.4).
 *
 * `'light'` = use texto claro. `'dark'` = use texto escuro.
 */
export function textOn(hex: string): 'light' | 'dark' {
  const l = luminance(hex)
  return l > 0.45 ? 'dark' : 'light'
}
