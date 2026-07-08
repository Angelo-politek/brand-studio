import { describe, it, expect } from 'vitest'
import { computeSmartSnap, type Box, type SnapOptions } from '@renderer/lib/smartGuides'

const opts = (over: Partial<SnapOptions> = {}): SnapOptions => ({
  threshold: 8,
  canvasW: 1000,
  canvasH: 1000,
  safeInsetX: 50,
  safeInsetY: 50,
  userGuidesX: [],
  userGuidesY: [],
  ...over
})

const box = (id: string, x: number, y: number, w = 100, h = 100): Box => ({ id, x, y, w, h })

describe('computeSmartSnap — alignment', () => {
  it('snaps a box center to the canvas center', () => {
    const drag = box('d', 448, 300) // center x = 498, canvas center = 500
    const r = computeSmartSnap(drag, [], opts())
    expect(r.x).toBe(450) // center now at 500
    expect(r.alignGuides.some((g) => g.axis === 'x' && g.pos === 500)).toBe(true)
  })

  it('snaps to the safe-zone edge', () => {
    const drag = box('d', 53, 300) // left edge near safe inset 50
    const r = computeSmartSnap(drag, [], opts())
    expect(r.x).toBe(50)
  })

  it('aligns left edges to another layer and shows ONE guide', () => {
    const other = box('o', 200, 600)
    const drag = box('d', 204, 300) // left edge 204 ~ other left 200
    const r = computeSmartSnap(drag, [other], opts())
    expect(r.x).toBe(200)
    const xGuides = r.alignGuides.filter((g) => g.axis === 'x')
    expect(xGuides).toHaveLength(1)
    expect(xGuides[0].pos).toBe(200)
  })

  it('picks the NEAREST target, not every aligned layer', () => {
    const near = box('near', 205, 600)
    const far = box('far', 500, 600)
    const drag = box('d', 203, 300)
    const r = computeSmartSnap(drag, [near, far], opts())
    // Snapped to the near layer's left edge (205), not the far one.
    expect(r.x).toBe(205)
    expect(r.alignGuides.filter((g) => g.axis === 'x')).toHaveLength(1)
  })

  it('draws the guide extent spanning only the dragged + target box', () => {
    const other = box('o', 200, 600) // far below the drag
    const drag = box('d', 204, 300)
    const r = computeSmartSnap(drag, [other], opts())
    const g = r.alignGuides.find((x) => x.axis === 'x')!
    // Vertical line spans from y=300 (drag top) to y=700 (other bottom).
    expect(g.from).toBe(300)
    expect(g.to).toBe(700)
  })
})

describe('computeSmartSnap — equal spacing', () => {
  it('snaps to equal gaps between two neighbours and emits spacing guides', () => {
    // Two boxes on the same row: left [0..100], right [400..500].
    const left = box('l', 0, 300)
    const right = box('r', 400, 300)
    // Drag a 100-wide box near the equidistant slot (gap should be 50 each).
    // available = 400-100-100 = 200 → gap 100 → snappedLo = 100+100 = 200.
    const drag = box('d', 196, 300)
    const r = computeSmartSnap(drag, [left, right], opts())
    expect(r.x).toBe(200)
    expect(r.spacingGuides).toHaveLength(2)
    expect(r.spacingGuides[0].gap).toBe(100)
    expect(r.spacingGuides[1].gap).toBe(100)
  })

  it('does not spacing-snap when boxes are on different rows', () => {
    const left = box('l', 0, 100)
    const right = box('r', 400, 800)
    const drag = box('d', 196, 300)
    const r = computeSmartSnap(drag, [left, right], opts())
    expect(r.spacingGuides).toHaveLength(0)
  })
})
