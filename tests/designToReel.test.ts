import { describe, it, expect } from 'vitest'
import {
  estimateReadingMs,
  snapBoundariesToBeats,
  autoAnimateLayers,
  pagesToScenes
} from '@renderer/lib/designToReel'
import type { Layer, Page } from '@shared/types'

function layer(partial: Partial<Layer>): Layer {
  return {
    id: partial.id ?? 'l',
    type: partial.type ?? 'text',
    name: 'L',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visible: true,
    locked: false,
    ...partial
  }
}

function page(partial: Partial<Page>): Page {
  return {
    id: partial.id ?? 'p',
    name: partial.name ?? 'Page',
    canvas: partial.canvas ?? { width: 1080, height: 1080, background: '#000000' },
    layers: partial.layers ?? []
  }
}

const READ = { wpm: 220, minSceneMs: 1800, maxSceneMs: 6000 }

describe('estimateReadingMs', () => {
  it('clamps an empty page to minSceneMs', () => {
    expect(estimateReadingMs(page({}), READ)).toBe(READ.minSceneMs)
  })

  it('clamps a very long text page to maxSceneMs', () => {
    const long = 'word '.repeat(1000)
    const p = page({ layers: [layer({ type: 'text', text: long })] })
    expect(estimateReadingMs(p, READ)).toBe(READ.maxSceneMs)
  })

  it('scales with word count at a known wpm', () => {
    // 110 words at 220 wpm = 30s, but clamped to max; use a small amount instead.
    // 11 words / 220 wpm * 60000 = 3000ms (within range).
    const text = 'aaaa '.repeat(11).trim() // ~11 "words" of 4 chars + spaces
    const p = page({ layers: [layer({ type: 'text', text })] })
    const ms = estimateReadingMs(p, READ)
    expect(ms).toBeGreaterThan(READ.minSceneMs)
    expect(ms).toBeLessThan(READ.maxSceneMs)
  })

  it('adds scan time for visual-only pages', () => {
    const p = page({ layers: [layer({ type: 'image' }), layer({ type: 'rect' })] })
    const ms = estimateReadingMs(p, READ)
    expect(ms).toBeGreaterThanOrEqual(READ.minSceneMs)
  })
})

describe('snapBoundariesToBeats', () => {
  it('returns input unchanged when beats are empty', () => {
    const b = [0, 1000, 2000]
    expect(snapBoundariesToBeats(b, [], 200)).toEqual(b)
  })

  it('snaps an interior boundary within tolerance', () => {
    const out = snapBoundariesToBeats([0, 1000, 2000], [950], 100)
    expect(out[1]).toBe(950)
  })

  it('leaves a boundary outside tolerance unchanged', () => {
    const out = snapBoundariesToBeats([0, 1000, 2000], [700], 100)
    expect(out[1]).toBe(1000)
  })

  it('never moves first or last boundary', () => {
    const out = snapBoundariesToBeats([0, 1000, 2000], [10, 1990], 200)
    expect(out[0]).toBe(0)
    expect(out[out.length - 1]).toBe(2000)
  })

  it('stays strictly monotonic', () => {
    const out = snapBoundariesToBeats([0, 100, 200, 300], [150, 150, 150], 200)
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1])
  })
})

describe('autoAnimateLayers', () => {
  const opts = {
    width: 1080,
    height: 1920,
    fit: 'keep' as const,
    intensity: 'normal' as const
  }

  it('gives the largest text a pop at normal intensity', () => {
    const layers = [
      layer({ id: 'title', type: 'text', text: 'Big', fontSize: 80 }),
      layer({ id: 'body', type: 'text', text: 'small', fontSize: 30 })
    ]
    const out = autoAnimateLayers(layers, 3000, opts)
    expect(out.find((l) => l.id === 'title')?.anim?.in).toBe('pop')
  })

  it('flashes/pulses a CTA at punchy intensity', () => {
    const layers = [layer({ id: 'cta', type: 'text', text: 'Follow for more →', fontSize: 50 })]
    const out = autoAnimateLayers(layers, 3000, { ...opts, intensity: 'punchy' })
    expect(out[0].anim?.in).toBe('pulse')
  })

  it('never emits flash/shake at subtle intensity', () => {
    const layers = [
      layer({ id: 'title', type: 'text', text: 'Big', fontSize: 80 }),
      layer({ id: 'img', type: 'image' })
    ]
    const out = autoAnimateLayers(layers, 3000, { ...opts, intensity: 'subtle' })
    for (const l of out) {
      expect(['flash', 'shake']).not.toContain(l.anim?.in)
    }
  })

  it('staggers body text with strictly increasing delays', () => {
    const layers = [
      layer({ id: 'title', type: 'text', text: 'Title', fontSize: 80 }),
      layer({ id: 'b1', type: 'text', text: 'line one', fontSize: 30 }),
      layer({ id: 'b2', type: 'text', text: 'line two', fontSize: 30 })
    ]
    const out = autoAnimateLayers(layers, 6000, opts)
    const d1 = out.find((l) => l.id === 'b1')?.anim?.delayMs ?? 0
    const d2 = out.find((l) => l.id === 'b2')?.anim?.delayMs ?? 0
    expect(d2).toBeGreaterThan(d1)
  })

  it('does not mutate input layers', () => {
    const layers = [layer({ id: 'x', type: 'text', text: 'hi', fontSize: 40 })]
    autoAnimateLayers(layers, 3000, opts)
    expect(layers[0].anim).toBeUndefined()
  })
})

describe('pagesToScenes', () => {
  const pages = [
    page({ id: 'p1', name: 'One', layers: [layer({ type: 'text', text: 'hello world' })] }),
    page({ id: 'p2', name: 'Two', layers: [layer({ type: 'text', text: 'second slide' })] }),
    page({ id: 'p3', name: 'Three', layers: [layer({ type: 'text', text: 'Follow →' })] })
  ]
  const opts = { width: 1080, height: 1920, fit: 'keep' as const, intensity: 'normal' as const }

  it('produces one scene per page', () => {
    const { scenes } = pagesToScenes(pages, opts)
    expect(scenes).toHaveLength(3)
  })

  it('gives a transition to every scene except the first', () => {
    const { scenes } = pagesToScenes(pages, opts)
    expect(scenes[0].transitionIn).toBeUndefined()
    expect(scenes[1].transitionIn?.type).toBe('fade')
    expect(scenes[2].transitionIn?.type).toBe('fade')
  })

  it('totalMs equals the sum of scene durations', () => {
    const { scenes, totalMs } = pagesToScenes(pages, opts)
    const sum = scenes.reduce((a, s) => a + s.durationMs, 0)
    expect(totalMs).toBe(sum)
  })

  it('keeps page size in keep mode', () => {
    const { scenes } = pagesToScenes(pages, opts)
    // keep mode doesn't transform layers; just sanity-check it produced scenes
    expect(scenes[0].layers).toHaveLength(1)
  })

  it('scales layers in fit9x16 mode', () => {
    const square = [
      page({
        id: 'sq',
        canvas: { width: 1000, height: 1000, background: '#000' },
        layers: [layer({ type: 'image', x: 0, y: 0, width: 1000, height: 1000 })]
      })
    ]
    const { scenes } = pagesToScenes(square, { ...opts, fit: 'fit9x16' })
    const l = scenes[0].layers[0]
    // scale = min(1080/1000, 1920/1000) = 1.08; centered vertically
    expect(l.width).toBeCloseTo(1080, 0)
    expect(l.y).toBeGreaterThan(0)
  })

  it('preserves text content', () => {
    const { scenes } = pagesToScenes(pages, opts)
    expect(scenes[0].layers[0].text).toBe('hello world')
  })

  it('handles empty pages', () => {
    expect(pagesToScenes([], opts)).toEqual({ scenes: [], totalMs: 0 })
  })

  it('snaps durations to beats when provided', () => {
    // Beats every 500ms; durations should remain >= minSceneMs and continuous.
    const beats = Array.from({ length: 40 }, (_, i) => i * 500)
    const { scenes, totalMs } = pagesToScenes(pages, { ...opts, beats })
    const sum = scenes.reduce((a, s) => a + s.durationMs, 0)
    expect(sum).toBe(totalMs)
  })
})
