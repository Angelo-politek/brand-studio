import { v4 as uuid } from 'uuid'
import type { Brand, CanvasSpec, Layer, PanelComponentKind, PanelComponentParams } from '@shared/types'

/**
 * Built-in starter templates for static designs. Each produces a ready-made
 * { canvas, layers } pair so a new user always has something to open instead of
 * a blank page. Brand colors/fonts are applied when a brand is supplied.
 *
 * Mirrors the shape of reelTemplates.ts (build functions), but for the design
 * editor rather than the video timeline.
 */

export interface StarterTemplate {
  id: string
  name: string
  description: string
  /** Base canvas size; the build adapts text positions to it. */
  canvas: CanvasSpec
  build: (canvas: CanvasSpec, brand?: Brand | null) => Layer[]
}

interface Palette {
  bg: string
  primary: string
  text: string
  heading: string
  body: string
}

function paletteFor(brand?: Brand | null): Palette {
  const primary = brand?.colors[0]?.hex ?? '#f97316'
  return {
    bg: brand?.colors[1]?.hex ?? '#0b0d12',
    primary,
    text: '#ffffff',
    heading: brand?.fonts.find((f) => f.role === 'heading')?.family ?? 'Inter',
    body: brand?.fonts.find((f) => f.role === 'body')?.family ?? 'Inter'
  }
}

const baseLayer = (): Omit<Layer, 'id' | 'type' | 'name' | 'x' | 'y' | 'width' | 'height'> => ({
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false
})

function text(
  value: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  opts: Partial<Layer> = {}
): Layer {
  return {
    ...baseLayer(),
    id: uuid(),
    type: 'text',
    name: 'Text',
    x,
    y,
    width,
    height: Math.round(fontSize * 1.4),
    text: value,
    fontFamily: 'Inter',
    fontSize,
    fontStyle: 'normal',
    fill: '#ffffff',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    ...opts
  }
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opts: Partial<Layer> = {}
): Layer {
  return {
    ...baseLayer(),
    id: uuid(),
    type: 'rect',
    name: 'Background',
    x,
    y,
    width,
    height,
    fill,
    strokeWidth: 0,
    cornerRadius: 0,
    ...opts
  }
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'quote-card',
    name: 'Quote Card',
    description: 'Centered quote on a solid background.',
    canvas: { width: 1080, height: 1080, background: '#0b0d12' },
    build: (canvas, brand) => {
      const p = paletteFor(brand)
      const w = canvas.width * 0.8
      const x = (canvas.width - w) / 2
      return [
        rect(0, 0, canvas.width, canvas.height, p.bg, { name: 'Background', locked: true }),
        rect(x, canvas.height * 0.32, w * 0.12, 8, p.primary, { name: 'Accent' }),
        text('"Great design is invisible."', x, canvas.height * 0.4, w, 72, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: p.text
        }),
        text('— Your Name', x, canvas.height * 0.62, w, 36, {
          fontFamily: p.body,
          fill: p.primary
        })
      ]
    }
  },
  {
    id: 'promo-sale',
    name: 'Promo / Sale',
    description: 'Bold sale announcement with a highlight band.',
    canvas: { width: 1080, height: 1080, background: '#0b0d12' },
    build: (canvas, brand) => {
      const p = paletteFor(brand)
      const w = canvas.width * 0.84
      const x = (canvas.width - w) / 2
      return [
        rect(0, 0, canvas.width, canvas.height, p.bg, { name: 'Background', locked: true }),
        rect(0, canvas.height * 0.42, canvas.width, canvas.height * 0.16, p.primary, {
          name: 'Band'
        }),
        text('SUMMER SALE', x, canvas.height * 0.2, w, 96, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: p.text
        }),
        text('-50%', x, canvas.height * 0.44, w, 120, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: '#ffffff'
        }),
        text('Limited time only', x, canvas.height * 0.66, w, 40, {
          fontFamily: p.body,
          fill: p.text
        })
      ]
    }
  },
  {
    id: 'new-post',
    name: 'New Post',
    description: 'Simple title + subtitle announcement.',
    canvas: { width: 1080, height: 1350, background: '#0b0d12' },
    build: (canvas, brand) => {
      const p = paletteFor(brand)
      const w = canvas.width * 0.82
      const x = (canvas.width - w) / 2
      return [
        rect(0, 0, canvas.width, canvas.height, p.bg, { name: 'Background', locked: true }),
        text('Big News', x, canvas.height * 0.32, w, 110, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: p.primary
        }),
        text('Tell your audience what just happened.', x, canvas.height * 0.5, w, 44, {
          fontFamily: p.body,
          fill: p.text
        })
      ]
    }
  },
  {
    id: 'story-cover',
    name: 'Story / Reel Cover',
    description: 'Vertical cover with a centered headline.',
    canvas: { width: 1080, height: 1920, background: '#0b0d12' },
    build: (canvas, brand) => {
      const p = paletteFor(brand)
      const w = canvas.width * 0.82
      const x = (canvas.width - w) / 2
      return [
        rect(0, 0, canvas.width, canvas.height, p.bg, { name: 'Background', locked: true }),
        rect(x, canvas.height * 0.46, w * 0.18, 10, p.primary, { name: 'Accent' }),
        text('SWIPE UP', x, canvas.height * 0.5, w, 88, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: p.text
        }),
        text('Your story starts here', x, canvas.height * 0.62, w, 40, {
          fontFamily: p.body,
          fill: p.primary
        })
      ]
    }
  },
  {
    id: 'eurorack-vco',
    name: 'Eurorack module',
    description: 'VCO front panel mockup — knobs, jacks, LED (12HP).',
    canvas: { width: 610, height: 1285, background: '#d8dade' },
    build: (canvas, brand) => {
      const p = paletteFor(brand)
      const accent = p.primary
      const cx = canvas.width / 2
      const label = (t: string, x: number, y: number, w: number, size = 24): Layer =>
        text(t, x, y, w, size, { fill: '#17171a', fontFamily: p.body, align: 'center' })
      return [
        // Module name + brand strip
        text('VCO-1', cx - 200, 60, 400, 64, {
          fontFamily: p.heading,
          fontStyle: 'bold',
          fill: '#17171a'
        }),
        rect(cx - 90, 140, 180, 8, accent, { name: 'Accent' }),
        // Corner screws
        panel('screw', 20, 20, 30, 30),
        panel('screw', canvas.width - 50, 20, 30, 30),
        panel('screw', 20, canvas.height - 50, 30, 30),
        panel('screw', canvas.width - 50, canvas.height - 50, 30, 30),
        // Big frequency knob
        panel('knob', cx - 110, 220, 220, 220, { accent }),
        label('FREQ', cx - 100, 450, 200),
        // Fine + shape knobs
        panel('knob', 70, 540, 130, 130, { accent, value: 0.35 }),
        label('FINE', 60, 680, 150),
        panel('knob', canvas.width - 200, 540, 130, 130, { accent, value: 0.8 }),
        label('SHAPE', canvas.width - 210, 680, 150),
        // Wave toggle + activity LED
        panel('toggle', cx - 30, 760, 60, 100),
        label('SAW/SQR', cx - 100, 870, 200),
        panel('led', cx - 18, 930, 36, 36, { accent, on: true }),
        // Jack row
        panel('jack', 60, 1050, 70, 70),
        label('V/OCT', 40, 1130, 110, 20),
        panel('jack', 180, 1050, 70, 70),
        label('FM', 160, 1130, 110, 20),
        panel('jack', 300, 1050, 70, 70),
        label('SYNC', 280, 1130, 110, 20),
        panel('jack', 440, 1050, 70, 70, { accent: '#17171a' }),
        label('OUT', 420, 1130, 110, 20)
      ]
    }
  }
]

/** panelComponent layer helper for hardware mockup templates. */
function panel(
  kind: PanelComponentKind,
  x: number,
  y: number,
  width: number,
  height: number,
  params: PanelComponentParams = {}
): Layer {
  return {
    ...baseLayer(),
    id: uuid(),
    type: 'panelComponent',
    name: kind,
    x,
    y,
    width,
    height,
    component: { kind, params }
  }
}

export function starterById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id)
}
