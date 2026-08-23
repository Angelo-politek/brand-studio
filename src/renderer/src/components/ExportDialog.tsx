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
  type ExportFmt,
  type PdfPageInput
} from '@renderer/editor/exportArtboard'
import {
  DPI_CHOICES,
  clampScaleToCanvasLimit,
  exceedsCanvasLimit,
  formatPhysicalSize,
  inferDpi
} from '@renderer/lib/printSize'
import { toast } from '@renderer/stores/uiStore'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import type { ExportRecord } from '@shared/types'

const FORMATS: ExportFmt[] = ['png', 'jpg', 'webp', 'pdf']
const SCALES = [1, 2, 3]

const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export default function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { canvas, name, projectId, brandId, pages } = useEditorStore()
  const brand = useCurrentBrand()
  const [format, setFormat] = useState<ExportFmt>('png')
  const [scale, setScale] = useState(2)
  const [quality, setQuality] = useState(0.92)
  // null = follow the density implied by the canvas size (correct by default).
  const [dpiOverride, setDpiOverride] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ExportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const multiPage = pages.length > 1
  // Which pages to include when exporting multiple pages (all selected initially).
  const [selectedPages, setSelectedPages] = useState<Set<string>>(
    () => new Set(pages.map((p) => p.id))
  )
  const chosenPageIds = pages.filter((p) => selectedPages.has(p.id)).map((p) => p.id)
  // Use the page-capture path whenever a multi-page doc has a selection (even a
  // single chosen page that isn't the active one). Single-page docs use the
  // simple active-artboard path.
  const exportChosen = multiPage && chosenPageIds.length >= 1

  function togglePage(id: string): void {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const outW = Math.round(canvas.width * (format === 'pdf' ? 1 : scale))
  const outH = Math.round(canvas.height * (format === 'pdf' ? 1 : scale))
  // PDF pages are measured in points, so the canvas density decides the printed
  // size. Default to the density implied by the canvas, overridable below.
  const autoDpi = inferDpi(canvas.width, canvas.height)
  const pdfDpi = dpiOverride ?? autoDpi
  const tooLarge = format !== 'pdf' && exceedsCanvasLimit(canvas.width, canvas.height, scale)
  const safeScale = clampScaleToCanvasLimit(canvas.width, canvas.height, scale)
  const presets = (brand?.presets ?? []).filter((p) =>
    (FORMATS as string[]).includes(p.format as string)
  )

  function applyPreset(presetId: string): void {
    const p = presets.find((x) => x.id === presetId)
    if (!p) return
    setFormat(p.format as ExportFmt)
    if (p.scale) setScale(p.scale)
    if (p.quality != null) setQuality(p.quality > 1 ? p.quality / 100 : p.quality)
  }

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
        scale: format === 'pdf' ? 1 : safeScale,
        name,
        projectId,
        brandId,
        quality,
        dpi: pdfDpi
      })
      setDone(record)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Capture the CHOSEN pages by switching the active page and re-rendering
  // between captures. Restores the originally active page when done.
  async function captureChosenPages(): Promise<PdfPageInput[]> {
    const store = useEditorStore.getState()
    const original = store.activePageId
    const out: PdfPageInput[] = []
    try {
      for (const pg of store.pages) {
        if (!selectedPages.has(pg.id)) continue
        store.setActivePage(pg.id)
        await nextFrame()
        const stage = getStage()
        if (!stage) continue
        // Each page carries its own size, so clamp and resolve density per page
        // rather than assuming every page matches the active canvas.
        const pageScale =
          format === 'pdf' ? 1 : clampScaleToCanvasLimit(pg.canvas.width, pg.canvas.height, scale)
        const png = await artboardBytes(stage, pg.canvas, 'png', pageScale)
        out.push({
          bytes: png,
          width: pg.canvas.width,
          height: pg.canvas.height,
          dpi: dpiOverride ?? inferDpi(pg.canvas.width, pg.canvas.height)
        })
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
      if (exportChosen) {
        const captured = await captureChosenPages()
        if (captured.length === 0) {
          setError('Select at least one page.')
          return
        }
        if (format === 'pdf') {
          const pdf = await pagesToPdf(captured)
          const saved = await saveBytesAs(pdf, `${name}-pages`, 'pdf')
          if (saved) toast(`Exported ${captured.length} page(s) to PDF.`, 'success')
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
        const bytes = await artboardBytes(
          stage,
          canvas,
          format,
          format === 'pdf' ? 1 : safeScale,
          quality,
          pdfDpi
        )
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
            {presets.length > 0 && (
              <div>
                <label className="block text-xs text-ink-faint mb-2">Brand presets</label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className="btn bg-surface-3 text-ink-muted hover:text-ink py-1.5 px-3 text-xs"
                      title={`${p.format.toUpperCase()}${p.scale ? ` ${p.scale}×` : ''}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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

            {format === 'pdf' && (
              <div>
                <label className="block text-xs text-ink-faint mb-2">
                  Print resolution
                  {dpiOverride === null && <span className="ml-1 opacity-60">(auto)</span>}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DPI_CHOICES.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDpiOverride(d === autoDpi ? null : d)}
                      className={cn(
                        'btn py-2 text-xs',
                        pdfDpi === d ? 'bg-surface-4 text-ink' : 'bg-surface-3 text-ink-muted'
                      )}
                      title={`${d} DPI`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(format === 'jpg' || format === 'webp') && (
              <div>
                <label className="block text-xs text-ink-faint mb-2">
                  Quality · {Math.round(quality * 100)}%
                </label>
                <input
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.02}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-ink-faint">
                Output: {outW}×{outH}px
              </p>
              {format === 'pdf' && (
                <p className="text-xs text-ink-muted">
                  Page size: {formatPhysicalSize(canvas.width, canvas.height, pdfDpi)}
                </p>
              )}
              {tooLarge && (
                <p className="text-[11px] text-amber-400">
                  {scale}× would exceed the browser canvas limit and export blank — using{' '}
                  {safeScale}× instead.
                </p>
              )}
            </div>

            {multiPage && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-ink-faint">
                    Pages to export
                    {exportChosen && chosenPageIds.length > 1 && format === 'pdf'
                      ? ' (single PDF)'
                      : ''}
                  </label>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={() => setSelectedPages(new Set(pages.map((p) => p.id)))}
                      className="text-ink-muted hover:text-accent"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedPages(new Set())}
                      className="text-ink-muted hover:text-accent"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {pages.map((p, i) => {
                    const on = selectedPages.has(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePage(p.id)}
                        className={cn(
                          'px-2 py-1 rounded text-[11px] border transition-colors',
                          on
                            ? 'border-accent bg-accent/15 text-ink'
                            : 'border-line text-ink-muted hover:text-ink'
                        )}
                        title={p.name}
                      >
                        {i + 1}. {p.name}
                      </button>
                    )
                  })}
                </div>
                {chosenPageIds.length === 0 && (
                  <p className="text-[11px] text-red-400 mt-1">Select at least one page.</p>
                )}
              </div>
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
