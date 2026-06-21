import { getDb } from './connection'

/** Idempotent schema creation. Safe to run on every startup. */
export function runMigrations(): void {
  const db = getDb()
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

  // Additive migration: add pages column to projects (idempotent).
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN pages TEXT`)
  } catch {
    // Column already exists — ignore.
  }

  // Additive migration: video timeline (scenes + global audio). Idempotent.
  for (const col of ['scenes TEXT', 'audio TEXT']) {
    try {
      db.exec(`ALTER TABLE video_projects ADD COLUMN ${col}`)
    } catch {
      // Column already exists — ignore.
    }
  }
  // Allow source_path to be NULL for new (clip-less) video projects.
  // SQLite can't drop a NOT NULL constraint in place; new rows simply write ''.
}
