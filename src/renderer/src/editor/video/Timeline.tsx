import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '@shared/ipc'
import { getWaveform, drawWaveform } from '@renderer/lib/waveform'
import {
  Plus,
  Copy,
  Trash2,
  Film,
  Music,
  ArrowRightLeft,
  Volume2,
  VolumeX,
  Scissors
} from 'lucide-react'
import { useVideoEditorStore } from '@renderer/stores/videoEditorStore'
import { cn } from '@renderer/lib/cn'
import type { SceneTransitionType } from '@shared/types'

// Horizontal scale: pixels per second of scene duration.
const PX_PER_SEC = 40
const MIN_SCENE_W = 64

const TRANSITIONS: { type: SceneTransitionType; label: string }[] = [
  { type: 'none', label: 'None' },
  { type: 'fade', label: 'Fade' },
  { type: 'slideLeft', label: 'Slide ←' },
  { type: 'slideUp', label: 'Slide ↑' }
]

function fmt(ms: number): string {
  const s = ms / 1000
  return `${s.toFixed(1)}s`
}

export default function Timeline({
  onPickVideo,
  onPickAudio
}: {
  onPickVideo: () => void
  onPickAudio: () => void
}): JSX.Element {
  const {
    scenes,
    activeSceneId,
    audio,
    playheadMs,
    setActiveScene,
    addScene,
    deleteScene,
    duplicateScene,
    renameScene,
    setSceneDuration,
    setSceneTransition,
    reorderScene,
    splitSceneAtPlayhead,
    updateClip,
    setAudio,
    seekGlobal,
    setPlaying
  } = useVideoEditorStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transitionFor, setTransitionFor] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startMs: number } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const sceneW = (ms: number): number => Math.max(MIN_SCENE_W, (ms / 1000) * PX_PER_SEC)

  // Global playhead X (px) accounting for the per-scene min-width clamping.
  const activeIdx = scenes.findIndex((s) => s.id === activeSceneId)
  let playheadX = 0
  for (let i = 0; i < activeIdx; i++) playheadX += sceneW(scenes[i].durationMs)
  if (activeIdx >= 0) {
    const sc = scenes[activeIdx]
    playheadX += (playheadMs / Math.max(1, sc.durationMs)) * sceneW(sc.durationMs)
  }

  /** Map an X position on the track to a global time (ms) and seek there. */
  function scrubToX(clientX: number): void {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let x = clientX - rect.left + el.scrollLeft - 12 /* px-3 padding */
    let acc = 0
    for (const s of scenes) {
      const w = sceneW(s.durationMs)
      if (x <= w || s === scenes[scenes.length - 1]) {
        const localFrac = Math.max(0, Math.min(1, x / w))
        seekGlobal(acc + localFrac * s.durationMs)
        return
      }
      x -= w
      acc += s.durationMs
    }
  }

  function onScrubStart(e: React.MouseEvent): void {
    setPlaying(false)
    scrubToX(e.clientX)
    function onMove(ev: MouseEvent): void {
      scrubToX(ev.clientX)
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onResizeStart(e: React.MouseEvent, id: string, durationMs: number): void {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { id, startX: e.clientX, startMs: durationMs }
    function onMove(ev: MouseEvent): void {
      const d = dragRef.current
      if (!d) return
      const deltaMs = ((ev.clientX - d.startX) / PX_PER_SEC) * 1000
      setSceneDuration(d.id, d.startMs + deltaMs)
    }
    function onUp(): void {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const totalMs = scenes.reduce((sum, s) => sum + s.durationMs, 0)

  return (
    <div className="h-44 shrink-0 border-t border-line bg-surface-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line/60">
        <span className="text-[11px] text-ink-faint">Timeline</span>
        <span className="text-[11px] text-ink-faint">·</span>
        <span className="text-[11px] text-ink-faint">{fmt(totalMs)} total</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => addScene()}
            className="btn-surface text-xs px-2 py-1"
            title="Add blank scene"
          >
            <Plus size={13} /> Scene
          </button>
          <button
            onClick={onPickVideo}
            className="btn-surface text-xs px-2 py-1"
            title="Add scene from a video clip"
          >
            <Film size={13} /> Video
          </button>
          <button
            onClick={onPickAudio}
            className="btn-surface text-xs px-2 py-1"
            title="Set background music"
          >
            <Music size={13} /> Music
          </button>
          <button
            onClick={() => splitSceneAtPlayhead()}
            className="btn-surface text-xs px-2 py-1"
            title="Split the active scene at the playhead"
          >
            <Scissors size={13} /> Split
          </button>
        </div>
      </div>

      {/* Scenes track */}
      <div ref={trackRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
        {/* Scrub ruler */}
        <div
          className="sticky top-0 z-20 h-4 bg-surface-2/60 cursor-pointer"
          onMouseDown={onScrubStart}
          title="Click or drag to scrub"
        />
        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-px bg-accent z-30 pointer-events-none"
          style={{ transform: `translateX(${12 + playheadX}px)` }}
        >
          <div className="w-2 h-2 -ml-1 rounded-full bg-accent" />
        </div>
        <div className="flex items-stretch gap-0 h-[calc(100%-1rem)] px-3 py-2 min-w-min">
          {scenes.map((scene, i) => {
            const isActive = scene.id === activeSceneId
            const w = Math.max(MIN_SCENE_W, (scene.durationMs / 1000) * PX_PER_SEC)
            const bg = scene.background === 'transparent' ? '#111' : scene.background
            return (
              <div key={scene.id} className="flex items-stretch h-full">
                {/* Transition handle between scenes (not before the first) */}
                {i > 0 && (
                  <div className="relative flex items-center">
                    <button
                      onClick={() => setTransitionFor(transitionFor === scene.id ? null : scene.id)}
                      className={cn(
                        'h-6 w-6 -mx-3 z-10 rounded-full grid place-items-center border',
                        scene.transitionIn && scene.transitionIn.type !== 'none'
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface-2 text-ink-faint border-line hover:text-ink'
                      )}
                      title="Transition"
                    >
                      <ArrowRightLeft size={11} />
                    </button>
                    {transitionFor === scene.id && (
                      // Opens upward: the timeline sits at the bottom of the
                      // screen, so a downward menu would be clipped.
                      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 bg-surface-1 border border-line rounded-lg shadow-xl py-1 min-w-[110px]">
                        {TRANSITIONS.map((t) => (
                          <button
                            key={t.type}
                            onClick={() => {
                              setSceneTransition(scene.id, t.type)
                              setTransitionFor(null)
                            }}
                            className="w-full text-left px-3 py-1 text-xs hover:bg-surface-3"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Scene block */}
                <div className="flex flex-col gap-1 h-full" style={{ width: w }}>
                  <div
                    onClick={() => setActiveScene(scene.id)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/scene-id', scene.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverId(scene.id)
                    }}
                    onDragLeave={() => setDragOverId((cur) => (cur === scene.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverId(null)
                      const draggedId = e.dataTransfer.getData('text/scene-id')
                      if (draggedId && draggedId !== scene.id) reorderScene(draggedId, i)
                    }}
                    onDragEnd={() => setDragOverId(null)}
                    className={cn(
                      'group relative flex-1 rounded border-2 cursor-pointer overflow-hidden transition-colors',
                      isActive ? 'border-accent' : 'border-line hover:border-accent/50',
                      dragOverId === scene.id && 'ring-2 ring-accent/70'
                    )}
                    style={{ background: bg }}
                    title={scene.name}
                  >
                    {scene.clip && (
                      <span className="absolute top-0.5 left-0.5 text-[9px] bg-black/60 text-white rounded px-1 flex items-center gap-0.5">
                        <Film size={8} /> clip
                      </span>
                    )}
                    {scene.layers.length > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/50 text-white rounded px-0.5">
                        {scene.layers.length}
                      </span>
                    )}
                    {/* Clip mute toggle */}
                    {scene.clip && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          updateClip(scene.id, { muted: !scene.clip!.muted })
                        }}
                        className="absolute top-0.5 right-0.5 text-white/80 hover:text-white bg-black/40 rounded p-0.5"
                        title={scene.clip.muted ? 'Unmute clip' : 'Mute clip'}
                      >
                        {scene.clip.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                      </button>
                    )}
                    {/* Hover actions */}
                    <div className="absolute top-0 right-0 hidden group-hover:flex gap-0.5 bg-black/50 rounded-bl p-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateScene(scene.id)
                        }}
                        className="text-white hover:text-accent"
                        title="Duplicate"
                      >
                        <Copy size={10} />
                      </button>
                      {scenes.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteScene(scene.id)
                          }}
                          className="text-white hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                    {/* Right-edge duration handle */}
                    <div
                      onMouseDown={(e) => onResizeStart(e, scene.id, scene.durationMs)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-accent/0 hover:bg-accent/60"
                      title="Drag to change duration"
                    />
                  </div>
                  {/* Name + duration */}
                  <div className="flex items-center justify-between gap-1 px-0.5">
                    {editingId === scene.id ? (
                      <input
                        autoFocus
                        className="text-[10px] flex-1 min-w-0 bg-surface-2 border border-accent rounded px-1 outline-none"
                        defaultValue={scene.name}
                        onBlur={(e) => {
                          renameScene(scene.id, e.target.value || `Scene ${i + 1}`)
                          setEditingId(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <button
                        onDoubleClick={() => setEditingId(scene.id)}
                        onClick={() => setActiveScene(scene.id)}
                        className={cn(
                          'text-[10px] truncate flex-1 text-left',
                          isActive ? 'text-ink font-medium' : 'text-ink-faint'
                        )}
                        title="Double-click to rename"
                      >
                        {scene.name}
                      </button>
                    )}
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={(scene.durationMs / 1000).toFixed(1)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSceneDuration(scene.id, Number(e.target.value) * 1000)}
                      className="text-[9px] text-ink-faint shrink-0 w-9 bg-surface-2 rounded px-1 text-right outline-none focus:ring-1 focus:ring-accent/40"
                      title="Scene duration (seconds)"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Audio lane */}
      <div className="h-9 shrink-0 border-t border-line/60 flex items-center gap-2 px-3">
        <Music size={13} className="text-ink-faint shrink-0" />
        {audio ? (
          <>
            <div className="flex-1 h-6 rounded bg-accent/10 border border-accent/40 relative overflow-hidden">
              <AudioWaveStrip src={audio.src} inMs={audio.inMs} />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted truncate max-w-[50%] bg-surface-1/70 px-1 rounded">
                {audio.src.split(/[/\\]/).pop()}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => setAudio({ ...audio, volume: Number(e.target.value) })}
              className="w-20 accent-orange-500"
              title="Music volume"
            />
            <button
              onClick={() => setAudio(null)}
              className="text-ink-faint hover:text-red-400"
              title="Remove music"
            >
              <Trash2 size={12} />
            </button>
          </>
        ) : (
          <button onClick={onPickAudio} className="text-[11px] text-ink-faint hover:text-accent">
            + Add background music
          </button>
        )}
      </div>
    </div>
  )
}

/** Waveform strip for the music lane (decoded once per src, cached). */
function AudioWaveStrip({ src, inMs }: { src: string; inMs: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    void getWaveform(mediaUrl(src)).then((wf) => {
      const c = canvasRef.current
      if (!alive || !wf || !c) return
      drawWaveform(c, wf, 'rgba(249, 115, 22, 0.75)', inMs)
    })
    return () => {
      alive = false
    }
  }, [src, inMs])
  return <canvas ref={canvasRef} width={960} height={24} className="absolute inset-0 w-full h-full" />
}
