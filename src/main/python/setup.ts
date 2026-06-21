import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { setStatus } from './status'

/**
 * The venv lives under userData (writable in a packaged app) rather than next to
 * the read-only backend sources in resources/.
 */
export function venvDir(): string {
  return join(app.getPath('userData'), 'python-venv')
}

/** Path to the venv's python executable (may not exist yet). */
export function venvPythonPath(): string {
  return process.platform === 'win32'
    ? join(venvDir(), 'Scripts', 'python.exe')
    : join(venvDir(), 'bin', 'python')
}

export function venvReady(): boolean {
  return existsSync(venvPythonPath())
}

/** Candidate system interpreters to bootstrap the venv from. */
function systemPythonCandidates(): string[] {
  return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']
}

function run(cmd: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true })
    p.stdout?.on('data', (d) => console.log('[py-setup]', d.toString().trim()))
    p.stderr?.on('data', (d) => console.log('[py-setup]', d.toString().trim()))
    p.on('error', () => resolve(-1))
    p.on('exit', (code) => resolve(code ?? -1))
  })
}

/** Find a working system Python (one that responds to --version). */
async function findSystemPython(): Promise<string | null> {
  for (const cand of systemPythonCandidates()) {
    if ((await run(cand, ['--version'])) === 0) return cand
  }
  return null
}

/**
 * Ensure the venv exists and dependencies are installed. Idempotent: returns
 * immediately if the venv is already present. Returns true if the venv is ready,
 * false if no system Python is available (server features stay disabled).
 *
 * Long-running on first run (pip install); progress is reported via setStatus.
 */
export async function ensureVenv(backendDir: string): Promise<boolean> {
  if (venvReady()) return true

  const sysPy = await findSystemPython()
  if (!sysPy) {
    setStatus('unavailable', 'Python non trovato sul sistema')
    console.warn('[py-setup] no system Python found — server features disabled')
    return false
  }

  setStatus('setting-up', 'Creazione ambiente Python…')
  if ((await run(sysPy, ['-m', 'venv', venvDir()])) !== 0) {
    setStatus('unavailable', 'Creazione venv fallita')
    return false
  }

  const py = venvPythonPath()
  setStatus('setting-up', 'Installazione dipendenze…')
  await run(py, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  const req = join(backendDir, 'requirements.txt')
  if ((await run(py, ['-m', 'pip', 'install', '-r', req])) !== 0) {
    setStatus('unavailable', 'Installazione dipendenze fallita')
    return false
  }

  // Best-effort: pre-fetch the background-removal model so it works offline.
  setStatus('setting-up', 'Download modello (u2net)…')
  await run(
    py,
    ['-c', "from rembg import new_session; new_session('u2net')"],
    backendDir
  )

  return venvReady()
}
