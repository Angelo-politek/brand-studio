import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Music, Loader2, Film } from 'lucide-react'
import { useEditorStore } from '@renderer/stores/editorStore'
import { useVideoStore } from '@renderer/stores/videoStore'
import {
  analyzeBeats,
  findHighlightMs,
  MIN_CONFIDENCE,
  type BeatAnalysis
} from '@renderer/lib/beatDetect'
import { pagesToScenes, type ReelFit, type ReelIntensity } from '@renderer/lib/designToReel'
import { useAssetStore } from '@renderer/stores/assetStore'
import { pickFiles } from '@renderer/lib/files'
import { mediaUrl } from '@shared/ipc'
import { cn } from '@renderer/lib/cn'
import { Upload } from 'lucide-react'
import { toast } from '@renderer/stores/uiStore'
import type { Asset, Page } from '@shared/types'

/** Reading speed presets mapped to words-per-minute. */
const SPEED_OPTIONS: { label: string; wpm: number }[] = [
  { label: 'Lento', wpm: 160 },
  { label: 'Normale', wpm: 220 },
  { label: 'Veloce', wpm: 300 }
]

const INTENSITY_OPTIONS: { value: ReelIntensity; label: string }[] = [
  { value: 'subtle', label: 'Sobrio' },
  { value: 'normal', label: 'Normale' },
  { value: 'punchy', label: 'Energico' }
]

/** Output format presets: null size = keep the design's own canvas size. */
const FORMAT_OPTIONS: {
  value: string
  label: string
  hint: string
  size: { width: number; height: number } | null
}[] = [
  { value: 'keep', label: 'Mantieni foglio', hint: 'Stesse dimensioni del design', size: null },
  {
    value: '9x16',
    label: 'Reel 9:16',
    hint: '1080×1920 · Reel/TikTok/Shorts',
    size: { width: 1080, height: 1920 }
  },
  {
    value: '1x1',
    label: 'Quadrato 1:1',
    hint: '1080×1080 · Feed',
    size: { width: 1080, height: 1080 }
  },
  {
    value: '4x5',
    label: 'Verticale 4:5',
    hint: '1080×1350 · Feed verticale',
    size: { width: 1080, height: 1350 }
  },
  {
    value: '16x9',
    label: 'Orizzontale 16:9',
    hint: '1920×1080 · YouTube',
    size: { width: 1920, height: 1080 }
  }
]

interface BeatState extends BeatAnalysis {
  loading: boolean
}

const EMPTY_ANALYSIS: BeatAnalysis = {
  bpm: 0,
  beats: [],
  confidence: 0,
  loudness: new Float32Array(0),
  loudnessRate: 0,
  durationMs: 0
}

export default function ConvertToReelDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useNavigate()
  const brandId = useEditorStore((s) => s.brandId)
  const projectName = useEditorStore((s) => s.name)

  const [format, setFormat] = useState('9x16')
  const [intensity, setIntensity] = useState<ReelIntensity>('normal')
  const [wpm, setWpm] = useState(220)
  const [syncToBeat, setSyncToBeat] = useState(true)
  const [tracks, setTracks] = useState<Asset[]>([])
  const [trackId, setTrackId] = useState<string>('')
  const [beat, setBeat] = useState<BeatState>({ loading: false, ...EMPTY_ANALYSIS })
  const [converting, setConverting] = useState(false)

  // Load Audio assets for the current brand.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!brandId) return
      const list = await window.api.assets.list({ brandId, folder: 'Audio' })
      if (!cancelled) setTracks(list)
    })()
    return () => {
      cancelled = true
    }
  }, [brandId])

  const selectedTrack = tracks.find((t) => t.id === trackId) ?? null

  // Analyze the chosen track for tempo.
  const analyze = useCallback(async (asset: Asset) => {
    setBeat({ loading: true, ...EMPTY_ANALYSIS })
    const result = await analyzeBeats(mediaUrl(asset.filePath))
    setBeat({ loading: false, ...result })
  }, [])

  function pickTrack(id: string): void {
    setTrackId(id)
    const asset = tracks.find((t) => t.id === id)
    if (asset) void analyze(asset)
  }

  const importPaths = useAssetStore((s) => s.importPaths)
  const importing = useAssetStore((s) => s.importing)

  // Upload a new audio file, add it to the Audio library, then select + analyze.
  async function uploadTrack(): Promise<void> {
    if (!brandId) return
    const paths = await pickFiles(
      [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'] }],
      false
    )
    if (paths.length === 0) return
    const prevFolder = useAssetStore.getState().folder
    useAssetStore.setState({ folder: 'Audio' })
    await importPaths(brandId, paths)
    useAssetStore.setState({ folder: prevFolder })
    const list = await window.api.assets.list({ brandId, folder: 'Audio' })
    setTracks(list)
    // Select the most recently added track (the upload we just made).
    const added = [...list].sort((a, b) => b.createdAt - a.createdAt)[0]
    if (added) pickTrack(added.id)
  }

  const target = FORMAT_OPTIONS.find((f) => f.value === format)?.size ?? null
  // Any fixed-size format reuses the generic scale-into-frame fit.
  const fit: ReelFit = target ? 'fit9x16' : 'keep'

  async function convert(): Promise<void> {
    if (!brandId) {
      toast('Nessun brand selezionato.', 'error')
      return
    }
    setConverting(true)
    try {
      const st = useEditorStore.getState()
      const pages: Page[] =
        st.pages && st.pages.length > 0
          ? st.pages
          : [{ id: 'p1', name: 'Page 1', canvas: st.canvas, layers: st.layers }]

      // For 'keep', use the first page's own canvas size as the project size.
      const width = target ? target.width : pages[0].canvas.width
      const height = target ? target.height : pages[0].canvas.height

      const hasBeats = syncToBeat && beat.beats.length > 0 && beat.confidence >= MIN_CONFIDENCE

      // Iterate to a consistent segment: layout → pick highlight for that
      // length → relayout against beats relative to the highlight → recompute
      // the highlight with the NEW length. Two rounds converge in practice, and
      // this fixes the old bug where the chosen segment length didn't match the
      // final reel length (scenes off-beat / music running out).
      const layout = (beats: number[] | null): ReturnType<typeof pagesToScenes> =>
        pagesToScenes(pages, { width, height, fit, intensity, beats, wpm })

      const first = layout(hasBeats ? beat.beats : null)
      let scenes = first.scenes
      let audioInMs = 0

      if (selectedTrack && beat.loudness.length > 0) {
        // Round 1: highlight for the first-pass length.
        audioInMs = findHighlightMs(
          beat.loudness,
          beat.loudnessRate,
          beat.durationMs,
          first.totalMs,
          hasBeats ? beat.beats : undefined
        )
        if (hasBeats && audioInMs > 0) {
          // Relayout with beats relative to the chosen start.
          const relBeats = beat.beats.filter((b) => b >= audioInMs).map((b) => b - audioInMs)
          const second = layout(relBeats)
          scenes = second.scenes
          // Round 2: re-pick the highlight for the ACTUAL reel length so the
          // audio segment and the reel are the same duration and beat-aligned.
          audioInMs = findHighlightMs(
            beat.loudness,
            beat.loudnessRate,
            beat.durationMs,
            second.totalMs,
            beat.beats
          )
          const relBeats2 = beat.beats.filter((b) => b >= audioInMs).map((b) => b - audioInMs)
          scenes = layout(relBeats2).scenes
        }
      }

      const vp = await useVideoStore.getState().create({
        brandId,
        name: `${projectName} – Reel`,
        width,
        height,
        scenes
      })

      if (selectedTrack) {
        await useVideoStore
          .getState()
          .update({ ...vp, audio: { src: selectedTrack.filePath, inMs: audioInMs, volume: 0.8 } })
      }

      onClose()
      navigate(`/app/video/${vp.id}`)
    } catch (err) {
      console.error('convert to reel failed', err)
      toast('Conversione non riuscita.', 'error')
      setConverting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="card w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold flex items-center gap-2">
            <Film size={16} /> Converti in Reel
          </h2>
          <button onClick={onClose} className="btn-ghost px-1.5 py-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Format */}
          <div>
            <div className="text-xs text-ink-faint mb-2">Formato</div>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'card p-3 text-left hover:border-accent/60',
                    format === f.value && 'border-accent'
                  )}
                >
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-[11px] text-ink-faint mt-0.5">{f.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Music */}
          <div>
            <div className="text-xs text-ink-faint mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Music size={12} /> Musica
              </span>
              <button
                onClick={() => void uploadTrack()}
                disabled={importing || !brandId}
                className="btn-surface text-[11px] px-2 py-1 disabled:opacity-50"
                title="Carica un nuovo file audio"
              >
                {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                Carica…
              </button>
            </div>
            {tracks.length === 0 ? (
              <p className="text-[11px] text-ink-faint">
                Nessuna traccia audio. Usa “Carica…” per aggiungerne una.
              </p>
            ) : (
              <select
                className="input w-full"
                value={trackId}
                onChange={(e) => pickTrack(e.target.value)}
              >
                <option value="">Nessuna (solo tempo di lettura)</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {beat.loading && (
              <div className="text-[11px] text-ink-faint mt-1 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Analisi del ritmo…
              </div>
            )}
            {!beat.loading && selectedTrack && (
              <div className="text-[11px] text-ink-faint mt-1">
                {beat.confidence >= MIN_CONFIDENCE
                  ? `Ritmo rilevato: ${beat.bpm} BPM`
                  : 'Ritmo non rilevato con certezza — userò il tempo di lettura.'}
              </div>
            )}
          </div>

          {/* Sync to beat */}
          {selectedTrack && beat.confidence >= MIN_CONFIDENCE && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={syncToBeat}
                onChange={(e) => setSyncToBeat(e.target.checked)}
              />
              Sincronizza le slide al ritmo
            </label>
          )}

          {/* Reading speed */}
          <div>
            <div className="text-xs text-ink-faint mb-2">Velocità di lettura</div>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((o) => (
                <button
                  key={o.wpm}
                  onClick={() => setWpm(o.wpm)}
                  className={cn(
                    'flex-1 card py-2 text-sm hover:border-accent/60',
                    wpm === o.wpm && 'border-accent'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Effects intensity */}
          <div>
            <div className="text-xs text-ink-faint mb-2">Intensità effetti</div>
            <div className="flex gap-2">
              {INTENSITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setIntensity(o.value)}
                  className={cn(
                    'flex-1 card py-2 text-sm hover:border-accent/60',
                    intensity === o.value && 'border-accent'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn-ghost text-sm" disabled={converting}>
            Annulla
          </button>
          <button
            onClick={() => void convert()}
            className="btn-primary text-sm"
            disabled={converting || beat.loading}
          >
            {converting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Conversione…
              </>
            ) : (
              <>
                <Film size={14} /> Crea Reel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
