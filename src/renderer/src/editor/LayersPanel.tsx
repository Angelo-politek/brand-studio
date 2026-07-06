import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Type,
  Square,
  Circle,
  Triangle,
  Hexagon,
  Minus,
  MoveRight,
  Image as ImageIcon,
  Group as GroupIcon
} from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useEditorStoreApi } from './editorStoreContext'
import type { Layer, LayerType } from '@shared/types'

const ICONS: Record<LayerType, typeof Type> = {
  text: Type,
  rect: Square,
  circle: Circle,
  triangle: Triangle,
  polygon: Hexagon,
  line: Minus,
  arrow: MoveRight,
  image: ImageIcon,
  group: GroupIcon
}

export default function LayersPanel(): JSX.Element {
  const useStore = useEditorStoreApi()
  const {
    layers,
    selectedIds,
    select,
    toggleSelect,
    updateLayer,
    removeLayer,
    duplicateLayer,
    moveLayer,
    groupSelected,
    ungroupSelected
  } = useStore()

  // Display topmost first (array end = top z-order).
  const ordered = [...layers].reverse()
  const selected = layers.filter((l) => selectedIds.includes(l.id))
  const canGroup = selected.length >= 2
  const canUngroup = selected.some((l) => l.groupId)

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2 text-xs font-medium text-ink-muted border-b border-line flex items-center justify-between">
        <span>Layers</span>
        {(canGroup || canUngroup) && (
          <button
            onClick={() => (canUngroup ? ungroupSelected() : groupSelected())}
            className="text-[11px] text-ink-faint hover:text-accent flex items-center gap-1"
            title={canUngroup ? 'Ungroup (Ctrl+Shift+G)' : 'Group selection (Ctrl+G)'}
          >
            <GroupIcon size={12} /> {canUngroup ? 'Ungroup' : 'Group'}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {ordered.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-ink-faint">No layers yet.</div>
        )}
        {ordered.map((layer: Layer) => {
          const Icon = ICONS[layer.type]
          const active = selectedIds.includes(layer.id)
          return (
            <div
              key={layer.id}
              onClick={(e) => (e.shiftKey ? toggleSelect(layer.id) : select(layer.id))}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer',
                active ? 'bg-surface-3' : 'hover:bg-surface-2'
              )}
            >
              {layer.groupId && (
                <GroupIcon size={11} className="shrink-0 text-accent/70 -mr-1" />
              )}
              <Icon size={14} className="shrink-0 text-ink-faint" />
              <span className={cn('flex-1 truncate text-xs', !layer.visible && 'opacity-40')}>
                {layer.name}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveLayer(layer.id, 'up')
                  }}
                  className="p-0.5 text-ink-faint hover:text-ink"
                  title="Bring forward"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveLayer(layer.id, 'down')
                  }}
                  className="p-0.5 text-ink-faint hover:text-ink"
                  title="Send backward"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateLayer(layer.id)
                  }}
                  className="p-0.5 text-ink-faint hover:text-ink"
                  title="Duplicate"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLayer(layer.id)
                  }}
                  className="p-0.5 text-ink-faint hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { visible: !layer.visible })
                }}
                className="p-0.5 text-ink-faint hover:text-ink"
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { locked: !layer.locked })
                }}
                className="p-0.5 text-ink-faint hover:text-ink"
              >
                {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
