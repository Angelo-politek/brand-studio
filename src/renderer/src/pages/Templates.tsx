import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, LayoutTemplate, Braces, Rows3 } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import FillVariablesDialog from '@renderer/components/FillVariablesDialog'
import BatchDialog from '@renderer/components/BatchDialog'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { confirmDialog } from '@renderer/stores/uiStore'
import { applyVariables, cloneLayers } from '@renderer/lib/variables'
import { mediaUrl } from '@shared/ipc'
import type { Template } from '@shared/types'

export default function Templates(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [filling, setFilling] = useState<Template | null>(null)
  const [batching, setBatching] = useState<Template | null>(null)

  const refresh = useCallback(async () => {
    if (brandId) setTemplates(await window.api.templates.list(brandId))
  }, [brandId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function instantiate(
    t: Template,
    values?: Record<string, string>,
    name?: string
  ): Promise<void> {
    let layers = cloneLayers(t.layers)
    if (values) layers = applyVariables(layers, values)
    const project = await window.api.projects.create({
      brandId,
      name: name || t.name,
      type: t.type,
      canvas: t.canvas,
      layers
    })
    setFilling(null)
    navigate(`/app/editor/${project.id}`)
  }

  function use(t: Template): void {
    if (t.variables.length > 0) setFilling(t)
    else void instantiate(t)
  }

  async function del(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    if (await confirmDialog('Delete this template?')) {
      await window.api.templates.delete(id)
      void refresh()
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Templates"
        subtitle="Reusable blueprints. Save any design as a template from the editor."
      />

      <div className="flex-1 overflow-y-auto p-8">
        {templates.length === 0 ? (
          <div className="h-full grid place-items-center text-center text-ink-faint">
            <div className="flex flex-col items-center gap-3">
              <LayoutTemplate size={28} />
              <p className="text-sm">
                No templates yet. Open a design and choose “Save as template”.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map((t) => {
              const ar = t.canvas.width / t.canvas.height
              return (
                <div
                  key={t.id}
                  onClick={() => use(t)}
                  className="group card overflow-hidden cursor-pointer hover:border-accent/60 transition-colors"
                >
                  <div className="aspect-[4/3] bg-surface-2 grid place-items-center overflow-hidden relative">
                    {t.thumbPath ? (
                      <img
                        src={mediaUrl(t.thumbPath)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div
                        className="border border-line shadow"
                        style={{
                          background:
                            t.canvas.background === 'transparent' ? '#fff' : t.canvas.background,
                          width: ar >= 1 ? 96 : 96 * ar,
                          height: ar >= 1 ? 96 / ar : 96
                        }}
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setBatching(t)
                      }}
                      title="Batch generate"
                      className="absolute top-2 right-11 h-7 w-7 rounded bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <Rows3 size={14} />
                    </button>
                    <button
                      onClick={(e) => del(e, t.id)}
                      className="absolute top-2 right-2 h-7 w-7 rounded bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-ink-faint flex items-center gap-2">
                      <span>
                        {t.canvas.width}×{t.canvas.height}
                      </span>
                      {t.variables.length > 0 && (
                        <span className="flex items-center gap-1 text-accent">
                          <Braces size={11} /> {t.variables.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {filling && (
        <FillVariablesDialog
          variables={filling.variables}
          defaultName={filling.name}
          onClose={() => setFilling(null)}
          onSubmit={(values, name) => void instantiate(filling, values, name)}
        />
      )}

      {batching && brandId && (
        <BatchDialog template={batching} brandId={brandId} onClose={() => setBatching(null)} />
      )}
    </div>
  )
}
