import type Database from 'better-sqlite3'
import { getDb } from './connection'

/**
 * Versioned migrations keyed off `PRAGMA user_version`. Each entry is applied in
 * order when its index (1-based) is greater than the stored version, then the
 * version is bumped. Existing pre-versioning databases report version 0 and are
 * brought up to date idempotently (CREATE TABLE IF NOT EXISTS + guarded
 * ADD COLUMN), so upgrading from the old try/catch scheme is seamless.
 */

/** True if `table` already has a column named `column`. */
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

/** Add a column only if it does not already exist (legacy DBs may have it). */
function addColumnIfMissing(db: Database.Database, table: string, columnDef: string): void {
  const name = columnDef.split(/\s+/)[0]
  if (!hasColumn(db, table, name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`)
  }
}

type Migration = (db: Database.Database) => void

const migrations: Migration[] = [
  // v1 — base schema + all additive columns (idempotent for legacy DBs).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS brands (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        logos       TEXT NOT NULL DEFAULT '[]',
        colors      TEXT NOT NULL DEFAULT '[]',
        fonts       TEXT NOT NULL DEFAULT '[]',
        presets     TEXT NOT NULL DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
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
      CREATE INDEX IF NOT EXISTS idx_assets_brand ON assets(brand_id);
      CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(brand_id, folder);

      CREATE TABLE IF NOT EXISTS projects (
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
      CREATE INDEX IF NOT EXISTS idx_projects_brand ON projects(brand_id);

      CREATE TABLE IF NOT EXISTS templates (
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
      CREATE INDEX IF NOT EXISTS idx_templates_brand ON templates(brand_id);

      CREATE TABLE IF NOT EXISTS planner (
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
      CREATE INDEX IF NOT EXISTS idx_planner_brand ON planner(brand_id);

      CREATE TABLE IF NOT EXISTS exports (
        id          TEXT PRIMARY KEY,
        project_id  TEXT,
        brand_id    TEXT,
        format      TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        settings    TEXT NOT NULL DEFAULT '{}',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_exports_brand ON exports(brand_id);

      CREATE TABLE IF NOT EXISTS video_projects (
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
      CREATE INDEX IF NOT EXISTS idx_video_brand ON video_projects(brand_id);
    `)

    // Additive columns introduced over time (multi-page projects, video v2).
    addColumnIfMissing(db, 'projects', 'pages TEXT')
    addColumnIfMissing(db, 'video_projects', 'scenes TEXT')
    addColumnIfMissing(db, 'video_projects', 'audio TEXT')
  }
]

/** Apply any migrations newer than the database's stored user_version. */
export function runMigrations(): void {
  const db = getDb()
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  for (let v = current; v < migrations.length; v++) {
    const migrate = db.transaction(() => {
      migrations[v](db)
      // user_version cannot be parameterized; v+1 is an integer we control.
      db.pragma(`user_version = ${v + 1}`)
    })
    migrate()
  }
}
