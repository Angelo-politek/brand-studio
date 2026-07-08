import { describe, it, expect } from 'vitest'
import { collectReferencedSrcs, findOrphanGeneratedAssets } from '@renderer/lib/assetGc'
import type { Asset } from '@shared/types'

const asset = (over: Partial<Asset>): Asset =>
  ({
    id: 'a',
    brandId: 'b',
    name: 'x',
    folder: 'Images',
    filePath: 'assets/x.png',
    thumbPath: null,
    tags: [],
    mime: 'image/png',
    width: null,
    height: null,
    size: 0,
    createdAt: 0,
    ...over
  }) as Asset

describe('collectReferencedSrcs', () => {
  it('finds src deep inside nested project blobs', () => {
    const project = { pages: [{ layers: [{ src: 'assets/used.png' }, { type: 'text' }] }] }
    const video = { scenes: [{ layers: [{ src: 'assets/clip.png' }] }] }
    const refs = collectReferencedSrcs([project, video])
    expect(refs.has('assets/used.png')).toBe(true)
    expect(refs.has('assets/clip.png')).toBe(true)
  })
})

describe('findOrphanGeneratedAssets', () => {
  const now = 1_000_000_000_000

  it('flags an OLD, unreferenced generated asset', () => {
    const a = asset({ tags: ['brand-match'], filePath: 'assets/old.png', createdAt: 0 })
    const orphans = findOrphanGeneratedAssets([a], new Set(), 1000, now)
    expect(orphans).toHaveLength(1)
  })

  it('keeps a RECENT generated asset even if unreferenced (unsaved project guard)', () => {
    const a = asset({ tags: ['nobg'], filePath: 'assets/fresh.png', createdAt: now - 500 })
    const orphans = findOrphanGeneratedAssets([a], new Set(), 1000, now)
    expect(orphans).toHaveLength(0)
  })

  it('never touches a referenced asset', () => {
    const a = asset({ tags: ['brand-match'], filePath: 'assets/live.png', createdAt: 0 })
    const orphans = findOrphanGeneratedAssets([a], new Set(['assets/live.png']), 1000, now)
    expect(orphans).toHaveLength(0)
  })

  it('never touches a non-generated (original) asset', () => {
    const a = asset({ tags: [], filePath: 'assets/original.png', createdAt: 0 })
    const orphans = findOrphanGeneratedAssets([a], new Set(), 1000, now)
    expect(orphans).toHaveLength(0)
  })
})
