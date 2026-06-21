import { describe, it, expect } from 'vitest'
import { applyBrandToLayers } from '@renderer/lib/brandApply'
import type { Brand, Layer } from '@shared/types'

const brand = {
  id: 'b1',
  colors: [{ id: 'c1', role: 'primary', hex: '#ff0000' }],
  fonts: [{ role: 'heading', family: 'Poppins' }]
} as unknown as Brand

function layer(partial: Partial<Layer>): Layer {
  return {
    id: 'l',
    type: 'rect',
    name: 'L',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visible: true,
    locked: false,
    ...partial
  } as Layer
}

describe('applyBrandToLayers', () => {
  it('applies primary color and heading font to text layers', () => {
    const [out] = applyBrandToLayers(
      [layer({ type: 'text', fill: '#000', fontFamily: 'Arial' })],
      brand
    )
    expect(out.fill).toBe('#ff0000')
    expect(out.fontFamily).toBe('Poppins')
  })

  it('applies primary color as fill to shapes', () => {
    const [out] = applyBrandToLayers([layer({ type: 'rect', fill: '#000' })], brand)
    expect(out.fill).toBe('#ff0000')
  })

  it('applies primary color as stroke to lines', () => {
    const [out] = applyBrandToLayers([layer({ type: 'line', strokeColor: '#000' })], brand)
    expect(out.strokeColor).toBe('#ff0000')
  })

  it('leaves images untouched', () => {
    const img = layer({ type: 'image', src: 'x' })
    const [out] = applyBrandToLayers([img], brand)
    expect(out).toEqual(img)
  })
})
