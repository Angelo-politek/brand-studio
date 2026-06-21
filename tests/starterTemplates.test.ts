import { describe, it, expect } from 'vitest'
import { STARTER_TEMPLATES, starterById } from '@renderer/lib/starterTemplates'
import type { Brand } from '@shared/types'

describe('starter templates', () => {
  it('exposes a non-empty catalog with unique ids', () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id)
    expect(ids.length).toBeGreaterThanOrEqual(4)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds valid layers for every template', () => {
    for (const t of STARTER_TEMPLATES) {
      const layers = t.build(t.canvas)
      expect(layers.length).toBeGreaterThan(0)
      for (const l of layers) {
        expect(l.id).toBeTruthy()
        expect(typeof l.x).toBe('number')
        expect(typeof l.y).toBe('number')
        expect(l.width).toBeGreaterThan(0)
      }
    }
  })

  it('applies brand colors when a brand is supplied', () => {
    const brand = {
      id: 'b1',
      colors: [
        { id: 'c1', role: 'primary', hex: '#123456' },
        { id: 'c2', role: 'secondary', hex: '#abcdef' }
      ],
      fonts: [{ role: 'heading', family: 'Poppins' }]
    } as unknown as Brand
    const layers = starterById('quote-card')!.build(
      { width: 1080, height: 1080, background: '#000' },
      brand
    )
    const usesPrimary = layers.some((l) => l.fill === '#123456')
    const usesHeadingFont = layers.some((l) => l.fontFamily === 'Poppins')
    expect(usesPrimary).toBe(true)
    expect(usesHeadingFont).toBe(true)
  })
})
