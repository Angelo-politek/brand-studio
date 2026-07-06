import { v4 as uuid } from 'uuid'
import type { Layer, Page, SceneTransition, VideoScene } from '@shared/types'

/**
 * Pure converter: turn a multi-page design (carousel of slides) into a sequence
 * of video scenes — one scene per page — with reading-time-based durations,
 * attention-grabbing auto-animations and inter-scene transitions, optionally
 * snapped to a music beat grid.
 *
 * No React, no IPC, no DOM: every function here is deterministic and unit-tested.
 * The result is a plain `VideoScene[]` that the existing video pipeline renders
 * and exports unchanged, so the generated reel is fully editable afterward.
 */

export type ReelIntensity = 'subtle' | 'normal' | 'punchy'
export type ReelFit = 'keep' | 'fit9x16'

export interface ReelConvertOptions {
  /** Target video width (used when fit !== 'keep'). */
  width: number
  /** Target video height (used when fit !== 'keep'). */
  height: number
  /** 'keep' uses each page's own canvas size; 'fit9x16' scales into width×height. */
  fit: ReelFit
  intensity: ReelIntensity
  /** Absolute beat timestamps (ms from track start), or null/empty for heuristic-only. */
  beats?: number[] | null
  /** Reading speed for the duration heuristic. Default 220 (social skim speed). */
  wpm?: number
  /** Minimum scene duration in ms. Default 1800. */
  minSceneMs?: number
  /** Maximum scene duration in ms. Default 6000. */
  maxSceneMs?: number
  /** Transition type between scenes. Default 'fade'. */
  transition?: SceneTransition['type']
}

export interface ReelConvertResult {
  scenes: VideoScene[]
  totalMs: number
}

const DEFAULTS = {
  wpm: 220,
  minSceneMs: 1800,
  maxSceneMs: 6000,
  transition: 'fade' as SceneTransition['type']
}

/** Words-per-character ratio: ~5 chars per word including the trailing space. */
const CHARS_PER_WORD = 5
/** Extra dwell per non-text element (scanning cost), capped. */
const SCAN_MS_PER_ELEMENT = 250
const SCAN_MS_CAP = 1500
/** Base dwell for a page with no text (purely visual slide). */
const VISUAL_ONLY_BASE_MS = 1600

/** Regex matching call-to-action copy across IT/EN. */
const CTA_RE = /follow|swipe|link|tap|subscribe|salva|segui|scorri|iscriviti|→|👉|👆/i

/** Sum of characters across a page's visible text layers. */
function totalTextChars(page: Page): number {
  return page.layers
    .filter((l) => l.visible && l.type === 'text' && l.text)
    .reduce((sum, l) => sum + (l.text as string).trim().length, 0)
}

/** Number of visible non-text layers on a page. */
function nonTextCount(page: Page): number {
  return page.layers.filter((l) => l.visible && l.type !== 'text').length
}

/**
 * Estimate how long a slide should stay on screen, based on reading time plus a
 * small scanning cost for visual elements. Clamped to [minSceneMs, maxSceneMs].
 */
export function estimateReadingMs(
  page: Page,
  o: { wpm: number; minSceneMs: number; maxSceneMs: number }
): number {
  const chars = totalTextChars(page)
  const words = chars / CHARS_PER_WORD
  const readMs = words > 0 ? (words / o.wpm) * 60000 : VISUAL_ONLY_BASE_MS
  const scanMs = Math.min(SCAN_MS_CAP, nonTextCount(page) * SCAN_MS_PER_ELEMENT)
  const raw = readMs + scanMs
  return Math.round(Math.max(o.minSceneMs, Math.min(o.maxSceneMs, raw)))
}

/**
 * Snap a list of cumulative scene boundaries (ms, strictly increasing, starting
 * at 0) to the nearest beat within `tolMs`. The first boundary (0) and the last
 * boundary (total end) are never moved — only interior cuts snap — and the
 * output stays strictly monotonic (no overlaps/reordering). Empty beats → input
 * returned unchanged.
 */
export function snapBoundariesToBeats(
  boundaries: number[],
  beats: number[],
  tolMs: number
): number[] {
  if (beats.length === 0 || boundaries.length <= 2) return boundaries.slice()
  const sortedBeats = [...beats].sort((a, b) => a - b)
  const out = boundaries.slice()
  for (let i = 1; i < out.length - 1; i++) {
    const target = boundaries[i]
    // Nearest beat to the original boundary.
    let best = target
    let bestDist = Infinity
    for (const b of sortedBeats) {
      const dist = Math.abs(b - target)
      if (dist < bestDist) {
        bestDist = dist
        best = b
      }
    }
    if (bestDist <= tolMs) {
      // Keep strictly increasing: must stay above previous and below next.
      const lo = out[i - 1] + 1
      const hi = boundaries[i + 1] - 1
      out[i] = Math.max(lo, Math.min(hi, best))
    }
  }
  return out
}

/** Median beat interval (ms) from a beat grid, or null if undeterminable. */
function beatIntervalMs(beats: number[] | null | undefined): number | null {
  if (!beats || beats.length < 2) return null
  const diffs: number[] = []
  for (let i = 1; i < beats.length; i++) diffs.push(beats[i] - beats[i - 1])
  diffs.sort((a, b) => a - b)
  const mid = diffs[Math.floor(diffs.length / 2)]
  return mid > 0 ? mid : null
}

/** Is this layer a likely call-to-action (accent fill or CTA copy)? */
function isCta(layer: Layer): boolean {
  if (layer.type === 'text' && layer.text && CTA_RE.test(layer.text)) return true
  return false
}

/**
 * Assign attention-grabbing enter animations to a scene's layers following
 * social-video best practices: the title pops, body text slides up in a
 * staggered cadence, visuals fade in, and a call-to-action flashes/pulses at
 * higher intensities. Returns NEW layers (never mutates input).
 */
export function autoAnimateLayers(
  layers: Layer[],
  sceneDurationMs: number,
  opts: ReelConvertOptions & { isLastScene?: boolean }
): Layer[] {
  const intensity = opts.intensity
  const beatMs = beatIntervalMs(opts.beats)
  // Largest text layer = title.
  const textLayers = layers.filter((l) => l.type === 'text')
  const maxFont = textLayers.reduce((m, l) => Math.max(m, l.fontSize ?? 0), 0)

  let bodyIndex = 0
  return layers.map((l) => {
    if (!l.visible) return l
    const baseDur = 450

    // Call-to-action: most attention at higher intensities.
    if (isCta(l) || (opts.isLastScene && l.type === 'text' && (l.fontSize ?? 0) === maxFont)) {
      if (intensity === 'punchy') {
        return {
          ...l,
          anim: { in: 'pulse', durationMs: baseDur, periodMs: beatMs ?? 600 }
        }
      }
      if (intensity === 'normal') {
        return { ...l, anim: { in: 'pop', durationMs: baseDur } }
      }
      return { ...l, anim: { in: 'fadeIn', durationMs: baseDur } }
    }

    // Title (largest font on the slide).
    if (l.type === 'text' && (l.fontSize ?? 0) === maxFont && maxFont > 0) {
      if (intensity === 'punchy') {
        return { ...l, anim: { in: 'flash', durationMs: baseDur, periodMs: beatMs ?? undefined } }
      }
      const inType = intensity === 'subtle' ? 'fadeIn' : 'pop'
      return { ...l, anim: { in: inType, durationMs: baseDur } }
    }

    // Body text: staggered slide-up. Stagger snaps to the beat when available.
    if (l.type === 'text') {
      const step = beatMs ?? 300
      const delayMs = Math.min(sceneDurationMs - baseDur, (bodyIndex + 1) * step)
      bodyIndex++
      return { ...l, anim: { in: 'slideUp', durationMs: baseDur, delayMs: Math.max(0, delayMs) } }
    }

    // Visuals (images/shapes): gentle fade in. Punchy adds a shake accent.
    if (intensity === 'punchy' && (l.type === 'image' || l.type === 'rect' || l.type === 'circle')) {
      return { ...l, anim: { in: 'shake', durationMs: baseDur } }
    }
    return { ...l, anim: { in: 'fadeIn', durationMs: baseDur } }
  })
}

/**
 * Scale and center a page's layers into the target frame. Uniform scale by the
 * smaller axis ratio, then translate so the content is centered (letterbox).
 */
function fitLayers(layers: Layer[], pageW: number, pageH: number, w: number, h: number): Layer[] {
  const scale = Math.min(w / pageW, h / pageH)
  const offsetX = (w - pageW * scale) / 2
  const offsetY = (h - pageH * scale) / 2
  return layers.map((l) => ({
    ...l,
    x: l.x * scale + offsetX,
    y: l.y * scale + offsetY,
    width: l.width * scale,
    height: l.height * scale,
    fontSize: l.fontSize != null ? l.fontSize * scale : l.fontSize
  }))
}

/**
 * Convert design pages into video scenes. Durations come from reading time,
 * optionally snapped to the beat grid; each non-first scene gets a transition;
 * layers receive auto-animations sized to their (final) scene duration.
 */
export function pagesToScenes(pages: Page[], opts: ReelConvertOptions): ReelConvertResult {
  const wpm = opts.wpm ?? DEFAULTS.wpm
  const minSceneMs = opts.minSceneMs ?? DEFAULTS.minSceneMs
  const maxSceneMs = opts.maxSceneMs ?? DEFAULTS.maxSceneMs
  const transition = opts.transition ?? DEFAULTS.transition

  if (pages.length === 0) return { scenes: [], totalMs: 0 }

  // 1) Heuristic durations.
  const durations = pages.map((p) => estimateReadingMs(p, { wpm, minSceneMs, maxSceneMs }))

  // 2) Beat snapping (operate on cumulative boundaries, then back to durations).
  let finalDurations = durations
  if (opts.beats && opts.beats.length > 0) {
    const boundaries = [0]
    for (const d of durations) boundaries.push(boundaries[boundaries.length - 1] + d)
    const interval = beatIntervalMs(opts.beats) ?? 500
    const tol = Math.min(220, interval / 2)
    const snapped = snapBoundariesToBeats(boundaries, opts.beats, tol)
    finalDurations = []
    for (let i = 1; i < snapped.length; i++) {
      finalDurations.push(Math.max(minSceneMs, snapped[i] - snapped[i - 1]))
    }
  }

  // 3) Build scenes.
  const scenes: VideoScene[] = pages.map((page, i) => {
    const durationMs = finalDurations[i]
    const pageW = page.canvas.width
    const pageH = page.canvas.height
    let layers = page.layers
    if (opts.fit === 'fit9x16') {
      layers = fitLayers(layers, pageW, pageH, opts.width, opts.height)
    }
    const animated = autoAnimateLayers(layers, durationMs, {
      ...opts,
      isLastScene: i === pages.length - 1
    })
    // Re-id layers so the new video project owns independent layer ids.
    const sceneLayers = animated.map((l) => ({ ...l, id: uuid() }))
    return {
      id: uuid(),
      name: page.name || `Scene ${i + 1}`,
      durationMs,
      background:
        page.canvas.background === 'transparent' ? '#000000' : page.canvas.background,
      clip: null,
      layers: sceneLayers,
      transitionIn: i === 0 ? undefined : { type: transition, durationMs: 400 }
    }
  })

  const totalMs = finalDurations.reduce((a, b) => a + b, 0)
  return { scenes, totalMs }
}
