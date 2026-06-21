import { useRef, useState } from 'react'
import Konva from 'konva'
import { X, Upload, Loader2, FileSpreadsheet } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { pickFiles, readFileBytes } from '@renderer/lib/files'
import { parseCsv, type ParsedCsv } from '@renderer/lib/csv'
import { applyVariables, cloneLayers } from '@renderer/lib/variables'
import { exportArtboard } from '@renderer/editor/exportArtboard'
import BatchRenderer from '@renderer/editor/BatchRenderer'
import { toast } from '@renderer/stores/uiStore'
import { mediaUrl } from '@shared/ipc'
import type { CanvasSpec, Layer, Template } from '@shared/types'

type Mode = 'images' | 'projects'

export default function BatchDialog({
  template,
  brandId,
  onClose
}: {
  template: Template
  brandId: string
  onClose: () => void
}): JSX.Element {
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [mode, setMode] = useState<Mode>('images')
  const [phase, setPhase] = useState<'config' | 'running' | 'done'>('config')
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState<{ canvas: CanvasSpec; layers: Layer[] } | null>(null)
  const resolverRef = useRef<((s: Konva.Stage) => void) | null>(null)

  const vars = template.variables
  const unmatched = csv ? vars.filter((v) => !csv.headers.includes(v)) : []

  function onStage(stage: Konva.Stage | null): void {
    if (stage && resolverRef.current) {
      const cb = resolverRef.current
      resolverRef.current = null
      // Allow Konva to paint before capturing.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setTimeout(() => cb(stage), 120))
      )
    }
  }

  async function loadCsv(): Promise<void> {
    const [path] = await pickFiles([{ name: 'CSV', extensions: ['csv'] }])
    if (!path) return
    const bytes = await readFileBytes(path)
    setCsv(parseCsv(new TextDecoder().decode(bytes)))
  }

  async function preloadImages(): Promise<void> {
    await Promise.all(
      template.layers
        .filter((l) => l.type === 'image' && l.src)
        .map(
          (l) =>
            new Promise<void>((res) => {
              const im = new Image()
              im.crossOrigin = 'anonymous'
              im.onload = () => res()
              im.onerror = () => res()
              im.src = mediaUrl(l.src!)
            })
        )
    )
  }

  async function run(): Promise<void> {
    if (!csv || csv.rows.length === 0) return
    setPhase('running')
    setProgress(0)
    if (mode === 'images') await preloadImages()

    for (let i = 0; i < csv.rows.length; i++) {
      const values: Record<string, string> = {}
      for (const v of vars) values[v] = csv.rows[i][v] ?? ''
      const layers = applyVariables(cloneLayers(template.layers), values)
      const name = `${template.name}-${i + 1}`

      if (mode === 'projects') {
        await window.api.projects.create({
          brandId,
          name,
          type: template.type,
          canvas: template.canvas,
          layers
        })
      } else {
        const stage = await new Promise<Konva.Stage>((res) => {
          resolverRef.current = res
          setCurrent({ canvas: template.canvas, layers })
        })
        await exportArtboard({
          stage,
          canvas: template.canvas,
          format: 'png',
          scale: 1,
          name,
          projectId: null,
          brandId
        })
      }
      setProgress(i + 1)
    }

    setCurrent(null)
    setPhase('done')
    toast(`Generated ${csv.rows.length} ${mode === 'images' ? 'images' : 'projects'}.`, 'success')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Batch generate · {template.name}</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {vars.length === 0 && (
            <p className="text-sm text-amber-400">
              This template has no {'{{variables}}'} — batch will produce identical copies.
            </p>
          )}

          {!csv ? (
            <button
              onClick={loadCsv}
              className="w-full border border-dashed border-line rounded-lg py-8 flex flex-col items-center gap-2 text-ink-faint hover:text-accent hover:border-accent"
            >
              <Upload size={24} />
              <span className="text-sm">Upload CSV (first row = column names)</span>
              {vars.length > 0 && (
                <span className="text-[11px]">Expected columns: {vars.join(', ')}</span>
              )}
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet size={16} className="text-ink-muted" />
                {csv.rows.length} rows · {csv.headers.length} columns
                <button onClick={loadCsv} className="btn-ghost text-xs ml-auto py-1">
                  Replace
                </button>
              </div>

              {unmatched.length > 0 && (
                <p className="text-xs text-amber-400">
                  Unmatched variables (will be blank): {unmatched.join(', ')}
                </p>
              )}

              <div className="max-h-32 overflow-auto rounded border border-line text-xs">
                <table className="w-full">
                  <thead className="bg-surface-2 sticky top-0">
                    <tr>
                      {csv.headers.map((h) => (
                        <th key={h} className="px-2 py-1 text-left font-medium text-ink-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {csv.headers.map((h) => (
                          <td key={h} className="px-2 py-1 truncate max-w-[120px]">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                {(['images', 'projects'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'btn flex-1 py-2 capitalize',
                      mode === m ? 'bg-accent text-white' : 'bg-surface-3 text-ink-muted'
                    )}
                  >
                    {m === 'images' ? 'Export PNGs' : 'Create projects'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-line">
          <span className="text-xs text-ink-faint">
            {phase === 'running' && `Generating ${progress}/${csv?.rows.length}…`}
            {phase === 'done' && `Done — ${progress} generated.`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">
              {phase === 'done' ? 'Close' : 'Cancel'}
            </button>
            {phase !== 'done' && (
              <button
                onClick={run}
                disabled={!csv || csv.rows.length === 0 || phase === 'running'}
                className="btn-primary text-sm"
              >
                {phase === 'running' ? <Loader2 size={15} className="animate-spin" /> : null}
                Generate
              </button>
            )}
          </div>
        </div>
      </div>

      {current && <BatchRenderer canvas={current.canvas} layers={current.layers} onStage={onStage} />}
    </div>
  )
}
