import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { makeTempUserData, removeTempDir, loadDbModules, flushPendingWrites } from './dbTestUtils'

let userDataDir: string

beforeEach(() => {
  userDataDir = makeTempUserData()
  vi.resetModules()
})

afterEach(async () => {
  vi.doUnmock('electron')
  await flushPendingWrites()
  removeTempDir(userDataDir)
})

describe('backupFileName / listOwnBackups (pure logic)', () => {
  it('names backups with the pre-migration version', async () => {
    const { backup } = await loadDbModules(userDataDir)
    expect(backup.backupFileName(0)).toBe('brandstudio.db.bak-v0')
    expect(backup.backupFileName(3)).toBe('brandstudio.db.bak-v3')
  })

  it('filters to only our own backup files, sorted oldest first', async () => {
    const { backup } = await loadDbModules(userDataDir)
    const entries = [
      'brandstudio.db.bak-v2',
      'unrelated-file.txt',
      'brandstudio.db.bak-v0',
      'brandstudio.db.bak-v10',
      'brandstudio.db.bak-v1'
    ]
    expect(backup.listOwnBackups(entries)).toEqual([
      'brandstudio.db.bak-v0',
      'brandstudio.db.bak-v1',
      'brandstudio.db.bak-v2',
      'brandstudio.db.bak-v10'
    ])
  })
})

describe('backupBeforeMigration — real file on disk', () => {
  it('creates a real, openable backup file before a migration runs', async () => {
    const { paths, connection, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    // Simulate a legacy DB with real data, at version 0, about to be migrated.
    db.exec(`
      CREATE TABLE brands (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, logos TEXT NOT NULL DEFAULT '[]',
        colors TEXT NOT NULL DEFAULT '[]', fonts TEXT NOT NULL DEFAULT '[]',
        presets TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `)
    db.prepare(
      `INSERT INTO brands (id, name, created_at, updated_at) VALUES ('b1','Pre-migration Co', 1, 1)`
    ).run()

    const dataRoot = paths.getPaths().dataRoot
    await backup.backupBeforeMigration(db, dataRoot, 0)

    const backupPath = join(dataRoot, 'backups', 'brandstudio.db.bak-v0')
    expect(existsSync(backupPath)).toBe(true)

    // The backup must be a real, independently-openable SQLite file with the
    // pre-migration data intact.
    const Database = (await import('better-sqlite3')).default
    const backupDb = new Database(backupPath, { readonly: true })
    const row = backupDb.prepare('SELECT name FROM brands WHERE id = ?').get('b1') as
      | { name: string }
      | undefined
    expect(row?.name).toBe('Pre-migration Co')
    backupDb.close()

    connection.closeDb()
  })

  it('keeps only the most recent MAX_BACKUPS backups, pruning the oldest', async () => {
    const { paths, connection, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()

    for (let v = 0; v < backup.MAX_BACKUPS + 2; v++) {
      await backup.backupBeforeMigration(db, paths.getPaths().dataRoot, v)
    }

    const dir = join(paths.getPaths().dataRoot, 'backups')
    const files = backup.listOwnBackups(readdirSync(dir))
    expect(files).toHaveLength(backup.MAX_BACKUPS)
    // The oldest ones (v0, v1) must have been pruned; the newest kept.
    expect(files).toEqual([
      `brandstudio.db.bak-v${backup.MAX_BACKUPS - 1}`,
      `brandstudio.db.bak-v${backup.MAX_BACKUPS}`,
      `brandstudio.db.bak-v${backup.MAX_BACKUPS + 1}`
    ])

    connection.closeDb()
  })

  it('pruneOldBackups only touches files matching our prefix, leaving others alone', async () => {
    const { paths, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const dir = join(paths.getPaths().dataRoot, 'backups')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'unrelated.txt'), 'keep me')
    for (let v = 0; v < 5; v++) {
      writeFileSync(join(dir, backup.backupFileName(v)), 'fake-backup-bytes')
    }

    backup.pruneOldBackups(dir, 2)

    const remaining = readdirSync(dir)
    expect(remaining).toContain('unrelated.txt')
    expect(backup.listOwnBackups(remaining)).toHaveLength(2)
  })

  it('pruneOldBackups on a non-existent directory is a no-op, not a throw', async () => {
    const { paths, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    expect(() =>
      backup.pruneOldBackups(join(paths.getPaths().dataRoot, 'no-such-dir'))
    ).not.toThrow()
  })
})

describe('runMigrations — backup integration', () => {
  it('creates a backup before migrating a legacy (version 0) database', async () => {
    const { paths, connection, migrations } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    // A legacy DB reports version 0 by default (SQLite's own default for
    // user_version), so runMigrations must back it up before altering it.
    expect(db.pragma('user_version', { simple: true })).toBe(0)

    await migrations.runMigrations()

    const dir = join(paths.getPaths().dataRoot, 'backups')
    expect(existsSync(dir)).toBe(true)
    const files = readdirSync(dir)
    expect(files).toContain('brandstudio.db.bak-v0')

    connection.closeDb()
  })

  it('startup still succeeds even if the backup step throws', async () => {
    const { paths, connection, migrations, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    connection.openDb()

    vi.spyOn(backup, 'backupBeforeMigration').mockRejectedValueOnce(new Error('disk full'))

    await expect(migrations.runMigrations()).resolves.not.toThrow()
    // Migration must still have applied despite the backup failure.
    const db = connection.getDb()
    expect(db.pragma('user_version', { simple: true })).toBe(1)

    connection.closeDb()
  })
})
