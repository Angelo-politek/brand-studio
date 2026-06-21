import { useState } from 'react'
import { Plus, Copy, Trash2 } from 'lucide-react'
import { useEditorStore } from '@renderer/stores/editorStore'
import { cn } from '@renderer/lib/cn'

export default function PagesPanel(): JSX.Element {
  const { pages, activePageId, setActivePage, addPage, deletePage, duplicatePage, renamePage } =
    useEditorStore()
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="h-20 shrink-0 border-t border-line bg-surface-1 flex items-center gap-2 px-3 overflow-x-auto">
      {pages.map((page, i) => {
        const isActive = page.id === activePageId
        const bg = page.canvas.background === 'transparent' ? '#ffffff' : page.canvas.background
        return (
          <div key={page.id} className="flex flex-col items-center gap-1 shrink-0">
            <div
              onClick={() => setActivePage(page.id)}
              className={cn(
                'group relative w-14 h-10 rounded border-2 cursor-pointer transition-colors overflow-hidden',
                isActive ? 'border-accent shadow-sm' : 'border-line hover:border-accent/50'
              )}
              style={{ background: bg }}
              title={page.name}
            >
              {/* Mini layer count badge */}
              {page.layers.length > 0 && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none bg-black/50 text-white rounded px-0.5">
                  {page.layers.length}
                </span>
              )}
              {/* Context actions on hover */}
              <div className="absolute top-0 right-0 hidden group-hover:flex gap-0.5 bg-black/50 rounded-bl p-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicatePage(page.id)
                  }}
                  className="text-white hover:text-accent"
                  title="Duplicate page"
                >
                  <Copy size={9} />
                </button>
                {pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePage(page.id)
                    }}
                    className="text-white hover:text-red-400"
                    title="Delete page"
                  >
                    <Trash2 size={9} />
                  </button>
                )}
              </div>
            </div>
            {/* Page name (editable) */}
            {editingId === page.id ? (
              <input
                autoFocus
                className="text-[10px] w-14 text-center bg-surface-2 border border-accent rounded px-1 py-0 outline-none"
                defaultValue={page.name}
                onBlur={(e) => {
                  renamePage(page.id, e.target.value || `Page ${i + 1}`)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <button
                onDoubleClick={() => setEditingId(page.id)}
                onClick={() => setActivePage(page.id)}
                className={cn(
                  'text-[10px] w-14 truncate text-center rounded',
                  isActive ? 'text-ink font-medium' : 'text-ink-faint hover:text-ink'
                )}
                title="Double-click to rename"
              >
                {page.name}
              </button>
            )}
          </div>
        )
      })}

      {/* Add page button */}
      <button
        onClick={addPage}
        className="h-10 w-10 shrink-0 rounded border-2 border-dashed border-line text-ink-faint hover:border-accent hover:text-accent grid place-items-center"
        title="Add page"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
