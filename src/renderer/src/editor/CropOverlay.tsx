import { useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Group, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import { mediaUrl } from '@shared/ipc'
import { useImage } from '@renderer/lib/useImage'
import { useEditorStoreApi } from './editorStoreContext'
import type { Layer } from '@shared/types'

/**
 * Interactive crop mode for a single image layer. Renders the full image
 * dimmed, with a draggable/resizable crop rectangle. Commit with Enter or a
 * click outside; cancel with Escape.
 *
 * Works in canvas coordinates. The crop rect is positioned over the layer's
 * box; on commit it is converted to source-image pixel coordinates and stored
 * in `layer.crop`.
 */
export default function CropOverlay({ layer }: { layer: Layer }): JSX.Element | null {
  const img = useImage(layer.src ? mediaUrl(layer.src) : undefined)
  const useStore = useEditorStoreApi()
  const updateLayer = useStore((s) => s.updateLayer)
  const setCropMode = useStore((s) => s.setCropMode)

  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // The full image is drawn covering the layer box. Crop rect starts at the
  // current crop (mapped into box space) or the whole box.
  const boxW = layer.width
  const boxH = layer.height
  const [rect, setRect] = useState({ x: layer.x, y: layer.y, width: boxW, height: boxH })

  // Attach the transformer to the crop rect once mounted.
  useEffect(() => {
    const tr = trRef.current
    const r = rectRef.current
    if (tr && r) {
      tr.nodes([r])
      tr.getLayer()?.batchDraw()
    }
  }, [img])

  // Keyboard: Enter commits, Escape cancels.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Enter') commit()
      else if (e.key === 'Escape') setCropMode(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, img])

  if (!img) return null

  const natW = img.width
  const natH = img.height

  function commit(): void {
    // Convert the crop rect (canvas/box space) into source-image pixels.
    const scaleX = natW / boxW
    const scaleY = natH / boxH
    const relX = (rect.x - layer.x) * scaleX
    const relY = (rect.y - layer.y) * scaleY
    const cw = rect.width * scaleX
    const ch = rect.height * scaleY
    const crop = {
      x: Math.max(0, Math.round(relX)),
      y: Math.max(0, Math.round(relY)),
      width: Math.min(natW, Math.round(cw)),
      height: Math.min(natH, Math.round(ch))
    }
    // Keep the box where the crop now is and size it to the crop's aspect.
    updateLayer(layer.id, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      crop
    })
    setCropMode(null)
  }

  return (
    <Group>
      {/* Full image, slightly dimmed, drawn over the layer box. */}
      <KonvaImage
        image={img}
        x={layer.x}
        y={layer.y}
        width={boxW}
        height={boxH}
        opacity={0.45}
        listening={false}
      />
      {/* Bright crop region: the image clipped to the crop rect. */}
      <Group
        clipX={rect.x}
        clipY={rect.y}
        clipWidth={rect.width}
        clipHeight={rect.height}
        listening={false}
      >
        <KonvaImage image={img} x={layer.x} y={layer.y} width={boxW} height={boxH} listening={false} />
      </Group>
      {/* Draggable / resizable crop rectangle. */}
      <Rect
        ref={rectRef}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke="#3b82f6"
        strokeWidth={2}
        draggable
        dragBoundFunc={(pos) => {
          // Keep the crop rect within the image box.
          const x = Math.max(layer.x, Math.min(pos.x, layer.x + boxW - rect.width))
          const y = Math.max(layer.y, Math.min(pos.y, layer.y + boxH - rect.height))
          return { x, y }
        }}
        onDragEnd={(e) => setRect((r) => ({ ...r, x: e.target.x(), y: e.target.y() }))}
        onTransformEnd={(e) => {
          const node = e.target
          const w = Math.max(8, node.width() * node.scaleX())
          const h = Math.max(8, node.height() * node.scaleY())
          node.scaleX(1)
          node.scaleY(1)
          setRect({
            x: Math.max(layer.x, node.x()),
            y: Math.max(layer.y, node.y()),
            width: Math.min(w, layer.x + boxW - node.x()),
            height: Math.min(h, layer.y + boxH - node.y())
          })
        }}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        keepRatio={false}
        anchorStroke="#3b82f6"
        anchorFill="#0b0d12"
        borderStroke="#3b82f6"
        anchorSize={9}
        boundBoxFunc={(oldBox, newBox) =>
          newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
        }
      />
    </Group>
  )
}
