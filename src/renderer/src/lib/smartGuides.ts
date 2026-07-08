/**
 * Smart alignment guides for the design canvas — pure geometry so it is
 * unit-tested independently of Konva/React.
 *
 * Given the dragging layer's proposed position and the other layers, it:
 *  - snaps edges/centers to the NEAREST other layer (+ canvas + safe zone +
 *    user guides) on each axis, so only the relevant line shows (low noise);
 *  - snaps to equal spacing when the dragged object sits between two others,
 *    emitting spacing segments with a measured gap for a Figma-style hint.
 */

export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** A single alignment line to draw across the artboard. */
export interface AlignGuide {
  axis: 'x' | 'y'
  pos: number
  /** Extent of the line along the OTHER axis (min..max) to keep it local. */
  from: number
  to: number
}

/** A measured gap between two boxes, drawn as a segment with a label. */
export interface SpacingGuide {
  axis: 'x' | 'y'
  /** Segment start/end along the axis. */
  start: number
  end: number
  /** Cross-axis position to draw the segment at. */
  cross: number
  gap: number
}

export interface SnapResult {
  x: number
  y: number
  alignGuides: AlignGuide[]
  spacingGuides: SpacingGuide[]
}

export interface SnapOptions {
  threshold: number
  canvasW: number
  canvasH: number
  /** Safe-zone inset (px) on each side; 0 to ignore. */
  safeInsetX: number
  safeInsetY: number
  userGuidesX: number[]
  userGuidesY: number[]
}

interface Candidate {
  /** The dragged box's coordinate that would touch the target. */
  src: number
  /** Offset from the box origin to that coordinate (0=left/top, w/2, w). */
  offset: number
}

interface Target {
  pos: number
  /** For layer targets, the box we aligned to (drives the guide extent). */
  box?: Box
  kind: 'canvas' | 'safe' | 'guide' | 'layer'
}

/** Pick the single closest target within threshold for a set of candidates. */
function bestSnap(
  cands: Candidate[],
  targets: Target[],
  threshold: number
): { finalOrigin: number; target: Target; srcPos: number } | null {
  let best: { finalOrigin: number; target: Target; srcPos: number; dist: number } | null = null
  for (const c of cands) {
    for (const t of targets) {
      const dist = Math.abs(c.src - t.pos)
      if (dist < threshold && (!best || dist < best.dist)) {
        best = { finalOrigin: t.pos - c.offset, target: t, srcPos: t.pos, dist }
      }
    }
  }
  return best
}

export function computeSmartSnap(
  drag: Box,
  others: Box[],
  o: SnapOptions
): SnapResult {
  const { threshold } = o
  const alignGuides: AlignGuide[] = []
  const spacingGuides: SpacingGuide[] = []

  let x = drag.x
  let y = drag.y

  // ---- Edge/center alignment (X) ----
  const xCands: Candidate[] = [
    { src: drag.x, offset: 0 },
    { src: drag.x + drag.w / 2, offset: drag.w / 2 },
    { src: drag.x + drag.w, offset: drag.w }
  ]
  const xTargets: Target[] = [
    { pos: 0, kind: 'canvas' },
    { pos: o.canvasW / 2, kind: 'canvas' },
    { pos: o.canvasW, kind: 'canvas' },
    ...(o.safeInsetX > 0
      ? [
          { pos: o.safeInsetX, kind: 'safe' as const },
          { pos: o.canvasW - o.safeInsetX, kind: 'safe' as const }
        ]
      : []),
    ...o.userGuidesX.map((p) => ({ pos: p, kind: 'guide' as const }))
  ]
  for (const b of others) {
    xTargets.push(
      { pos: b.x, box: b, kind: 'layer' },
      { pos: b.x + b.w / 2, box: b, kind: 'layer' },
      { pos: b.x + b.w, box: b, kind: 'layer' }
    )
  }
  const snapX = bestSnap(xCands, xTargets, threshold)
  if (snapX) {
    x = snapX.finalOrigin
    const line = extentFor('y', snapX.target.box, drag, o)
    alignGuides.push({ axis: 'x', pos: snapX.srcPos, from: line.from, to: line.to })
  }

  // ---- Edge/center alignment (Y) ----
  const yCands: Candidate[] = [
    { src: drag.y, offset: 0 },
    { src: drag.y + drag.h / 2, offset: drag.h / 2 },
    { src: drag.y + drag.h, offset: drag.h }
  ]
  const yTargets: Target[] = [
    { pos: 0, kind: 'canvas' },
    { pos: o.canvasH / 2, kind: 'canvas' },
    { pos: o.canvasH, kind: 'canvas' },
    ...(o.safeInsetY > 0
      ? [
          { pos: o.safeInsetY, kind: 'safe' as const },
          { pos: o.canvasH - o.safeInsetY, kind: 'safe' as const }
        ]
      : []),
    ...o.userGuidesY.map((p) => ({ pos: p, kind: 'guide' as const }))
  ]
  for (const b of others) {
    yTargets.push(
      { pos: b.y, box: b, kind: 'layer' },
      { pos: b.y + b.h / 2, box: b, kind: 'layer' },
      { pos: b.y + b.h, box: b, kind: 'layer' }
    )
  }
  const snapY = bestSnap(yCands, yTargets, threshold)
  if (snapY) {
    y = snapY.finalOrigin
    const line = extentFor('x', snapY.target.box, drag, o)
    alignGuides.push({ axis: 'y', pos: snapY.srcPos, from: line.from, to: line.to })
  }

  // ---- Equal-spacing snap ----
  // Only when NOT already edge-snapped on that axis (avoid fighting).
  if (!snapX) {
    const sp = equalSpacing('x', { ...drag, x, y }, others, threshold)
    if (sp) {
      x = sp.origin
      spacingGuides.push(...sp.guides)
    }
  }
  if (!snapY) {
    const sp = equalSpacing('y', { ...drag, x, y }, others, threshold)
    if (sp) {
      y = sp.origin
      spacingGuides.push(...sp.guides)
    }
  }

  return { x, y, alignGuides, spacingGuides }
}

/** Line extent: span the dragged box and the target box so the line is local. */
function extentFor(
  along: 'x' | 'y',
  box: Box | undefined,
  drag: Box,
  o: SnapOptions
): { from: number; to: number } {
  if (!box) {
    // Canvas/guide target → span the whole artboard on that axis.
    return along === 'x' ? { from: 0, to: o.canvasW } : { from: 0, to: o.canvasH }
  }
  if (along === 'x') {
    return { from: Math.min(drag.x, box.x), to: Math.max(drag.x + drag.w, box.x + box.w) }
  }
  return { from: Math.min(drag.y, box.y), to: Math.max(drag.y + drag.h, box.y + box.h) }
}

/**
 * Detect equal spacing on one axis: find the nearest neighbour on each side of
 * the dragged box and, if snapping the box makes the two gaps equal, return the
 * snapped origin + two spacing segments to render.
 */
function equalSpacing(
  axis: 'x' | 'y',
  drag: Box,
  others: Box[],
  threshold: number
): { origin: number; guides: SpacingGuide[] } | null {
  const lo = (b: Box): number => (axis === 'x' ? b.x : b.y)
  const hi = (b: Box): number => (axis === 'x' ? b.x + b.w : b.y + b.h)
  const crossLo = (b: Box): number => (axis === 'x' ? b.y : b.x)
  const crossHi = (b: Box): number => (axis === 'x' ? b.y + b.h : b.x + b.w)
  const size = axis === 'x' ? drag.w : drag.h

  // Consider only boxes that overlap on the cross axis (visually in a row/col).
  const inLine = others.filter(
    (b) => crossLo(b) < crossHi(drag) && crossHi(b) > crossLo(drag)
  )
  const left = inLine.filter((b) => hi(b) <= lo(drag)).sort((a, b) => hi(b) - hi(a))[0]
  const right = inLine.filter((b) => lo(b) >= hi(drag)).sort((a, b) => lo(a) - lo(b))[0]
  if (!left || !right) return null

  // Position the dragged box so the gaps to left and right are equal.
  const available = lo(right) - hi(left) - size
  if (available <= 0) return null
  const gap = available / 2
  const snappedLo = hi(left) + gap
  const curLo = lo(drag)
  if (Math.abs(snappedLo - curLo) > threshold) return null

  const origin = snappedLo // lo === origin on this axis (x or y)
  const cross = (crossLo(drag) + crossHi(drag)) / 2
  const guides: SpacingGuide[] = [
    { axis, start: hi(left), end: snappedLo, cross, gap },
    { axis, start: snappedLo + size, end: lo(right), cross, gap }
  ]
  return { origin, guides }
}
