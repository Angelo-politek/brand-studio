import { useState } from 'react'
import { X, Loader2, FolderOpen, ExternalLink } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useEditorStore } from '@renderer/stores/editorStore'
import { getStage } from '@renderer/editor/stageRef'
import { exportArtboard, type ExportFmt } from '@renderer/editor/exportArtboard'
import type { ExportRecord } from '@shared/types'

const FORMATS: ExportFmt[] = ['png', 'jpg', 'webp', 'pdf']
const SCALES = [1, 2, 3]

export default function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { canvas, name, projectId, brandId } = useEditorStore()
  const [format, setFormat] = useState<ExportFmt>('png')
  const [scale, setScale] = useState(2)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ExportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const outW = Math.round(canvas.width * (format === 'pdf' ? 1 : scale))
  const outH = Math.round(canvas.height * (format === 'pdf' ? 1 : scale))

  async function run(): Promise<void> {
    const stage = getStage()
    if (!stage) {
      setError('Canvas not ready.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const record = await exportArtboard({
        stage,
        canvas,
        format,
        scale: format === 'pdf' ? 1 : scale,
        name,
        projectId,
        brandId
      })
      setDone(record)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Export</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-green-400">Exported successfully.</p>
            <p className="text-xs text-ink-faint font-mono break-all">{done.filePath}</p>
            <div className="flex gap-2">
              <button
                onClick={() => window.api.app.openPath(done.filePath)}
                className="btn-surface text-sm flex-1"
              >
                <ExternalLink size={14} /> Open
              </button>
              <button
                onClick={() => window.api.app.showInFolder(done.filePath)}
                className="btn-surface text-sm flex-1"
              >
                <FolderOpen size={14} /> Show in folder
              </button>
            </div>
            <button onClick={onClose} className="btn-primary w-full text-sm">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-ink-faint mb-2">Format</label>
              <div className="grid grid-cols-4 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn(
                      'btn py-2',
                      format === f ? 'bg-accent text-white' : 'bg-surface-3 text-ink-muted'
                    )}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {format !== 'pdf' && (
              <div>
                <label className="block text-xs text-ink-faint mb-2">Scale</label>
                <div className="grid grid-cols-3 gap-2">
                  {SCALES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={cn(
                        'btn py-2',
                        scale === s ? 'bg-surface-4 text-ink' : 'bg-surface-3 text-ink-muted'
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-ink-faint">
              Output: {outW}×{outH}px
            </p>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button onClick={run} disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? 'Exporting…' : 'Export'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
