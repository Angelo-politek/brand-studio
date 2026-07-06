import { describe, it, expect } from 'vitest'
import { applyBrandToLayers } from '@renderer/lib/brandApply'
import type { Brand, Layer } from '@shared/types'

const brand = {
  id: 'b1',
  colors: [{ id: 'c1', role: 'primary', hex: '#ff0000' }],
  fonts: [{ role: 'heading', family: 'Poppins' }]
} as unknown as Brand

const fullBrand = {
  id: 'b2',
  colors: [
    { id: 'c1', role: 'primary', hex: '#ff0000' },
    { id: 'c2', role: 'secondary', hex: '#00ff00' },
    { id: 'c3', role: 'accent', hex: '#0000ff' }
  ],
  fonts: [
    { role: 'heading', family: 'Poppins' },
    { role: 'body', family: 'Inter' }
  ]
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

  it('title gets heading font, other text gets body font', () => {
    const [title, bodyText] = applyBrandToLayers(
      [
        layer({ type: 'text', fontSize: 64, fontFamily: 'Arial' }),
        layer({ type: 'text', fontSize: 24, fontFamily: 'Arial' })
      ],
      fullBrand
    )
    expect(title.fontFamily).toBe('Poppins')
    expect(bodyText.fontFamily).toBe('Inter')
  })

  it('uses secondary for shapes and accent for lines when available', () => {
    const [shape, line] = applyBrandToLayers(
      [layer({ type: 'rect', fill: '#000' }), layer({ type: 'line', strokeColor: '#000' })],
      fullBrand
    )
    expect(shape.fill).toBe('#00ff00')
    expect(line.strokeColor).toBe('#0000ff')
  })

  it('single-color brands fall back to primary everywhere', () => {
    const [shape, line] = applyBrandToLayers(
      [layer({ type: 'rect', fill: '#000' }), layer({ type: 'line', strokeColor: '#000' })],
      brand
    )
    expect(shape.fill).toBe('#ff0000')
    expect(line.strokeColor).toBe('#ff0000')
  })
})
