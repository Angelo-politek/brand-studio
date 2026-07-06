import { useRef, useState } from 'react'
import { AlignLeft, AlignCenter, AlignRight, Wand2, Loader2, Palette, Crop } from 'lucide-react'
import { useEditorStoreApi, useIsVideoEditor } from './editorStoreContext'
import { useVideoEditorStore } from '@renderer/stores/videoEditorStore'
import { useCurrentBrand } from '@renderer/stores/brandStore'
import { removeBackground, recolorToPalette } from '@renderer/lib/python'
import { usePythonStatus } from '@renderer/components/BackendStatus'
import { toast } from '@renderer/stores/uiStore'
import { makeImageThumbnail } from '@renderer/lib/thumbnail'
import { mediaUrl } from '@shared/ipc'
import ColorPicker from '@renderer/components/ColorPicker'
import type { Layer } from '@shared/types'

const SYSTEM_FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana']

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-ink-faint">{label}</span>
      <div className="flex-1 flex items-center gap-2">{children}</div>
    </div>
  )
}

function ColorField({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (v: string) => void
}): JSX.Element {
  return <ColorPicker value={value} onChange={onChange} />
}

function Num({
  value,
  onChange,
  min,
  max,
  step = 1
}: {
  value: number | undefined
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}): JSX.Element {
  return (
    <input
      type="number"
      className="input"
      value={value ?? 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** Visual trim bar: full source duration with draggable in/out handles. */
function ClipTrimBar({
  sourceDurMs,
  inMs,
  outMs,
  onChange
}: {
  sourceDurMs: number
  inMs: number
  outMs: number
  onChange: (inMs: number, outMs: number) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const inPct = (inMs / sourceDurMs) * 100
  const outPct = (outMs / sourceDurMs) * 100

  function startDrag(which: 'in' | 'out'): (e: React.MouseEvent) => void {
    return (e) => {
      e.preventDefault()
      e.stopPropagation()
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      function move(ev: MouseEvent): void {
        const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        const ms = Math.round(frac * sourceDurMs)
        if (which === 'in') onChange(Math.min(ms, outMs - 100), outMs)
        else onChange(inMs, Math.max(ms, inMs + 100))
      }
      function up(): void {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }
  }

  return (
    <div>
      <div ref={ref} className="relative h-8 rounded bg-surface-3 overflow-hidden select-none">
        {/* Selected segment */}
        <div
          className="absolute top-0 bottom-0 bg-accent/25 border-x-2 border-accent"
          style={{ left: `${inPct}%`, right: `${100 - outPct}%` }}
        />
        {/* In handle */}
        <div
          onMouseDown={startDrag('in')}
          className="absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize bg-accent rounded"
          style={{ left: `${inPct}%` }}
          title="Trim in"
        />
        {/* Out handle */}
        <div
          onMouseDown={startDrag('out')}
          className="absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize bg-accent rounded"
          style={{ left: `${outPct}%` }}
          title="Trim out"
        />
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint mt-0.5">
        <span>0s</span>
        <span>{(sourceDurMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  )
}

export default function Inspector(): JSX.Element | null {
  const useStore = useEditorStoreApi()
  const isVideo = useIsVideoEditor()
  const { layers, selectedIds, updateLayer, canvas, setCanvas } = useStore()
  // Video-only: active scene duration (hooks must run unconditionally).
  const activeSceneDurationMs = useVideoEditorStore((s) => {
    const sc = s.scenes.find((x) => x.id === s.activeSceneId)
    return sc?.durationMs ?? 0
  })
  const activeSceneId = useVideoEditorStore((s) => s.activeSceneId)
  const setSceneDuration = useVideoEditorStore((s) => s.setSceneDuration)
  const activeClip = useVideoEditorStore((s) => {
    const sc = s.scenes.find((x) => x.id === s.activeSceneId)
    return sc?.clip ?? null
  })
  const updateClip = useVideoEditorStore((s) => s.updateClip)
  const setSceneClip = useVideoEditorStore((s) => s.setSceneClip)
  const brandId = useStore((s) => s.brandId)
  const brand = useCurrentBrand()
  const aiReady = usePythonStatus().status === 'ready'
  const [bgBusy, setBgBusy] = useState(false)
  const [matchBusy, setMatchBusy] = useState(false)
  const setCropMode = useStore((s) => s.setCropMode)
  // Recolor UI state.
  const [selectedPalette, setSelectedPalette] = useState<string[]>([])
  const layer =
    selectedIds.length === 1 ? (layers.find((l) => l.id === selectedIds[0]) ?? null) : null

  async function saveProcessedAsLayerSrc(
    out: Uint8Array,
    suffix: string,
    tag: string
  ): Promise<void> {
    if (!layer || !brandId) return
    const blob = new Blob([out as BlobPart], { type: 'image/png' })
    const thumb = await makeImageThumbnail(blob)
    const asset = await window.api.assets.import({
      brandId,
      folder: 'Images',
      name: `${layer.name}-${suffix}.png`,
      mime: 'image/png',
      bytes: out,
      width: thumb?.width ?? null,
      height: thumb?.height ?? null,
      thumbBytes: thumb?.bytes ?? null,
      tags: [tag]
    })
    updateLayer(layer.id, { src: asset.filePath })
  }

  async function matchPalette(): Promise<void> {
    if (!layer || layer.type !== 'image' || !layer.src || !brandId) return
    const all = (brand?.colors ?? []).map((c) => c.hex)
    // Use the chosen subset, or the full palette when nothing is checked.
    const colors = selectedPalette.length > 0 ? selectedPalette : all
    if (colors.length === 0) {
      toast('Add brand colors first.', 'error')
      return
    }
    setMatchBusy(true)
    try {
      const srcBytes = new Uint8Array(await (await fetch(mediaUrl(layer.src))).arrayBuffer())
      const out = await recolorToPalette(srcBytes, `${layer.name}.png`, colors)
      if (!out) {
        toast('Color matching unavailable (processing backend not ready).', 'error')
        return
      }
      await saveProcessedAsLayerSrc(out, 'brand', 'brand-match')
      toast('Matched to brand palette.', 'success')
    } catch (e) {
      toast(`Color matching failed: ${(e as Error).message}`, 'error')
    } finally {
      setMatchBusy(false)
    }
  }

  function togglePaletteColor(hex: string): void {
    setSelectedPalette((prev) =>
      prev.includes(hex) ? prev.filter((c) => c !== hex) : [...prev, hex]
    )
  }

  async function cropToAspect(a: number | null): Promise<void> {
    if (!layer || layer.type !== 'image' || !layer.src) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = rej
      img.src = mediaUrl(layer.src!)
    })
    const nW = img.naturalWidth
    const nH = img.naturalHeight
    if (a === null) {
      updateLayer(layer.id, { crop: null, height: layer.width * (nH / nW) })
      return
    }
    let cw: number
    let ch: number
    if (nW / nH > a) {
      ch = nH
      cw = nH * a
    } else {
      cw = nW
      ch = nW / a
    }
    updateLayer(layer.id, {
      crop: { x: (nW - cw) / 2, y: (nH - ch) / 2, width: cw, height: ch },
      height: layer.width / a
    })
  }

  async function removeBg(): Promise<void> {
    if (!layer || layer.type !== 'image' || !layer.src || !brandId) return
    setBgBusy(true)
    try {
      const srcBytes = new Uint8Array(await (await fetch(mediaUrl(layer.src))).arrayBuffer())
      const out = await removeBackground(srcBytes, `${layer.name}.png`)
      if (!out) {
        toast('Background removal unavailable (processing backend not ready).', 'error')
        return
      }
      const blob = new Blob([out as BlobPart], { type: 'image/png' })
      const thumb = await makeImageThumbnail(blob)
      const asset = await window.api.assets.import({
        brandId,
        folder: 'Images',
        name: `${layer.name}-nobg.png`,
        mime: 'image/png',
        bytes: out,
        width: thumb?.width ?? null,
        height: thumb?.height ?? null,
        thumbBytes: thumb?.bytes ?? null,
        tags: ['nobg']
      })
      updateLayer(layer.id, { src: asset.filePath })
      toast('Background removed.', 'success')
    } catch (e) {
      toast(`Background removal failed: ${(e as Error).message}`, 'error')
    } finally {
      setBgBusy(false)
    }
  }

  // Video clip selected → dedicated clip panel.
  if (isVideo && selectedIds.length === 1 && selectedIds[0] === '__clip__' && activeClip) {
    const c = activeClip
    const setClip = (patch: Partial<typeof c>): void => updateClip(activeSceneId, patch)
    return (
      <div className="flex-1 overflow-y-auto border-t border-line">
        <div className="px-3 py-2 text-xs font-medium text-ink-muted">Video clip</div>
        <div className="px-3 pb-4 space-y-2.5">
          {/* Visual trim bar */}
          {c.sourceDurMs && c.sourceDurMs > 0 && (
            <ClipTrimBar
              sourceDurMs={c.sourceDurMs}
              inMs={c.inMs}
              outMs={c.outMs}
              onChange={(inMs, outMs) => {
                setClip({ inMs, outMs })
                setSceneDuration(activeSceneId, outMs - inMs)
              }}
            />
          )}
          <Row label="Trim in">
            <Num
              value={Number((c.inMs / 1000).toFixed(2))}
              min={0}
              step={0.1}
              onChange={(v) => {
                const inMs = Math.max(0, Math.min(v * 1000, c.outMs - 100))
                setClip({ inMs })
                setSceneDuration(activeSceneId, c.outMs - inMs)
              }}
            />
            <span className="text-ink-faint text-[11px]">s</span>
          </Row>
          <Row label="Trim out">
            <Num
              value={Number((c.outMs / 1000).toFixed(2))}
              min={0}
              step={0.1}
              onChange={(v) => {
                const outMs = Math.max(c.inMs + 100, v * 1000)
                setClip({ outMs })
                setSceneDuration(activeSceneId, outMs - c.inMs)
              }}
            />
            <span className="text-ink-faint text-[11px]">s</span>
          </Row>
          <p className="text-[10px] text-ink-faint">
            Segment: {((c.outMs - c.inMs) / 1000).toFixed(1)}s
          </p>

          <Row label="Volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={c.muted ? 0 : c.volume}
              disabled={c.muted}
              onChange={(e) => setClip({ volume: Number(e.target.value) })}
              className="w-full"
            />
            <button
              onClick={() => setClip({ muted: !c.muted })}
              className={`text-[11px] px-1.5 py-0.5 rounded ${c.muted ? 'bg-red-500/20 text-red-400' : 'text-ink-muted hover:text-ink'}`}
            >
              {c.muted ? 'Muted' : 'Mute'}
            </button>
          </Row>

          <Row label="Fit">
            <select
              className="input text-xs"
              value={c.fit}
              onChange={(e) => setClip({ fit: e.target.value as 'cover' | 'contain' })}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </Row>

          <Row label="Position">
            <Num value={Math.round(c.x)} onChange={(v) => setClip({ x: v })} />
            <Num value={Math.round(c.y)} onChange={(v) => setClip({ y: v })} />
          </Row>
          <Row label="Size">
            <Num
              value={Math.round(c.width)}
              min={1}
              onChange={(v) => setClip({ width: Math.max(1, v) })}
            />
            <Num
              value={Math.round(c.height)}
              min={1}
              onChange={(v) => setClip({ height: Math.max(1, v) })}
            />
          </Row>
          <Row label="Opacity">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={c.opacity}
              onChange={(e) => setClip({ opacity: Number(e.target.value) })}
              className="w-full"
            />
          </Row>

          <button
            onClick={() => setSceneClip(activeSceneId, null)}
            className="btn-surface w-full text-sm text-red-400"
          >
            Remove clip
          </button>
        </div>
      </div>
    )
  }

  if (!layer) {
    // Multiple layers selected → show count hint.
    if (selectedIds.length > 1) {
      return (
        <div className="p-4 text-center text-xs text-ink-faint border-t border-line">
          {`${selectedIds.length} layers selected`}
        </div>
      )
    }

    // Nothing selected → scene (video) or artboard (design) properties.
    const isTransparent = canvas.background === 'transparent'
    return (
      <div className="flex-1 overflow-y-auto border-t border-line">
        <div className="px-3 py-2 text-xs font-medium text-ink-muted">
          {isVideo ? 'Scene properties' : 'Design properties'}
        </div>
        <div className="px-3 pb-4 space-y-2.5">
          {isVideo ? (
            <Row label="Duration">
              <Num
                value={Number((activeSceneDurationMs / 1000).toFixed(1))}
                min={0.2}
                step={0.1}
                onChange={(v) => setSceneDuration(activeSceneId, Math.max(200, v * 1000))}
              />
              <span className="text-ink-faint text-[11px]">s</span>
            </Row>
          ) : (
            <Row label="Size">
              <Num
                value={canvas.width}
                min={1}
                onChange={(v) => setCanvas({ width: Math.max(1, v) })}
              />
              <span className="text-ink-faint text-[11px]">×</span>
              <Num
                value={canvas.height}
                min={1}
                onChange={(v) => setCanvas({ height: Math.max(1, v) })}
              />
            </Row>
          )}
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-faint font-medium">Background</span>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTransparent}
                  onChange={(e) =>
                    setCanvas({ background: e.target.checked ? 'transparent' : '#ffffff' })
                  }
                />
                Transparent
              </label>
            </div>
            {!isTransparent && (
              <ColorPicker
                value={canvas.background}
                onChange={(v) => setCanvas({ background: v })}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  const set = (patch: Partial<Layer>): void => updateLayer(layer.id, patch)
  const fonts = Array.from(new Set([...(brand?.fonts.map((f) => f.family) ?? []), ...SYSTEM_FONTS]))

  return (
    <div className="flex-1 overflow-y-auto border-t border-line">
      <div className="px-3 py-2 text-xs font-medium text-ink-muted">
        {layer.type.charAt(0).toUpperCase() + layer.type.slice(1)} properties
      </div>
      <div className="px-3 pb-4 space-y-2.5">
        {/* Text */}
        {layer.type === 'text' && (
          <>
            <textarea
              className="input min-h-[64px] resize-y"
              value={layer.text ?? ''}
              onChange={(e) => set({ text: e.target.value })}
            />
            <Row label="Font">
              <select
                className="input"
                value={layer.fontFamily ?? 'Inter'}
                onChange={(e) => set({ fontFamily: e.target.value })}
              >
                {fonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Size">
              <Num value={layer.fontSize} min={4} onChange={(v) => set({ fontSize: v })} />
              <select
                className="input w-28"
                value={layer.fontStyle ?? 'normal'}
                onChange={(e) => set({ fontStyle: e.target.value })}
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
                <option value="italic">Italic</option>
                <option value="bold italic">Bold Italic</option>
              </select>
            </Row>
            <Row label="Color">
              <ColorField value={layer.fill} onChange={(v) => set({ fill: v })} />
            </Row>
            <Row label="Align">
              <div className="flex gap-1">
                {(
                  [
                    ['left', AlignLeft],
                    ['center', AlignCenter],
                    ['right', AlignRight]
                  ] as const
                ).map(([a, Icon]) => (
                  <button
                    key={a}
                    onClick={() => set({ align: a })}
                    className={`btn px-2 py-1.5 ${layer.align === a ? 'bg-surface-4 text-ink' : 'bg-surface-3 text-ink-muted'}`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Spacing">
              <Num
                value={layer.letterSpacing}
                step={0.5}
                onChange={(v) => set({ letterSpacing: v })}
              />
              <Num value={layer.lineHeight} step={0.1} onChange={(v) => set({ lineHeight: v })} />
            </Row>
            <Row label="Stroke">
              <ColorField value={layer.strokeColor} onChange={(v) => set({ strokeColor: v })} />
            </Row>
            <Row label="Stroke W">
              <Num value={layer.strokeWidth} min={0} onChange={(v) => set({ strokeWidth: v })} />
            </Row>
            <Row label="Shadow">
              <ColorField value={layer.shadowColor} onChange={(v) => set({ shadowColor: v })} />
            </Row>
            <Row label="Shadow Blur">
              <Num value={layer.shadowBlur} min={0} onChange={(v) => set({ shadowBlur: v })} />
            </Row>
            <Row label="Shadow Off">
              <Num value={layer.shadowOffsetX} onChange={(v) => set({ shadowOffsetX: v })} />
              <Num value={layer.shadowOffsetY} onChange={(v) => set({ shadowOffsetY: v })} />
            </Row>

          </>
        )}

        {/* Shapes with fill */}
        {(layer.type === 'rect' ||
          layer.type === 'circle' ||
          layer.type === 'triangle' ||
          layer.type === 'polygon') && (
          <>
            <Row label="Fill">
              <ColorField value={layer.fill} onChange={(v) => set({ fill: v })} />
            </Row>
            {layer.type === 'rect' && (
              <Row label="Radius">
                <Num
                  value={layer.cornerRadius}
                  min={0}
                  onChange={(v) => set({ cornerRadius: v })}
                />
              </Row>
            )}
            {layer.type === 'polygon' && (
              <Row label="Sides">
                <Num value={layer.sides} min={3} max={12} onChange={(v) => set({ sides: v })} />
              </Row>
            )}
            <Row label="Stroke">
              <ColorField value={layer.strokeColor} onChange={(v) => set({ strokeColor: v })} />
            </Row>
            <Row label="Stroke W">
              <Num value={layer.strokeWidth} min={0} onChange={(v) => set({ strokeWidth: v })} />
            </Row>
          </>
        )}

        {/* Line / Arrow */}
        {(layer.type === 'line' || layer.type === 'arrow') && (
          <>
            <Row label="Color">
              <ColorField value={layer.strokeColor} onChange={(v) => set({ strokeColor: v })} />
            </Row>
            <Row label="Width">
              <Num value={layer.strokeWidth} min={1} onChange={(v) => set({ strokeWidth: v })} />
            </Row>
          </>
        )}

        {/* Image */}
        {layer.type === 'image' && (
          <>
            <Row label="Brightness">
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={layer.filters?.brightness ?? 0}
                onChange={(e) =>
                  set({ filters: { ...layer.filters, brightness: Number(e.target.value) } })
                }
                className="w-full"
              />
            </Row>
            <Row label="Contrast">
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={layer.filters?.contrast ?? 0}
                onChange={(e) =>
                  set({ filters: { ...layer.filters, contrast: Number(e.target.value) } })
                }
                className="w-full"
              />
            </Row>
            <Row label="Blur">
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={layer.filters?.blur ?? 0}
                onChange={(e) =>
                  set({ filters: { ...layer.filters, blur: Number(e.target.value) } })
                }
                className="w-full"
              />
            </Row>
            <Row label="Grayscale">
              <input
                type="checkbox"
                checked={layer.filters?.grayscale ?? false}
                onChange={(e) =>
                  set({ filters: { ...layer.filters, grayscale: e.target.checked } })
                }
              />
            </Row>
            <div>
              <div className="text-[11px] text-ink-faint mb-1">Crop</div>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    ['Orig', null],
                    ['1:1', 1],
                    ['4:5', 0.8],
                    ['16:9', 16 / 9],
                    ['9:16', 9 / 16]
                  ] as const
                ).map(([label, a]) => (
                  <button
                    key={label}
                    onClick={() => cropToAspect(a)}
                    className="btn bg-surface-3 text-ink-muted hover:text-ink py-1.5 text-[11px]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setCropMode(layer.id)}
              className="btn-surface w-full text-sm mt-1"
            >
              <Crop size={14} /> Crop image
            </button>

            <button
              onClick={removeBg}
              disabled={bgBusy || !aiReady}
              title={aiReady ? undefined : 'AI backend not ready'}
              className="btn-surface w-full text-sm disabled:opacity-50"
            >
              {bgBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {bgBusy ? 'Removing…' : 'Remove background'}
            </button>

            {/* Recolor: map onto brand palette (optional subset) */}
            {(brand?.colors.length ?? 0) > 0 && (
              <div className="pt-1 border-t border-line space-y-2">
                <span className="text-[11px] text-ink-faint font-medium">
                  Match to brand palette
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(brand?.colors ?? []).map((c) => {
                    const on = selectedPalette.includes(c.hex)
                    return (
                      <button
                        key={c.id}
                        title={c.name ?? c.role}
                        onClick={() => togglePaletteColor(c.hex)}
                        className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                          on ? 'border-accent shadow-sm scale-110' : 'border-line/60 opacity-60'
                        }`}
                        style={{ background: c.hex }}
                      />
                    )
                  })}
                </div>
                <p className="text-[10px] text-ink-faint">
                  {selectedPalette.length === 0
                    ? 'No colors picked → uses the full palette.'
                    : `${selectedPalette.length} color${selectedPalette.length > 1 ? 's' : ''} selected.`}
                </p>
                <button
                  onClick={matchPalette}
                  disabled={matchBusy || !aiReady}
                  title={aiReady ? undefined : 'AI backend not ready'}
                  className="btn-surface w-full text-sm disabled:opacity-50"
                >
                  {matchBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Palette size={14} />
                  )}
                  {matchBusy ? 'Matching…' : 'Match palette'}
                </button>
              </div>
            )}

            {/* Color overlay */}
            <div className="pt-1 border-t border-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ink-faint font-medium">Tint / Color overlay</span>
                <button
                  onClick={() =>
                    set({
                      colorOverlay: layer.colorOverlay
                        ? null
                        : { hex: '#000000', opacity: 0.3, blendMode: 'multiply' }
                    })
                  }
                  className="text-[11px] text-ink-muted hover:text-accent"
                >
                  {layer.colorOverlay ? 'Remove' : 'Add'}
                </button>
              </div>
              {layer.colorOverlay && (
                <>
                  <ColorPicker
                    value={layer.colorOverlay.hex}
                    onChange={(v) => set({ colorOverlay: { ...layer.colorOverlay!, hex: v } })}
                  />
                  <Row label="Opacity">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={layer.colorOverlay.opacity}
                      onChange={(e) =>
                        set({
                          colorOverlay: { ...layer.colorOverlay!, opacity: Number(e.target.value) }
                        })
                      }
                      className="w-full"
                    />
                    <span className="text-[11px] text-ink-faint w-8 text-right">
                      {Math.round(layer.colorOverlay.opacity * 100)}%
                    </span>
                  </Row>
                  <Row label="Blend">
                    <select
                      className="input text-xs"
                      value={layer.colorOverlay.blendMode}
                      onChange={(e) =>
                        set({
                          colorOverlay: {
                            ...layer.colorOverlay!,
                            blendMode: e.target.value as 'multiply' | 'overlay' | 'color'
                          }
                        })
                      }
                    >
                      <option value="multiply">Multiply</option>
                      <option value="overlay">Overlay</option>
                      <option value="color">Color</option>
                    </select>
                  </Row>
                </>
              )}
            </div>
          </>
        )}

        {/* Common */}
        <Row label="Rotate">
          <Num
            value={Math.round(layer.rotation)}
            step={1}
            onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 })}
          />
          <span className="text-ink-faint text-[11px]">°</span>
          <button
            onClick={() => set({ rotation: (Math.round(layer.rotation / 90) * 90 + 90) % 360 })}
            className="btn-surface px-2 py-1 text-[11px] shrink-0"
            title="Rotate 90° clockwise"
          >
            +90°
          </button>
          <button
            onClick={() => set({ rotation: 0 })}
            className="btn-surface px-2 py-1 text-[11px] shrink-0"
            title="Reset rotation"
          >
            0°
          </button>
        </Row>
        <Row label="Opacity">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            onChange={(e) => set({ opacity: Number(e.target.value) })}
            className="w-full"
          />
        </Row>

        {/* Animation (video editor only, any layer type) */}
        {isVideo && <AnimSection layer={layer} set={set} />}
      </div>
    </div>
  )
}

/** Enter/exit animation editor, shown for every overlay layer in the video editor. */
function AnimSection({
  layer,
  set
}: {
  layer: Layer
  set: (patch: Partial<Layer>) => void
}): JSX.Element {
  const anim = layer.anim
  return (
    <div className="pt-1 border-t border-line space-y-2">
      <span className="text-[11px] text-ink-faint font-medium">Animation</span>
      <Row label="In">
        <select
          className="input text-xs"
          value={anim?.in ?? 'none'}
          onChange={(e) =>
            set({ anim: { ...anim, in: e.target.value as NonNullable<Layer['anim']>['in'] } })
          }
        >
          <option value="none">None</option>
          <option value="fadeIn">Fade in</option>
          <option value="slideUp">Slide up</option>
          <option value="slideDown">Slide down</option>
          <option value="slideLeft">Slide left</option>
          <option value="slideRight">Slide right</option>
          <option value="pop">Pop</option>
          <option value="flash">Flash</option>
          <option value="pulse">Pulse</option>
          <option value="shake">Shake</option>
        </select>
      </Row>
      <Row label="Out">
        <select
          className="input text-xs"
          value={anim?.out ?? 'none'}
          onChange={(e) =>
            set({ anim: { ...anim, out: e.target.value as NonNullable<Layer['anim']>['out'] } })
          }
        >
          <option value="none">None</option>
          <option value="fadeOut">Fade out</option>
          <option value="slideDownOut">Slide down</option>
          <option value="slideUpOut">Slide up</option>
          <option value="popOut">Pop out</option>
        </select>
      </Row>
      <Row label="Easing">
        <select
          className="input text-xs"
          value={anim?.easing ?? 'linear'}
          onChange={(e) =>
            set({
              anim: { ...anim, easing: e.target.value as NonNullable<Layer['anim']>['easing'] }
            })
          }
        >
          <option value="linear">Linear</option>
          <option value="easeIn">Ease in</option>
          <option value="easeOut">Ease out</option>
          <option value="easeInOut">Ease in-out</option>
        </select>
      </Row>
      <Row label="Duration">
        <Num
          value={anim?.durationMs ?? 500}
          min={100}
          step={100}
          onChange={(v) => set({ anim: { ...anim, durationMs: v } })}
        />
        <span className="text-ink-faint text-[11px]">ms</span>
      </Row>
      <Row label="Delay">
        <Num
          value={anim?.delayMs ?? 0}
          min={0}
          step={100}
          onChange={(v) => set({ anim: { ...anim, delayMs: v } })}
        />
        <span className="text-ink-faint text-[11px]">ms</span>
      </Row>
    </div>
  )
}
