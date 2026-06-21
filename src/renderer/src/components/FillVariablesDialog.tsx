import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  variables: string[]
  defaultName: string
  onClose: () => void
  onSubmit: (values: Record<string, string>, name: string) => void
}

export default function FillVariablesDialog({
  variables,
  defaultName,
  onClose,
  onSubmit
}: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({})
  const [name, setName] = useState(defaultName)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">Fill template variables</h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-ink-faint mb-1">Project name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {variables.map((v) => (
            <div key={v}>
              <label className="block text-xs text-ink-faint mb-1">{`{{${v}}}`}</label>
              <input
                className="input"
                value={values[v] ?? ''}
                onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(values, name.trim() || defaultName)}
            className="btn-primary text-sm"
          >
            Create design
          </button>
        </div>
      </div>
    </div>
  )
}
