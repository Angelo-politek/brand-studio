import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Brand, ExportPreset, BrandFont } from '@shared/types'

const LS_KEY = 'bs:currentBrandId'

function defaultPresets(): ExportPreset[] {
  return [
    { id: uuid(), name: 'PNG @2x', format: 'png', scale: 2 },
    { id: uuid(), name: 'JPG', format: 'jpg', quality: 92 },
    { id: uuid(), name: 'PDF', format: 'pdf' },
    { id: uuid(), name: 'MP4', format: 'mp4' }
  ]
}

function defaultFonts(): BrandFont[] {
  return [
    { role: 'heading', family: 'Inter' },
    { role: 'body', family: 'Inter' },
    { role: 'alt', family: 'Georgia' }
  ]
}

interface BrandState {
  brands: Brand[]
  currentBrandId: string | null
  loaded: boolean
  load: () => Promise<void>
  create: (name: string) => Promise<Brand>
  update: (brand: Brand) => Promise<Brand>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
}

export const useBrandStore = create<BrandState>((set) => ({
  brands: [],
  currentBrandId: null,
  loaded: false,

  async load() {
    const brands = await window.api.brands.list()
    const saved = localStorage.getItem(LS_KEY)
    const currentBrandId = saved && brands.some((b) => b.id === saved) ? saved : null
    set({ brands, currentBrandId, loaded: true })
  },

  async create(name) {
    const brand = await window.api.brands.create({
      name,
      colors: [],
      logos: [],
      fonts: defaultFonts(),
      presets: defaultPresets()
    })
    set((s) => ({ brands: [brand, ...s.brands] }))
    return brand
  },

  async update(brand) {
    const updated = await window.api.brands.update(brand)
    set((s) => ({ brands: s.brands.map((b) => (b.id === updated.id ? updated : b)) }))
    return updated
  },

  async remove(id) {
    await window.api.brands.delete(id)
    set((s) => {
      const currentBrandId = s.currentBrandId === id ? null : s.currentBrandId
      if (currentBrandId === null) localStorage.removeItem(LS_KEY)
      return { brands: s.brands.filter((b) => b.id !== id), currentBrandId }
    })
  },

  select(id) {
    if (id) localStorage.setItem(LS_KEY, id)
    else localStorage.removeItem(LS_KEY)
    set({ currentBrandId: id })
  }
}))

/** Hook returning the currently selected brand object (or null). */
export function useCurrentBrand(): Brand | null {
  return useBrandStore((s) => s.brands.find((b) => b.id === s.currentBrandId) ?? null)
}
