import { openDb } from './connection'
import { runMigrations } from './migrations'

export {
  brandsRepo,
  assetsRepo,
  projectsRepo,
  templatesRepo,
  exportsRepo,
  plannerRepo,
  videoRepo
} from './repositories'
export { closeDb } from './connection'

/** Open the database and apply migrations. Call once on startup. */
export async function initDb(): Promise<void> {
  openDb()
  await runMigrations()
}
