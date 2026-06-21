import type { Layer } from '@shared/types'

/**
 * Apply a layer's enter/exit animation for preview, given the playhead position
 * within the scene and the scene's total duration. Returns a NEW layer with
 * opacity / position / scale adjusted — never mutates the input.
 *
 * Mirrors the design intent that the export pipeline will reproduce.
 */
export function animateLayer(layer: Layer, playheadMs: number, sceneDurationMs: number): Layer {
  const anim = layer.anim
  if (!anim || (anim.in === 'none' && anim.out === 'none')) return layer
  const d = anim.durationMs ?? 500

  let progressIn = 1 // 0 = start of enter, 1 = fully in
  if (anim.in && anim.in !== 'none') {
    progressIn = Math.max(0, Math.min(1, playheadMs / d))
  }

  let progressOut = 1 // 1 = not yet leaving, 0 = fully out
  if (anim.out && anim.out !== 'none') {
    const outStart = sceneDurationMs - d
    progressOut = playheadMs < outStart ? 1 : Math.max(0, 1 - (playheadMs - outStart) / d)
  }

  let opacity = layer.opacity
  let x = layer.x
  let y = layer.y
  let scaleX = layer.scaleX
  let scaleY = layer.scaleY

  // Enter
  switch (anim.in) {
    case 'fadeIn':
      opacity *= progressIn
      break
    case 'slideUp':
      opacity *= progressIn
      y += (1 - progressIn) * 60
      break
    case 'pop': {
      opacity *= progressIn
      const s = 0.7 + 0.3 * progressIn
      scaleX *= s
      scaleY *= s
      break
    }
    default:
      break
  }

  // Exit (fade only for now)
  if (anim.out === 'fadeOut') opacity *= progressOut

  return { ...layer, opacity, x, y, scaleX, scaleY }
}
