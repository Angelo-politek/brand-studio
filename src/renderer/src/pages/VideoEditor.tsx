import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Download, Check, Loader2, LayoutTemplate } from 'lucide-react'
import { useVideoEditorStore } from '@renderer/stores/videoEditorStore'
import { useBrandStore } from '@renderer/stores/brandStore'
import { ensureBrandFonts } from '@renderer/lib/fonts'
import { EditorStoreProvider, type SharedEditorStore } from '@renderer/editor/editorStoreContext'
import { useEditorHotkeys } from '@renderer/editor/useEditorHotkeys'
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
import { animateLayer, sceneTransitionState, TRANSITION_IDENTITY } from '@renderer/lib/videoAnim'
import {
  startVideoExport,
  getVideoJob,
  cancelVideoJob,
  type ExportScene
} from '@renderer/lib/python'
import { mediaUrl } from '@shared/ipc'
import { saveUserReelTemplate } from '@renderer/lib/userReelTemplates'
import { toast, promptDialog } from '@renderer/stores/uiStore'
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
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStage, setExportStage] = useState('')
  const [picker, setPicker] = useState<'video' | 'audio' | null>(null)
  const lastSaved = useRef('')
  const exportJobId = useRef<string | null>(null)
  const exportCancelled = useRef(false)

  const store = useVideoEditorStore
  useEditorHotkeys(useVideoEditorStore)
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
    setSceneClip,
    setAudio,
    addScene
  } = useVideoEditorStore()

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0]
  const musicRef = useRef<HTMLAudioElement>(null)

  // Live transition preview is applied to the artboard CONTENT (the Konva
  // layers + a confined overlay), not the whole work area — see
  // `sceneTransitionTransform` / `transitionStyle` below. This keeps the effect
  // inside the page bounds, matching the exported video.

  const audioSrc = audio?.src
  const audioVolume = audio?.volume

  // Start/stop background music on play-state changes only. We seek once on
  // play (and on pause) — NOT every animation frame, which previously caused
  // constant currentTime resets and a glitchy/stuttering preview. Fresh playhead
  // values are read from the store so this effect need not re-run per frame.
  useEffect(() => {
    const a = musicRef.current
    const st = useVideoEditorStore.getState()
    if (!a || !st.audio) return
    const offset =
      st.scenes
        .slice(
          0,
          Math.max(
            0,
            st.scenes.findIndex((s) => s.id === st.activeSceneId)
          )
        )
        .reduce((sum, s) => sum + s.durationMs, 0) + st.playheadMs
    const target = (st.audio.inMs + offset) / 1000
    if (playing) {
      if (Math.abs(a.currentTime - target) > 0.3) a.currentTime = target
      void a.play().catch(() => {})
    } else {
      a.pause()
      a.currentTime = target
    }
  }, [playing, audioSrc])

  // Keep volume in sync without touching playback position.
  useEffect(() => {
    const a = musicRef.current
    if (a && audioVolume != null) a.volume = audioVolume
  }, [audioVolume])

  // Follow scrubbing while paused, so pressing Play resumes the music from the
  // scrubbed position instead of wherever it last stopped. No-op during
  // playback (the RAF clock advances playheadMs every frame — reseeking there
  // would stutter; the play/pause effect above handles that case).
  useEffect(() => {
    if (playing) return
    const a = musicRef.current
    if (!a || !audio) return
    const idx = Math.max(
      0,
      scenes.findIndex((s) => s.id === activeSceneId)
    )
    const offset = scenes.slice(0, idx).reduce((sum, s) => sum + s.durationMs, 0) + playheadMs
    a.currentTime = (audio.inMs + offset) / 1000
  }, [playing, playheadMs, activeSceneId, scenes, audio])

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
      if (!vp.id) {
        setSaving(false)
        return
      }
      try {
        await window.api.video.update(vp as VideoProject)
        lastSaved.current = JSON.stringify({ name: vp.name, scenes: vp.scenes, audio: vp.audio })
      } catch (err) {
        console.error('[autosave] failed:', err)
      } finally {
        setSaving(false)
      }
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
    if (!durMs) {
      // A failed probe means the file is unreadable or the codec is unsupported;
      // adding it with a made-up duration would break trim and export silently.
      toast('Impossibile leggere il video: file danneggiato o formato non supportato', 'error')
      return
    }
    // Default geometry = full scene frame, cover fit.
    const clip = {
      src: asset.filePath,
      inMs: 0,
      outMs: durMs,
      sourceDurMs: durMs,
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
    setExportProgress(0)
    setExportStage('Rendering overlays…')
    exportCancelled.current = false
    exportJobId.current = null
    const CANCELLED = new Error('__cancelled__')
    try {
      const paths = await window.api.app.getPaths()
      const root = paths.dataRoot.replace(/\\/g, '/')
      const safeName = vp.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'reel'
      const relPath = `exports/${safeName}_${Date.now()}.mp4`
      const outputPath = `${root}/${relPath}`

      // Per-export work dir under the data root; overlays/frames are written
      // here by the renderer and the backend deletes it when the job ends.
      const exportId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const workSub = `cache/video-export/${exportId}`
      const workDir = `${root}/${workSub}`

      // Overlay frames at output fps, so animations are as smooth as the video.
      const OVERLAY_FPS = 30

      // Rasterize overlays scene by scene, streaming animated frames straight
      // to disk (memory stays flat) — this phase is 0..30% of the bar.
      const totalDur = vp.scenes.reduce((a, s) => a + s.durationMs, 0) || 1
      let doneDur = 0
      const scenes: ExportScene[] = []
      for (const [i, s] of vp.scenes.entries()) {
        if (exportCancelled.current) throw CANCELLED
        let overlayPath: string | null = null
        let framesDir: string | null = null
        if (sceneHasAnimation(s)) {
          const sub = `${workSub}/scene_${i}`
          await renderSceneOverlayFrames(s, vp.width, vp.height, OVERLAY_FPS, async (bytes, j) => {
            if (exportCancelled.current) throw CANCELLED
            await window.api.app.saveBinaryNamed({
              subdir: sub,
              filename: `f_${String(j).padStart(5, '0')}.png`,
              bytes
            })
          })
          framesDir = `${workDir}/scene_${i}`
        } else {
          const png = await renderSceneOverlayPng(s, vp.width, vp.height)
          if (png) {
            await window.api.app.saveBinaryNamed({
              subdir: workSub,
              filename: `ov_${i}.png`,
              bytes: png
            })
            overlayPath = `${workDir}/ov_${i}.png`
          }
        }
        doneDur += s.durationMs
        setExportProgress(Math.round((doneDur / totalDur) * 30))
        scenes.push({
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
          transitionIn: s.transitionIn,
          overlayPath,
          framesDir
        })
      }

      const audio = vp.audio
        ? {
            path: `${root}/${vp.audio.src.replace(/\\/g, '/')}`,
            volume: vp.audio.volume,
            inMs: vp.audio.inMs,
            fadeOutMs: vp.audio.fadeOutMs ?? 0
          }
        : null

      const jobId = await startVideoExport({
        outputPath,
        width: vp.width,
        height: vp.height,
        scenes,
        overlayFps: OVERLAY_FPS,
        audio,
        workDir
      })
      if (!jobId) {
        toast('Processing backend offline — restart the app.', 'error')
        return
      }
      exportJobId.current = jobId

      // Poll the job: backend work is 30..100% of the bar.
      for (;;) {
        await new Promise((r) => setTimeout(r, 500))
        const st = await getVideoJob(jobId)
        setExportProgress(30 + Math.round(st.progress * 70))
        setExportStage(st.stage === 'audio' ? 'Mixing audio…' : `Encoding ${st.stage}…`)
        if (st.state === 'done') {
          toast('Video exported!', 'success')
          await window.api.app.showInFolder(relPath)
          break
        }
        if (st.state === 'cancelled') {
          toast('Export cancelled')
          break
        }
        if (st.state === 'error') {
          throw new Error(st.error ?? 'export failed')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === '__cancelled__') {
        toast('Export cancelled')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[video export] failed:', err)
        toast(`Export failed: ${msg}`, 'error')
      }
    } finally {
      setExporting(false)
      setExportProgress(0)
      setExportStage('')
      exportJobId.current = null
    }
  }

  function handleCancelExport(): void {
    exportCancelled.current = true
    const id = exportJobId.current
    if (id) void cancelVideoJob(id)
  }

  async function handleSaveAsTemplate(): Promise<void> {
    const vp = store.getState().toProject()
    if (vp.scenes.length === 0) return
    const tplName = await promptDialog('Nome del template', vp.name)
    if (!tplName) return
    try {
      await saveUserReelTemplate({
        name: tplName,
        width: vp.width,
        height: vp.height,
        scenes: vp.scenes,
        audio: vp.audio ?? null
      })
      toast('Template salvato!', 'success')
    } catch (err) {
      toast(`Salvataggio template fallito: ${(err as Error).message}`, 'error')
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
            onClick={() => setPlaying(!playing)}
            className="btn-ghost px-2 py-1.5 ml-2"
            title={playing ? 'Pause (resumes from the playhead)' : 'Play'}
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
              onClick={() => void handleSaveAsTemplate()}
              className="btn-ghost px-2 py-1.5"
              title="Salva come template riutilizzabile"
            >
              <LayoutTemplate size={15} />
            </button>
            {exporting ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-ink-faint" />
                <div className="w-36 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint w-28 truncate" title={exportStage}>
                  {exportProgress}% · {exportStage}
                </span>
                <button
                  onClick={handleCancelExport}
                  className="btn-surface text-xs px-2 py-1"
                  title="Cancel export"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => void handleExport()} className="btn-primary text-sm">
                <Download size={15} /> Export
              </button>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 min-h-0 flex">
          <ElementsPanel />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <EditorCanvas
                layerTransform={
                  playing
                    ? (l) => {
                        const animated = animateLayer(l, playheadMs, activeScene.durationMs)
                        const t = sceneTransitionState(
                          activeScene.transitionIn,
                          playheadMs,
                          width,
                          height
                        )
                        if (t === TRANSITION_IDENTITY) return animated
                        return {
                          ...animated,
                          x: animated.x + t.dx,
                          y: animated.y + t.dy,
                          opacity: animated.opacity * t.opacity
                        }
                      }
                    : undefined
                }
                underlay={
                  activeScene.clip ? (
                    <SceneClipNode
                      key={activeScene.id}
                      clip={activeScene.clip}
                      playheadMs={playheadMs}
                      playing={playing}
                      transition={
                        playing
                          ? sceneTransitionState(
                              activeScene.transitionIn,
                              playheadMs,
                              width,
                              height
                            )
                          : TRANSITION_IDENTITY
                      }
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
