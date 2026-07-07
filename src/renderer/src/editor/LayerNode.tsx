import { useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import {
  Text,
  Rect,
  Image as KonvaImage,
  Group,
  Ellipse,
  RegularPolygon,
  Line,
  Arrow
} from 'react-konva'
import type { KonvaEventObject, Filter } from 'konva/lib/Node'
import { mediaUrl } from '@shared/ipc'
import { useImageWithStatus } from '@renderer/lib/useImage'
import { Temperature } from '@renderer/lib/konvaFilters'
import { gradientToKonvaProps, offsetGradient } from '@renderer/lib/gradients'
import { iconToImage } from '@renderer/lib/icons'
import PanelComponentNode from './panel/PanelComponentNode'
import type { BlendMode, Layer } from '@shared/types'

/** Konva globalCompositeOperation for a blend mode ('normal' → default). */
export function blendToComposite(
  mode: BlendMode | undefined
): GlobalCompositeOperation | undefined {
  return !mode || mode === 'normal' ? undefined : (mode as GlobalCompositeOperation)
}

interface NodeCtx {
  isSelected: boolean
  onSelect: (additive: boolean) => void
  onChange: (patch: Partial<Layer>) => void
  snap: boolean
  gridSize: number
  /** Called during drag; return snapped {x,y} to override position. */
  onDragMove?: (id: string, x: number, y: number) => { x: number; y: number } | null
  onDragEnd?: (id: string) => void
  /**
   * Click WITHOUT drag (Konva suppresses click after a drag). Used to collapse
   * a multi-selection to the clicked layer — mousedown must not do it, or
   * dragging a multi-selection would move only one member.
   */
  onClickSelect?: (additive: boolean) => void
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
    globalCompositeOperation: blendToComposite(layer.blendMode),
    draggable: !layer.locked,
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => ctx.onSelect(e.evt.shiftKey),
    onTap: () => ctx.onSelect(false),
    onClick: (e: KonvaEventObject<MouseEvent>) => ctx.onClickSelect?.(e.evt.shiftKey),
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
    // Live conversion for side anchors on text/image so the user sees the real
    // result (reflow / crop) while dragging instead of a stretch that snaps
    // back on release.
    onTransform: (e: KonvaEventObject<Event>) => {
      const n = e.target
      if (layer.type !== 'text' && layer.type !== 'image') return
      const stage = n.getStage()
      const tr = stage?.findOne('Transformer') as Konva.Transformer | undefined
      const anchor = tr && tr.nodes().length === 1 ? tr.getActiveAnchor() : null
      if (!anchor || !SIDE_ANCHORS.has(anchor)) return
      const patch = resolveTransform(layer, n, anchor)
      n.scaleX(1)
      n.scaleY(1)
      if (patch.x != null) n.x(patch.x)
      if (patch.y != null) n.y(patch.y)
      ctx.onChange(patch)
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
function resolveTransform(layer: Layer, n: Konva.Node, anchor: string | null): Partial<Layer> {
  const sx = n.scaleX()
  const sy = n.scaleY()
  // Flip lives in the SIGN of the scale: normalize the magnitude into
  // width/height but keep the sign, or resizing would silently un-mirror.
  const signX = Math.sign(sx) || 1
  const signY = Math.sign(sy) || 1
  const base: Partial<Layer> = {
    x: n.x(),
    y: n.y(),
    rotation: n.rotation(),
    scaleX: signX,
    scaleY: signY
  }

  const newW = Math.max(1, layer.width * Math.abs(sx))
  const newH = Math.max(1, layer.height * Math.abs(sy))
  const isSide = anchor != null && SIDE_ANCHORS.has(anchor)

  // Text: corners scale the font proportionally; sides reflow the box width.
  if (layer.type === 'text') {
    if (isSide) {
      return { ...base, width: newW }
    }
    const factor = Math.abs(sx) !== 1 ? Math.abs(sx) : Math.abs(sy)
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
    const cropW =
      anchor === 'middle-left' || anchor === 'middle-right'
        ? Math.min(natW, Math.max(1, cur.width * sx))
        : cur.width
    const cropH =
      anchor === 'top-center' || anchor === 'bottom-center'
        ? Math.min(natH, Math.max(1, cur.height * sy))
        : cur.height
    // Anchor the crop so the opposite edge stays put.
    const cropX = anchor === 'middle-left' ? Math.max(0, cur.x + (cur.width - cropW)) : cur.x
    const cropY = anchor === 'top-center' ? Math.max(0, cur.y + (cur.height - cropH)) : cur.y
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

function ImageNode({
  layer,
  common
}: {
  layer: Layer
  common: Record<string, unknown>
}): JSX.Element | null {
  const { img, error } = useImageWithStatus(layer.src ? mediaUrl(layer.src) : undefined)
  const ref = useRef<Konva.Image>(null)
  const f = layer.filters ?? {}
  const co = layer.colorOverlay

  const filters: Filter[] = []
  if (f.brightness) filters.push(Konva.Filters.Brighten)
  if (f.contrast) filters.push(Konva.Filters.Contrast)
  if (f.blur) filters.push(Konva.Filters.Blur)
  if (f.grayscale) filters.push(Konva.Filters.Grayscale)
  if (f.saturation || f.hue) filters.push(Konva.Filters.HSL)
  if (f.temperature) filters.push(Temperature)

  useEffect(() => {
    const node = ref.current
    if (node && img) {
      node.cache()
      node.getLayer()?.batchDraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    img,
    f.brightness,
    f.contrast,
    f.blur,
    f.grayscale,
    f.saturation,
    f.hue,
    f.temperature,
    layer.width,
    layer.height,
    layer.crop
  ])

  // Missing/corrupt file: render a visible placeholder instead of vanishing,
  // so the layer stays selectable and the user can fix or delete it.
  if (error) {
    return (
      <Group {...common}>
        <Rect
          width={layer.width}
          height={layer.height}
          fill="#2a2a30"
          stroke="#6b7280"
          strokeWidth={1}
          dash={[6, 4]}
        />
        <Line points={[0, 0, layer.width, layer.height]} stroke="#6b7280" strokeWidth={1} />
        <Line points={[layer.width, 0, 0, layer.height]} stroke="#6b7280" strokeWidth={1} />
      </Group>
    )
  }
  if (!img) return null

  // Wrap image + optional color overlay in a Group so both share the same
  // transform (position, rotation, scale, opacity).
  const {
    x,
    y,
    rotation,
    scaleX,
    scaleY,
    opacity,
    visible,
    draggable,
    onMouseDown,
    onTap,
    onClick,
    onDragMove,
    onDragEnd,
    onTransformEnd
  } = common as Record<string, unknown>

  const radius = layer.cornerRadius ?? 0
  const mask = layer.mask ?? 'none'
  const iw = layer.width
  const ih = layer.height
  // Clip the image content (and tint) to a rounded rect or circle when asked.
  const clipFunc =
    mask === 'circle' || radius > 0
      ? (ctxc: Konva.Context): void => {
          ctxc.beginPath()
          if (mask === 'circle') {
            ctxc.ellipse(iw / 2, ih / 2, iw / 2, ih / 2, 0, 0, Math.PI * 2)
          } else {
            const rr = Math.min(radius, iw / 2, ih / 2)
            ctxc.moveTo(rr, 0)
            ctxc.arcTo(iw, 0, iw, ih, rr)
            ctxc.arcTo(iw, ih, 0, ih, rr)
            ctxc.arcTo(0, ih, 0, 0, rr)
            ctxc.arcTo(0, 0, iw, 0, rr)
          }
          ctxc.closePath()
        }
      : undefined

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
      globalCompositeOperation={
        (common as { globalCompositeOperation?: GlobalCompositeOperation }).globalCompositeOperation
      }
      draggable={draggable as boolean}
      onMouseDown={onMouseDown as () => void}
      onTap={onTap as () => void}
      onClick={onClick as (() => void) | undefined}
      onDragMove={onDragMove as (() => void) | undefined}
      onDragEnd={onDragEnd as (() => void) | undefined}
      onTransformEnd={onTransformEnd as (() => void) | undefined}
    >
      {/* Clipped content: the image + optional tint share the mask/radius. */}
      <Group clipFunc={clipFunc}>
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
          saturation={f.saturation ?? 0}
          hue={f.hue ?? 0}
          temperature={f.temperature ?? 0}
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
      {/* Border follows the same rounded/circular outline as the clip. */}
      {(layer.strokeWidth ?? 0) > 0 &&
        (mask === 'circle' ? (
          <Ellipse
            x={iw / 2}
            y={ih / 2}
            radiusX={iw / 2}
            radiusY={ih / 2}
            stroke={layer.strokeColor}
            strokeWidth={layer.strokeWidth}
            listening={false}
          />
        ) : (
          <Rect
            width={iw}
            height={ih}
            cornerRadius={radius}
            stroke={layer.strokeColor}
            strokeWidth={layer.strokeWidth}
            listening={false}
          />
        ))}
    </Group>
  )
}

/** Lucide vector icon rasterized + recolored to the layer's fill. */
function IconNode({
  layer,
  common
}: {
  layer: Layer
  common: Record<string, unknown>
}): JSX.Element | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const name = layer.icon?.name
  const color = layer.fill ?? '#111111'
  useEffect(() => {
    let alive = true
    if (!name) return
    void iconToImage(name, color).then((i) => {
      if (alive) setImg(i)
    })
    return () => {
      alive = false
    }
  }, [name, color])
  if (!img) return null
  return (
    <Group {...common}>
      <KonvaImage image={img} width={layer.width} height={layer.height} listening />
      {/* Invisible hit area so the whole box is clickable even where the icon is thin. */}
      <Rect width={layer.width} height={layer.height} fill="transparent" />
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
  // Gradient fill (overrides flat `fill`); null → keep the solid fill prop.
  const grad = gradientToKonvaProps(layer.gradient, w, h)
  // Centered variant for ellipse/polygon whose origin is at (w/2, h/2).
  const gradCentered = grad
    ? offsetGradient(gradientToKonvaProps(layer.gradient, w, h)!, -w / 2, -h / 2)
    : null
  const fillProps = grad ? grad : { fill: layer.fill }
  const fillPropsCentered = gradCentered ? gradCentered : { fill: layer.fill }

  switch (layer.type) {
    case 'text':
      return (
        <Text
          {...common}
          {...(grad ?? {})}
          text={layer.text ?? ''}
          width={layer.width}
          fontFamily={layer.fontFamily ?? 'Inter'}
          fontSize={layer.fontSize ?? 48}
          fontStyle={layer.fontStyle ?? 'normal'}
          fill={grad ? undefined : (layer.fill ?? '#ffffff')}
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
          {...fillProps}
          width={w}
          height={h}
          cornerRadius={layer.cornerRadius ?? 0}
          stroke={layer.strokeWidth ? layer.strokeColor : undefined}
          strokeWidth={layer.strokeWidth ?? 0}
          shadowColor={layer.shadowColor}
          shadowBlur={layer.shadowBlur ?? 0}
          shadowOffsetX={layer.shadowOffsetX ?? 0}
          shadowOffsetY={layer.shadowOffsetY ?? 0}
        />
      )
    case 'image':
      return <ImageNode layer={layer} common={common} />
    case 'icon':
      return <IconNode layer={layer} common={common} />
    case 'circle':
      return (
        <Group {...common}>
          <Ellipse
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            {...fillPropsCentered}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur ?? 0}
            shadowOffsetX={layer.shadowOffsetX ?? 0}
            shadowOffsetY={layer.shadowOffsetY ?? 0}
          />
        </Group>
      )
    case 'triangle': {
      // Scale a unit polygon to fill the w×h box so it deforms with the layer.
      const r = 50
      return (
        <Group {...common}>
          <RegularPolygon
            x={w / 2}
            y={h / 2}
            sides={3}
            radius={r}
            scaleX={w / (2 * r)}
            scaleY={h / (2 * r)}
            {...(gradCentered ?? { fill: layer.fill })}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
            strokeScaleEnabled={false}
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur ?? 0}
            shadowOffsetX={layer.shadowOffsetX ?? 0}
            shadowOffsetY={layer.shadowOffsetY ?? 0}
          />
        </Group>
      )
    }
    case 'polygon': {
      const r = 50
      return (
        <Group {...common}>
          <RegularPolygon
            x={w / 2}
            y={h / 2}
            sides={layer.sides ?? 6}
            radius={r}
            scaleX={w / (2 * r)}
            scaleY={h / (2 * r)}
            {...(gradCentered ?? { fill: layer.fill })}
            stroke={layer.strokeWidth ? layer.strokeColor : undefined}
            strokeWidth={layer.strokeWidth ?? 0}
            strokeScaleEnabled={false}
            shadowColor={layer.shadowColor}
            shadowBlur={layer.shadowBlur ?? 0}
            shadowOffsetX={layer.shadowOffsetX ?? 0}
            shadowOffsetY={layer.shadowOffsetY ?? 0}
          />
        </Group>
      )
    }
    case 'line':
      return (
        <Group {...common}>
          {/* Length follows the layer width so resizing actually stretches it. */}
          <Line
            points={[0, h / 2, w, h / 2]}
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
            points={[0, h / 2, w, h / 2]}
            stroke={layer.strokeColor ?? '#ffffff'}
            fill={layer.strokeColor ?? '#ffffff'}
            strokeWidth={layer.strokeWidth ?? 6}
            pointerLength={layer.pointerLength ?? 20}
            pointerWidth={layer.pointerWidth ?? 20}
          />
        </Group>
      )
    case 'panelComponent':
      return <PanelComponentNode layer={layer} common={common} />
    default:
      return null
  }
}
