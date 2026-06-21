import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useUiStore } from '@renderer/stores/uiStore'

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const COLORS = { success: 'text-green-400', error: 'text-red-400', info: 'text-ink-muted' }

/** Toasts + confirm + prompt modal hosts. Mount once at the app root. */
export default function FeedbackHosts(): JSX.Element {
  const { toasts, dismiss, confirmState, resolveConfirm, promptState, resolvePrompt } = useUiStore()
  const [promptVal, setPromptVal] = useState('')

  useEffect(() => {
    if (promptState) setPromptVal(promptState.defaultValue)
  }, [promptState])

  return (
    <>
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              className="pointer-events-auto card flex items-center gap-2.5 px-3 py-2.5 shadow-lg max-w-sm bg-surface-2"
            >
              <Icon size={16} className={COLORS[t.type]} />
              <span className="text-sm flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirm */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-6">
          <div className="card w-full max-w-sm p-5">
            <p className="text-sm mb-5">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => resolveConfirm(false)} className="btn-ghost text-sm">
                Cancel
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className="btn bg-red-500/90 text-white hover:bg-red-500 text-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt */}
      {promptState && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-6">
          <div className="card w-full max-w-sm p-5">
            <p className="text-sm mb-3">{promptState.message}</p>
            <input
              autoFocus
              className="input mb-5"
              value={promptVal}
              onChange={(e) => setPromptVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') resolvePrompt(promptVal)
                if (e.key === 'Escape') resolvePrompt(null)
              }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => resolvePrompt(null)} className="btn-ghost text-sm">
                Cancel
              </button>
              <button onClick={() => resolvePrompt(promptVal)} className="btn-primary text-sm">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
