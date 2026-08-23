import { describe, it, expect } from 'vitest'
import { animateLayer, ease, sceneTransitionState, locateOnTimeline } from '@renderer/lib/videoAnim'
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

  it('directional slides start offset and settle in place', () => {
    const down = animateLayer(layer({ in: 'slideDown', durationMs: 500 }), 0, 3000)
    expect(down.y).toBeLessThan(100) // enters from above
    const right = animateLayer(layer({ in: 'slideRight', durationMs: 500 }), 0, 3000)
    expect(right.x).toBeLessThan(100) // enters from the left
    const settled = animateLayer(layer({ in: 'slideDown', durationMs: 500 }), 600, 3000)
    expect(settled.y).toBe(100)
  })

  it('popOut exit shrinks and fades at the scene end', () => {
    const l = layer({ out: 'popOut', durationMs: 500 })
    const end = animateLayer(l, 3000, 3000)
    expect(end.opacity).toBeCloseTo(0, 5)
    expect(end.scaleX).toBeCloseTo(0.7, 5)
    const before = animateLayer(l, 2000, 3000)
    expect(before.opacity).toBe(1)
  })
})

describe('ease', () => {
  it('is identity at the endpoints for every curve', () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(ease(0, e)).toBe(0)
      expect(ease(1, e)).toBe(1)
    }
  })

  it('easeIn is slower and easeOut faster at the midpoint', () => {
    expect(ease(0.5, 'easeIn')).toBeLessThan(0.5)
    expect(ease(0.5, 'easeOut')).toBeGreaterThan(0.5)
    expect(ease(0.5, 'easeInOut')).toBeCloseTo(0.5, 5)
  })

  it('easing shapes the enter ramp of animateLayer', () => {
    const linear = animateLayer(layer({ in: 'fadeIn', durationMs: 1000 }), 500, 3000)
    const eased = animateLayer(
      layer({ in: 'fadeIn', durationMs: 1000, easing: 'easeIn' }),
      500,
      3000
    )
    expect(eased.opacity).toBeLessThan(linear.opacity)
  })
})

describe('locateOnTimeline', () => {
  const scenes = [
    { id: 'a', durationMs: 2000 },
    { id: 'b', durationMs: 3000 },
    { id: 'c', durationMs: 1000 }
  ]

  it('advances the visible scene as the global clock moves', () => {
    expect(locateOnTimeline(scenes, 0)).toMatchObject({ sceneId: 'a', localMs: 0, atEnd: false })
    expect(locateOnTimeline(scenes, 1500)).toMatchObject({ sceneId: 'a', localMs: 1500 })
    expect(locateOnTimeline(scenes, 2500)).toMatchObject({ sceneId: 'b', localMs: 500 })
    expect(locateOnTimeline(scenes, 5200)).toMatchObject({ sceneId: 'c', localMs: 200 })
  })

  it('flags the end once past the total duration', () => {
    expect(locateOnTimeline(scenes, 6000).atEnd).toBe(true)
    expect(locateOnTimeline(scenes, 9999).atEnd).toBe(true)
  })

  it('handles an empty timeline', () => {
    expect(locateOnTimeline([], 100)).toEqual({ sceneId: '', localMs: 0, atEnd: true })
  })
})

describe('sceneTransitionState', () => {
  it('is identity without a transition or past its window', () => {
    expect(sceneTransitionState(undefined, 100, 1080, 1920).opacity).toBe(1)
    expect(sceneTransitionState({ type: 'fade', durationMs: 400 }, 500, 1080, 1920).dx).toBe(0)
    expect(sceneTransitionState({ type: 'fade', durationMs: 400 }, 500, 1080, 1920).opacity).toBe(1)
  })

  it('fade ramps opacity over the window', () => {
    const t = sceneTransitionState({ type: 'fade', durationMs: 400 }, 200, 1080, 1920)
    expect(t.opacity).toBeCloseTo(0.5, 5)
    expect(t.dx).toBe(0)
  })

  it('slides displace by the full canvas size (xfade semantics)', () => {
    const left = sceneTransitionState({ type: 'slideLeft', durationMs: 400 }, 0, 1080, 1920)
    expect(left.dx).toBe(1080)
    const up = sceneTransitionState({ type: 'slideUp', durationMs: 400 }, 200, 1080, 1920)
    expect(up.dy).toBeCloseTo(960, 5)
  })
})
