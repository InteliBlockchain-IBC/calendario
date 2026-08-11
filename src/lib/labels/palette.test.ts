import { describe, it, expect } from 'vitest'
import { PALETTE, isValidHex, textOn } from './palette'

describe('PALETTE', () => {
  it('tem 12 cores, todas hex válidos e sem repetição', () => {
    expect(PALETTE).toHaveLength(12)
    for (const color of PALETTE) {
      expect(isValidHex(color)).toBe(true)
    }
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })
})

describe('isValidHex', () => {
  it('aceita hex de 6 dígitos com #', () => {
    expect(isValidHex('#3B82F6')).toBe(true)
    expect(isValidHex('#000000')).toBe(true)
    expect(isValidHex('#ffffff')).toBe(true)
  })

  it('rejeita o que não é hex de 6 dígitos', () => {
    expect(isValidHex('3B82F6')).toBe(false)
    expect(isValidHex('#3B82F')).toBe(false)
    expect(isValidHex('#3B82F6A')).toBe(false)
    expect(isValidHex('#GGGGGG')).toBe(false)
    expect(isValidHex('')).toBe(false)
    expect(isValidHex('red')).toBe(false)
    expect(isValidHex('#fff')).toBe(false)
  })

  it('rejeita tentativa de injeção de CSS', () => {
    expect(isValidHex('#000; background: url(x)')).toBe(false)
    expect(isValidHex('red; content: "x"')).toBe(false)
  })
})

describe('textOn', () => {
  it('pede texto claro sobre fundo escuro', () => {
    expect(textOn('#000000')).toBe('light')
    expect(textOn('#0F172A')).toBe('light')
    expect(textOn('#3B82F6')).toBe('light')
  })

  it('pede texto escuro sobre fundo claro', () => {
    expect(textOn('#FFFFFF')).toBe('dark')
    expect(textOn('#EAB308')).toBe('dark')
    expect(textOn('#84CC16')).toBe('dark')
  })

  it('funciona com hex em minúsculas', () => {
    expect(textOn('#ffffff')).toBe('dark')
    expect(textOn('#000000')).toBe('light')
  })
})
