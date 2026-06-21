import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import NewProjectDialog from '@renderer/components/NewProjectDialog'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { confirmDialog } from '@renderer/stores/uiStore'
import { mediaUrl } from '@shared/ipc'
import type { CanvasSpec, Project } from '@shared/types'

export default function Projects(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [dialog, setDialog] = useState<{ open: boolean; type?: string }>({ open: false })

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

  async function create(input: { name: string; type: string; canvas: CanvasSpec }): Promise<void> {
    const project = await window.api.projects.create({ brandId, ...input })
    setDialog({ open: false })
    navigate(`/app/editor/${project.id}`)
  }

  async function del(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    if (await confirmDialog('Delete this project?')) {
      await window.api.projects.delete(id)
      void refresh()
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

      <div className="flex-1 overflow-y-auto p-8">
        {projects.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <p className="text-ink-faint mb-4">No projects yet.</p>
              <button onClick={() => setDialog({ open: true })} className="btn-primary">
                <Plus size={15} /> Create your first design
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {projects.map((p) => {
              const ar = p.canvas.width / p.canvas.height
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/app/editor/${p.id}`)}
                  className="group card overflow-hidden cursor-pointer hover:border-accent/60 transition-colors"
                >
                  <div className="aspect-[4/3] bg-surface-2 grid place-items-center overflow-hidden relative">
                    {p.thumbPath ? (
                      <img src={mediaUrl(p.thumbPath)} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div
                        className="border border-line shadow"
                        style={{
                          background: p.canvas.background === 'transparent' ? '#fff' : p.canvas.background,
                          width: ar >= 1 ? 96 : 96 * ar,
                          height: ar >= 1 ? 96 / ar : 96
                        }}
                      />
                    )}
                    <button
                      onClick={(e) => del(e, p.id)}
                      className="absolute top-2 right-2 h-7 w-7 rounded bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
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
