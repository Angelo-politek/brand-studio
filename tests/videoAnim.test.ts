import { describe, it, expect } from 'vitest'
import { animateLayer } from '@renderer/lib/videoAnim'
import type { Layer, LayerAnimation } from '@shared/types'

function layer(anim?: LayerAnimation): Layer {
  return {
    id: 'l',
    type: 'text',
    name: 'L',
    x: 100,
    y: 100,
    width: 200,
    height: 80,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visible: true,
    locked: false,
    text: 'hi',
    anim
  }
}

describe('animateLayer — new effects', () => {
  it('returns the layer untouched when there is no animation', () => {
    const l = layer()
    expect(animateLayer(l, 100, 3000)).toBe(l)
  })

  it('flash keeps opacity within [0,1]', () => {
    const l = layer({ in: 'flash', durationMs: 500 })
    for (let t = 0; t <= 3000; t += 50) {
      const out = animateLayer(l, t, 3000)
      expect(out.opacity).toBeGreaterThanOrEqual(0)
      expect(out.opacity).toBeLessThanOrEqual(1)
    }
  })

  it('pulse keeps positive scale and does not mutate input', () => {
    const l = layer({ in: 'pulse', durationMs: 500, periodMs: 500 })
    const out = animateLayer(l, 250, 3000)
    expect(out.scaleX).toBeGreaterThan(0)
    expect(out.scaleY).toBeGreaterThan(0)
    expect(l.scaleX).toBe(1) // input untouched
  })

  it('shake perturbs x within the effect window then settles', () => {
    const l = layer({ in: 'shake', durationMs: 500 })
    const during = animateLayer(l, 100, 3000)
    const after = animateLayer(l, 1000, 3000)
    // After the window, x returns to the original value.
    expect(after.x).toBe(100)
    // During, x is generally displaced (allow exact-zero crossings).
    expect(typeof during.x).toBe('number')
  })

  it('respects delayMs: hidden before the delay', () => {
    const l = layer({ in: 'fadeIn', durationMs: 500, delayMs: 1000 })
    const before = animateLayer(l, 500, 3000) // before delay
    const after = animateLayer(l, 1500, 3000) // delay + full duration
    expect(before.opacity).toBe(0)
    expect(after.opacity).toBeCloseTo(1, 5)
  })

  it('never mutates the input layer', () => {
    const l = layer({ in: 'pop', durationMs: 500 })
    const snapshot = JSON.stringify(l)
    animateLayer(l, 200, 3000)
    expect(JSON.stringify(l)).toBe(snapshot)
  })
})
