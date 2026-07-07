import type Konva from 'konva'

/**
 * Custom Konva filter: color temperature. Warm (+) pushes red and pulls blue,
 * cold (−) does the opposite. The node must expose `temperature` (-1..1) via
 * getAttr — wired as a plain prop on the Konva.Image.
 */
export function Temperature(this: Konva.Node, imageData: ImageData): void {
  const t = (this.getAttr('temperature') as number) ?? 0
  if (t) applyTemperature(imageData.data, t)
}

/** Pure core (unit-tested): shift R up and B down by up to ±40/255 per unit. */
export function applyTemperature(data: Uint8ClampedArray, t: number): void {
  const shift = Math.max(-1, Math.min(1, t)) * 40
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] + shift))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] - shift))
  }
}
