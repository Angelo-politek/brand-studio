import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import type { PythonStatusInfo, PythonStatusValue } from '@shared/ipc'

const LABEL: Record<PythonStatusValue, string> = {
  idle: 'AI starting…',
  'setting-up': 'Setting up AI…',
  starting: 'AI starting…',
  ready: 'AI ready',
  down: 'AI offline',
  unavailable: 'AI unavailable'
}

/** True for the states where AI features (background removal, palette, video
 *  export via the sidecar) are actually usable. */
export function isPythonReady(status: PythonStatusValue): boolean {
  return status === 'ready'
}

/** True for the states a manual restart can plausibly recover from. */
export function canRestartPython(status: PythonStatusValue): boolean {
  return status === 'down' || status === 'unavailable'
}

const DOT: Record<PythonStatusValue, string> = {
  idle: 'bg-yellow-400',
  'setting-up': 'bg-yellow-400 animate-pulse',
  starting: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-400',
  down: 'bg-red-400',
  unavailable: 'bg-ink-faint'
}

/** Subscribe to the live Python sidecar status. */
export function usePythonStatus(): PythonStatusInfo {
  const [info, setInfo] = useState<PythonStatusInfo>({ status: 'idle', detail: '' })
  useEffect(() => {
    void window.api.app.getPythonStatus().then(setInfo)
    return window.api.app.onPythonStatus(setInfo)
  }, [])
  return info
}

interface Props {
  /** Show a "Restart" action once the sidecar is down/unavailable. Off by
   *  default so the compact sidebar footer stays a single line; Settings
   *  turns it on. */
  showRestart?: boolean
}

/**
 * Footer indicator reflecting the Python sidecar lifecycle. The dot + label
 * always summarize state at a glance; when `showRestart` is set and the
 * sidecar has given up (down/unavailable), a "Restart" button appears so the
 * user isn't stuck without AI features until they relaunch the whole app.
 */
export default function BackendStatus({ showRestart = false }: Props): JSX.Element {
  const info = usePythonStatus()
  const [restarting, setRestarting] = useState(false)

  async function handleRestart(): Promise<void> {
    setRestarting(true)
    try {
      await window.api.app.restartPython()
    } finally {
      // The sidecar reports its own status via onPythonStatus as it comes back
      // up; this just re-enables the button once the request round-trips.
      setRestarting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-faint min-w-0">
      <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[info.status])} />
      <span className="truncate" title={info.detail || LABEL[info.status]}>
        {LABEL[info.status]}
      </span>
      {showRestart && canRestartPython(info.status) && (
        <button
          type="button"
          onClick={() => void handleRestart()}
          disabled={restarting}
          className="ml-auto shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-muted hover:text-ink hover:bg-surface-3 disabled:opacity-50 transition-colors"
          title="Restart the AI backend"
        >
          <RotateCw size={11} className={restarting ? 'animate-spin' : undefined} />
          Restart
        </button>
      )}
    </div>
  )
}
