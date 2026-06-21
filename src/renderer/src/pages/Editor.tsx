import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditorStore } from '@renderer/stores/editorStore'
import { useBrandStore } from '@renderer/stores/brandStore'
import { ensureBrandFonts } from '@renderer/lib/fonts'
import EditorTopBar from '@renderer/editor/EditorTopBar'
import EditorCanvas from '@renderer/editor/EditorCanvas'
import ElementsPanel from '@renderer/editor/ElementsPanel'
import LayersPanel from '@renderer/editor/LayersPanel'
import Inspector from '@renderer/editor/Inspector'
import PagesPanel from '@renderer/editor/PagesPanel'
import { useEditorHotkeys } from '@renderer/editor/useEditorHotkeys'
import ExportDialog from '@renderer/components/ExportDialog'
import ResizeDialog from '@renderer/components/ResizeDialog'
import { getStage } from '@renderer/editor/stageRef'
import { captureThumbnailBytes } from '@renderer/editor/exportArtboard'
import type { Project } from '@shared/types'

export default function Editor(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const lastSavedRef = useRef('')

  useEditorHotkeys()

  const name = useEditorStore((s) => s.name)
  const canvas = useEditorStore((s) => s.canvas)
  const layers = useEditorStore((s) => s.layers)
  const pages = useEditorStore((s) => s.pages)

  // Load the project once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) return
      const p = await window.api.projects.get(projectId)
      if (cancelled) return
      if (!p) {
        navigate('/app/projects')
        return
      }
      useEditorStore.getState().loadProject(p)
      useEditorStore.temporal.getState().clear()
      lastSavedRef.current = JSON.stringify({ name: p.name, canvas: p.canvas, layers: p.layers, pages: p.pages })
      const brand =
        useBrandStore.getState().brands.find((b) => b.id === p.brandId) ??
        (await window.api.brands.get(p.brandId))
      await ensureBrandFonts(brand)
    })()
    return () => {
      cancelled = true
      useEditorStore.temporal.getState().clear()
    }
  }, [projectId, navigate])

  // Debounced autosave whenever design data changes.
  useEffect(() => {
    const snapshot = JSON.stringify({ name, canvas, layers, pages })
    if (snapshot === lastSavedRef.current || !lastSavedRef.current) return
    setSaving(true)
    const t = setTimeout(async () => {
      const st = useEditorStore.getState()
      if (!st.projectId || !st.brandId) return
      const project: Project = {
        id: st.projectId,
        brandId: st.brandId,
        name: st.name,
        type: st.type,
        canvas: st.canvas,
        layers: st.layers,
        pages: st.pages,
        thumbPath: null,
        createdAt: st.createdAt,
        updatedAt: Date.now()
      }
      await window.api.projects.update(project)
      lastSavedRef.current = JSON.stringify({ name: st.name, canvas: st.canvas, layers: st.layers, pages: st.pages })
      // Refresh the grid thumbnail (best-effort, overwrites projects/<id>.png).
      const stage = getStage()
      if (stage) {
        try {
          await window.api.projects.saveThumb(st.projectId, captureThumbnailBytes(stage, st.canvas))
        } catch {
          /* non-fatal */
        }
      }
      setSaving(false)
    }, 600)
    return () => clearTimeout(t)
  }, [name, canvas, layers, pages])

  return (
    <div className="h-full flex flex-col bg-surface-0">
      <EditorTopBar
        saving={saving}
        onExport={() => setExportOpen(true)}
        onResize={() => setResizeOpen(true)}
      />
      <div className="flex-1 min-h-0 flex">
        <ElementsPanel />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <EditorCanvas />
          </div>
          <PagesPanel />
        </div>
        <div className="w-80 shrink-0 border-l border-line bg-surface-1 flex flex-col min-h-0">
          <div className="h-[42%] min-h-0 flex flex-col border-b border-line">
            <LayersPanel />
          </div>
          <Inspector />
        </div>
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {resizeOpen && <ResizeDialog onClose={() => setResizeOpen(false)} />}
    </div>
  )
}
