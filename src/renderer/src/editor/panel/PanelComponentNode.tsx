import { Group, Circle, Rect, Line, RegularPolygon, Text } from 'react-konva'
import { buildPanelPrimitives } from '@renderer/lib/panelShapes'
import type { Layer } from '@shared/types'

/**
 * Hardware panel component (knob, fader, jack, …) as a single layer. The data
 * stays flat — this Group is render-only; geometry comes from the shared
 * `buildPanelPrimitives` so the export path draws exactly the same pixels.
 */
export default function PanelComponentNode({
  layer,
  common
}: {
  layer: Layer
  common: Record<string, unknown>
}): JSX.Element | null {
  const comp = layer.component
  if (!comp) return null
  const prims = buildPanelPrimitives(comp.kind, comp.params ?? {}, layer.width, layer.height)

  return (
    <Group {...common}>
      {prims.map((p, i) => {
        switch (p.kind) {
          case 'circle':
            return (
              <Circle
                key={i}
                x={p.x}
                y={p.y}
                radius={p.radius}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                shadowColor={p.shadowColor}
                shadowBlur={p.shadowBlur}
                opacity={p.opacity ?? 1}
                listening={false}
              />
            )
          case 'rect':
            return (
              <Rect
                key={i}
                x={p.x}
                y={p.y}
                width={p.width}
                height={p.height}
                cornerRadius={p.cornerRadius}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                opacity={p.opacity ?? 1}
                listening={false}
              />
            )
          case 'line':
            return (
              <Line
                key={i}
                points={p.points}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                lineCap={p.lineCap}
                opacity={p.opacity ?? 1}
                listening={false}
              />
            )
          case 'polygon':
            return (
              <RegularPolygon
                key={i}
                x={p.x}
                y={p.y}
                radius={p.radius}
                sides={p.sides}
                rotation={p.rotation ?? 0}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                listening={false}
              />
            )
          case 'text':
            return (
              <Text
                key={i}
                x={p.x}
                y={p.y}
                width={p.width}
                text={p.text}
                fontSize={p.fontSize}
                fontFamily={p.fontFamily}
                fill={p.fill}
                align={p.align}
                opacity={p.opacity ?? 1}
                listening={false}
              />
            )
          default:
            return null
        }
      })}
      {/* Invisible hit area so the whole box is clickable/draggable. */}
      <Rect x={0} y={0} width={layer.width} height={layer.height} fill="transparent" />
    </Group>
  )
}
