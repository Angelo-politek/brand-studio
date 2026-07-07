import { v4 as uuid } from 'uuid'
import { defaultPanelSize, PANEL_DEFAULTS, PANEL_KIND_LABELS } from '@renderer/lib/panelShapes'
import type { CanvasSpec, Layer, LayerType, PanelComponentKind } from '@shared/types'

const base = (canvas: CanvasSpec): Omit<Layer, 'id' | 'type' | 'name'> => ({
  x: canvas.width / 2,
  y: canvas.height / 2,
  width: 200,
  height: 200,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false
})

let counter = 0
function nameFor(type: LayerType): string {
  counter += 1
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  return `${label} ${counter}`
}

export function createTextLayer(canvas: CanvasSpec, fontFamily = 'Inter'): Layer {
  return {
    ...base(canvas),
    id: uuid(),
    type: 'text',
    name: nameFor('text'),
    width: Math.min(600, canvas.width * 0.6),
    height: 80,
    x: canvas.width / 2 - Math.min(600, canvas.width * 0.6) / 2,
    y: canvas.height / 2 - 40,
    text: 'Your text here',
    fontFamily,
    fontSize: 64,
    fontStyle: 'normal',
    fill: '#ffffff',
    align: 'left',
    letterSpacing: 0,
    lineHeight: 1.2
  }
}

export function createShapeLayer(type: LayerType, canvas: CanvasSpec, fill = '#f97316'): Layer {
  const size = Math.min(canvas.width, canvas.height) * 0.3
  const common: Layer = {
    ...base(canvas),
    id: uuid(),
    type,
    name: nameFor(type),
    width: size,
    height: size,
    x: canvas.width / 2 - size / 2,
    y: canvas.height / 2 - size / 2,
    fill,
    strokeColor: '#000000',
    strokeWidth: 0
  }
  if (type === 'rect') common.cornerRadius = 0
  if (type === 'polygon') common.sides = 6
  if (type === 'line') {
    common.points = [0, 0, size, 0]
    common.strokeColor = '#ffffff'
    common.strokeWidth = 8
    common.height = 8
  }
  if (type === 'arrow') {
    common.points = [0, 0, size, 0]
    common.strokeColor = '#ffffff'
    common.strokeWidth = 8
    common.pointerLength = 20
    common.pointerWidth = 20
    common.height = 24
  }
  return common
}

export function createPanelComponent(
  kind: PanelComponentKind,
  canvas: CanvasSpec,
  accent?: string
): Layer {
  const { width, height } = defaultPanelSize(kind)
  counter += 1
  return {
    ...base(canvas),
    id: uuid(),
    type: 'panelComponent',
    name: `${PANEL_KIND_LABELS[kind]} ${counter}`,
    width,
    height,
    x: canvas.width / 2 - width / 2,
    y: canvas.height / 2 - height / 2,
    component: {
      kind,
      params: { ...PANEL_DEFAULTS[kind], ...(accent ? { accent } : {}) }
    }
  }
}

export function createIconLayer(name: string, canvas: CanvasSpec, color = '#111111'): Layer {
  const size = Math.min(canvas.width, canvas.height) * 0.2
  counter += 1
  return {
    ...base(canvas),
    id: uuid(),
    type: 'icon',
    name: `Icon ${counter}`,
    width: size,
    height: size,
    x: canvas.width / 2 - size / 2,
    y: canvas.height / 2 - size / 2,
    fill: color,
    icon: { name }
  }
}

export function createImageLayer(
  canvas: CanvasSpec,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  name = 'Image'
): Layer {
  const maxW = canvas.width * 0.6
  const ratio = naturalHeight / naturalWidth || 1
  const width = Math.min(naturalWidth, maxW)
  const height = width * ratio
  return {
    ...base(canvas),
    id: uuid(),
    type: 'image',
    name,
    width,
    height,
    x: canvas.width / 2 - width / 2,
    y: canvas.height / 2 - height / 2,
    src,
    filters: {}
  }
}
