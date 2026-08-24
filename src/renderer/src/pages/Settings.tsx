import { useEffect, useState } from 'react'
import { FolderOpen, FileText, Github, Bug, RotateCw, DownloadCloud } from 'lucide-react'
import PageHeader from '@renderer/components/PageHeader'
import { cn } from '@renderer/lib/cn'
import { usePythonStatus, canRestartPython } from '@renderer/components/BackendStatus'
import { toast } from '@renderer/stores/uiStore'
import { isNewerVersion } from '@renderer/lib/version'
import type { AppPaths, PythonStatusValue, UpdateCheckResult } from '@shared/ipc'

const REPO_URL = 'https://github.com/Angelo-politek/brand-studio'
const ISSUES_URL = `${REPO_URL}/issues/new`

const STATUS_LABEL: Record<PythonStatusValue, string> = {
  idle: 'Starting…',
  'setting-up': 'Setting up…',
  starting: 'Starting…',
  ready: 'Ready',
  down: 'Offline',
  unavailable: 'Unavailable'
}

const STATUS_DOT: Record<PythonStatusValue, string> = {
  idle: 'bg-yellow-400',
  'setting-up': 'bg-yellow-400 animate-pulse',
  starting: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-400',
  down: 'bg-red-400',
  unavailable: 'bg-ink-faint'
}

function openExternal(url: string): void {
  window.open(url, '_blank')
}

export default function Settings(): JSX.Element {
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const pyStatus = usePythonStatus()
  const [restarting, setRestarting] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    void window.api.app.getPaths().then(setPaths)
    void window.api.app.getVersion().then(setVersion)
  }, [])

  async function handleRestart(): Promise<void> {
    setRestarting(true)
    try {
      await window.api.app.restartPython()
      toast('Restarting the AI backend…', 'info')
    } catch (err) {
      toast(`Could not restart the AI backend: ${(err as Error).message}`, 'error')
    } finally {
      setRestarting(false)
    }
  }

  async function handleCheckForUpdate(): Promise<void> {
    setCheckingUpdate(true)
    setUpdateResult(null)
    try {
      const result = await window.api.app.checkForUpdate()
      setUpdateResult(result)
      if (!result.ok) toast(result.error ?? 'Could not check for updates.', 'error')
    } catch (err) {
      setUpdateResult({ ok: false, error: (err as Error).message })
      toast(`Could not check for updates: ${(err as Error).message}`, 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function handleOpenData(): Promise<void> {
    try {
      await window.api.app.openDataFolder()
    } catch (err) {
      toast(`Could not open the data folder: ${(err as Error).message}`, 'error')
    }
  }

  async function handleOpenLogs(): Promise<void> {
    try {
      await window.api.app.openLogsFolder()
    } catch (err) {
      toast(`Could not open the logs folder: ${(err as Error).message}`, 'error')
    }
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <PageHeader title="Settings" subtitle="Local environment, storage & app info." />
      <div className="p-8 space-y-6 max-w-2xl">
        <section className="card p-5">
          <h2 className="font-medium mb-3">Processing backend</h2>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn('h-2.5 w-2.5 rounded-full shrink-0', STATUS_DOT[pyStatus.status])}
            />
            <span className="text-ink-muted">
              AI features (background removal, palette extraction, video export):{' '}
              <span className="text-ink font-medium">{STATUS_LABEL[pyStatus.status]}</span>
            </span>
          </div>
          {pyStatus.detail && (
            <p className="mt-1.5 text-xs text-ink-faint break-words">{pyStatus.detail}</p>
          )}
          {pyStatus.status === 'ready' && (
            <p className="mt-1.5 text-xs text-ink-faint">All AI-powered tools are available.</p>
          )}
          {!canRestartPython(pyStatus.status) && pyStatus.status !== 'ready' && (
            <p className="mt-1.5 text-xs text-ink-faint">
              The backend is still starting up — this can take a while on first launch while models
              are downloaded.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void handleRestart()}
              disabled={restarting}
              className="btn-surface text-xs py-1.5"
            >
              <RotateCw size={13} className={restarting ? 'animate-spin' : undefined} />
              Restart AI backend
            </button>
            {canRestartPython(pyStatus.status) && (
              <span className="text-xs text-ink-faint">
                The backend stopped retrying on its own — restart it manually.
              </span>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-3">Storage</h2>
          <dl className="space-y-1.5 text-sm mb-4">
            {paths &&
              Object.entries(paths).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-ink-faint">{k}</dt>
                  <dd className="font-mono text-xs text-ink-muted break-all">{v}</dd>
                </div>
              ))}
          </dl>
          <div className="flex items-center gap-2">
            <button onClick={() => void handleOpenData()} className="btn-surface text-xs py-1.5">
              <FolderOpen size={13} />
              Open data folder
            </button>
            <button onClick={() => void handleOpenLogs()} className="btn-surface text-xs py-1.5">
              <FileText size={13} />
              Open logs folder
            </button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-2">About</h2>
          <p className="text-sm text-ink-muted mb-3">
            Brand Studio — offline-first, local-only content studio. No cloud, no subscription.
          </p>
          <p className="text-sm text-ink-faint mb-3">
            Version <span className="font-mono text-ink-muted">{version ?? '…'}</span>
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => openExternal(REPO_URL)} className="btn-surface text-xs py-1.5">
              <Github size={13} />
              GitHub repository
            </button>
            <button onClick={() => openExternal(ISSUES_URL)} className="btn-surface text-xs py-1.5">
              <Bug size={13} />
              Report an issue
            </button>
            <button
              onClick={() => void handleCheckForUpdate()}
              disabled={checkingUpdate}
              className="btn-surface text-xs py-1.5"
            >
              <DownloadCloud size={13} className={checkingUpdate ? 'animate-pulse' : undefined} />
              {checkingUpdate ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
          {updateResult?.ok && updateResult.latestTag && (
            <p className="mt-2 text-xs text-ink-faint">
              {version && isNewerVersion(version, updateResult.latestTag) ? (
                <>
                  A newer version is available ({updateResult.latestTag}).{' '}
                  <button
                    onClick={() => openExternal(updateResult.htmlUrl ?? REPO_URL)}
                    className="underline hover:text-ink-muted"
                  >
                    View the release
                  </button>
                </>
              ) : (
                <>You&rsquo;re on the latest version.</>
              )}
            </p>
          )}
          {updateResult && !updateResult.ok && (
            <p className="mt-2 text-xs text-ink-faint">
              {updateResult.error ?? 'Could not check for updates.'}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Checked only when you click the button above — Brand Studio never contacts the internet
            on its own.
          </p>
        </section>
      </div>
    </div>
  )
}
