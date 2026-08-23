import { describe, it, expect } from 'vitest'
import {
  HARDWARE_DPI,
  PRINT_DPI,
  SCREEN_DPI,
  clampScaleToCanvasLimit,
  exceedsCanvasLimit,
  formatPhysicalSize,
  inferDpi,
  physicalSize,
  pxToMm,
  pxToPt
} from '@renderer/lib/printSize'
import { presetByType } from '@renderer/lib/presets'

/** Nominal ISO / print sizes in millimetres. */
const NOMINAL_MM: Record<string, [number, number]> = {
  a5: [148, 210],
  a4: [210, 297],
  a3: [297, 420],
  flyer: [148, 210],
  poster: [420, 594]
}

describe('pxToPt / pxToMm', () => {
  it('maps 1 inch at any density to 72 points', () => {
    expect(pxToPt(300, 300)).toBeCloseTo(72, 10)
    expect(pxToPt(72, 72)).toBeCloseTo(72, 10)
    expect(pxToPt(254, 254)).toBeCloseTo(72, 10)
  })

  it('maps 1 inch to 25.4 mm', () => {
    expect(pxToMm(300, 300)).toBeCloseTo(25.4, 10)
  })

  it('is linear in pixels', () => {
    expect(pxToPt(600, 300)).toBeCloseTo(2 * pxToPt(300, 300), 10)
  })
})

describe('inferDpi', () => {
  it('detects the print presets as 300 DPI', () => {
    for (const type of Object.keys(NOMINAL_MM)) {
      const p = presetByType(type)!
      expect(inferDpi(p.width, p.height)).toBe(PRINT_DPI)
    }
  })

  it('detects hardware panel presets as 254 DPI (10 px/mm)', () => {
    const p = presetByType('eurorack_8hp')!
    expect(inferDpi(p.width, p.height)).toBe(HARDWARE_DPI)
  })

  it('treats social/screen canvases as 72 DPI', () => {
    expect(inferDpi(1080, 1080)).toBe(SCREEN_DPI)
    expect(inferDpi(1080, 1920)).toBe(SCREEN_DPI)
    expect(inferDpi(1200, 1200)).toBe(SCREEN_DPI)
  })

  it('treats arbitrary custom sizes as 72 DPI', () => {
    expect(inferDpi(777, 999)).toBe(SCREEN_DPI)
  })

  it('is orientation-insensitive (landscape A4 is still print)', () => {
    expect(inferDpi(3508, 2480)).toBe(PRINT_DPI)
  })

  it('resolves the A4-sized Product Sheet as print, not screen', () => {
    const p = presetByType('product_sheet')!
    expect(inferDpi(p.width, p.height)).toBe(PRINT_DPI)
  })
})

describe('physicalSize on print presets', () => {
  it.each(Object.entries(NOMINAL_MM))(
    '%s comes out at its nominal mm size within 0.5mm',
    (type, [mmW, mmH]) => {
      const p = presetByType(type)!
      const s = physicalSize(p.width, p.height)
      expect(s.dpi).toBe(PRINT_DPI)
      expect(Math.abs(s.widthMm - mmW)).toBeLessThan(0.5)
      expect(Math.abs(s.heightMm - mmH)).toBeLessThan(0.5)
    }
  )

  it('gives A4 the canonical ~595.3 x ~841.9 pt page box', () => {
    const p = presetByType('a4')!
    const s = physicalSize(p.width, p.height)
    // The preset stores whole pixels (2480 rather than 2480.3), so the page box
    // lands a fraction of a point under nominal -- ~0.03mm, far inside tolerance.
    expect(s.widthPt).toBeCloseTo(595.3, 0)
    expect(s.heightPt).toBeCloseTo(841.9, 0)
  })

  it('does NOT size the page in raw pixels (the bug being fixed)', () => {
    const p = presetByType('a4')!
    const s = physicalSize(p.width, p.height)
    expect(s.widthPt).not.toBeCloseTo(p.width, 0)
    // Raw pixels-as-points would have made A4 roughly 87 cm wide.
    expect(s.widthMm).toBeLessThan(300)
  })

  it('keeps hardware panels 1:1 in millimetres', () => {
    const p = presetByType('eurorack_8hp')!
    const s = physicalSize(p.width, p.height)
    expect(s.widthMm).toBeCloseTo(40.6, 1)
    expect(s.heightMm).toBeCloseTo(128.5, 1)
  })
})

describe('physicalSize on screen canvases', () => {
  it('renders a 1080x1080 post as 15 x 15 inches at 72 DPI', () => {
    const s = physicalSize(1080, 1080)
    expect(s.dpi).toBe(SCREEN_DPI)
    expect(s.widthPt).toBeCloseTo(1080, 10)
    expect(s.widthPt / 72).toBeCloseTo(15, 10)
  })

  it('never produces a microscopic page', () => {
    const s = physicalSize(1080, 1080)
    expect(s.widthMm).toBeGreaterThan(100)
  })
})

describe('physicalSize override', () => {
  it('honours an explicit dpi over the inferred one', () => {
    const s = physicalSize(1080, 1080, 300)
    expect(s.dpi).toBe(300)
    expect(s.widthMm).toBeCloseTo(91.44, 2)
  })

  it('ignores a zero or negative dpi and falls back to inference', () => {
    expect(physicalSize(2480, 3508, 0).dpi).toBe(PRINT_DPI)
    expect(physicalSize(2480, 3508, -10).dpi).toBe(PRINT_DPI)
  })

  it('halving the dpi doubles the physical size', () => {
    const a = physicalSize(1000, 1000, 300)
    const b = physicalSize(1000, 1000, 150)
    expect(b.widthMm).toBeCloseTo(a.widthMm * 2, 6)
  })
})

describe('formatPhysicalSize', () => {
  it('labels A4 in mm at 300 DPI', () => {
    const p = presetByType('a4')!
    expect(formatPhysicalSize(p.width, p.height)).toBe('210 × 297 mm @ 300 DPI')
  })

  it('adds an inch reading for screen-density canvases', () => {
    expect(formatPhysicalSize(1080, 1080)).toContain('15 × 15 in')
    expect(formatPhysicalSize(1080, 1080)).toContain('72 DPI')
  })

  it('reflects an override', () => {
    expect(formatPhysicalSize(1080, 1080, 300)).toBe('91.4 × 91.4 mm @ 300 DPI')
  })
})

describe('canvas size limit guard', () => {
  it('flags an A2 poster at 3x, which silently rasterizes blank', () => {
    const p = presetByType('poster')!
    // 4961 x 3 = 14883, 7016 x 3 = 21048 -> over the 16384 limit.
    expect(exceedsCanvasLimit(p.width, p.height, 3)).toBe(true)
  })

  it('accepts an A2 poster at 1x', () => {
    const p = presetByType('poster')!
    expect(exceedsCanvasLimit(p.width, p.height, 1)).toBe(false)
  })

  it('accepts a social post at 3x', () => {
    expect(exceedsCanvasLimit(1080, 1080, 3)).toBe(false)
  })

  it('clamps an over-limit scale to something that fits', () => {
    const p = presetByType('poster')!
    const s = clampScaleToCanvasLimit(p.width, p.height, 3)
    expect(s).toBeLessThan(3)
    expect(exceedsCanvasLimit(p.width, p.height, s)).toBe(false)
  })

  it('leaves an already-safe scale untouched', () => {
    expect(clampScaleToCanvasLimit(1080, 1080, 2)).toBe(2)
  })

  it('never clamps below 1x, even for a canvas bigger than the limit', () => {
    expect(clampScaleToCanvasLimit(20000, 20000, 3)).toBe(1)
  })

  it('handles a degenerate zero-size canvas without dividing by zero', () => {
    expect(clampScaleToCanvasLimit(0, 0, 2)).toBe(2)
  })
})
