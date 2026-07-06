import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getPaths } from '../storage/paths'
import { setStatus } from './status'
import { ensureVenv, venvPythonPath, venvReady } from './setup'

let proc: ChildProcess | null = null
let port: number | null = null
let healthy = false
let shuttingDown = false
let restartAttempts = 0
const MAX_RESTARTS = 3

// Shared secret passed to the sidecar via env; the renderer fetches it to
// authenticate its requests. Regenerated on every launch.
const token = randomUUID()

function backendDir(): string {
  const candidates = is.dev
    ? [join(app.getAppPath(), 'backend'), join(process.cwd(), 'backend')]
    : [join(process.resourcesPath, 'backend')]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[0]
}

/**
 * The PyInstaller-frozen sidecar exe, when present. Packaged installs ship it
 * under resources/sidecar; a dev checkout may have a local build to test with.
 */
function frozenSidecarPath(dir: string): string | null {
  const exeName = process.platform === 'win32' ? 'brandstudio-sidecar.exe' : 'brandstudio-sidecar'
  const candidates = is.dev
    ? [join(dir, 'dist-sidecar', 'brandstudio-sidecar', exeName)]
    : [join(process.resourcesPath, 'sidecar', 'brandstudio-sidecar', exeName)]
  for (const c of candidates) if (existsSync(c)) return c
  return null
}

/** Bundled FFmpeg binaries (packaged: resources/bin; dev: resources/bin/win). */
function bundledFfmpeg(): { ffmpeg?: string; ffprobe?: string } {
  const dirs = is.dev
    ? [join(app.getAppPath(), 'resources', 'bin', 'win')]
    : [join(process.resourcesPath, 'bin')]
  for (const d of dirs) {
    const ffmpeg = join(d, 'ffmpeg.exe')
    const ffprobe = join(d, 'ffprobe.exe')
    if (existsSync(ffmpeg)) {
      return { ffmpeg, ffprobe: existsSync(ffprobe) ? ffprobe : undefined }
    }
  }
  return {}
}

/**
 * The interpreter to run the sidecar with. Prefers the managed userData venv;
 * falls back to a co-located dev .venv, then the system interpreter.
 */
function resolvePython(dir: string): string {
  if (venvReady()) return venvPythonPath()
  const devWin = join(dir, '.venv', 'Scripts', 'python.exe')
  if (existsSync(devWin)) return devWin
  const devNix = join(dir, '.venv', 'bin', 'python')
  if (existsSync(devNix)) return devNix
  return process.platform === 'win32' ? 'python' : 'python3'
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(p))
    })
  })
}

async function waitHealthy(p: number, timeoutMs = 40000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      // /health is unauthenticated by design (liveness probe).
      const res = await fetch(`http://127.0.0.1:${p}/health`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/** Spawn the sidecar (frozen exe or venv uvicorn) and wait until healthy. */
async function spawnSidecar(dir: string): Promise<void> {
  port = await findFreePort()
  const ff = bundledFfmpeg()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    U2NET_HOME: join(dir, 'models'),
    BS_SIDECAR_TOKEN: token,
    // Path-validation allowlist for the sidecar (see routers/video.py).
    BS_DATA_ROOT: getPaths().dataRoot,
    BS_PORT: String(port),
    ...(ff.ffmpeg ? { BS_FFMPEG: ff.ffmpeg } : {}),
    ...(ff.ffprobe ? { BS_FFPROBE: ff.ffprobe } : {})
  }
  // Inherited from a mis-launched Electron this would make any child Electron
  // process boot as plain Node; it must never reach the sidecar's children.
  delete env.ELECTRON_RUN_AS_NODE
  setStatus('starting', 'Avvio del servizio…')
  const frozen = frozenSidecarPath(dir)
  proc = frozen
    ? spawn(frozen, [], { cwd: dir, env, windowsHide: true })
    : spawn(
        resolvePython(dir),
        ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)],
        { cwd: dir, env, windowsHide: true }
      )
  proc.stdout?.on('data', (d) => console.log('[python]', d.toString().trim()))
  proc.stderr?.on('data', (d) => console.log('[python]', d.toString().trim()))
  proc.on('exit', (code) => {
    console.log('[python] exited with code', code)
    healthy = false
    proc = null
    if (!shuttingDown) onUnexpectedExit()
  })
  proc.on('error', (err) => {
    console.warn('[python] failed to spawn:', err.message)
    healthy = false
    proc = null
  })

  healthy = await waitHealthy(port)
  if (healthy) {
    restartAttempts = 0
    setStatus('ready')
    console.log(`[python] sidecar healthy on port ${port}`)
  } else {
    setStatus('down', 'Il servizio non è diventato disponibile')
    console.warn('[python] sidecar did not become healthy in time')
  }
}

/** Restart the sidecar with exponential backoff after an unexpected exit. */
function onUnexpectedExit(): void {
  if (restartAttempts >= MAX_RESTARTS) {
    setStatus('down', 'Il servizio è stato riavviato troppe volte')
    console.warn('[python] giving up after', MAX_RESTARTS, 'restart attempts')
    return
  }
  const delay = 1000 * 2 ** restartAttempts
  restartAttempts++
  setStatus('starting', `Riavvio del servizio (tentativo ${restartAttempts})…`)
  setTimeout(() => {
    if (shuttingDown) return
    void spawnSidecar(backendDir()).catch((err) =>
      console.warn('[python] restart failed:', (err as Error).message)
    )
  }, delay)
}

/**
 * Bootstrap (first run: create venv + install deps) and launch the sidecar.
 * Non-fatal: if Python is unavailable the app keeps running without
 * server-side processing features.
 */
export async function startPython(): Promise<void> {
  const dir = backendDir()
  const frozen = frozenSidecarPath(dir)
  if (!frozen && !existsSync(join(dir, 'main.py'))) {
    console.warn('[python] backend/main.py not found — sidecar disabled')
    setStatus('unavailable', 'Backend non trovato')
    return
  }
  try {
    // The frozen exe is self-contained; the venv (created on first run in dev)
    // is only needed when running from Python sources.
    if (!frozen && !venvReady() && !existsSync(join(dir, '.venv'))) {
      const ok = await ensureVenv(dir)
      if (!ok) return // status already set to 'unavailable'
    }
    await spawnSidecar(dir)
  } catch (err) {
    healthy = false
    setStatus('down', (err as Error).message)
    console.warn('[python] startup error:', (err as Error).message)
  }
}

/** The sidecar port, or null if it is not (yet) healthy. */
export function getPythonPort(): number | null {
  return healthy ? port : null
}

/** Port + auth token for the renderer to call the sidecar, or null if down. */
export function getPythonInfo(): { port: number; token: string } | null {
  return healthy && port != null ? { port, token } : null
}

export function stopPython(): void {
  shuttingDown = true
  if (proc) {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
    proc = null
  }
  healthy = false
}
