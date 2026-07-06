import { describe, it, expect } from 'vitest'
import {
  buildPanelPrimitives,
  defaultPanelSize,
  PANEL_DEFAULTS,
  type PanelPrimitive
} from '../src/renderer/src/lib/panelShapes'
import type { PanelComponentKind } from '../src/shared/types'

const KINDS = Object.keys(PANEL_DEFAULTS) as PanelComponentKind[]

function lines(prims: PanelPrimitive[]): Extract<PanelPrimitive, { kind: 'line' }>[] {
  return prims.filter((p): p is Extract<PanelPrimitive, { kind: 'line' }> => p.kind === 'line')
}

describe('buildPanelPrimitives', () => {
  it('produces primitives for every kind at its default size', () => {
    for (const kind of KINDS) {
      const { width, height } = defaultPanelSize(kind)
      const prims = buildPanelPrimitives(kind, {}, width, height)
      expect(prims.length, kind).toBeGreaterThan(0)
    }
  })

  it('knob indicator angle follows value', () => {
    const at = (value: number): number[] => {
      const prims = buildPanelPrimitives('knob', { value, ticks: 0 }, 100, 100)
      const indicator = lines(prims).find((l) => l.stroke === PANEL_DEFAULTS.knob.accent)!
      return indicator.points
    }
    const low = at(0)
    const high = at(1)
    // value 0 points lower-left (x < center), value 1 lower-right (x > center).
    expect(low[2]).toBeLessThan(50)
    expect(high[2]).toBeGreaterThan(50)
  })

  it('knob tick count matches params', () => {
    const prims = buildPanelPrimitives('knob', { ticks: 7 }, 100, 100)
    const tickLines = lines(prims).filter((l) => l.stroke === '#8a8f98')
    expect(tickLines.length).toBe(7)
  })

  it('fader handle position follows value (top = 1)', () => {
    const handleY = (value: number): number => {
      const prims = buildPanelPrimitives('fader', { value, ticks: 0 }, 70, 260)
      const rects = prims.filter(
        (p): p is Extract<PanelPrimitive, { kind: 'rect' }> => p.kind === 'rect'
      )
      // Track first, handle second.
      return rects[1].y
    }
    expect(handleY(1)).toBeLessThan(handleY(0))
  })

  it('lit LED glows, unlit LED dims', () => {
    const on = buildPanelPrimitives('led', { on: true }, 36, 36)
    const off = buildPanelPrimitives('led', { on: false }, 36, 36)
    const lightOn = on.find((p) => p.kind === 'circle' && p.shadowBlur)!
    expect(lightOn).toBeDefined()
    const lightOff = off.find((p) => p.kind === 'circle' && (p.opacity ?? 1) < 1)
    expect(lightOff).toBeDefined()
  })

  it('display text overrides the default', () => {
    const prims = buildPanelPrimitives('display7seg', { text: '432' }, 220, 90)
    const t = prims.find((p) => p.kind === 'text')!
    expect(t.kind === 'text' && t.text).toBe('432')
  })

  it('user colors override defaults', () => {
    const prims = buildPanelPrimitives('knob', { color: '#123456', accent: '#abcdef' }, 100, 100)
    expect(prims.some((p) => p.kind === 'circle' && p.fill === '#123456')).toBe(true)
    expect(lines(prims).some((l) => l.stroke === '#abcdef')).toBe(true)
  })
})
