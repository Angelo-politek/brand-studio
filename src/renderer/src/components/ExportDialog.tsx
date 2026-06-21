import { useState } from 'react'
import { X, Loader2, FolderOpen, ExternalLink } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useEditorStore } from '@renderer/stores/editorStore'
import { getStage } from '@renderer/editor/stageRef'
import {
  exportArtboard,
  artboardBytes,
  pagesToPdf,
  saveBytesAs,
  sanitize,
  type ExportFmt
} from '@renderer/editor/exportArtboard'
import { toast } from '@renderer/stores/uiStore'
import type { ExportRecord } from '@shared/types'

const FORMATS: ExportFmt[] = ['png', 'jpg', 'webp', 'pdf']
const SCALES = [1, 2, 3]

const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export default function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { canvas, name, projectId, brandId, pages } = useEditorStore()
  const [format, setFormat] = useState<ExportFmt>('png')
  const [scale, setScale] = useState(2)
  const [allPages, setAllPages] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ExportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const multiPage = pages.length > 1
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

  // Capture every page by switching the active page and re-rendering between
  // captures. Restores the originally active page when done.
  async function captureAllPages(): Promise<
    { bytes: Uint8Array; width: number; height: number }[]
  > {
    const store = useEditorStore.getState()
    const original = store.activePageId
    const out: { bytes: Uint8Array; width: number; height: number }[] = []
    try {
      for (const pg of store.pages) {
        store.setActivePage(pg.id)
        await nextFrame()
        const stage = getStage()
        if (!stage) continue
        const png = await artboardBytes(stage, pg.canvas, 'png', format === 'pdf' ? 1 : scale)
        out.push({ bytes: png, width: pg.canvas.width, height: pg.canvas.height })
      }
    } finally {
      store.setActivePage(original)
      await nextFrame()
    }
    return out
  }

  async function saveAs(): Promise<void> {
    const stage = getStage()
    if (!stage) {
      setError('Canvas not ready.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (allPages && multiPage) {
        const captured = await captureAllPages()
        if (format === 'pdf') {
          const pdf = await pagesToPdf(captured)
          const saved = await saveBytesAs(pdf, `${name}-all`, 'pdf')
          if (saved) toast(`Exported ${captured.length} pages to PDF.`, 'success')
        } else {
          // One file per page, each via its own save dialog.
          let n = 0
          for (let i = 0; i < captured.length; i++) {
            const ok = await saveBytesAs(captured[i].bytes, `${sanitize(name)}-${i + 1}`, format)
            if (ok) n++
          }
          if (n) toast(`Saved ${n} page(s).`, 'success')
        }
      } else {
        const bytes = await artboardBytes(stage, canvas, format, format === 'pdf' ? 1 : scale)
        const saved = await saveBytesAs(bytes, name, format)
        if (saved) toast('Saved.', 'success')
      }
      onClose()
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

            {multiPage && (
              <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={allPages}
                  onChange={(e) => setAllPages(e.target.checked)}
                />
                Export all {pages.length} pages
                {allPages && format === 'pdf' ? ' (single PDF)' : ''}
              </label>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button onClick={run} disabled={busy} className="btn-surface flex-1">
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                Export to library
              </button>
              <button onClick={saveAs} disabled={busy} className="btn-primary flex-1">
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                Save as…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
