import { useEffect, useState } from 'react'
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

/** Small footer indicator reflecting the Python sidecar lifecycle. */
export default function BackendStatus(): JSX.Element {
  const info = usePythonStatus()

  return (
    <div
      className="flex items-center gap-2 text-[11px] text-ink-faint"
      title={info.detail || LABEL[info.status]}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[info.status])} />
      <span className="truncate">{LABEL[info.status]}</span>
    </div>
  )
}
