import { useEffect, useRef } from 'react'
import Konva from 'konva'
import { Text, Rect, Image as KonvaImage, Group, Ellipse, RegularPolygon, Line, Arrow } from 'react-konva'
import type { KonvaEventObject, Filter } from 'konva/lib/Node'
import { mediaUrl } from '@shared/ipc'
import { useImage } from '@renderer/lib/useImage'
import type { Layer } from '@shared/types'

interface NodeCtx {
  isSelected: boolean
  onSelect: (additive: boolean) => void
  onChange: (patch: Partial<Layer>) => void
  snap: boolean
  gridSize: number
  /** Called during drag; return snapped {x,y} to override position. */
  onDragMove?: (id: string, x: number, y: number) => { x: number; y: number } | null
  onDragEnd?: (id: string) => void
}

function useCommon(layer: Layer, ctx: NodeCtx): Record<string, unknown> {
  return {
    id: layer.id,
    name: 'layer',
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => ctx.onSelect(e.evt.shiftKey),
    onTap: () => ctx.onSelect(false),
    onDragMove: ctx.onDragMove
      ? (e: KonvaEventObject<DragEvent>) => {
          const snapped = ctx.onDragMove!(layer.id, e.target.x(), e.target.y())
          if (snapped) e.target.position(snapped)
        }
      : undefined,
    onDragEnd: (e: KonvaEventObject<DragEvent>) => {
      let nx = e.target.x()
      let ny = e.target.y()
      if (ctx.snap) {
        nx = Math.round(nx / ctx.gridSize) * ctx.gridSize
        ny = Math.round(ny / ctx.gridSize) * ctx.gridSize
        e.target.position({ x: nx, y: ny })
      }
      ctx.onDragEnd?.(layer.id)
      ctx.onChange({ x: nx, y: ny })
    },
    onTransformEnd: (e: KonvaEventObject<Event>) => {
      const n = e.target
      const stage = n.getStage()
      const tr = stage?.findOne('Transformer') as Konva.Transformer | undefined
      // Single-selection resize gets type-aware behaviour; multi-select (or
      // unknown anchor) falls back to plain scaling of the group.
      const anchor = tr && tr.nodes().length === 1 ? tr.getActiveAnchor() : null
      const patch = resolveTransform(layer, n, anchor)
      ctx.onChange(patch)
      // Reset the node's scale so width/height/fontSize become the source of
      // truth and the next transform starts clean.
      n.scaleX(1)
      n.scaleY(1)
    }
  }
}

const SIDE_ANCHORS = new Set(['middle-left', 'middle-right', 'top-center', 'bottom-center'])

/**
 * Convert a Konva transform (which applies scaleX/scaleY) into a normalized
 * layer patch. Corner anchors resize; side anchors crop (images) or reflow
 * (text). Returns scaleX/scaleY = 1 so dimensions stay the source of truth.
 */
function resolveTransform(
  layer: Layer,
  n: Konva.Node,
  anchor: string | null
): Partial<Layer> {
  const sx = n.scaleX()
  const sy = n.scaleY()
  const base: Partial<Layer> = {
    x: n.x(),
    y: n.y(),
    rotation: n.rotation(),
    scaleX: 1,
    scaleY: 1
  }

  const newW = Math.max(1, layer.width * sx)
  const newH = Math.max(1, layer.height * sy)
  const isSide = anchor != null && SIDE_ANCHORS.has(anchor)

  // Text: corners scale the font proportionally; sides reflow the box width.
  if (layer.type === 'text') {
    if (isSide) {
      return { ...base, width: newW }
    }
    const factor = sx !== 1 ? sx : sy
    return {
      ...base,
      width: newW,
      fontSize: Math.max(4, Math.round((layer.fontSize ?? 48) * factor))
    }
  }

  // Image: side anchors crop the source instead of stretching the picture.
  if (layer.type === 'image' && isSide) {
    const group = n as Konva.Group
    const imgNode =
      typeof group.findOne === 'function'
        ? ((group.findOne('Image') as Konva.Image | undefined) ?? null)
        : null
    const src = imgNode?.image() as HTMLImageElement | undefined
    const natW = src?.naturalWidth ?? layer.crop?.width ?? layer.width
    const natH = src?.naturalHeight ?? layer.crop?.height ?? layer.height
    const cur = layer.crop ?? { x: 0, y: 0, width: natW, height: natH }
    // Scale the crop region by the same factor so the visible content is
    // revealed/clipped rather than scaled.
    const cropW = anchor === 'middle-left' || anchor === 'middle-right'
      ? Math.min(natW, Math.max(1, cur.width * sx))
      : cur.width
    const cropH = anchor === 'top-center' || anchor === 'bottom-center'
      ? Math.min(natH, Math.max(1, cur.height * sy))
      : cur.height
    // Anchor the crop so the opposite edge stays put.
    const cropX = anchor === 'middle-left'
      ? Math.max(0, cur.x + (cur.width - cropW))
      : cur.x
    const cropY = anchor === 'top-center'
      ? Math.max(0, cur.y + (cur.height - cropH))
      : cur.y
    return {
      ...base,
      width: newW,
      height: newH,
      crop: { x: cropX, y: cropY, width: cropW, height: cropH }
    }
  }

  // Default (shapes, image corners, lines): resize to real dimensions.
  return { ...base, width: newW, height: newH }
}

function ImageNode({ layer, common }: { layer: Layer; common: Record<string, unknown> }): JSX.Element | null {
  const img = useImage(layer.src ? mediaUrl(layer.src) : undefined)
  const ref = useRef<Konva.Image>(null)
  const f = layer.filters ?? {}
  const co = layer.colorOverlay

  const filters: Filter[] = []
  if (f.brightness) filters.push(Konva.Filters.Brighten)
  if (f.contrast) filters.push(Konva.Filters.Contrast)
  if (f.blur) filters.push(Konva.Filters.Blur)
  if (f.grayscale) filters.push(Konva.Filters.Grayscale)

  useEffect(() => {
    const node = ref.current
    if (node && img) {
      node.cache()
      node.getLayer()?.batchDraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, f.brightness, f.contrast, f.blur, f.grayscale, layer.width, layer.height, layer.crop])

  if (!img) return null

  // Wrap image + optional color overlay in a Group so both share the same
  // transform (position, rotation, scale, opacity).
  const { x, y, rotation, scaleX, scaleY, opacity, visible, draggable,
    onMouseDown, onTap, onDragMove, onDragEnd, onTransformEnd } = common as Record<string, unknown>

  return (
    <Group
      id={layer.id}
      name="layer"
      x={x as number}
      y={y as number}
      rotation={rotation as number}
      scaleX={scaleX as number}
      scaleY={scaleY as number}
      opacity={opacity as number}
      visible={visible as boolean}
      draggable={draggable as boolean}
      onMouseDown={onMouseDown as () => void}
      onTap={onTap as () => void}
      onDragMove={onDragMove as (() => void) | undefined}
      onDragEnd={onDragEnd as (() => void) | undefined}
      onTransformEnd={onTransformEnd as (() => void) | undefined}
    >
      <KonvaImage
        ref={ref}
        image={img}
        width={layer.width}
        height={layer.height}
        crop={layer.crop ?? undefined}
        filters={filters}
        brightness={f.brightness ?? 0}
        contrast={f.contrast ?? 0}
        blurRadius={f.blur ?? 0}
      />
      {co && co.opacity > 0 && (
        <Rect
          width={layer.width}
          height={layer.height}
          fill={co.hex}
          opacity={co.opacity}
          globalCompositeOperation={co.blendMode === 'color' ? 'color' : co.blendMode}
          listening={false}
        />
      )}
    </Group>
  )
}

export default function LayerNode({
  layer,
  ctx
}: {
  layer: Layer
  ctx: NodeCtx
}): JSX.Element | null {
  const common = useCommon(layer, ctx)
  const w = layer.width
  const h = layer.height

  switch (layer.type) {
    case 'text':
      return (
        <Text
          {...common}
          text={layer.text ?? ''}
          width={layer.width}
          fontFamily={layer.fontFamily ?? 'Inter'}
          fontSize={layer.fontSize ?? 48}
          fontStyle={layer.fontStyle ?? 'normal'}
          fill={layer.fill ?? '#ffffff'}
          align={layer.align ?? 'left'}
          letterSpacing={layer.letterSpacing ?? 0}
          lineHeight={layer.lineHeight ?? 1.2}
          stroke={layer.strokeWidth ? layer.strokeColor : undefined}
          strokeWidth={layer.strokeWidth ?? 0}
          shadowColor={layer.shadowColor}
          shadowBlur={layer.shadowBlur ?? 0}
          shadowOffsetX={layer.shadowOffsetX ?? 0}
          shadowOffsetY={layer.shadowOffsetY ?? 0}
        />
      )
    case 'rect':
      return (
        <Rect
          {...common}
          width={w}
          height={h}
          fill={layer.fill}
          cornerRadius={layer.cornerRadius ?? 0}
          stroke={layer.strokeWidth ? layer.strokeColor : undefined}
          strokeWidth={layer.strokeWidth ?? 0}
        />
      )
    case 'image':
      return <ImageNode layer={layer} common={common} />
    case 'circle':
      return (
        <Group {...common}>
          <Ellipse
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            fill={layer.fill}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
          />
        </Group>
      )
    case 'triangle':
      return (
        <Group {...common}>
          <RegularPolygon
            x={w / 2}
            y={h / 2}
            sides={3}
            radius={Math.min(w, h) / 2}
            fill={layer.fill}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
          />
        </Group>
      )
    case 'polygon':
      return (
        <Group {...common}>
          <RegularPolygon
            x={w / 2}
            y={h / 2}
            sides={layer.sides ?? 6}
            radius={Math.min(w, h) / 2}
            fill={layer.fill}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
          />
        </Group>
      )
    case 'line':
      return (
        <Group {...common}>
          <Line
            points={layer.points ?? [0, 0, w, 0]}
            stroke={layer.strokeColor ?? '#ffffff'}
            strokeWidth={layer.strokeWidth ?? 6}
            lineCap="round"
          />
        </Group>
      )
    case 'arrow':
      return (
        <Group {...common}>
          <Arrow
            points={layer.points ?? [0, 0, w, 0]}
            stroke={layer.strokeColor ?? '#ffffff'}
            fill={layer.strokeColor ?? '#ffffff'}
            strokeWidth={layer.strokeWidth ?? 6}
            pointerLength={layer.pointerLength ?? 20}
            pointerWidth={layer.pointerWidth ?? 20}
          />
        </Group>
      )
    default:
      return null
  }
}
