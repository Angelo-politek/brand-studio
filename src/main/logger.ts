import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, createWriteStream, type WriteStream } from 'fs'

/**
 * Minimal append-only file logger for the main process. Logs land in
 * userData/logs/main.log so problems in a packaged app are diagnosable without a
 * devtools console. Also mirrors to stdout in dev.
 */

let stream: WriteStream | null = null

function ensureStream(): WriteStream {
  if (stream) return stream
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  stream = createWriteStream(join(dir, 'main.log'), { flags: 'a' })
  return stream
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`
  try {
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
