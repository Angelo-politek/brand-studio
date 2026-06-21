import { v4 as uuid } from 'uuid'
import type { Layer, VideoScene } from '@shared/types'

/**
 * Starter reel templates: ready-made scene sequences with animated text and
 * transitions. Clips are left empty (placeholders) so the user just drops in
 * their videos. Scenes are generated at the project's width/height so text is
 * centered correctly for any format.
 */
export interface ReelTemplate {
  id: string
  name: string
  description: string
  build: (width: number, height: number) => VideoScene[]
}

function textLayer(
  text: string,
  width: number,
  height: number,
  opts: Partial<Layer> = {}
): Layer {
  const boxW = width * 0.8
  return {
    id: uuid(),
    type: 'text',
    name: 'Text',
    x: width / 2 - boxW / 2,
    y: height * 0.4,
    width: boxW,
    height: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    visible: true,
    locked: false,
    text,
    fontFamily: 'Inter',
    fontSize: Math.round(width * 0.075),
    fontStyle: 'bold',
    fill: '#ffffff',
    align: 'center',
    lineHeight: 1.15,
    shadowColor: '#000000',
    shadowBlur: 12,
    anim: { in: 'slideUp', out: 'fadeOut', durationMs: 450 },
    ...opts
  }
}

function scene(name: string, durationMs: number, layers: Layer[], transition = true): VideoScene {
  return {
    id: uuid(),
    name,
    durationMs,
    background: '#000000',
    clip: null,
    layers,
    transitionIn: transition ? { type: 'fade', durationMs: 400 } : undefined
  }
}

export const REEL_TEMPLATES: ReelTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from an empty timeline.',
    build: () => [scene('Scene 1', 4000, [], false)]
  },
  {
    id: 'hook_points_cta',
    name: 'Hook + 3 points + CTA',
    description: 'Classic value reel: a hook, three quick points, a call to action.',
    build: (w, h) => [
      scene('Hook', 3000, [textLayer('Stop scrolling 🛑', w, h)], false),
      scene('Point 1', 3000, [textLayer('Tip #1', w, h)]),
      scene('Point 2', 3000, [textLayer('Tip #2', w, h)]),
      scene('Point 3', 3000, [textLayer('Tip #3', w, h)]),
      scene('CTA', 3000, [textLayer('Follow for more →', w, h, { fill: '#f97316' })])
    ]
  },
  {
    id: 'before_after',
    name: 'Before / After',
    description: 'Two scenes to show a transformation.',
    build: (w, h) => [
      scene('Before', 3000, [textLayer('BEFORE', w, h, { anim: { in: 'fadeIn', durationMs: 350 } })], false),
      scene('After', 3000, [textLayer('AFTER', w, h, { fill: '#22c55e', anim: { in: 'pop', durationMs: 450 } })])
    ]
  },
  {
    id: 'quote',
    name: 'Quote reel',
    description: 'A single bold quote over your clip.',
    build: (w, h) => [
      scene('Quote', 5000, [
        textLayer('"Your bold quote here."', w, h, {
          fontSize: Math.round(w * 0.09),
          anim: { in: 'fadeIn', out: 'fadeOut', durationMs: 600 }
        })
      ], false)
    ]
  }
]
