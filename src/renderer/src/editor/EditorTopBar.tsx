import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Grid3x3,
  SquareDashed,
  Download,
  Check,
  LayoutTemplate,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter
} from 'lucide-react'
import { callFit } from './fitRef'
import { useEditorStore } from '@renderer/stores/editorStore'
import { extractVariables } from '@renderer/lib/variables'
import { toast, promptDialog } from '@renderer/stores/uiStore'
import { getStage } from './stageRef'
import { captureThumbnailBytes } from './exportArtboard'
import { cn } from '@renderer/lib/cn'
import type { Layer } from '@shared/types'

interface Props {
  saving: boolean
  onExport?: () => void
  onResize?: () => void
}

function SelectionInfo({
  layer,
  layers,
  selectedIds,
  updateLayer
}: {
  layer: Layer | null
  layers: Layer[]
  selectedIds: string[]
  updateLayer: (id: string, patch: Partial<Layer>) => void
}): JSX.Element {
  const sel = layers.filter((l) => selectedIds.includes(l.id))
  const x = layer ? Math.round(layer.x) : Math.round(Math.min(...sel.map((l) => l.x)))
  const y = layer ? Math.round(layer.y) : Math.round(Math.min(...sel.map((l) => l.y)))
  const w = layer
    ? Math.round(layer.width * layer.scaleX)
    : Math.round(
        Math.max(...sel.map((l) => l.x + l.width * l.scaleX)) - Math.min(...sel.map((l) => l.x))
      )
  const h = layer
    ? Math.round(layer.height * layer.scaleY)
    : Math.round(
        Math.max(...sel.map((l) => l.y + l.height * l.scaleY)) - Math.min(...sel.map((l) => l.y))
      )

  function handle(field: string, val: number): void {
    if (!layer) return
    if (field === 'x') updateLayer(layer.id, { x: val })
    else if (field === 'y') updateLayer(layer.id, { y: val })
    else if (field === 'w' && layer.width > 0) updateLayer(layer.id, { scaleX: val / layer.width })
    else if (field === 'h' && layer.height > 0)
      updateLayer(layer.id, { scaleY: val / layer.height })
  }

  return (
    <div className="flex items-center gap-1 border-l border-line pl-2 ml-1">
      {(
        [
          ['X', 'x', x],
          ['Y', 'y', y],
          ['W', 'w', w],
          ['H', 'h', h]
        ] as [string, string, number][]
      ).map(([lbl, key, val]) => (
        <label key={key} className="flex items-center gap-0.5">
          <span className="text-[10px] text-ink-faint">{lbl}</span>
          <input
            type="number"
            value={val}
            readOnly={!layer}
            onChange={layer ? (e) => handle(key, Number(e.target.value)) : undefined}
            className={cn(
              'w-14 rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent/40',
              layer ? 'bg-surface-2 text-ink' : 'bg-surface-2/50 text-ink-faint cursor-default'
            )}
          />
        </label>
      ))}
    </div>
  )
}

function ZoomControl(): JSX.Element {
  const { zoom, setZoom } = useEditorStore()
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const PRESETS = [25, 50, 75, 100, 150, 200]
  const pct = Math.round(zoom * 100)

  function commit(val: string): void {
    const n = parseInt(val, 10)
    if (!isNaN(n) && n > 0) setZoom(n / 100)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        autoFocus
        defaultValue={pct}
        className="w-16 rounded px-1 py-0.5 text-xs text-center bg-surface-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <div className="relative flex items-center">
      <button
        onClick={() => setEditing(true)}
        className="w-14 rounded px-1 py-0.5 text-xs text-center bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors"
        title="Click to set zoom. Ctrl+0 = fit, Ctrl+1 = 100%"
      >
        {pct}%
      </button>
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value
          if (v === 'fit') {
            callFit()
            return
          }
          setZoom(Number(v) / 100)
        }}
        className="absolute right-0 opacity-0 w-4 h-full cursor-pointer"
        title="Zoom preset"
      >
        <option value="">—</option>
        <option value="fit">Fit to screen</option>
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}%
          </option>
        ))}
      </select>
    </div>
  )
}

export default function EditorTopBar({ saving, onExport, onResize }: Props): JSX.Element {
  const navigate = useNavigate()
  const {
    name,
    setName,
    showGrid,
    showSafe,
    toggleGrid,
    toggleSafe,
    selectedIds,
    layers,
    updateLayer,
    alignSelected,
    distributeSelected
  } = useEditorStore()
  const layer =
    selectedIds.length === 1 ? (layers.find((l) => l.id === selectedIds[0]) ?? null) : null
  const { canUndo, canRedo } = useStore(
    useEditorStore.temporal,
    useShallow((s) => ({ canUndo: s.pastStates.length > 0, canRedo: s.futureStates.length > 0 }))
  )

  async function saveAsTemplate(): Promise<void> {
    const st = useEditorStore.getState()
    const templateName = await promptDialog('Template name', st.name)
    if (!templateName) return
    const variables = extractVariables(st.layers)
    const template = await window.api.templates.create({
      brandId: st.brandId,
      name: templateName,
      type: st.type,
      canvas: st.canvas,
      layers: st.layers,
      variables
    })
    const stage = getStage()
    if (stage) {
      try {
        await window.api.templates.saveThumb(template.id, captureThumbnailBytes(stage, st.canvas))
      } catch {
        /* non-fatal */
      }
    }
    toast(
      `Saved as template${variables.length ? ` with variables: ${variables.map((v) => `{{${v}}}`).join(', ')}` : ''}.`,
      'success'
    )
  }

  return (
    <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-line bg-surface-1">
      <button onClick={() => navigate('/app/projects')} className="btn-ghost px-2 py-1.5">
        <ArrowLeft size={16} />
      </button>

      <input
        className="bg-transparent text-sm font-medium px-2 py-1 rounded hover:bg-surface-2 focus:bg-surface-2 focus:outline-none w-56"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => useEditorStore.temporal.getState().undo()}
          disabled={!canUndo}
          className="btn-ghost px-2 py-1.5"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={() => useEditorStore.temporal.getState().redo()}
          disabled={!canRedo}
          className="btn-ghost px-2 py-1.5"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleGrid}
          className={cn('btn-ghost px-2 py-1.5', showGrid && 'text-accent')}
          title="Toggle grid + snap"
        >
          <Grid3x3 size={16} />
        </button>
        <button
          onClick={toggleSafe}
          className={cn('btn-ghost px-2 py-1.5', showSafe && 'text-accent')}
          title="Toggle safe margins"
        >
          <SquareDashed size={16} />
        </button>
      </div>

      {/* Alignment toolbar — visible when ≥1 layer selected */}
      {selectedIds.length >= 1 && (
        <div className="flex items-center gap-0.5 border-l border-line pl-2 ml-1">
          <button
            onClick={() => alignSelected('left')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align left"
          >
            <AlignLeft size={15} />
          </button>
          <button
            onClick={() => alignSelected('centerX')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align center X"
          >
            <AlignCenter size={15} />
          </button>
          <button
            onClick={() => alignSelected('right')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align right"
          >
            <AlignRight size={15} />
          </button>
          <button
            onClick={() => alignSelected('top')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align top"
          >
            <AlignStartVertical size={15} />
          </button>
          <button
            onClick={() => alignSelected('centerY')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align center Y"
          >
            <AlignCenterVertical size={15} />
          </button>
          <button
            onClick={() => alignSelected('bottom')}
            className="btn-ghost px-1.5 py-1.5"
            title="Align bottom"
          >
            <AlignEndVertical size={15} />
          </button>
          {selectedIds.length >= 3 && (
            <>
              <button
                onClick={() => distributeSelected('horizontal')}
                className="btn-ghost px-1.5 py-1.5"
                title="Distribute horizontally"
              >
                <AlignHorizontalDistributeCenter size={15} />
              </button>
              <button
                onClick={() => distributeSelected('vertical')}
                className="btn-ghost px-1.5 py-1.5"
                title="Distribute vertically"
              >
                <AlignVerticalDistributeCenter size={15} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Selection W/H/X/Y info */}
      {selectedIds.length >= 1 && (
        <SelectionInfo
          layer={layer}
          layers={layers}
          selectedIds={selectedIds}
          updateLayer={updateLayer}
        />
      )}

      <button
        onClick={saveAsTemplate}
        className="btn-ghost px-2 py-1.5 text-sm"
        title="Save as template"
      >
        <LayoutTemplate size={16} />
      </button>

      {onResize && (
        <button onClick={onResize} className="btn-ghost px-2 py-1.5 text-sm" title="Make variants">
          <Maximize2 size={16} />
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <ZoomControl />
        <span className="text-xs text-ink-faint flex items-center gap-1">
          {saving ? (
            'Saving…'
          ) : (
            <>
              <Check size={13} className="text-green-400" /> Saved
            </>
          )}
        </span>
        {onExport && (
          <button onClick={onExport} className="btn-primary text-sm">
            <Download size={15} /> Export
          </button>
        )}
      </div>
    </div>
  )
}
