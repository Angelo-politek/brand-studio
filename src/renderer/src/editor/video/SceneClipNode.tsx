import { useEffect, useRef } from 'react'
import Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { mediaUrl } from '@shared/ipc'
import { useVideoEditorStore } from '@renderer/stores/videoEditorStore'
import { TRANSITION_IDENTITY, type SceneTransitionState } from '@renderer/lib/videoAnim'
import type { VideoClip } from '@shared/types'

export const CLIP_ID = '__clip__'

const SIDE_ANCHORS = new Set(['middle-left', 'middle-right', 'top-center', 'bottom-center'])

/**
 * The scene's background video as a manipulable Konva node (selectable, drag,
 * resize/crop, rotate). Owns its own <video> element synced to the scene
 * playhead. Writes geometry/crop back to `scene.clip` via the store.
 */
export default function SceneClipNode({
  clip,
  playheadMs,
  playing,
  transition = TRANSITION_IDENTITY
}: {
  clip: VideoClip
  playheadMs: number
  playing: boolean
  /** Scene enter-transition displacement/fade (preview parity with xfade). */
  transition?: SceneTransitionState
}): JSX.Element | null {
  const select = useVideoEditorStore((s) => s.select)
  const updateClip = useVideoEditorStore((s) => s.updateClip)
  const activeSceneId = useVideoEditorStore((s) => s.activeSceneId)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imgRef = useRef<Konva.Image>(null)

  // Create the <video> element once.
  if (!videoRef.current) {
    const v = document.createElement('video')
    v.src = mediaUrl(clip.src)
    v.crossOrigin = 'anonymous'
    v.playsInline = true
    v.preload = 'auto'
    videoRef.current = v
  }

  // Repoint when the source changes.
  useEffect(() => {
    const v = videoRef.current
    if (v && v.src !== mediaUrl(clip.src)) v.src = mediaUrl(clip.src)
  }, [clip.src])

  // Drive a Konva.Animation to push video frames onto the canvas while playing.
  useEffect(() => {
    const node = imgRef.current
    const v = videoRef.current
    if (!node || !v) return
    const anim = new Konva.Animation(() => {}, node.getLayer())
    if (playing) {
      v.muted = clip.muted
      v.volume = clip.volume
      void v.play().catch(() => {})
      anim.start()
    } else {
      v.pause()
    }
    return () => {
      anim.stop()
    }
  }, [playing, clip.muted, clip.volume])

  // Sync currentTime to the scene playhead (when paused or on scrub).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const target = (clip.inMs + playheadMs) / 1000
    if (!playing) {
      if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target
      // Force a one-off redraw so the paused frame shows.
      imgRef.current?.getLayer()?.batchDraw()
    } else if (Math.abs(v.currentTime - target) > 0.3) {
      v.currentTime = target
    }
  }, [playheadMs, playing, clip.inMs])

  function onDragEnd(e: KonvaEventObject<DragEvent>): void {
    updateClip(activeSceneId, { x: e.target.x(), y: e.target.y() })
  }

  function onTransformEnd(e: KonvaEventObject<Event>): void {
    const n = e.target
    const stage = n.getStage()
    const tr = stage?.findOne('Transformer') as Konva.Transformer | undefined
    const anchor = tr?.getActiveAnchor() ?? null
    const sx = n.scaleX()
    const sy = n.scaleY()
    const newW = Math.max(1, clip.width * sx)
    const newH = Math.max(1, clip.height * sy)
    const isSide = anchor != null && SIDE_ANCHORS.has(anchor)

    const patch: Partial<VideoClip> = {
      x: n.x(),
      y: n.y(),
      rotation: n.rotation(),
      scaleX: 1,
      scaleY: 1,
      width: newW,
      height: newH
    }

    // Side anchors crop the source instead of stretching (mirrors images).
    if (isSide && clip.naturalWidth && clip.naturalHeight) {
      const natW = clip.naturalWidth
      const natH = clip.naturalHeight
      const cur = clip.crop ?? { x: 0, y: 0, width: natW, height: natH }
      const cropW =
        anchor === 'middle-left' || anchor === 'middle-right'
          ? Math.min(natW, Math.max(1, cur.width * sx))
          : cur.width
      const cropH =
        anchor === 'top-center' || anchor === 'bottom-center'
          ? Math.min(natH, Math.max(1, cur.height * sy))
          : cur.height
      const cropX = anchor === 'middle-left' ? Math.max(0, cur.x + (cur.width - cropW)) : cur.x
      const cropY = anchor === 'top-center' ? Math.max(0, cur.y + (cur.height - cropH)) : cur.y
      patch.crop = { x: cropX, y: cropY, width: cropW, height: cropH }
    }

    n.scaleX(1)
    n.scaleY(1)
    updateClip(activeSceneId, patch)
  }

  return (
    <Group
      id={CLIP_ID}
      name="layer"
      x={clip.x + transition.dx}
      y={clip.y + transition.dy}
      rotation={clip.rotation}
      opacity={clip.opacity * transition.opacity}
      draggable
      onMouseDown={() => select(CLIP_ID)}
      onTap={() => select(CLIP_ID)}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      <KonvaImage
        ref={imgRef}
        image={videoRef.current ?? undefined}
        width={clip.width}
        height={clip.height}
        crop={clip.crop ?? undefined}
      />
    </Group>
  )
}
