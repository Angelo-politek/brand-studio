import { describe, it, expect } from 'vitest'
import {
  collectBrandCandidatePaths,
  validateBrandPaths,
  type BrandOwnedRows
} from '@main/storage/brandCleanup'
import type { Asset, Brand, ExportRecord, Project, VideoProject } from '@shared/types'

const brand = (over: Partial<Brand> = {}): Brand => ({
  id: 'b1',
  name: 'Acme',
  logos: [],
  colors: [],
  fonts: [],
  presets: [],
  createdAt: 0,
  updatedAt: 0,
  ...over
})

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  brandId: 'b1',
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
})

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  brandId: 'b1',
  name: 'Project',
  type: 'post',
  canvas: { width: 1080, height: 1080, background: '#fff' },
  layers: [],
  thumbPath: null,
  createdAt: 0,
  updatedAt: 0,
  ...over
})

const video = (over: Partial<VideoProject> = {}): VideoProject => ({
  id: 'v1',
  brandId: 'b1',
  name: 'Video',
  width: 1080,
  height: 1920,
  scenes: [],
  audio: null,
  thumbPath: null,
  createdAt: 0,
  updatedAt: 0,
  ...over
})

const exportRecord = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: 'e1',
  projectId: 'p1',
  brandId: 'b1',
  format: 'png',
  filePath: 'exports/e1.png',
  settings: {},
  createdAt: 0,
  ...over
})

const emptyRows = (over: Partial<BrandOwnedRows> = {}): BrandOwnedRows => ({
  brand: brand(),
  assets: [],
  projects: [],
  videos: [],
  exports: [],
  ...over
})

describe('collectBrandCandidatePaths', () => {
  it('collects brand logos and fonts', () => {
    const rows = emptyRows({
      brand: brand({
        logos: [{ type: 'main', filePath: 'brands/logo.png', format: 'png' }],
        fonts: [{ role: 'heading', family: 'Foo', filePath: 'brands/foo.ttf' }]
      })
    })
    const paths = collectBrandCandidatePaths(rows)
    expect(paths).toContain('brands/logo.png')
    expect(paths).toContain('brands/foo.ttf')
  })

  it('skips a font with no custom filePath', () => {
    const rows = emptyRows({
      brand: brand({ fonts: [{ role: 'heading', family: 'System Font' }] })
    })
    expect(collectBrandCandidatePaths(rows)).toEqual([])
  })

  it('collects asset file and thumb paths', () => {
    const rows = emptyRows({
      assets: [asset({ filePath: 'assets/a.png', thumbPath: 'cache/thumbs/a.png' })]
    })
    const paths = collectBrandCandidatePaths(rows)
    expect(paths).toContain('assets/a.png')
    expect(paths).toContain('cache/thumbs/a.png')
  })

  it('collects project and video thumbs, and export files', () => {
    const rows = emptyRows({
      projects: [project({ thumbPath: 'projects/p1.png' })],
      videos: [video({ thumbPath: 'videos/v1.png' })],
      exports: [exportRecord({ filePath: 'exports/e1.png' })]
    })
    const paths = collectBrandCandidatePaths(rows)
    expect(paths).toEqual(
      expect.arrayContaining(['projects/p1.png', 'videos/v1.png', 'exports/e1.png'])
    )
  })

  it('ignores null thumbPath / filePath without crashing', () => {
    const rows = emptyRows({
      projects: [project({ thumbPath: null })],
      videos: [video({ thumbPath: null })]
    })
    expect(collectBrandCandidatePaths(rows)).toEqual([])
  })

  it('deduplicates paths shared across rows', () => {
    const rows = emptyRows({
      assets: [
        asset({ id: 'a1', filePath: 'assets/shared.png', thumbPath: null }),
        asset({ id: 'a2', filePath: 'assets/shared.png', thumbPath: null })
      ]
    })
    expect(collectBrandCandidatePaths(rows)).toEqual(['assets/shared.png'])
  })

  it('never includes template paths (they survive brand deletion via SET NULL)', () => {
    // Templates are deliberately absent from BrandOwnedRows — this test
    // documents that omission is intentional, not an oversight.
    const rows = emptyRows()
    expect(collectBrandCandidatePaths(rows)).toEqual([])
  })
})

describe('validateBrandPaths', () => {
  const toAbsolute = (rel: string): string => `/data-root/${rel}`
  const isUnderPath = (abs: string): boolean => abs.startsWith('/data-root/')

  it('accepts paths that resolve under the data root', () => {
    const result = validateBrandPaths(['assets/a.png', 'brands/logo.png'], toAbsolute, isUnderPath)
    expect(result.valid).toEqual(['assets/a.png', 'brands/logo.png'])
    expect(result.rejected).toEqual([])
  })

  it('rejects a path that escapes the data root and never mixes it into valid', () => {
    const escapeAbsolute = (rel: string): string =>
      rel.startsWith('..') ? '/outside/secret.txt' : `/data-root/${rel}`
    const result = validateBrandPaths(
      ['assets/a.png', '../../secret.txt'],
      escapeAbsolute,
      isUnderPath
    )
    expect(result.valid).toEqual(['assets/a.png'])
    expect(result.rejected).toEqual(['../../secret.txt'])
  })

  it('returns empty arrays for no candidates', () => {
    const result = validateBrandPaths([], toAbsolute, isUnderPath)
    expect(result.valid).toEqual([])
    expect(result.rejected).toEqual([])
  })
})
