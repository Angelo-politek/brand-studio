import { app } from 'electron'
import { join } from 'path'
import {
  mkdirSync,
  createWriteStream,
  existsSync,
  statSync,
  renameSync,
  unlinkSync,
  type WriteStream
} from 'fs'

/**
 * Minimal append-only file logger for the main process. Logs land in
 * userData/logs/main.log so problems in a packaged app are diagnosable without a
 * devtools console. Also mirrors to stdout in dev.
 *
 * Rotates by size so a long-lived install never grows main.log without bound:
 * once main.log crosses MAX_LOG_BYTES it is renamed to main.log.1 (bumping any
 * existing numbered files up one slot), older files beyond MAX_LOG_FILES are
 * dropped, and a fresh main.log is started.
 */

export const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5MB
/** How many rotated files to keep (main.log.1 … main.log.N), besides the live main.log. */
export const MAX_LOG_FILES = 2

const LOG_NAME = 'main.log'

/**
 * Rotate `<dir>/<baseName>` if it exists and is at least `maxBytes`. Keeps up
 * to `maxFiles` numbered backups (`<baseName>.1` is newest). Pure filesystem
 * logic, no electron dependency, so it is directly testable.
 */
export function rotateIfNeeded(
  dir: string,
  baseName = LOG_NAME,
  maxBytes = MAX_LOG_BYTES,
  maxFiles = MAX_LOG_FILES
): void {
  const current = join(dir, baseName)
  if (!existsSync(current)) return
  if (statSync(current).size < maxBytes) return

  // Drop the oldest backup if we're at capacity, then shift the rest up.
  const oldest = join(dir, `${baseName}.${maxFiles}`)
  if (existsSync(oldest)) unlinkSync(oldest)
  for (let n = maxFiles - 1; n >= 1; n--) {
    const from = join(dir, `${baseName}.${n}`)
    if (existsSync(from)) renameSync(from, join(dir, `${baseName}.${n + 1}`))
  }
  renameSync(current, join(dir, `${baseName}.1`))
}

let stream: WriteStream | null = null

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function openStream(dir: string): WriteStream {
  mkdirSync(dir, { recursive: true })
  return createWriteStream(join(dir, LOG_NAME), { flags: 'a' })
}

function ensureStream(): WriteStream {
  if (stream) return stream
  const dir = logsDir()
  try {
    rotateIfNeeded(dir)
  } catch {
    /* a failed rotation must not prevent logging from continuing */
  }
  stream = openStream(dir)
  return stream
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) =>
      a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a)
    )
    .join(' ')}\n`
  try {
    const dir = logsDir()
    const current = join(dir, LOG_NAME)
    // Cheap size check before every write — logging isn't a hot path at
    // megabyte scale, and this keeps rotation exact rather than approximate.
    if (stream && existsSync(current) && statSync(current).size >= MAX_LOG_BYTES) {
      stream.end()
      stream = null
      rotateIfNeeded(dir)
    }
    ensureStream().write(line)
  } catch {
    /* logging must never throw */
  }
}

export const logger = {
  info: (...args: unknown[]): void => {
    console.log(...args)
    write('INFO', args)
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args)
    write('WARN', args)
  },
  error: (...args: unknown[]): void => {
    console.error(...args)
    write('ERROR', args)
  }
}

/** Catch otherwise-unhandled errors so they are recorded rather than silent. */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => logger.error('uncaughtException', err))
  process.on('unhandledRejection', (reason) => logger.error('unhandledRejection', reason))
}
