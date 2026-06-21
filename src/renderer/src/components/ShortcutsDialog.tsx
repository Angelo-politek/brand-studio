import { X } from 'lucide-react'

const MOD = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

const SHORTCUTS: [string, string][] = [
  [`${MOD} Z`, 'Undo'],
  [`${MOD} Shift Z`, 'Redo'],
  [`${MOD} D`, 'Duplicate selection'],
  [`${MOD} C / ${MOD} V`, 'Copy / paste'],
  ['Delete / Backspace', 'Delete selection'],
  ['Esc', 'Deselect'],
  ['Arrow keys', 'Nudge 1px (Shift = 10px)'],
  [`${MOD} 0`, 'Fit to screen'],
  [`${MOD} 1`, 'Zoom to 100%'],
  ['?', 'Show this panel']
]

/** Lists the editor keyboard shortcuts (mirrors useEditorHotkeys). */
export default function ShortcutsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">{label}</span>
              <kbd className="bg-surface-3 text-ink rounded px-2 py-0.5 text-xs font-mono">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
