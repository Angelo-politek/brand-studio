import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Layer } from '@shared/types'

interface Props {
  layer: Layer
  zoom: number
  pan: { x: number; y: number }
  onCommit: (text: string) => void
  onCancel: () => void
}

/** DOM textarea overlaid on a Konva text node for inline editing. */
export default function TextEditorOverlay({ layer, zoom, pan, onCommit, onCancel }: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [val, setVal] = useState(layer.text ?? '')

  useEffect(() => {
    const t = ref.current
    if (t) {
      t.focus()
      t.select()
    }
  }, [])

  const style: CSSProperties = {
    position: 'absolute',
    left: pan.x + layer.x * zoom,
    top: pan.y + layer.y * zoom,
    width: Math.max(40, layer.width * layer.scaleX * zoom),
    fontSize: (layer.fontSize ?? 48) * layer.scaleY * zoom,
    fontFamily: layer.fontFamily ?? 'Inter',
    color: layer.fill ?? '#ffffff',
    lineHeight: String(layer.lineHeight ?? 1.2),
    letterSpacing: (layer.letterSpacing ?? 0) * layer.scaleX * zoom,
    textAlign: layer.align ?? 'left',
    fontStyle: (layer.fontStyle ?? '').includes('italic') ? 'italic' : 'normal',
    fontWeight: (layer.fontStyle ?? '').includes('bold') ? 'bold' : 'normal',
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: 'top left',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    padding: 0,
    margin: 0,
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    zIndex: 30
  }

  return (
    <textarea
      ref={ref}
      style={style}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onCommit(val)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        e.stopPropagation()
      }}
    />
  )
}
