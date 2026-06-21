import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Upload, X, Wand2, Check } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { useBrandStore, useCurrentBrand } from '@renderer/stores/brandStore'
import { registerFont } from '@renderer/lib/fonts'
import { extractPalette } from '@renderer/lib/python'
import { toast } from '@renderer/stores/uiStore'
import {
  pickFiles,
  readFileBytes,
  saveBinary,
  basename,
  extOf,
  IMAGE_FILTERS,
  FONT_FILTERS
} from '@renderer/lib/files'
import { mediaUrl } from '@shared/ipc'
import type {
  Brand,
  BrandColor,
  BrandColorRole,
  BrandFontRole,
  BrandLogoType,
  ExportFormat,
  ExportPreset
} from '@shared/types'

const LOGO_SLOTS: { type: BrandLogoType; label: string }[] = [
  { type: 'main', label: 'Main' },
  { type: 'white', label: 'White' },
  { type: 'dark', label: 'Dark' },
  { type: 'icon', label: 'Icon' }
]
const COLOR_ROLES: BrandColorRole[] = ['primary', 'secondary', 'accent']
const FONT_ROLES: BrandFontRole[] = ['heading', 'body', 'alt']
const EXPORT_FORMATS: ExportFormat[] = ['png', 'jpg', 'webp', 'pdf', 'mp4']

export default function Brands(): JSX.Element {
  const brand = useCurrentBrand()
  const update = useBrandStore((s) => s.update)
  const [draft, setDraft] = useState<Brand | null>(brand)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const lastIdRef = useRef<string | null>(brand?.id ?? null)

  // Reset the draft when switching brands.
  useEffect(() => {
    if (brand && brand.id !== lastIdRef.current) {
      lastIdRef.current = brand.id
      setDraft(brand)
      setDirty(false)
    } else if (brand && !draft) {
      setDraft(brand)
    }
  }, [brand, draft])

  // Debounced persistence on user edits.
  useEffect(() => {
    if (!dirty || !draft) return
    const t = setTimeout(async () => {
      await update(draft)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }, 400)
    return () => clearTimeout(t)
  }, [dirty, draft, update])

  if (!draft) return <PageHeader title="Brand" />

  function patch(p: Partial<Brand>): void {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setDirty(true)
  }

  /* ------------------------------- logos ------------------------------- */
  async function uploadLogo(type: BrandLogoType): Promise<void> {
    const [path] = await pickFiles(IMAGE_FILTERS)
    if (!path) return
    const bytes = await readFileBytes(path)
    const name = basename(path)
    const rel = await saveBinary('brands', name, bytes)
    const old = draft!.logos.find((l) => l.type === type)
    if (old) void window.api.app.deleteFile(old.filePath)
    const logos = draft!.logos.filter((l) => l.type !== type)
    logos.push({ type, filePath: rel, format: extOf(name) })
    patch({ logos })
  }
  function removeLogo(type: BrandLogoType): void {
    const old = draft!.logos.find((l) => l.type === type)
    if (old) void window.api.app.deleteFile(old.filePath)
    patch({ logos: draft!.logos.filter((l) => l.type !== type) })
  }

  /* ------------------------------- colors ------------------------------ */
  function addColor(hex = '#f97316', role: BrandColorRole = 'primary'): void {
    patch({ colors: [...draft!.colors, { id: uuid(), hex, role }] })
  }
  function updateColor(id: string, p: Partial<BrandColor>): void {
    patch({ colors: draft!.colors.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  }
  function removeColor(id: string): void {
    patch({ colors: draft!.colors.filter((c) => c.id !== id) })
  }
  async function extractFromImage(): Promise<void> {
    const [path] = await pickFiles(IMAGE_FILTERS)
    if (!path) return
    const bytes = await readFileBytes(path)
    const palette = await extractPalette(bytes, basename(path), 6)
    if (palette.length === 0) {
      toast('Palette extraction unavailable (processing backend not ready).', 'error')
      return
    }
    const colors = [
      ...draft!.colors,
      ...palette.map((c, i) => ({
        id: uuid(),
        hex: c.hex,
        role: (i === 0 ? 'primary' : i < 3 ? 'secondary' : 'accent') as BrandColorRole
      }))
    ]
    patch({ colors })
  }

  /* -------------------------------- fonts ------------------------------ */
  function updateFont(role: BrandFontRole, family: string): void {
    patch({ fonts: draft!.fonts.map((f) => (f.role === role ? { ...f, family } : f)) })
  }
  async function importFont(role: BrandFontRole): Promise<void> {
    const [path] = await pickFiles(FONT_FILTERS)
    if (!path) return
    const bytes = await readFileBytes(path)
    const name = basename(path)
    const rel = await saveBinary('brands', name, bytes)
    const oldFont = draft!.fonts.find((f) => f.role === role)
    if (oldFont?.filePath) void window.api.app.deleteFile(oldFont.filePath)
    const family = name.replace(/\.[^.]+$/, '')
    await registerFont(family, rel)
    patch({
      fonts: draft!.fonts.map((f) => (f.role === role ? { ...f, family, filePath: rel } : f))
    })
  }

  /* ------------------------------- presets ----------------------------- */
  function addPreset(): void {
    patch({
      presets: [...draft!.presets, { id: uuid(), name: 'New preset', format: 'png', scale: 1 }]
    })
  }
  function updatePreset(id: string, p: Partial<ExportPreset>): void {
    patch({ presets: draft!.presets.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  }
  function removePreset(id: string): void {
    patch({ presets: draft!.presets.filter((x) => x.id !== id) })
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Brand"
        subtitle="Identity used across every design in this brand."
        actions={
          saved ? (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check size={15} /> Saved
            </span>
          ) : dirty ? (
            <span className="text-sm text-ink-faint">Saving…</span>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl">
        {/* Name */}
        <section className="card p-5">
          <label className="block text-sm text-ink-muted mb-2">Brand name</label>
          <input
            className="input max-w-sm"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </section>

        {/* Logos */}
        <section className="card p-5">
          <h2 className="font-medium mb-4">Logos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {LOGO_SLOTS.map(({ type, label }) => {
              const logo = draft.logos.find((l) => l.type === type)
              return (
                <div key={type}>
                  <div className="text-xs text-ink-faint mb-1.5">{label}</div>
                  <div className="relative group aspect-square rounded-lg border border-line checkerboard grid place-items-center overflow-hidden">
                    {logo ? (
                      <>
                        <img
                          src={mediaUrl(logo.filePath)}
                          alt={label}
                          className="max-h-[80%] max-w-[80%] object-contain"
                        />
                        <button
                          onClick={() => removeLogo(type)}
                          className="absolute top-1 right-1 h-6 w-6 rounded bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => uploadLogo(type)}
                        className="flex flex-col items-center gap-1 text-ink-faint hover:text-accent"
                      >
                        <Upload size={18} />
                        <span className="text-[11px]">Upload</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-faint">PNG, JPG, WEBP or SVG.</p>
        </section>

        {/* Colors */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">Color palette</h2>
            <div className="flex gap-2">
              <button onClick={extractFromImage} className="btn-surface text-xs py-1.5">
                <Wand2 size={14} /> Extract from image
              </button>
              <button onClick={() => addColor()} className="btn-surface text-xs py-1.5">
                <Plus size={14} /> Add color
              </button>
            </div>
          </div>
          {draft.colors.length === 0 ? (
            <p className="text-sm text-ink-faint">No colors yet.</p>
          ) : (
            <div className="space-y-2">
              {draft.colors.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={c.hex}
                    onChange={(e) => updateColor(c.id, { hex: e.target.value })}
                    className="h-9 w-12 rounded bg-transparent border border-line cursor-pointer"
                  />
                  <input
                    className="input w-28 font-mono text-xs"
                    value={c.hex}
                    onChange={(e) => updateColor(c.id, { hex: e.target.value })}
                  />
                  <input
                    className="input flex-1"
                    placeholder="Name (optional)"
                    value={c.name ?? ''}
                    onChange={(e) => updateColor(c.id, { name: e.target.value })}
                  />
                  <select
                    className="input w-32"
                    value={c.role}
                    onChange={(e) => updateColor(c.id, { role: e.target.value as BrandColorRole })}
                  >
                    {COLOR_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeColor(c.id)}
                    className="btn-ghost px-2 py-1.5 hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Typography */}
        <section className="card p-5">
          <h2 className="font-medium mb-4">Typography</h2>
          <div className="space-y-3">
            {FONT_ROLES.map((role) => {
              const font = draft.fonts.find((f) => f.role === role)
              return (
                <div key={role} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-ink-faint capitalize">{role}</span>
                  <input
                    className="input flex-1"
                    value={font?.family ?? ''}
                    placeholder="Font family"
                    onChange={(e) => updateFont(role, e.target.value)}
                  />
                  <span
                    className="w-40 truncate text-lg"
                    style={{ fontFamily: font?.family }}
                    title="Preview"
                  >
                    Ag 123
                  </span>
                  <button onClick={() => importFont(role)} className="btn-surface text-xs py-1.5">
                    <Upload size={14} /> Import
                  </button>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Import TTF/OTF/WOFF to embed a custom font in this brand.
          </p>
        </section>

        {/* Export presets */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">Export presets</h2>
            <button onClick={addPreset} className="btn-surface text-xs py-1.5">
              <Plus size={14} /> Add preset
            </button>
          </div>
          <div className="space-y-2">
            {draft.presets.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <input
                  className="input flex-1"
                  value={p.name}
                  onChange={(e) => updatePreset(p.id, { name: e.target.value })}
                />
                <select
                  className="input w-28"
                  value={p.format}
                  onChange={(e) => updatePreset(p.id, { format: e.target.value as ExportFormat })}
                >
                  {EXPORT_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={4}
                  step={0.5}
                  className="input w-20"
                  title="Scale"
                  value={p.scale ?? 1}
                  onChange={(e) => updatePreset(p.id, { scale: Number(e.target.value) })}
                />
                <button
                  onClick={() => removePreset(p.id)}
                  className="btn-ghost px-2 py-1.5 hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
