import { app } from 'electron'
import { join, relative, sep, normalize } from 'path'
import { mkdirSync } from 'fs'
import type { AppPaths } from '@shared/ipc'

let cached: AppPaths | null = null

export function getPaths(): AppPaths {
  if (cached) return cached
  const dataRoot = join(app.getPath('userData'), 'data')
  cached = {
    dataRoot,
    brands: join(dataRoot, 'brands'),
    projects: join(dataRoot, 'projects'),
    templates: join(dataRoot, 'templates'),
    assets: join(dataRoot, 'assets'),
    exports: join(dataRoot, 'exports'),
    planner: join(dataRoot, 'planner'),
    database: join(dataRoot, 'database'),
    cache: join(dataRoot, 'cache'),
    // Sibling of dataRoot (userData/logs), not userData/data/logs: the logger
    // (src/main/logger.ts) has always written to userData/logs directly, so
    // this mirrors that existing location rather than moving it.
    logs: join(app.getPath('userData'), 'logs')
  }
  return cached
}

/** Create all data subdirectories (idempotent). Call once on startup. */
export function ensureDataDirs(): void {
  const p = getPaths()
  for (const dir of Object.values(p)) mkdirSync(dir, { recursive: true })
  mkdirSync(join(p.cache, 'thumbs'), { recursive: true })
}

/** Convert an absolute path under the data root to a forward-slash relative path. */
export function toRelative(absolutePath: string): string {
  return relative(getPaths().dataRoot, absolutePath).split(sep).join('/')
}

/** Resolve a data-root-relative path back to an absolute path. */
export function toAbsolute(relativePath: string): string {
  return normalize(join(getPaths().dataRoot, relativePath))
}

/** True if `absolutePath` resolves to a location inside the data root. */
export function isUnderDataRoot(absolutePath: string): boolean {
  const root = normalize(getPaths().dataRoot)
  const abs = normalize(absolutePath)
  // Append a separator so `…/data` does not match a sibling `…/data-evil`.
  return abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** Throw unless `absolutePath` is inside the data root. */
export function assertUnderDataRoot(absolutePath: string): string {
  if (!isUnderDataRoot(absolutePath)) {
    throw new Error('Path is outside the data root')
  }
  return absolutePath
}

/** Subdirectories the renderer is allowed to write binaries into. */
export const WRITABLE_SUBDIRS = [
  'brands',
  'projects',
  'templates',
  'assets',
  'exports',
  'planner',
  'videos',
  'cache',
  'cache/thumbs'
] as const
