import { BrowserWindow } from 'electron'

/** Lifecycle of the Python sidecar, surfaced to the renderer. */
export type PythonStatus =
  | 'idle'        // not started yet
  | 'setting-up'  // creating venv / installing deps
  | 'starting'    // spawned, waiting for health
  | 'ready'       // healthy and serving
  | 'down'        // crashed / failed to start
  | 'unavailable' // no Python interpreter — server features disabled

let current: PythonStatus = 'idle'
let detail = ''

export const PYTHON_STATUS_CHANNEL = 'python:status'

export function getStatus(): { status: PythonStatus; detail: string } {
  return { status: current, detail }
}

/** Update the status and broadcast it to every open window. */
export function setStatus(status: PythonStatus, info = ''): void {
  current = status
  detail = info
  const payload = { status, detail }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(PYTHON_STATUS_CHANNEL, payload)
  }
}
