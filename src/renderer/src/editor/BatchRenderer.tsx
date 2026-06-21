import { useEffect, useRef } from 'react'
import Konva from 'konva'
import { Stage, Layer, Rect } from 'react-konva'
import LayerNode from './LayerNode'
import type { CanvasSpec, Layer as LayerModel } from '@shared/types'

const NOOP_CTX = {
  isSelected: false,
  onSelect: () => {},
  onChange: () => {},
  snap: false,
  gridSize: 1
}

/** Hidden full-size Konva stage used to render template rows for batch export. */
export default function BatchRenderer({
  canvas,
  layers,
  onStage
}: {
  canvas: CanvasSpec
  layers: LayerModel[]
  onStage: (stage: Konva.Stage | null) => void
}): JSX.Element {
  const ref = useRef<Konva.Stage>(null)

  useEffect(() => {
    onStage(ref.current)
    // Re-report whenever the rendered content changes.
  }, [layers, onStage])

  return (
    <div style={{ position: 'fixed', left: -99999, top: 0, opacity: 0, pointerEvents: 'none' }}>
      <Stage ref={ref} width={canvas.width} height={canvas.height}>
        <Layer>
          <Rect
            name="artboard-bg"
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            fill={canvas.background === 'transparent' ? '#ffffff' : canvas.background}
          />
          {layers.map((l) => (
            <LayerNode key={l.id} layer={l} ctx={NOOP_CTX} />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
