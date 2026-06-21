import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getPaths } from '../storage/paths'

let proc: ChildProcess | null = null
let port: number | null = null
let healthy = false
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

function venvPython(dir: string): string {
  const win = join(dir, '.venv', 'Scripts', 'python.exe')
  if (existsSync(win)) return win
  const nix = join(dir, '.venv', 'bin', 'python')
  if (existsSync(nix)) return nix
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

/**
 * Launch the FastAPI sidecar (uvicorn). Non-fatal: if Python or the venv is
 * missing the app keeps running, just without server-side processing features.
 */
export async function startPython(): Promise<void> {
  const dir = backendDir()
  if (!existsSync(join(dir, 'main.py'))) {
    console.warn('[python] backend/main.py not found — sidecar disabled')
    return
  }
  const py = venvPython(dir)
  try {
    port = await findFreePort()
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      U2NET_HOME: join(dir, 'models'),
      BS_SIDECAR_TOKEN: token,
      // Path-validation allowlist for the sidecar (see routers/video.py).
      BS_DATA_ROOT: getPaths().dataRoot
    }
    proc = spawn(py, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: dir,
      env,
      windowsHide: true
    })
    proc.stdout?.on('data', (d) => console.log('[python]', d.toString().trim()))
    proc.stderr?.on('data', (d) => console.log('[python]', d.toString().trim()))
    proc.on('exit', (code) => {
      console.log('[python] exited with code', code)
      healthy = false
      proc = null
    })
    proc.on('error', (err) => {
      console.warn('[python] failed to spawn:', err.message)
      healthy = false
      proc = null
    })

    healthy = await waitHealthy(port)
    if (healthy) console.log(`[python] sidecar healthy on port ${port}`)
    else console.warn('[python] sidecar did not become healthy in time')
  } catch (err) {
    console.warn('[python] startup error:', (err as Error).message)
    healthy = false
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
