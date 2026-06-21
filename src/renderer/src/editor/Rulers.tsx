const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000]

function chooseStep(zoom: number): number {
  for (const s of STEPS) if (s * zoom >= 64) return s
  return STEPS[STEPS.length - 1]
}

function ticks(lengthDesign: number, zoom: number, offset: number): { pos: number; label: number }[] {
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
  pan
}: {
  width: number
  height: number
  zoom: number
  pan: { x: number; y: number }
}): JSX.Element {
  const hTicks = ticks(width, zoom, pan.x)
  const vTicks = ticks(height, zoom, pan.y)

  return (
    <>
      {/* corner */}
      <div className="absolute top-0 left-0 w-6 h-6 bg-surface-2 border-r border-b border-line z-20" />
      {/* horizontal ruler */}
      <div className="absolute top-0 left-6 right-0 h-6 bg-surface-2 border-b border-line overflow-hidden z-20">
        {hTicks.map((t, i) => (
          <div key={i} className="absolute top-0 h-full" style={{ left: t.pos }}>
            <div className="absolute bottom-0 w-px h-2 bg-ink-faint" />
            <span className="absolute top-0.5 left-1 text-[9px] text-ink-faint">{t.label}</span>
          </div>
        ))}
      </div>
      {/* vertical ruler */}
      <div className="absolute top-6 left-0 bottom-0 w-6 bg-surface-2 border-r border-line overflow-hidden z-20">
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
