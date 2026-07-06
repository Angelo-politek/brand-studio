import type { Layer } from '@shared/types'

/**
 * Apply a layer's enter/exit animation for preview, given the playhead position
 * within the scene and the scene's total duration. Returns a NEW layer with
 * opacity / position / scale adjusted — never mutates the input.
 *
 * Mirrors the design intent that the export pipeline will reproduce.
 *
 * `anim.delayMs` shifts the local clock: the enter animation starts at
 * `delayMs` into the scene (used for staggered/beat-synced reveals). Before the
 * delay, the layer is rendered in its enter "start" state (hidden/offset).
 *
 * Looping effects (pulse/flash) repeat on `anim.periodMs` when set, so they can
 * lock to the music tempo; otherwise they run once over `durationMs`.
 */
export function animateLayer(layer: Layer, playheadMs: number, sceneDurationMs: number): Layer {
  const anim = layer.anim
  if (!anim || (anim.in === 'none' && anim.out === 'none')) return layer
  const d = anim.durationMs ?? 500
  const delay = anim.delayMs ?? 0

  // Local clock for the enter animation (offset by delay).
  const tIn = playheadMs - delay

  let progressIn = 1 // 0 = start of enter, 1 = fully in
  if (anim.in && anim.in !== 'none') {
    progressIn = Math.max(0, Math.min(1, tIn / d))
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
    case 'flash': {
      // Blink a few times during the effect window, then settle to full opacity.
      if (tIn < 0) {
        opacity = 0
      } else {
        const cycles = 3
        const period = anim.periodMs && anim.periodMs > 0 ? anim.periodMs : d / cycles
        // Square-ish wave: bright on the first half of each period, dim on the second.
        const phase = (tIn % period) / period
        const on = phase < 0.5
        // After the effect window, stay fully visible (no perpetual blinking
        // unless an explicit period keeps it going for the whole scene).
        if (!anim.periodMs && tIn >= d) opacity = layer.opacity
        else opacity = layer.opacity * (on ? 1 : 0.15)
      }
      break
    }
    case 'pulse': {
      // Continuous gentle heartbeat scaling, optionally locked to the beat.
      if (tIn < 0) {
        opacity = 0
      } else {
        const period = anim.periodMs && anim.periodMs > 0 ? anim.periodMs : 600
        const amp = 0.08
        const s = 1 + amp * Math.max(0, Math.sin((2 * Math.PI * tIn) / period))
        scaleX *= s
        scaleY *= s
      }
      break
    }
    case 'shake': {
      // Horizontal jitter that decays over the effect window.
      if (tIn < 0) {
        opacity = 0
      } else if (tIn < d) {
        const decay = 1 - tIn / d
        const amp = 14 * decay
        const freq = 0.05 // rad per ms ≈ ~8 Hz
        x += amp * Math.sin(tIn * freq)
      }
      break
    }
    default:
      break
  }

  // Exit (fade only for now)
  if (anim.out === 'fadeOut') opacity *= progressOut

  return { ...layer, opacity, x, y, scaleX, scaleY }
}
