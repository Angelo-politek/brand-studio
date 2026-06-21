import { create } from 'zustand'
import type { Asset, AssetFolder } from '@shared/types'
import { readFileBytes, basename, fileToBytes } from '@renderer/lib/files'
import { mimeFromName, folderFromMime, isImageMime } from '@renderer/lib/mime'
import { makeImageThumbnail } from '@renderer/lib/thumbnail'

export type FolderFilter = AssetFolder | 'All'

interface ImportItem {
  name: string
  mime: string
  bytes: Uint8Array
}

interface AssetState {
  assets: Asset[]
  folder: FolderFilter
  search: string
  loading: boolean
  importing: boolean
  selectedId: string | null

  setFolder: (f: FolderFilter) => void
  setSearch: (s: string) => void
  select: (id: string | null) => void
  refresh: (brandId: string) => Promise<void>
  importBlobs: (brandId: string, files: File[]) => Promise<void>
  importPaths: (brandId: string, paths: string[]) => Promise<void>
  updateAsset: (asset: Asset) => Promise<void>
  remove: (id: string) => Promise<void>
}

async function buildImport(item: ImportItem, target: FolderFilter, brandId: string): Promise<Asset> {
  const folder: AssetFolder = target === 'All' ? folderFromMime(item.mime) : target
  let width: number | null = null
  let height: number | null = null
  let thumbBytes: Uint8Array | null = null

  if (isImageMime(item.mime) && item.mime !== 'image/svg+xml') {
    const blob = new Blob([item.bytes as BlobPart], { type: item.mime })
    const thumb = await makeImageThumbnail(blob)
    if (thumb) {
      thumbBytes = thumb.bytes
      width = thumb.width
      height = thumb.height
    }
  }

  return window.api.assets.import({
    brandId,
    folder,
    name: item.name,
    mime: item.mime,
    bytes: item.bytes,
    width,
    height,
    thumbBytes,
    tags: []
  })
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  folder: 'All',
  search: '',
  loading: false,
  importing: false,
  selectedId: null,

  setFolder: (folder) => set({ folder }),
  setSearch: (search) => set({ search }),
  select: (selectedId) => set({ selectedId }),

  async refresh(brandId) {
    const { folder, search } = get()
    set({ loading: true })
    const assets = await window.api.assets.list({
      brandId,
      folder: folder === 'All' ? undefined : folder,
      search: search.trim() || undefined
    })
    set({ assets, loading: false })
  },

  async importBlobs(brandId, files) {
    set({ importing: true })
    try {
      const target = get().folder
      const imported: Asset[] = []
      for (const f of files) {
        const item: ImportItem = {
          name: f.name,
          mime: f.type || mimeFromName(f.name),
          bytes: await fileToBytes(f)
        }
        imported.push(await buildImport(item, target, brandId))
      }
      set((s) => ({ assets: [...imported, ...s.assets] }))
    } finally {
      set({ importing: false })
    }
  },

  async importPaths(brandId, paths) {
    set({ importing: true })
    try {
      const target = get().folder
      const imported: Asset[] = []
      for (const p of paths) {
        const name = basename(p)
        const item: ImportItem = {
          name,
          mime: mimeFromName(name),
          bytes: await readFileBytes(p)
        }
        imported.push(await buildImport(item, target, brandId))
      }
      set((s) => ({ assets: [...imported, ...s.assets] }))
    } finally {
      set({ importing: false })
    }
  },

  async updateAsset(asset) {
    const updated = await window.api.assets.update(asset)
    set((s) => ({ assets: s.assets.map((a) => (a.id === updated.id ? updated : a)) }))
  },

  async remove(id) {
    await window.api.assets.delete(id)
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId
    }))
  }
}))
