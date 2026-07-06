import type { PanelComponentKind, PanelComponentParams } from '@shared/types'

/**
 * Pure geometry for hardware front-panel components (music-gear mockups).
 *
 * `buildPanelPrimitives` turns (kind, params, box size) into a flat list of
 * drawing primitives in layer-local coordinates. Two consumers render them:
 * the live editor node (react-konva) and the export path (imperative Konva) —
 * one source of truth, so the canvas and the exported PNG/MP4 always match.
 */

export type PanelPrimitive =
  | {
      kind: 'circle'
      x: number
      y: number
      radius: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      shadowColor?: string
      shadowBlur?: number
      opacity?: number
    }
  | {
      kind: 'rect'
      x: number
      y: number
      width: number
      height: number
      cornerRadius?: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }
  | {
      kind: 'line'
      points: number[]
      stroke: string
      strokeWidth: number
      lineCap?: 'butt' | 'round' | 'square'
      opacity?: number
    }
  | {
      kind: 'polygon'
      x: number
      y: number
      radius: number
      sides: number
      rotation?: number
      fill?: string
      stroke?: string
      strokeWidth?: number
    }
  | {
      kind: 'text'
      x: number
      y: number
      width: number
      text: string
      fontSize: number
      fontFamily: string
      fill: string
      align: 'left' | 'center' | 'right'
      opacity?: number
    }

/** Sensible defaults per component kind (merged under user params). */
export const PANEL_DEFAULTS: Record<PanelComponentKind, Required<PanelComponentParams>> = {
  knob: { color: '#2b2b31', accent: '#f97316', value: 0.65, ticks: 11, on: true, text: '' },
  encoder: { color: '#26262c', accent: '#e8e8ec', value: 0.5, ticks: 0, on: true, text: '' },
  fader: { color: '#2b2b31', accent: '#f97316', value: 0.7, ticks: 9, on: true, text: '' },
  jack: { color: '#9aa0a6', accent: '#0b0b0d', value: 0, ticks: 0, on: true, text: '' },
  led: { color: '#1a1a1e', accent: '#ff3b30', value: 0, ticks: 0, on: true, text: '' },
  toggle: { color: '#9aa0a6', accent: '#c0c4c9', value: 1, ticks: 0, on: true, text: '' },
  pushbutton: { color: '#2b2b31', accent: '#f97316', value: 0, ticks: 0, on: false, text: '' },
  screw: { color: '#9aa0a6', accent: '#55585e', value: 0.3, ticks: 0, on: true, text: '' },
  display7seg: { color: '#160404', accent: '#ff3b30', value: 0, ticks: 0, on: true, text: '120' },
  displayOled: {
    color: '#05070d',
    accent: '#7ecbff',
    value: 0,
    ticks: 0,
    on: true,
    text: 'OSC A\nSAW  50%'
  }
}

/** Human labels for the elements panel / inspector. */
export const PANEL_KIND_LABELS: Record<PanelComponentKind, string> = {
  knob: 'Knob',
  encoder: 'Encoder',
  fader: 'Fader',
  jack: 'Jack',
  led: 'LED',
  toggle: 'Toggle',
  pushbutton: 'Button',
  screw: 'Screw',
  display7seg: '7-seg display',
  displayOled: 'OLED display'
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** Pot sweep: 270° clockwise from 135° (lower-left) to 45° (lower-right). */
function knobAngleDeg(value: number): number {
  return 135 + clamp01(value) * 270
}

const rad = (deg: number): number => (deg * Math.PI) / 180

export function buildPanelPrimitives(
  kind: PanelComponentKind,
  userParams: PanelComponentParams,
  w: number,
  h: number
): PanelPrimitive[] {
  const p = { ...PANEL_DEFAULTS[kind], ...userParams }
  const cx = w / 2
  const cy = h / 2
  const s = Math.min(w, h)
  const R = s / 2
  const out: PanelPrimitive[] = []

  switch (kind) {
    case 'knob': {
      // Sweep ticks around the bezel.
      if (p.ticks > 1) {
        for (let i = 0; i < p.ticks; i++) {
          const a = rad(135 + (i * 270) / (p.ticks - 1))
          out.push({
            kind: 'line',
            points: [
              cx + Math.cos(a) * R * 0.86,
              cy + Math.sin(a) * R * 0.86,
              cx + Math.cos(a) * R * 0.98,
              cy + Math.sin(a) * R * 0.98
            ],
            stroke: '#8a8f98',
            strokeWidth: Math.max(1, s * 0.015)
          })
        }
      }
      out.push({ kind: 'circle', x: cx, y: cy, radius: R * 0.78, fill: '#101014' })
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.66,
        fill: p.color,
        stroke: '#000000',
        strokeWidth: Math.max(1, s * 0.01)
      })
      const a = rad(knobAngleDeg(p.value))
      out.push({
        kind: 'line',
        points: [
          cx + Math.cos(a) * R * 0.18,
          cy + Math.sin(a) * R * 0.18,
          cx + Math.cos(a) * R * 0.6,
          cy + Math.sin(a) * R * 0.6
        ],
        stroke: p.accent,
        strokeWidth: Math.max(2, s * 0.06),
        lineCap: 'round'
      })
      break
    }

    case 'encoder': {
      out.push({ kind: 'circle', x: cx, y: cy, radius: R * 0.95, fill: '#101014' })
      out.push({ kind: 'circle', x: cx, y: cy, radius: R * 0.82, fill: p.color })
      // Knurled edge: short radial dashes all around the cap.
      const knurls = 24
      for (let i = 0; i < knurls; i++) {
        const a = rad((i * 360) / knurls)
        out.push({
          kind: 'line',
          points: [
            cx + Math.cos(a) * R * 0.68,
            cy + Math.sin(a) * R * 0.68,
            cx + Math.cos(a) * R * 0.82,
            cy + Math.sin(a) * R * 0.82
          ],
          stroke: '#0c0c0f',
          strokeWidth: Math.max(1, s * 0.02)
        })
      }
      const a = rad(knobAngleDeg(p.value))
      out.push({
        kind: 'circle',
        x: cx + Math.cos(a) * R * 0.45,
        y: cy + Math.sin(a) * R * 0.45,
        radius: Math.max(1.5, s * 0.045),
        fill: p.accent
      })
      break
    }

    case 'fader': {
      const trackW = Math.max(3, w * 0.14)
      const pad = h * 0.06
      // Lane ticks.
      if (p.ticks > 1) {
        for (let i = 0; i < p.ticks; i++) {
          const y = pad + ((h - 2 * pad) * i) / (p.ticks - 1)
          out.push({
            kind: 'line',
            points: [cx - w * 0.32, y, cx - trackW * 0.9, y],
            stroke: '#8a8f98',
            strokeWidth: Math.max(1, s * 0.01)
          })
          out.push({
            kind: 'line',
            points: [cx + trackW * 0.9, y, cx + w * 0.32, y],
            stroke: '#8a8f98',
            strokeWidth: Math.max(1, s * 0.01)
          })
        }
      }
      out.push({
        kind: 'rect',
        x: cx - trackW / 2,
        y: pad,
        width: trackW,
        height: h - 2 * pad,
        cornerRadius: trackW / 2,
        fill: '#101014'
      })
      const handleH = Math.max(8, h * 0.14)
      const travel = h - 2 * pad - handleH
      const hy = pad + (1 - clamp01(p.value)) * travel
      out.push({
        kind: 'rect',
        x: cx - w * 0.4,
        y: hy,
        width: w * 0.8,
        height: handleH,
        cornerRadius: Math.min(6, handleH * 0.25),
        fill: p.color,
        stroke: '#000000',
        strokeWidth: 1
      })
      out.push({
        kind: 'line',
        points: [cx - w * 0.4, hy + handleH / 2, cx + w * 0.4, hy + handleH / 2],
        stroke: p.accent,
        strokeWidth: Math.max(2, handleH * 0.16)
      })
      break
    }

    case 'jack': {
      out.push({
        kind: 'polygon',
        x: cx,
        y: cy,
        radius: R * 0.95,
        sides: 6,
        rotation: 30,
        fill: p.color,
        stroke: '#5f6368',
        strokeWidth: Math.max(1, s * 0.02)
      })
      out.push({ kind: 'circle', x: cx, y: cy, radius: R * 0.55, fill: '#3c4043' })
      out.push({ kind: 'circle', x: cx, y: cy, radius: R * 0.32, fill: p.accent })
      break
    }

    case 'led': {
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.62,
        fill: p.color,
        stroke: '#000000',
        strokeWidth: 1
      })
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.45,
        fill: p.accent,
        opacity: p.on ? 1 : 0.25,
        ...(p.on ? { shadowColor: p.accent, shadowBlur: s * 0.5 } : {})
      })
      break
    }

    case 'toggle': {
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.42,
        fill: p.color,
        stroke: '#5f6368',
        strokeWidth: Math.max(1, s * 0.02)
      })
      const up = clamp01(p.value) >= 0.5
      const tipY = up ? cy - R * 0.85 : cy + R * 0.85
      out.push({
        kind: 'line',
        points: [cx, cy, cx, tipY],
        stroke: p.accent,
        strokeWidth: Math.max(3, s * 0.18),
        lineCap: 'round'
      })
      out.push({
        kind: 'circle',
        x: cx,
        y: tipY,
        radius: Math.max(2.5, s * 0.13),
        fill: p.accent,
        stroke: '#5f6368',
        strokeWidth: 1
      })
      break
    }

    case 'pushbutton': {
      out.push({
        kind: 'rect',
        x: cx - R * 0.95,
        y: cy - R * 0.95,
        width: R * 1.9,
        height: R * 1.9,
        cornerRadius: R * 0.3,
        fill: '#101014',
        stroke: '#000000',
        strokeWidth: 1
      })
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.62,
        fill: p.color,
        ...(p.on ? { shadowColor: p.accent, shadowBlur: s * 0.35 } : {})
      })
      if (p.on) {
        out.push({
          kind: 'circle',
          x: cx,
          y: cy,
          radius: R * 0.62,
          fill: undefined,
          stroke: p.accent,
          strokeWidth: Math.max(2, s * 0.05)
        })
      }
      break
    }

    case 'screw': {
      out.push({
        kind: 'circle',
        x: cx,
        y: cy,
        radius: R * 0.85,
        fill: p.color,
        stroke: '#5f6368',
        strokeWidth: Math.max(1, s * 0.02)
      })
      const a = rad(clamp01(p.value) * 180)
      out.push({
        kind: 'line',
        points: [
          cx - Math.cos(a) * R * 0.6,
          cy - Math.sin(a) * R * 0.6,
          cx + Math.cos(a) * R * 0.6,
          cy + Math.sin(a) * R * 0.6
        ],
        stroke: p.accent,
        strokeWidth: Math.max(2, s * 0.09)
      })
      break
    }

    case 'display7seg': {
      out.push({
        kind: 'rect',
        x: 0,
        y: 0,
        width: w,
        height: h,
        cornerRadius: Math.min(8, s * 0.08),
        fill: p.color,
        stroke: '#000000',
        strokeWidth: 1
      })
      out.push({
        kind: 'text',
        x: 0,
        y: h * 0.18,
        width: w,
        text: p.text || '888',
        fontSize: h * 0.62,
        fontFamily: 'Consolas, monospace',
        fill: p.accent,
        align: 'center',
        opacity: p.on ? 1 : 0.2
      })
      break
    }

    case 'displayOled': {
      out.push({
        kind: 'rect',
        x: 0,
        y: 0,
        width: w,
        height: h,
        cornerRadius: Math.min(6, s * 0.06),
        fill: p.color,
        stroke: '#1c2733',
        strokeWidth: 1
      })
      out.push({
        kind: 'text',
        x: w * 0.08,
        y: h * 0.14,
        width: w * 0.84,
        text: p.text || '',
        fontSize: Math.max(8, h * 0.24),
        fontFamily: 'Consolas, monospace',
        fill: p.accent,
        align: 'left',
        opacity: p.on ? 1 : 0.2
      })
      break
    }
  }

  return out
}

/** Default layer box size (px) per kind, at typical mockup scale. */
export function defaultPanelSize(kind: PanelComponentKind): { width: number; height: number } {
  switch (kind) {
    case 'knob':
    case 'encoder':
      return { width: 120, height: 120 }
    case 'fader':
      return { width: 70, height: 260 }
    case 'jack':
      return { width: 70, height: 70 }
    case 'led':
      return { width: 36, height: 36 }
    case 'toggle':
      return { width: 60, height: 100 }
    case 'pushbutton':
      return { width: 80, height: 80 }
    case 'screw':
      return { width: 30, height: 30 }
    case 'display7seg':
      return { width: 220, height: 90 }
    case 'displayOled':
      return { width: 260, height: 130 }
  }
}
