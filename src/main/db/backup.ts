import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'

/** Keep only the most recent N backups; older ones are deleted. */
export const MAX_BACKUPS = 3

const BACKUP_PREFIX = 'brandstudio.db.bak-v'

/** Backup filename for a given (pre-migration) schema version. */
export function backupFileName(fromVersion: number): string {
  return `${BACKUP_PREFIX}${fromVersion}`
}

/**
 * Given the entries of a backups directory, return the ones this module wrote
 * (oldest first) so the caller can decide what to prune.
 */
export function listOwnBackups(entries: string[]): string[] {
  return entries
    .filter((f) => f.startsWith(BACKUP_PREFIX))
    .sort((a, b) => {
      const va = Number(a.slice(BACKUP_PREFIX.length))
      const vb = Number(b.slice(BACKUP_PREFIX.length))
      return va - vb
    })
}

/**
 * Delete the oldest backups in `dir` beyond `keep`, keeping the highest-numbered
 * (most recent) ones. Safe to call on a directory with unrelated files — only
 * files matching our prefix are ever touched.
 */
export function pruneOldBackups(dir: string, keep = MAX_BACKUPS): void {
  if (!existsSync(dir)) return
  const own = listOwnBackups(readdirSync(dir))
  const excess = own.length - keep
  if (excess <= 0) return
  for (const name of own.slice(0, excess)) {
    try {
      unlinkSync(join(dir, name))
    } catch {
      /* best-effort — a stuck old backup is not worth failing startup over */
    }
  }
}

/**
 * Snapshot the database into `<dataRoot>/backups/` before a migration that will
 * change `user_version`. Uses better-sqlite3's online backup API (safe under
 * WAL — unlike a raw file copy, it doesn't require checkpointing first) and
 * never throws: a failed backup is logged by the caller and must not block
 * startup, especially when no migration was actually needed.
 */
export async function backupBeforeMigration(
  db: Database.Database,
  dataRoot: string,
  fromVersion: number
): Promise<void> {
  const dir = join(dataRoot, 'backups')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, backupFileName(fromVersion))
  await db.backup(dest)
  pruneOldBackups(dir)
}
