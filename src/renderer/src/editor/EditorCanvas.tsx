import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Group, Rect, Line, Transformer } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useEditorStoreApi } from './editorStoreContext'
import LayerNode from './LayerNode'
import Rulers from './Rulers'
import TextEditorOverlay from './TextEditorOverlay'
import { setStage } from './stageRef'
import { setFitFn } from './fitRef'
import ContextMenu from './ContextMenu'
import CropOverlay from './CropOverlay'
import type { Layer as LayerModel } from '@shared/types'

const SNAP_THRESHOLD = 8

interface Guide { type: 'x' | 'y'; pos: number }

function computeSnap(
  draggingId: string,
  nx: number,
  ny: number,
  draggingLayer: LayerModel,
  allLayers: LayerModel[],
  canvas: { width: number; height: number }
): { x: number; y: number; guides: Guide[] } {
  const dw = draggingLayer.width * draggingLayer.scaleX
  const dh = draggingLayer.height * draggingLayer.scaleY

  // X snap points for the dragging layer (left, center, right)
  const dLeft = nx
  const dCX = nx + dw / 2
  const dRight = nx + dw

  // Y snap points
  const dTop = ny
  const dCY = ny + dh / 2
  const dBottom = ny + dh

  // Collect target snap lines from canvas + other layers
  const xTargets: number[] = [0, canvas.width / 2, canvas.width]
  const yTargets: number[] = [0, canvas.height / 2, canvas.height]

  for (const l of allLayers) {
    if (l.id === draggingId) continue
    const lw = l.width * l.scaleX
    const lh = l.height * l.scaleY
    xTargets.push(l.x, l.x + lw / 2, l.x + lw)
    yTargets.push(l.y, l.y + lh / 2, l.y + lh)
  }

  let finalX = nx
  let finalY = ny
  const guides: Guide[] = []

  // Snap X
  const xCandidates: { src: number; offset: number; target: number }[] = [
    { src: dLeft, offset: 0, target: 0 },
    { src: dCX, offset: dw / 2, target: 0 },
    { src: dRight, offset: dw, target: 0 }
  ]
  for (const { src, offset } of xCandidates) {
    for (const t of xTargets) {
      if (Math.abs(src - t) < SNAP_THRESHOLD) {
        finalX = t - offset
        guides.push({ type: 'x', pos: t })
        break
      }
    }
    if (finalX !== nx) break
  }

  // Snap Y
  const yCandidates: { src: number; offset: number }[] = [
    { src: dTop, offset: 0 },
    { src: dCY, offset: dh / 2 },
    { src: dBottom, offset: dh }
  ]
  for (const { src, offset } of yCandidates) {
    for (const t of yTargets) {
      if (Math.abs(src - t) < SNAP_THRESHOLD) {
        finalY = t - offset
        guides.push({ type: 'y', pos: t })
        break
      }
    }
    if (finalY !== ny) break
  }

  return { x: finalX, y: finalY, guides }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export default function EditorCanvas({
  /** When true the artboard background rect is not drawn (used by the video
      editor so a background video clip shows through). */
  transparentArtboard = false,
  /** Optional content rendered inside the Konva layer, behind all layers
      (e.g. a video clip frame). Receives nothing; positioned in canvas coords. */
  backdrop,
  /** Optional per-layer transform applied at render time only (e.g. the video
      editor applies text animations based on the scene playhead). Does not
      mutate stored state. */
  layerTransform,
  /** Optional Konva node rendered inside the clipped artboard group, BELOW all
      layers (e.g. the scene's background video clip node). */
  underlay
}: {
  transparentArtboard?: boolean
  backdrop?: React.ReactNode
  layerTransform?: (layer: LayerModel) => LayerModel
  underlay?: React.ReactNode
} = {}): JSX.Element {
  const useStore = useEditorStoreApi()
  const {
    canvas,
    layers,
    selectedIds,
    zoom,
    pan,
    showGrid,
    showSafe,
    gridSize,
    cropMode,
    select,
    toggleSelect,
    setSelection,
    updateLayer,
    setZoom,
    setPan
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const fittedRef = useRef(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [snapGuides, setSnapGuides] = useState<Guide[]>([])
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(null)
  // Marquee (rubber-band) selection, in canvas coordinates.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)

  const handleDragMove = useCallback(
    (id: string, x: number, y: number): { x: number; y: number } | null => {
      const draggingLayer = layers.find((l) => l.id === id)
      if (!draggingLayer) return null
      const result = computeSnap(id, x, y, draggingLayer, layers, canvas)
      setSnapGuides(result.guides)
      return { x: result.x, y: result.y }
    },
    [layers, canvas]
  )

  const handleDragEnd = useCallback(() => setSnapGuides([]), [])

  const editingLayer = layers.find((l) => l.id === editingId) ?? null
  const cropLayer = (cropMode && layers.find((l) => l.id === cropMode && l.type === 'image')) || null

  function fit(): void {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    const z = Math.min(w / canvas.width, h / canvas.height) * 0.9
    setZoom(z)
    setPan({ x: (w - canvas.width * z) / 2, y: (h - canvas.height * z) / 2 })
  }

  // Expose the stage for the export flow, and fit() for hotkeys.
  useEffect(() => {
    setStage(stageRef.current)
    return () => setStage(null)
  }, [])

  useEffect(() => {
    setFitFn(fit)
    return () => setFitFn(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.width, canvas.height])

  // Measure container; fit once when first sized.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
      if (!fittedRef.current && el.clientWidth > 0) {
        fittedRef.current = true
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fit when the artboard dimensions change (e.g., opening another project).
  useEffect(() => {
    fittedRef.current = false
    if (sizeRef.current.w > 0) {
      fittedRef.current = true
      fit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.width, canvas.height])

  // Attach the transformer to all selected (unlocked) nodes.
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    // While cropping, the CropOverlay owns its own transformer.
    if (cropMode) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }
    const nodes: Konva.Node[] = []
    for (const id of selectedIds) {
      const l = layers.find((x) => x.id === id)
      // Layers may be locked; non-layer selectable nodes (e.g. the video clip,
      // id '__clip__') are matched directly by id on the stage.
      if (l) {
        if (l.locked) continue
      }
      const n = stage.findOne(`#${id}`)
      if (n) nodes.push(n as Konva.Node)
    }
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, layers, cropMode])

  function onWheel(e: KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const mousePointTo = { x: (pointer.x - pan.x) / zoom, y: (pointer.y - pan.y) / zoom }
    const factor = 1.06
    const newZoom = clamp(e.evt.deltaY > 0 ? zoom / factor : zoom * factor, 0.05, 10)
    setZoom(newZoom)
    setPan({ x: pointer.x - mousePointTo.x * newZoom, y: pointer.y - mousePointTo.y * newZoom })
  }

  /** Convert the current pointer position to canvas (artboard) coordinates. */
  function pointerToCanvas(): { x: number; y: number } | null {
    const stage = stageRef.current
    const p = stage?.getPointerPosition()
    if (!stage || !p) return null
    return { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom }
  }

  function onStageMouseDown(e: KonvaEventObject<MouseEvent>): void {
    // No marquee / selection changes while in crop mode.
    if (cropMode) return
    const t = e.target
    const onEmpty = t === t.getStage() || t.name() === 'artboard-bg'
    if (!onEmpty) return
    // Start a marquee selection on empty space (left button only).
    if (e.evt.button === 0) {
      const c = pointerToCanvas()
      if (c) {
        marqueeStart.current = c
        setMarquee({ x1: c.x, y1: c.y, x2: c.x, y2: c.y })
        // Disable Stage panning while drawing the marquee.
        stageRef.current?.draggable(false)
      }
      if (!e.evt.shiftKey) select(null)
    }
  }

  function onStageMouseMove(): void {
    if (!marqueeStart.current) return
    const c = pointerToCanvas()
    if (!c) return
    setMarquee({ x1: marqueeStart.current.x, y1: marqueeStart.current.y, x2: c.x, y2: c.y })
  }

  function onStageMouseUp(e: KonvaEventObject<MouseEvent>): void {
    if (!marqueeStart.current || !marquee) {
      marqueeStart.current = null
      stageRef.current?.draggable(true)
      return
    }
    const left = Math.min(marquee.x1, marquee.x2)
    const right = Math.max(marquee.x1, marquee.x2)
    const top = Math.min(marquee.y1, marquee.y2)
    const bottom = Math.max(marquee.y1, marquee.y2)
    marqueeStart.current = null
    setMarquee(null)
    stageRef.current?.draggable(true)

    // Ignore tiny drags (treat as a click that already cleared selection).
    if (right - left < 3 && bottom - top < 3) return

    const hits = layers
      .filter((l) => {
        if (l.locked || !l.visible) return false
        const lw = l.width * l.scaleX
        const lh = l.height * l.scaleY
        // Intersection test between layer bbox and marquee rect.
        return l.x < right && l.x + lw > left && l.y < bottom && l.y + lh > top
      })
      .map((l) => l.id)

    if (e.evt.shiftKey) {
      const merged = new Set([...selectedIds, ...hits])
      setSelection([...merged])
    } else {
      setSelection(hits)
    }
  }

  function onStageDblClick(e: KonvaEventObject<MouseEvent>): void {
    const id = e.target.id()
    const layer = layers.find((l) => l.id === id)
    if (layer?.type === 'text' && !layer.locked) setEditingId(id)
  }

  function onStageContextMenu(e: KonvaEventObject<MouseEvent>): void {
    e.evt.preventDefault()
    const id = e.target.id()
    if (!id || !layers.find((l) => l.id === id)) return
    select(id)
    setContextMenu({ layerId: id, x: e.evt.clientX, y: e.evt.clientY })
  }

  const gridLines = useMemo(() => {
    if (!showGrid) return null
    const lines: JSX.Element[] = []
    for (let x = 0; x <= canvas.width; x += gridSize) {
      lines.push(
        <Line key={`v${x}`} points={[x, 0, x, canvas.height]} stroke="#000000" strokeWidth={1} opacity={0.06} listening={false} />
      )
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
      lines.push(
        <Line key={`h${y}`} points={[0, y, canvas.width, y]} stroke="#000000" strokeWidth={1} opacity={0.06} listening={false} />
      )
    }
    return lines
  }, [showGrid, canvas.width, canvas.height, gridSize])

  const safeInsetX = canvas.width * 0.05
  const safeInsetY = canvas.height * 0.05

  // Tailor which transform handles are shown to the selected layer's type.
  const ALL_ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ]
  const transformerAnchors = useMemo(() => {
    if (selectedIds.length !== 1) return ALL_ANCHORS
    const l = layers.find((x) => x.id === selectedIds[0])
    if (l && (l.type === 'line' || l.type === 'arrow')) {
      return ['middle-left', 'middle-right']
    }
    return ALL_ANCHORS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, layers])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-surface-0">
      <Rulers width={canvas.width} height={canvas.height} zoom={zoom} pan={pan} />

      {/* Optional DOM backdrop (e.g. a <video> clip) placed behind the Konva
          stage, transformed to match the artboard's zoom/pan. */}
      {backdrop && (
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none overflow-hidden"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: canvas.width,
            height: canvas.height
          }}
        >
          {backdrop}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={sizeRef.current.w || 800}
        height={sizeRef.current.h || 600}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
        draggable
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onDblClick={onStageDblClick}
        onDblTap={onStageDblClick}
        onContextMenu={onStageContextMenu}
        onDragEnd={(e) => {
          // Only commit pan when the Stage itself was dragged (not a child node).
          if (e.target === e.target.getStage()) setPan({ x: e.target.x(), y: e.target.y() })
        }}
      >
        <Layer>
          {transparentArtboard ? (
            // Only a subtle frame so the artboard bounds stay visible over the
            // backdrop video; no opaque fill.
            <Rect
              name="artboard-bg"
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill={canvas.background === 'transparent' ? undefined : canvas.background}
              listening={!canvas.background ? false : true}
            />
          ) : (
            <Rect
              name="artboard-bg"
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill={canvas.background === 'transparent' ? '#ffffff' : canvas.background}
              shadowColor="#000000"
              shadowBlur={24}
              shadowOpacity={0.4}
            />
          )}
          {gridLines}

          {/* Clip layer content to the artboard so anything dragged/resized
              past the page edges stays hidden and the page border is clear. */}
          <Group
            clipX={0}
            clipY={0}
            clipWidth={canvas.width}
            clipHeight={canvas.height}
          >
            {underlay}
            {layers.map((rawLayer) => {
              const layer = layerTransform ? layerTransform(rawLayer) : rawLayer
              return (
              <LayerNode
                key={layer.id}
                layer={
                  layer.id === editingId || layer.id === cropMode
                    ? { ...layer, visible: false }
                    : layer
                }
                ctx={{
                  isSelected: selectedIds.includes(rawLayer.id),
                  onSelect: (additive) =>
                    additive ? toggleSelect(rawLayer.id) : select(rawLayer.id),
                  onChange: (patch) => updateLayer(rawLayer.id, patch),
                  snap: showGrid,
                  gridSize,
                  onDragMove: handleDragMove,
                  onDragEnd: handleDragEnd
                }}
              />
              )
            })}
          </Group>

          {cropLayer && <CropOverlay key={`crop-${cropLayer.id}`} layer={cropLayer} />}

          {/* Snap guide lines */}
          {snapGuides.map((g, i) =>
            g.type === 'x' ? (
              <Line
                key={`gx${i}`}
                points={[g.pos, 0, g.pos, canvas.height]}
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[6, 4]}
                listening={false}
                opacity={0.8}
              />
            ) : (
              <Line
                key={`gy${i}`}
                points={[0, g.pos, canvas.width, g.pos]}
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[6, 4]}
                listening={false}
                opacity={0.8}
              />
            )
          )}

          {showSafe && (
            <Rect
              x={safeInsetX}
              y={safeInsetY}
              width={canvas.width - safeInsetX * 2}
              height={canvas.height - safeInsetY * 2}
              stroke="#f97316"
              strokeWidth={2}
              dash={[12, 8]}
              listening={false}
            />
          )}

          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="#3b82f6"
              opacity={0.12}
              stroke="#3b82f6"
              strokeWidth={1}
              listening={false}
            />
          )}

          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={false}
            enabledAnchors={transformerAnchors}
            anchorStroke="#f97316"
            anchorFill="#0b0d12"
            borderStroke="#f97316"
            anchorSize={9}
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>

      {editingLayer && (
        <TextEditorOverlay
          layer={editingLayer}
          zoom={zoom}
          pan={pan}
          onCommit={(text) => {
            updateLayer(editingLayer.id, { text })
            setEditingId(null)
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          layerId={contextMenu.layerId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
