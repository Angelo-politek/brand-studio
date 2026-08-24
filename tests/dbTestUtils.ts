// Shared helpers for integration tests that exercise a REAL SQLite database on
// a temp file (never the user's real %APPDATA% database). Mirrors the
// electron-mocking pattern already used by tests/paths.test.ts and
// tests/safeJson.test.ts: `electron.app.getPath('userData')` is redirected to a
// fresh temp directory so src/main/storage/paths.ts (and everything that reads
// getPaths() from it — connection.ts, migrations.ts, backup.ts, logger.ts) sees
// an isolated, disposable data root.
//
// IMPORTANT for callers: `getPaths()` in paths.ts memoizes its result in a
// module-level `cached` variable, so the data root can only be set once per
// module instance. Tests that need a *fresh* data root per test (not just per
// file) must reset the module registry with `vi.resetModules()` and re-`import()`
// both 'electron' (with a new mock) and every @main module under test.

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { vi } from 'vitest'

/** Create a fresh empty temp directory to use as a fake electron userData root. */
export function makeTempUserData(prefix = 'bs-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * Await this before removeTempDir in afterEach. logger.ts (pulled in
 * transitively by migrations.ts) writes to a Node WriteStream asynchronously;
 * without this tick, an in-flight write can race the temp dir's removal and
 * surface as an unhandled ENOENT from a write that lands after cleanup.
 */
export async function flushPendingWrites(): Promise<void> {
  await new Promise((r) => setImmediate(r))
}

/**
 * Re-import the full DB stack (paths, connection, migrations, backup, logger,
 * repositories, index) against a fresh electron mock pointed at `userDataDir`.
 * Call `vi.resetModules()` immediately before this in each test/beforeEach so
 * paths.ts's internal cache and connection.ts's module-level `db` singleton
 * both start clean.
 */
export async function loadDbModules(userDataDir: string) {
  vi.doMock('electron', () => ({
    app: { getPath: () => userDataDir }
  }))

  const paths = await import('@main/storage/paths')
  const connection = await import('@main/db/connection')
  const migrations = await import('@main/db/migrations')
  const backup = await import('@main/db/backup')
  const repositories = await import('@main/db/repositories')
  const dbIndex = await import('@main/db/index')

  return { paths, connection, migrations, backup, repositories, dbIndex }
}
