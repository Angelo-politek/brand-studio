import type { Asset, Brand, ExportRecord, Project, VideoProject } from '@shared/types'

/**
 * Everything a brand can own on disk, gathered from the DB rows a caller
 * already fetched. Kept as plain relative-path arrays so this module has no
 * dependency on fs / better-sqlite3 and can be unit tested in isolation.
 */
export interface BrandOwnedRows {
  brand: Brand
  assets: Asset[]
  projects: Project[]
  videos: VideoProject[]
  exports: ExportRecord[]
}

/**
 * Every candidate relative path that deleting `rows.brand` should remove from
 * disk. Templates are intentionally excluded: the `templates.brand_id` FK is
 * `ON DELETE SET NULL`, so a brand-scoped template survives as a global
 * template and its thumbnail must stay.
 *
 * Duplicates are collapsed (e.g. two rows accidentally sharing a thumb path)
 * so the caller never attempts to unlink the same file twice.
 */
export function collectBrandCandidatePaths(rows: BrandOwnedRows): string[] {
  const out = new Set<string>()
  const add = (p: string | null | undefined): void => {
    if (p) out.add(p)
  }

  for (const logo of rows.brand.logos) add(logo.filePath)
  for (const font of rows.brand.fonts) add(font.filePath)

  for (const asset of rows.assets) {
    add(asset.filePath)
    add(asset.thumbPath)
  }

  for (const project of rows.projects) add(project.thumbPath)
  for (const video of rows.videos) add(video.thumbPath)
  for (const exp of rows.exports) add(exp.filePath)

  return [...out]
}

/** A candidate path split into what is safe to delete and what must be skipped. */
export interface ValidatedBrandPaths {
  valid: string[]
  /** Paths that failed the data-root check — never touched, only logged. */
  rejected: string[]
}

/**
 * Partition candidate relative paths into ones that resolve under the data
 * root (safe to unlink) and ones that do not (must be skipped, never
 * deleted). `isUnderPath` is injected so this stays pure / independent of
 * electron's `app.getPath`.
 */
export function validateBrandPaths(
  candidates: string[],
  toAbsolute: (rel: string) => string,
  isUnderPath: (abs: string) => boolean
): ValidatedBrandPaths {
  const valid: string[] = []
  const rejected: string[] = []
  for (const rel of candidates) {
    const abs = toAbsolute(rel)
    if (isUnderPath(abs)) valid.push(rel)
    else rejected.push(rel)
  }
  return { valid, rejected }
}
