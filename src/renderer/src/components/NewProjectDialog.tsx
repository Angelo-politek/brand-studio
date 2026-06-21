import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import {
  DESIGN_PRESETS,
  PRESET_CATEGORIES,
  presetByType,
  type PresetCategory,
  type SizePreset
} from '@renderer/lib/presets'
import type { CanvasSpec } from '@shared/types'

interface Props {
  initialType?: string
  onClose: () => void
  onCreate: (input: { name: string; type: string; canvas: CanvasSpec }) => void
}

export default function NewProjectDialog({ initialType, onClose, onCreate }: Props): JSX.Element {
  const initialPreset = (initialType && presetByType(initialType)) || DESIGN_PRESETS[0]
  const [category, setCategory] = useState<PresetCategory>(initialPreset.category)
  const [selected, setSelected] = useState<SizePreset>(initialPreset)
  const [custom, setCustom] = useState({ width: 1080, height: 1080, on: false })
  const [name, setName] = useState(initialPreset.label)

  const presets = DESIGN_PRESETS.filter((p) => p.category === category)

  function submit(): void {
    const canvas: CanvasSpec = custom.on
      ? { width: custom.width, height: custom.height, background: '#ffffff' }
      : { width: selected.width, height: selected.height, background: '#ffffff' }
    const type = custom.on ? 'custom' : selected.type
    onCreate({ name: name.trim() || 'Untitled', type, canvas })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">New design</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex gap-2">
            {PRESET_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c)
                  setCustom((s) => ({ ...s, on: false }))
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm',
                  category === c && !custom.on ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2'
                )}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setCustom((s) => ({ ...s, on: true }))}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm ml-auto',
                custom.on ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-2'
              )}
            >
              Custom
            </button>
          </div>

          {custom.on ? (
            <div className="flex items-end gap-3">
              <label className="text-sm">
                <span className="block text-xs text-ink-faint mb-1">Width</span>
                <input
                  type="number"
                  className="input w-32"
                  value={custom.width}
                  min={1}
                  onChange={(e) => setCustom((s) => ({ ...s, width: Number(e.target.value) }))}
                />
              </label>
              <span className="pb-2 text-ink-faint">×</span>
              <label className="text-sm">
                <span className="block text-xs text-ink-faint mb-1">Height</span>
                <input
                  type="number"
                  className="input w-32"
                  value={custom.height}
                  min={1}
                  onChange={(e) => setCustom((s) => ({ ...s, height: Number(e.target.value) }))}
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {presets.map((p) => {
                const active = selected.type === p.type
                const ar = p.width / p.height
                return (
                  <button
                    key={p.type}
                    onClick={() => {
                      setSelected(p)
                      setName(p.label)
                    }}
                    className={cn(
                      'card p-3 flex flex-col items-center gap-2 hover:border-accent/60',
                      active && 'border-accent'
                    )}
                  >
                    <div className="h-16 grid place-items-center">
                      <div
                        className="bg-surface-3 border border-line rounded"
                        style={{
                          width: ar >= 1 ? 56 : 56 * ar,
                          height: ar >= 1 ? 56 / ar : 56
                        }}
                      />
                    </div>
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-[10px] text-ink-faint">
                      {p.width}×{p.height}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div>
            <label className="block text-xs text-ink-faint mb-1">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary text-sm">
            Create design
          </button>
        </div>
      </div>
    </div>
  )
}
