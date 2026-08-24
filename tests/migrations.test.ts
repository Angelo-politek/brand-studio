import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { makeTempUserData, removeTempDir, loadDbModules, flushPendingWrites } from './dbTestUtils'

// Real end-to-end migration tests against a real SQLite file on disk (never
// the user's %APPDATA% database — always a throwaway temp dir cleaned up in
// afterEach). This is the highest-risk area in the app: a user upgrading
// Brand Studio must never lose their brands/projects/assets.

const ALL_TABLES = [
  'brands',
  'assets',
  'projects',
  'templates',
  'planner',
  'exports',
  'video_projects'
]

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

describe('migrations — fresh database', () => {
  it('creates every table and lands on the expected user_version', async () => {
    const { paths, connection, migrations } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    await migrations.runMigrations()

    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of ALL_TABLES) {
      expect(tableNames).toContain(t)
    }

    const version = db.pragma('user_version', { simple: true })
    expect(version).toBe(1)

    connection.closeDb()
  })

  it('creates the additive columns (pages, scenes, audio) on a fresh DB too', async () => {
    const { paths, connection, migrations } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    await migrations.runMigrations()

    const projectCols = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(projectCols).toContain('pages')

    const videoCols = (
      db.prepare('PRAGMA table_info(video_projects)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(videoCols).toContain('scenes')
    expect(videoCols).toContain('audio')

    connection.closeDb()
  })

  it('enforces foreign_keys = ON and WAL journal mode', async () => {
    const { paths, connection, migrations } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    await migrations.runMigrations()

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')

    connection.closeDb()
  })
})

describe('migrations — idempotency', () => {
  it('running migrations twice in a row does not error and leaves schema/version stable', async () => {
    const { paths, connection, migrations } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    const db = connection.openDb()
    await migrations.runMigrations()
    await expect(migrations.runMigrations()).resolves.not.toThrow()

    expect(db.pragma('user_version', { simple: true })).toBe(1)
    connection.closeDb()
  })

  it('re-running after closing and reopening the same file is safe and keeps data', async () => {
    const { paths, connection, migrations, repositories } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    connection.openDb()
    await migrations.runMigrations()
    const brand = repositories.brandsRepo.create({ name: 'Idempotent Co' })
    connection.closeDb()

    // Reopen against the very same file and run migrations again.
    vi.resetModules()
    const second = await loadDbModules(userDataDir)
    second.paths.ensureDataDirs()
    second.connection.openDb()
    await second.migrations.runMigrations()

    const found = second.repositories.brandsRepo.get(brand.id)
    expect(found?.name).toBe('Idempotent Co')
    second.connection.closeDb()
  })
})

describe('migrations — upgrade from a legacy pre-versioning database', () => {
  /**
   * Hand-build a DB matching the schema described in migrations.ts's own
   * comment: "pre-versioning databases report version 0" and are missing the
   * columns added later (projects.pages, video_projects.scenes/audio). This
   * mirrors the base CREATE TABLE statements in migrations.ts minus those
   * three additive columns, with user_version left at its SQLite default (0).
   */
  function createLegacyV0Database(file: string): void {
    const db = new Database(file)
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE brands (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        logos       TEXT NOT NULL DEFAULT '[]',
        colors      TEXT NOT NULL DEFAULT '[]',
        fonts       TEXT NOT NULL DEFAULT '[]',
        presets     TEXT NOT NULL DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE assets (
        id          TEXT PRIMARY KEY,
        brand_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        folder      TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        thumb_path  TEXT,
        tags        TEXT NOT NULL DEFAULT '[]',
        mime        TEXT NOT NULL DEFAULT '',
        width       INTEGER,
        height      INTEGER,
        size        INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
      );

      -- Legacy projects table: NO "pages" column yet.
      CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        brand_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        canvas      TEXT NOT NULL,
        layers      TEXT NOT NULL DEFAULT '[]',
        thumb_path  TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
      );

      CREATE TABLE templates (
        id          TEXT PRIMARY KEY,
        brand_id    TEXT,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        canvas      TEXT NOT NULL,
        layers      TEXT NOT NULL DEFAULT '[]',
        variables   TEXT NOT NULL DEFAULT '[]',
        thumb_path  TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
      );

      CREATE TABLE planner (
        id          TEXT PRIMARY KEY,
        brand_id    TEXT NOT NULL,
        date        TEXT NOT NULL,
        time        TEXT,
        platform    TEXT,
        status      TEXT NOT NULL DEFAULT 'Idea',
        title       TEXT NOT NULL,
        notes       TEXT,
        project_id  TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE exports (
        id          TEXT PRIMARY KEY,
        project_id  TEXT,
        brand_id    TEXT,
        format      TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        settings    TEXT NOT NULL DEFAULT '{}',
        created_at  INTEGER NOT NULL
      );

      -- Legacy video_projects table: single-clip schema, NO "scenes"/"audio" yet.
      CREATE TABLE video_projects (
        id          TEXT PRIMARY KEY,
        brand_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        source_path TEXT NOT NULL,
        width       INTEGER NOT NULL DEFAULT 0,
        height      INTEGER NOT NULL DEFAULT 0,
        duration    REAL NOT NULL DEFAULT 0,
        trim_start  REAL NOT NULL DEFAULT 0,
        trim_end    REAL NOT NULL DEFAULT 0,
        overlays    TEXT NOT NULL DEFAULT '[]',
        captions    TEXT NOT NULL DEFAULT '[]',
        look        TEXT NOT NULL DEFAULT 'none',
        thumb_path  TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
      );
    `)

    // Seed realistic pre-existing user data — this is what must survive.
    const ts = 1700000000000
    db.prepare(
      `INSERT INTO brands (id, name, logos, colors, fonts, presets, created_at, updated_at)
       VALUES ('brand-1', 'Legacy Brand', '[]', '[{"id":"c1","role":"primary","hex":"#112233"}]', '[]', '[]', ?, ?)`
    ).run(ts, ts)

    db.prepare(
      `INSERT INTO assets (id, brand_id, name, folder, file_path, tags, mime, size, created_at)
       VALUES ('asset-1', 'brand-1', 'logo.png', 'Logos', 'assets/logo.png', '[]', 'image/png', 1024, ?)`
    ).run(ts)

    db.prepare(
      `INSERT INTO projects (id, brand_id, name, type, canvas, layers, created_at, updated_at)
       VALUES ('proj-1', 'brand-1', 'Legacy Project', 'post', '{"width":1080,"height":1080,"background":"#fff"}', '[]', ?, ?)`
    ).run(ts, ts)

    db.prepare(
      `INSERT INTO video_projects
         (id, brand_id, name, source_path, width, height, duration, trim_start, trim_end, overlays, captions, look, created_at, updated_at)
       VALUES
         ('vid-1', 'brand-1', 'Legacy Reel', 'videos/clip.mp4', 1080, 1920, 12.5, 1, 10, '[]', '[]', 'none', ?, ?)`
    ).run(ts, ts)

    db.prepare(
      `INSERT INTO templates (id, brand_id, name, type, canvas, layers, variables, created_at, updated_at)
       VALUES ('tpl-1', 'brand-1', 'Legacy Template', 'post', '{"width":1080,"height":1080,"background":"#fff"}', '[]', '[]', ?, ?)`
    ).run(ts, ts)

    db.pragma('user_version = 0')
    db.close()
  }

  it('preserves all pre-existing rows and adds the new columns after migrating', async () => {
    const { paths, connection, migrations, repositories } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()

    const dbDir = paths.getPaths().database
    mkdirSync(dbDir, { recursive: true })
    const file = join(dbDir, 'brandstudio.db')
    createLegacyV0Database(file)

    // Now open through the app's normal path and run migrations, exactly like
    // a real upgrade on startup.
    const db = connection.openDb()
    await migrations.runMigrations()

    // 1. user_version was bumped to the latest.
    expect(db.pragma('user_version', { simple: true })).toBe(1)

    // 2. New columns exist.
    const projectCols = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(projectCols).toContain('pages')
    const videoCols = (
      db.prepare('PRAGMA table_info(video_projects)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(videoCols).toContain('scenes')
    expect(videoCols).toContain('audio')

    // 3. Pre-existing data survived, byte for byte where it matters.
    const brand = repositories.brandsRepo.get('brand-1')
    expect(brand).not.toBeNull()
    expect(brand?.name).toBe('Legacy Brand')
    expect(brand?.colors).toEqual([{ id: 'c1', role: 'primary', hex: '#112233' }])

    const assets = repositories.assetsRepo.list({ brandId: 'brand-1' })
    expect(assets).toHaveLength(1)
    expect(assets[0].filePath).toBe('assets/logo.png')

    const project = repositories.projectsRepo.get('proj-1')
    expect(project).not.toBeNull()
    expect(project?.name).toBe('Legacy Project')
    // The legacy row has no "pages" column data — the mapper must synthesize one
    // from canvas/layers rather than crash.
    expect(project?.pages).toHaveLength(1)
    expect(project?.canvas.width).toBe(1080)

    const video = repositories.videoRepo.get('vid-1')
    expect(video).not.toBeNull()
    expect(video?.name).toBe('Legacy Reel')
    // Legacy single-clip video with no "scenes" data must be migrated into one
    // scene in-memory by the mapper (see mapVideo in repositories.ts).
    expect(video?.scenes).toHaveLength(1)
    expect(video?.scenes[0].clip?.src).toBe('videos/clip.mp4')

    const template = repositories.templatesRepo.get('tpl-1')
    expect(template).not.toBeNull()
    expect(template?.name).toBe('Legacy Template')

    connection.closeDb()
  })

  it('does not run the backup step when the DB is already up to date', async () => {
    const { paths, connection, migrations, backup } = await loadDbModules(userDataDir)
    paths.ensureDataDirs()
    connection.openDb()
    await migrations.runMigrations() // brings it up to date, version 1

    const spy = vi.spyOn(backup, 'backupBeforeMigration')
    await migrations.runMigrations() // already current — must skip backup entirely
    expect(spy).not.toHaveBeenCalled()

    connection.closeDb()
  })
})
