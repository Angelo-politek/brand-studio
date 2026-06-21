import Database from 'better-sqlite3'
import { join } from 'path'
import { getPaths } from '../storage/paths'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call openDb() first')
  return db
}

export function openDb(): Database.Database {
  const file = join(getPaths().database, 'brandstudio.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
