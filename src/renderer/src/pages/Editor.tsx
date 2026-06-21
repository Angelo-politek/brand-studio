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
import ShortcutsDialog from '@renderer/components/ShortcutsDialog'
import { getStage } from '@renderer/editor/stageRef'
import { captureThumbnailBytes } from '@renderer/editor/exportArtboard'
import { toast } from '@renderer/stores/uiStore'
import type { Project } from '@shared/types'

/** Build a Project snapshot from the current editor store state. */
function currentProject(): Project | null {
  const st = useEditorStore.getState()
  if (!st.projectId || !st.brandId) return null
  return {
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
}

function snapshotKey(p: Pick<Project, 'name' | 'canvas' | 'layers' | 'pages'>): string {
  return JSON.stringify({ name: p.name, canvas: p.canvas, layers: p.layers, pages: p.pages })
}

export default function Editor(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
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
      lastSavedRef.current = snapshotKey(p)
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

  // Persist the current state immediately. Surfaces errors to the user and
  // never leaves the saving spinner stuck. Returns true on success.
  async function persist(withThumb: boolean): Promise<boolean> {
    const project = currentProject()
    if (!project) return false
    setSaving(true)
    try {
      await window.api.projects.update(project)
      lastSavedRef.current = snapshotKey(project)
      if (withThumb) {
        // Thumbnail refresh is best-effort and must not fail the save.
        const stage = getStage()
        if (stage) {
          try {
            await window.api.projects.saveThumb(
              project.id,
              captureThumbnailBytes(stage, project.canvas)
            )
          } catch {
            /* non-fatal */
          }
        }
      }
      return true
    } catch (err) {
      console.error('autosave failed', err)
      toast('Salvataggio non riuscito — le modifiche non sono state salvate.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  // Debounced autosave whenever design data changes.
  useEffect(() => {
    const snapshot = JSON.stringify({ name, canvas, layers, pages })
    if (snapshot === lastSavedRef.current || !lastSavedRef.current) return
    setSaving(true)
    const t = setTimeout(() => {
      void persist(true)
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, canvas, layers, pages])

  // "?" opens the shortcuts panel (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      if (e.key === '?') setShortcutsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Flush any pending changes on window close / navigation away, so closing
  // within the debounce window does not lose work.
  useEffect(() => {
    function hasPending(): boolean {
      const p = currentProject()
      return !!p && !!lastSavedRef.current && snapshotKey(p) !== lastSavedRef.current
    }
    const onBeforeUnload = (): void => {
      if (hasPending()) void persist(false)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (hasPending()) void persist(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full flex flex-col bg-surface-0">
      <EditorTopBar
        saving={saving}
        onExport={() => setExportOpen(true)}
        onResize={() => setResizeOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
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
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
