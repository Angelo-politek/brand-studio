const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000]

function chooseStep(zoom: number): number {
  for (const s of STEPS) if (s * zoom >= 64) return s
  return STEPS[STEPS.length - 1]
}

function ticks(
  lengthDesign: number,
  zoom: number,
  offset: number
): { pos: number; label: number }[] {
  const step = chooseStep(zoom)
  const out: { pos: number; label: number }[] = []
  for (let v = 0; v <= lengthDesign; v += step) {
    out.push({ pos: offset + v * zoom, label: v })
  }
  return out
}

/** Thin horizontal + vertical rulers that track the stage zoom/pan. */
export default function Rulers({
  width,
  height,
  zoom,
  pan,
  containerRef,
  onCreateGuide
}: {
  width: number
  height: number
  zoom: number
  pan: { x: number; y: number }
  /** Canvas container, to convert screen → canvas coordinates. */
  containerRef?: React.RefObject<HTMLDivElement>
  /** Called when the user drags a guide out of a ruler onto the canvas. */
  onCreateGuide?: (axis: 'x' | 'y', canvasPos: number) => void
}): JSX.Element {
  const hTicks = ticks(width, zoom, pan.x)
  const vTicks = ticks(height, zoom, pan.y)

  function startGuideDrag(axis: 'x' | 'y'): void {
    if (!onCreateGuide) return
    const rect = containerRef?.current?.getBoundingClientRect()
    function onMove(): void {
      /* live preview handled by the canvas snap layer; no-op */
    }
    function onUp(ev: MouseEvent): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const r = rect ?? containerRef?.current?.getBoundingClientRect()
      if (!r) return
      const pos =
        axis === 'x' ? (ev.clientX - r.left - pan.x) / zoom : (ev.clientY - r.top - pan.y) / zoom
      // Only drop guides inside the artboard.
      const max = axis === 'x' ? width : height
      if (pos >= 0 && pos <= max) onCreateGuide!(axis, pos)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      {/* corner */}
      <div className="absolute top-0 left-0 w-6 h-6 bg-surface-2 border-r border-b border-line z-20" />
      {/* horizontal ruler → drag down for a vertical guide */}
      <div
        className="absolute top-0 left-6 right-0 h-6 bg-surface-2 border-b border-line overflow-hidden z-20 cursor-ns-resize"
        onMouseDown={() => startGuideDrag('x')}
        title="Drag onto the canvas to add a vertical guide"
      >
        {hTicks.map((t, i) => (
          <div key={i} className="absolute top-0 h-full" style={{ left: t.pos }}>
            <div className="absolute bottom-0 w-px h-2 bg-ink-faint" />
            <span className="absolute top-0.5 left-1 text-[9px] text-ink-faint">{t.label}</span>
          </div>
        ))}
      </div>
      {/* vertical ruler → drag right for a horizontal guide */}
      <div
        className="absolute top-6 left-0 bottom-0 w-6 bg-surface-2 border-r border-line overflow-hidden z-20 cursor-ew-resize"
        onMouseDown={() => startGuideDrag('y')}
        title="Drag onto the canvas to add a horizontal guide"
      >
        {vTicks.map((t, i) => (
          <div key={i} className="absolute left-0 w-full" style={{ top: t.pos }}>
            <div className="absolute right-0 h-px w-2 bg-ink-faint" />
            <span
              className="absolute left-0.5 top-0.5 text-[9px] text-ink-faint"
              style={{ writingMode: 'vertical-rl' }}
            >
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
