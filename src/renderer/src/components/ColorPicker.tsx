import { useCurrentBrand } from '@renderer/stores/brandStore'

interface Props {
  value: string | undefined
  onChange: (hex: string) => void
  label?: string
}

/** Color picker showing brand swatches + native color input. */
export default function ColorPicker({ value, onChange, label }: Props): JSX.Element {
  const brand = useCurrentBrand()
  const colors = brand?.colors ?? []
  const hex = value ?? '#000000'

  return (
    <div className="space-y-1.5">
      {/* Brand swatches */}
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colors.map((c) => (
            <button
              key={c.id}
              title={c.name ?? c.role}
              onClick={() => onChange(c.hex)}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                hex.toLowerCase() === c.hex.toLowerCase()
                  ? 'border-accent shadow-sm scale-110'
                  : 'border-transparent'
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      )}

      {/* Native color + hex input */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 rounded bg-transparent border border-line cursor-pointer flex-shrink-0"
          title={label ?? 'Color'}
        />
        <input
          className="input font-mono text-xs flex-1"
          value={hex}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
          }}
        />
      </div>
    </div>
  )
}
