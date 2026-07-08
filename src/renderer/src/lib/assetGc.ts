import type { Asset } from '@shared/types'

/**
 * Garbage collection for GENERATED assets (background-removed / palette-matched
 * variants). They are never deleted at edit time — that would break undo (the
 * restored src would point to a missing file). Instead this scans everything
 * that can reference an asset and reports the generated ones nobody uses.
 */

export const GENERATED_TAGS = ['nobg', 'brand-match'] as const

/** Walk arbitrary JSON-ish blobs and collect every string `src` field. */
export function collectReferencedSrcs(blobs: unknown[]): Set<string> {
  const out = new Set<string>()
  const visit = (v: unknown): void => {
    if (!v) return
    if (Array.isArray(v)) {
      v.forEach(visit)
      return
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.src === 'string' && o.src) out.add(o.src)
      Object.values(o).forEach(visit)
    }
  }
  blobs.forEach(visit)
  return out
}

/**
 * Generated assets whose file is not referenced by any provided blob AND that
 * are older than `minAgeMs` (default 24h). The age guard prevents deleting an
 * asset that was just created for a project the user hasn't saved/closed yet —
 * that would leave a live layer pointing at a missing file.
 */
export function findOrphanGeneratedAssets(
  assets: Asset[],
  referenced: Set<string>,
  minAgeMs = 24 * 60 * 60 * 1000,
  now = Date.now()
): Asset[] {
  return assets.filter(
    (a) =>
      a.tags.some((t) => (GENERATED_TAGS as readonly string[]).includes(t)) &&
      !referenced.has(a.filePath) &&
      now - (a.createdAt ?? 0) > minAgeMs
  )
}
