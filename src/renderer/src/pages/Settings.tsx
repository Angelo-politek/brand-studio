import { useEffect, useState } from 'react'
import PageHeader from '@renderer/components/PageHeader'
import type { AppPaths } from '@shared/ipc'

export default function Settings(): JSX.Element {
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [pyPort, setPyPort] = useState<number | null>(null)

  useEffect(() => {
    void window.api.app.getPaths().then(setPaths)
    void window.api.app.getPythonPort().then(setPyPort)
  }, [])

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Settings" subtitle="Local environment & storage." />
      <div className="p-8 space-y-6 max-w-2xl">
        <section className="card p-5">
          <h2 className="font-medium mb-3">Processing backend</h2>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${pyPort ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
            <span className="text-ink-muted">
              {pyPort
                ? `Python sidecar healthy on port ${pyPort}`
                : 'Python sidecar not running (background removal disabled)'}
            </span>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-3">Storage</h2>
          <dl className="space-y-1.5 text-sm">
            {paths &&
              Object.entries(paths).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-ink-faint">{k}</dt>
                  <dd className="font-mono text-xs text-ink-muted break-all">{v}</dd>
                </div>
              ))}
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-2">About</h2>
          <p className="text-sm text-ink-muted">
            Brand Studio — offline-first, local-only content studio. No cloud, no subscription.
          </p>
        </section>
      </div>
    </div>
  )
}
