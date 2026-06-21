import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Download, Check, Loader2 } from 'lucide-react'
import { useVideoEditorStore } from '@renderer/stores/videoEditorStore'
import { useBrandStore } from '@renderer/stores/brandStore'
import { ensureBrandFonts } from '@renderer/lib/fonts'
import { EditorStoreProvider, type SharedEditorStore } from '@renderer/editor/editorStoreContext'
import EditorCanvas from '@renderer/editor/EditorCanvas'
import ElementsPanel from '@renderer/editor/ElementsPanel'
import LayersPanel from '@renderer/editor/LayersPanel'
import Inspector from '@renderer/editor/Inspector'
import Timeline from '@renderer/editor/video/Timeline'
import SceneClipNode from '@renderer/editor/video/SceneClipNode'
import AssetPickerDialog from '@renderer/editor/video/AssetPickerDialog'
import {
  renderSceneOverlayPng,
  renderSceneOverlayFrames,
  sceneHasAnimation
} from '@renderer/lib/videoExport'
import { animateLayer } from '@renderer/lib/videoAnim'
import { exportVideo } from '@renderer/lib/python'
import { mediaUrl } from '@shared/ipc'
import { toast } from '@renderer/stores/uiStore'
import type { Asset, VideoProject } from '@shared/types'

/** Probe a video asset (served via media://) for duration + natural size. */
function probeVideoMeta(url: string): Promise<{ durMs: number; w: number; h: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.src = url
    v.onloadedmetadata = () => {
      resolve({ durMs: (v.duration || 0) * 1000, w: v.videoWidth || 0, h: v.videoHeight || 0 })
      v.src = ''
    }
    v.onerror = () => resolve({ durMs: 0, w: 0, h: 0 })
  })
}

export default function VideoEditor(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [picker, setPicker] = useState<'video' | 'audio' | null>(null)
  const lastSaved = useRef('')

  const store = useVideoEditorStore
  const {
    name,
    width,
    height,
    scenes,
    activeSceneId,
    audio,
    playheadMs,
    playing,
    setName,
    setPlaying,
    setPlayhead,
    setSceneClip,
    setAudio,
    addScene
  } = useVideoEditorStore()

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0]
  const musicRef = useRef<HTMLAudioElement>(null)

  // Live transition preview: when the active scene changes during playback,
  // briefly animate the canvas wrapper according to the scene's transitionIn.
  const [transClass, setTransClass] = useState('')
  const prevSceneRef = useRef(activeSceneId)
  useEffect(() => {
    if (prevSceneRef.current === activeSceneId) return
    prevSceneRef.current = activeSceneId
    if (!playing) return
    const t = activeScene?.transitionIn
    if (!t || t.type === 'none') return
    const cls =
      t.type === 'fade' ? 'vt-fade' : t.type === 'slideLeft' ? 'vt-slide-left' : 'vt-slide-up'
    setTransClass(cls)
    const timer = setTimeout(() => setTransClass(''), t.durationMs)
    return () => clearTimeout(timer)
  }, [activeSceneId, playing, activeScene])

  // Global timeline offset (ms) = sum of durations before the active scene + local playhead.
  const globalOffsetMs =
    scenes
      .slice(
        0,
        Math.max(
          0,
          scenes.findIndex((s) => s.id === activeSceneId)
        )
      )
      .reduce((sum, s) => sum + s.durationMs, 0) + playheadMs

  // Drive the background-music <audio> from play state + global playhead.
  useEffect(() => {
    const a = musicRef.current
    if (!a || !audio) return
    a.volume = audio.volume
    const target = (audio.inMs + globalOffsetMs) / 1000
    if (!playing) {
      a.pause()
      if (Math.abs(a.currentTime - target) > 0.1) a.currentTime = target
    } else {
      if (Math.abs(a.currentTime - target) > 0.4) a.currentTime = target
      void a.play().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, globalOffsetMs, audio?.volume, audio?.inMs, audio?.src])

  // Load project once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!videoId) return
      const vp = await window.api.video.get(videoId)
      if (cancelled) return
      if (!vp) {
        navigate('/app/videos')
        return
      }
      store.getState().loadProject(vp)
      store.temporal.getState().clear()
      lastSaved.current = JSON.stringify({ name: vp.name, scenes: vp.scenes, audio: vp.audio })
      const brand =
        useBrandStore.getState().brands.find((b) => b.id === vp.brandId) ??
        (await window.api.brands.get(vp.brandId))
      await ensureBrandFonts(brand)
    })()
    return () => {
      cancelled = true
      store.temporal.getState().clear()
    }
  }, [videoId, navigate, store])

  // Debounced autosave.
  useEffect(() => {
    const snap = JSON.stringify({ name, scenes, audio })
    if (snap === lastSaved.current || !lastSaved.current) return
    setSaving(true)
    const t = setTimeout(async () => {
      const vp = store.getState().toProject()
      if (!vp.id) return
      await window.api.video.update(vp as VideoProject)
      lastSaved.current = JSON.stringify({ name: vp.name, scenes: vp.scenes, audio: vp.audio })
      setSaving(false)
    }, 600)
    return () => clearTimeout(t)
  }, [name, scenes, audio, store])

  // Simple scene-local playback clock.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number): void => {
      const dt = t - last
      last = t
      const cur = store.getState()
      const scene = cur.scenes.find((s) => s.id === cur.activeSceneId)
      if (!scene) return
      const next = cur.playheadMs + dt
      if (next >= scene.durationMs) {
        // Advance to next scene or stop at the end.
        const idx = cur.scenes.findIndex((s) => s.id === cur.activeSceneId)
        if (idx < cur.scenes.length - 1) {
          cur.setActiveScene(cur.scenes[idx + 1].id)
          cur.setPlayhead(0)
        } else {
          cur.setPlaying(false)
          cur.setPlayhead(0)
          return
        }
      } else {
        cur.setPlayhead(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, store])

  async function onPickVideo(asset: Asset): Promise<void> {
    setPicker(null)
    const { durMs, w, h } = await probeVideoMeta(mediaUrl(asset.filePath))
    // Default geometry = full scene frame, cover fit.
    const clip = {
      src: asset.filePath,
      inMs: 0,
      outMs: durMs || 4000,
      sourceDurMs: durMs || 4000,
      volume: 1,
      muted: false,
      fit: 'cover' as const,
      look: 'none' as const,
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      crop: null,
      naturalWidth: w || undefined,
      naturalHeight: h || undefined
    }
    // If the active scene has no clip, set it there; otherwise create a new scene.
    const s = store.getState()
    const active = s.scenes.find((sc) => sc.id === s.activeSceneId)
    if (active && !active.clip && active.layers.length === 0) {
      setSceneClip(active.id, clip)
    } else {
      addScene({ clip, durationMs: Math.max(200, clip.outMs - clip.inMs) })
    }
  }

  async function onPickAudio(asset: Asset): Promise<void> {
    setPicker(null)
    setAudio({ src: asset.filePath, inMs: 0, volume: 0.8 })
  }

  async function handleExport(): Promise<void> {
    const vp = store.getState().toProject()
    if (vp.scenes.length === 0) return
    setExporting(true)
    try {
      const paths = await window.api.app.getPaths()
      const root = paths.dataRoot.replace(/\\/g, '/')
      const safeName = vp.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'reel'
      const relPath = `exports/${safeName}_${Date.now()}.mp4`
      const outputPath = `${root}/${relPath}`

      // Render each scene's overlays. Animated scenes produce a frame sequence;
      // static scenes produce a single PNG.
      const OVERLAY_FPS = 15
      const overlays: (Uint8Array | null)[] = []
      const frames: (Uint8Array[] | null)[] = []
      for (const s of vp.scenes) {
        if (sceneHasAnimation(s)) {
          overlays.push(null)
          frames.push(await renderSceneOverlayFrames(s, vp.width, vp.height, OVERLAY_FPS))
        } else {
          overlays.push(await renderSceneOverlayPng(s, vp.width, vp.height))
          frames.push(null)
        }
      }

      const scenes = vp.scenes.map((s) => ({
        durationMs: s.durationMs,
        background: s.background === 'transparent' ? '#000000' : s.background,
        clip: s.clip
          ? {
              src: `${root}/${s.clip.src.replace(/\\/g, '/')}`,
              inMs: s.clip.inMs,
              outMs: s.clip.outMs,
              volume: s.clip.volume,
              muted: s.clip.muted,
              fit: s.clip.fit,
              look: s.clip.look ?? 'none',
              x: s.clip.x,
              y: s.clip.y,
              width: s.clip.width,
              height: s.clip.height,
              crop: s.clip.crop ?? null,
              naturalWidth: s.clip.naturalWidth ?? null,
              naturalHeight: s.clip.naturalHeight ?? null
            }
          : null,
        transitionIn: s.transitionIn
      }))

      const audio = vp.audio
        ? {
            path: `${root}/${vp.audio.src.replace(/\\/g, '/')}`,
            volume: vp.audio.volume,
            inMs: vp.audio.inMs
          }
        : null

      const result = await exportVideo({
        outputPath,
        width: vp.width,
        height: vp.height,
        scenes,
        overlays,
        frames,
        overlayFps: OVERLAY_FPS,
        audio
      })
      if (!result) {
        toast('Processing backend offline — restart the app.', 'error')
        return
      }
      toast('Video exported!', 'success')
      await window.api.app.showInFolder(relPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast(`Export failed: ${msg}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  if (!activeScene) {
    return <div className="h-full grid place-items-center text-ink-faint">Loading…</div>
  }

  return (
    <EditorStoreProvider store={store as unknown as SharedEditorStore} isVideo>
      <div className="h-full flex flex-col bg-surface-0">
        {/* Background-music player (hidden), driven by the global playhead. */}
        {audio && <audio ref={musicRef} src={mediaUrl(audio.src)} preload="auto" />}
        {/* Top bar */}
        <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-line bg-surface-1">
          <button onClick={() => navigate('/app/videos')} className="btn-ghost px-2 py-1.5">
            <ArrowLeft size={16} />
          </button>
          <input
            className="bg-transparent text-sm font-medium px-2 py-1 rounded hover:bg-surface-2 focus:bg-surface-2 focus:outline-none w-56"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() => {
              setPlayhead(0)
              setPlaying(!playing)
            }}
            className="btn-ghost px-2 py-1.5 ml-2"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-faint flex items-center gap-1">
              {saving ? (
                'Saving…'
              ) : (
                <>
                  <Check size={13} className="text-green-400" /> Saved
                </>
              )}
            </span>
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 min-h-0 flex">
          <ElementsPanel />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className={`flex-1 min-h-0 ${transClass}`}>
              <EditorCanvas
                layerTransform={
                  playing ? (l) => animateLayer(l, playheadMs, activeScene.durationMs) : undefined
                }
                underlay={
                  activeScene.clip ? (
                    <SceneClipNode
                      key={activeScene.id}
                      clip={activeScene.clip}
                      playheadMs={playheadMs}
                      playing={playing}
                    />
                  ) : null
                }
              />
            </div>
            <Timeline
              onPickVideo={() => setPicker('video')}
              onPickAudio={() => setPicker('audio')}
            />
          </div>
          <div className="w-80 shrink-0 border-l border-line bg-surface-1 flex flex-col min-h-0">
            <div className="h-[42%] min-h-0 flex flex-col border-b border-line">
              <LayersPanel />
            </div>
            <Inspector />
          </div>
        </div>

        {picker === 'video' && (
          <AssetPickerDialog
            folder="Videos"
            title="Add a video clip"
            onPick={(a) => void onPickVideo(a)}
            onClose={() => setPicker(null)}
          />
        )}
        {picker === 'audio' && (
          <AssetPickerDialog
            folder="Audio"
            title="Add background music"
            onPick={(a) => void onPickAudio(a)}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </EditorStoreProvider>
  )
}
