import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, ArrowRight } from 'lucide-react'
import { useBrandStore } from '@renderer/stores/brandStore'
import { confirmDialog } from '@renderer/stores/uiStore'
import { mediaUrl } from '@shared/ipc'
import type { Brand } from '@shared/types'

export default function StartupBrands(): JSX.Element {
  const { brands, load, create, remove, select } = useBrandStore()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  function open(brand: Brand): void {
    select(brand.id)
    navigate('/app/dashboard')
  }

  function edit(brand: Brand): void {
    select(brand.id)
    navigate('/app/brands')
  }

  async function submitCreate(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const brand = await create(trimmed)
    setName('')
    setCreating(false)
    edit(brand)
  }

  async function del(brand: Brand): Promise<void> {
    if (await confirmDialog(`Delete brand "${brand.name}" and all its data? This cannot be undone.`)) {
      await remove(brand.id)
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold tracking-tight">Brand Studio</h1>
          <p className="mt-2 text-ink-muted">Select a brand to continue, or create a new one.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {brands.map((brand) => {
            const logo = brand.logos.find((l) => l.type === 'main') ?? brand.logos[0]
            return (
              <div
                key={brand.id}
                className="card p-4 group hover:border-accent/60 transition-colors flex flex-col"
              >
                <div className="h-24 rounded-md bg-surface-2 mb-3 grid place-items-center overflow-hidden">
                  {logo ? (
                    <img
                      src={mediaUrl(logo.filePath)}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span
                      className="h-12 w-12 rounded-lg grid place-items-center text-lg font-bold text-white"
                      style={{ background: brand.colors[0]?.hex ?? '#f97316' }}
                    >
                      {brand.name[0]?.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mb-2 h-3">
                  {brand.colors.slice(0, 6).map((c) => (
                    <span
                      key={c.id}
                      className="h-3 w-3 rounded-full border border-black/30"
                      style={{ background: c.hex }}
                      title={c.hex}
                    />
                  ))}
                </div>

                <div className="font-medium truncate">{brand.name}</div>

                <div className="mt-3 flex items-center gap-1.5">
                  <button onClick={() => open(brand)} className="btn-primary flex-1 text-xs py-1.5">
                    Open <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={() => edit(brand)}
                    className="btn-surface px-2 py-1.5"
                    title="Edit brand"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => del(brand)}
                    className="btn-ghost px-2 py-1.5 hover:text-red-400"
                    title="Delete brand"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Create card */}
          <div className="card border-dashed p-4 flex flex-col items-center justify-center min-h-[200px]">
            {creating ? (
              <div className="w-full space-y-2">
                <input
                  autoFocus
                  className="input"
                  placeholder="Brand name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitCreate()
                    if (e.key === 'Escape') setCreating(false)
                  }}
                />
                <div className="flex gap-2">
                  <button onClick={submitCreate} className="btn-primary flex-1 text-xs py-1.5">
                    Create
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="btn-ghost text-xs py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex flex-col items-center gap-2 text-ink-muted hover:text-accent transition-colors"
              >
                <span className="h-12 w-12 rounded-full bg-surface-2 grid place-items-center">
                  <Plus size={22} />
                </span>
                <span className="text-sm font-medium">Create Brand</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
