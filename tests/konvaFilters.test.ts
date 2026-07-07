import { describe, it, expect } from 'vitest'
import { applyTemperature } from '@renderer/lib/konvaFilters'

function px(r: number, g: number, b: number): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, 255])
}

describe('applyTemperature', () => {
  it('warm (+) pushes red up and blue down', () => {
    const d = px(100, 100, 100)
    applyTemperature(d, 1)
    expect(d[0]).toBe(140)
    expect(d[1]).toBe(100)
    expect(d[2]).toBe(60)
  })

  it('cold (-) pushes red down and blue up', () => {
    const d = px(100, 100, 100)
    applyTemperature(d, -1)
    expect(d[0]).toBe(60)
    expect(d[2]).toBe(140)
  })

  it('zero is a no-op', () => {
    const d = px(50, 60, 70)
    applyTemperature(d, 0)
    expect([...d]).toEqual([50, 60, 70, 255])
  })

  it('clamps at channel bounds', () => {
    const d = px(250, 0, 5)
    applyTemperature(d, 1)
    expect(d[0]).toBe(255)
    expect(d[2]).toBe(0)
  })
})
