import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, LayoutTemplate, Braces, Rows3, Pencil, Copy } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import FillVariablesDialog from '@renderer/components/FillVariablesDialog'
import BatchDialog from '@renderer/components/BatchDialog'
import ListToolbar, { type SortKey } from '@renderer/components/ListToolbar'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { confirmDialog, promptDialog, toast } from '@renderer/stores/uiStore'
import { applyVariables, cloneLayers } from '@renderer/lib/variables'
import { STARTER_TEMPLATES } from '@renderer/lib/starterTemplates'
import { mediaUrl } from '@shared/ipc'
import type { Template } from '@shared/types'

export default function Templates(): JSX.Element {
  const brand = useCurrentBrand()
  const brandId = brand?.id ?? ''
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [filling, setFilling] = useState<Template | null>(null)
  const [batching, setBatching] = useState<Template | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  const refresh = useCallback(async () => {
    if (brandId) setTemplates(await window.api.templates.list(brandId))
  }, [brandId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
    )
    return list
  }, [templates, query, sort])

  async function rename(e: React.MouseEvent, t: Template): Promise<void> {
    e.stopPropagation()
    const name = await promptDialog('Rename template', t.name)
    if (!name || name === t.name) return
    await window.api.templates.rename(t.id, name)
    void refresh()
  }

  async function duplicate(e: React.MouseEvent, t: Template): Promise<void> {
    e.stopPropagation()
    await window.api.templates.create({
      brandId: t.brandId,
      name: `${t.name} copy`,
      type: t.type,
      canvas: t.canvas,
      layers: cloneLayers(t.layers),
      variables: t.variables
    })
    toast('Template duplicated.', 'success')
    void refresh()
  }

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

  async function openStarter(starterId: string): Promise<void> {
    const starter = STARTER_TEMPLATES.find((s) => s.id === starterId)
    if (!starter || !brandId) return
    const layers = starter.build(starter.canvas, brand)
    const project = await window.api.projects.create({
      brandId,
      name: starter.name,
      type: 'custom',
      canvas: starter.canvas,
      layers
    })
    navigate(`/app/editor/${project.id}`)
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

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Built-in starter templates — always available so there is never a dead end. */}
        <section>
          <h2 className="text-sm font-medium text-ink mb-1">Starter templates</h2>
          <p className="text-[11px] text-ink-faint mb-3">
            Ready-made layouts using your brand colors and fonts.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {STARTER_TEMPLATES.map((s) => {
              const ar = s.canvas.width / s.canvas.height
              return (
                <button
                  key={s.id}
                  onClick={() => void openStarter(s.id)}
                  className="group card overflow-hidden cursor-pointer hover:border-accent/60 transition-colors text-left"
                >
                  <div className="aspect-[4/3] bg-surface-2 grid place-items-center overflow-hidden">
                    <div
                      className="border border-line shadow grid place-items-center"
                      style={{
                        background: s.canvas.background,
                        width: ar >= 1 ? 96 : 96 * ar,
                        height: ar >= 1 ? 96 / ar : 96
                      }}
                    >
                      <LayoutTemplate size={18} className="text-ink-faint" />
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-[11px] text-ink-faint truncate">{s.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3 gap-4">
            <h2 className="text-sm font-medium text-ink">Your templates</h2>
            {templates.length > 0 && (
              <ListToolbar
                query={query}
                onQuery={setQuery}
                sort={sort}
                onSort={setSort}
                placeholder="Search templates…"
              />
            )}
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No saved templates yet. Open a design and choose “Save as template”.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-ink-faint">No templates match “{query}”.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {visible.map((t) => {
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
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setBatching(t)
                          }}
                          title="Batch generate"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Rows3 size={13} />
                        </button>
                        <button
                          onClick={(e) => rename(e, t)}
                          title="Rename"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => duplicate(e, t)}
                          title="Duplicate"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={(e) => del(e, t.id)}
                          title="Delete"
                          className="h-7 w-7 rounded bg-black/60 text-white grid place-items-center"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
        </section>
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
