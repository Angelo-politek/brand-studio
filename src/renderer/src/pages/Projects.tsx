import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Copy, Pencil, CheckSquare, Square, X } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import NewProjectDialog from '@renderer/components/NewProjectDialog'
import ListToolbar, { type SortKey } from '@renderer/components/ListToolbar'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { confirmDialog, promptDialog, toast } from '@renderer/stores/uiStore'
import { cloneLayers } from '@renderer/lib/variables'
import { mediaUrl } from '@shared/ipc'
import { cn } from '@renderer/lib/cn'
import type { CanvasSpec, Project } from '@shared/types'

export default function Projects(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [dialog, setDialog] = useState<{ open: boolean; type?: string }>({ open: false })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (brandId) setProjects(await window.api.projects.list(brandId))
  }, [brandId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Dashboard deep-links: /app/projects?new=instagram_post
  useEffect(() => {
    const newType = params.get('new')
    if (newType) {
      setDialog({ open: true, type: newType })
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
    )
    return list
  }, [projects, query, sort])

  async function create(input: { name: string; type: string; canvas: CanvasSpec }): Promise<void> {
    try {
      const project = await window.api.projects.create({ brandId, ...input })
      setDialog({ open: false })
      navigate(`/app/editor/${project.id}`)
    } catch (e) {
      toast(`Failed to create project: ${(e as Error).message}`, 'error')
    }
  }

  async function del(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    if (await confirmDialog('Delete this project?')) {
      try {
        await window.api.projects.delete(id)
        void refresh()
      } catch (err) {
        toast(`Failed to delete project: ${(err as Error).message}`, 'error')
      }
    }
  }

  async function rename(e: React.MouseEvent, p: Project): Promise<void> {
    e.stopPropagation()
    const name = await promptDialog('Rename project', p.name)
    if (!name || name === p.name) return
    try {
      await window.api.projects.update({ ...p, name })
      void refresh()
    } catch (err) {
      toast(`Failed to rename project: ${(err as Error).message}`, 'error')
    }
  }

  async function duplicate(e: React.MouseEvent, p: Project): Promise<void> {
    e.stopPropagation()
    try {
      const full = await window.api.projects.get(p.id)
      if (!full) return
      await window.api.projects.create({
        brandId,
        name: `${full.name} copy`,
        type: full.type,
        canvas: full.canvas,
        layers: cloneLayers(full.pages?.[0]?.layers ?? full.layers)
      })
      toast('Project duplicated.', 'success')
      void refresh()
    } catch (err) {
      toast(`Failed to duplicate project: ${(err as Error).message}`, 'error')
    }
  }

  function toggleSelect(id: string): void {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect(): void {
    setSelecting(false)
    setSelected(new Set())
  }

  async function bulkDelete(): Promise<void> {
    if (selected.size === 0) return
    if (await confirmDialog(`Delete ${selected.size} selected project(s)?`)) {
      let ok = 0
      let failed = 0
      for (const id of selected) {
        try {
          await window.api.projects.delete(id)
          ok++
        } catch {
          failed++
        }
      }
      exitSelect()
      void refresh()
      if (failed > 0) {
        toast(`Deleted ${ok} project(s), ${failed} failed.`, 'error')
      } else {
        toast(`Deleted ${ok} project(s).`, 'success')
      }
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Projects"
        subtitle="Your designs across every format."
        actions={
          <button onClick={() => setDialog({ open: true })} className="btn-primary text-sm">
            <Plus size={15} /> New design
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-5">
        {projects.length > 0 && (
          <ListToolbar
            query={query}
            onQuery={setQuery}
            sort={sort}
            onSort={setSort}
            placeholder="Search projects…"
            right={
              selecting ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-faint">{selected.size} selected</span>
                  <button
                    onClick={bulkDelete}
                    disabled={selected.size === 0}
                    className="btn-surface text-sm text-red-400 disabled:opacity-40"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  <button onClick={exitSelect} className="btn-ghost px-2 py-1.5">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setSelecting(true)} className="btn-surface text-sm">
                  <CheckSquare size={14} /> Select
                </button>
              )
            }
          />
        )}

        {projects.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-ink-faint mb-4">No projects yet.</p>
              <button onClick={() => setDialog({ open: true })} className="btn-primary">
                <Plus size={15} /> Create your first design
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-ink-faint">No projects match “{query}”.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map((p) => {
              const ar = p.canvas.width / p.canvas.height
              const isSel = selected.has(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => (selecting ? toggleSelect(p.id) : navigate(`/app/editor/${p.id}`))}
                  className={cn(
                    'group card overflow-hidden cursor-pointer transition-colors',
                    isSel ? 'border-accent' : 'hover:border-accent/60'
                  )}
                >
                  <div className="aspect-[4/3] bg-surface-2 grid place-items-center overflow-hidden relative">
                    {p.thumbPath ? (
                      <img
                        src={mediaUrl(p.thumbPath)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div
                        className="border border-line shadow"
                        style={{
                          background:
                            p.canvas.background === 'transparent' ? '#fff' : p.canvas.background,
                          width: ar >= 1 ? 96 : 96 * ar,
                          height: ar >= 1 ? 96 / ar : 96
                        }}
                      />
                    )}
                    {selecting ? (
                      <span className="absolute top-2 left-2 text-accent">
                        {isSel ? <CheckSquare size={18} /> : <Square size={18} />}
                      </span>
                    ) : (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => rename(e, p)}
                          title="Rename"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => duplicate(e, p)}
                          title="Duplicate"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={(e) => del(e, p.id)}
                          title="Delete"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {p.canvas.width}×{p.canvas.height}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dialog.open && (
        <NewProjectDialog
          initialType={dialog.type}
          onClose={() => setDialog({ open: false })}
          onCreate={create}
        />
      )}
    </div>
  )
}
