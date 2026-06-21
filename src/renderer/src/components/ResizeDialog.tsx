import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useEditorStore } from '@renderer/stores/editorStore'
import { resizeLayers } from '@renderer/lib/autoresize'
import { SIZE_PRESETS, PRESET_CATEGORIES } from '@renderer/lib/presets'
import { toast } from '@renderer/stores/uiStore'

export default function ResizeDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { canvas, layers, name, brandId } = useEditorStore()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  function toggle(type: string): void {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(type)) n.delete(type)
      else n.add(type)
      return n
    })
  }

  async function create(): Promise<void> {
    if (!brandId || picked.size === 0) return
    setBusy(true)
    try {
      for (const preset of SIZE_PRESETS.filter((p) => picked.has(p.type))) {
        const to = { width: preset.width, height: preset.height, background: canvas.background }
        await window.api.projects.create({
          brandId,
          name: `${name} – ${preset.label}`,
          type: preset.type,
          canvas: to,
          layers: resizeLayers(layers, canvas, to)
        })
      }
      toast(`Created ${picked.size} variant${picked.size > 1 ? 's' : ''}.`, 'success')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Make variants</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-ink-muted">
            Pick target formats. Layers are scaled to fit and centred in each.
          </p>
          {PRESET_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="text-xs text-ink-faint mb-2">{cat}</div>
              <div className="grid grid-cols-3 gap-2">
                {SIZE_PRESETS.filter((p) => p.category === cat).map((p) => (
                  <button
                    key={p.type}
                    onClick={() => toggle(p.type)}
                    className={cn(
                      'card p-2 text-left',
                      picked.has(p.type) ? 'border-accent' : 'hover:border-surface-4'
                    )}
                  >
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-[10px] text-ink-faint">
                      {p.width}×{p.height}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button onClick={create} disabled={busy || picked.size === 0} className="btn-primary text-sm">
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            Create {picked.size > 0 ? picked.size : ''} variant{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
