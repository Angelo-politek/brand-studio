import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useEditorStore,
  coalesceHistory,
  checkpointHistory,
  layerAabb
} from '@renderer/stores/editorStore'
import { createTextLayer, createShapeLayer } from '@renderer/editor/factory'
import { extractVariables, applyVariables, cloneLayers } from '@renderer/lib/variables'
import { presetByType, SIZE_PRESETS } from '@renderer/lib/presets'

const canvas = { width: 1080, height: 1080, background: '#ffffff' }

function resetStore(): void {
  useEditorStore.setState({
    pages: [{ id: 'p1', name: 'Page 1', canvas, layers: [] }],
    activePageId: 'p1',
    canvas,
    layers: [],
    selectedIds: []
  })
  useEditorStore.temporal.getState().clear()
}

// History writes are coalesced on a 300ms wall-clock window that persists
// across tests (module-level store): drive a fake clock and jump it well past
// the window in every beforeEach so each test starts with a fresh window.
let clock = 1_000_000_000

function tick(ms = 400): void {
  clock += ms
  vi.setSystemTime(clock)
}

describe('editor store — layer operations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    tick(10_000)
    resetStore()
  })
  afterEach(() => vi.useRealTimers())

  it('adds layers', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    s.addLayer(createShapeLayer('rect', canvas))
    expect(useEditorStore.getState().layers).toHaveLength(2)
  })

  it('updates a layer property', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    const id = useEditorStore.getState().layers[0].id
    s.updateLayer(id, { x: 123 })
    expect(useEditorStore.getState().layers[0].x).toBe(123)
  })

  it('supports undo/redo via zundo (distinct edits >300ms apart)', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    tick()
    const id = useEditorStore.getState().layers[0].id
    s.updateLayer(id, { x: 123 })
    useEditorStore.temporal.getState().undo()
    expect(useEditorStore.getState().layers[0].x).not.toBe(123)
    useEditorStore.temporal.getState().redo()
    expect(useEditorStore.getState().layers[0].x).toBe(123)
  })

  it('coalesces a burst of edits into one history entry', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    tick()
    const id = useEditorStore.getState().layers[0].id
    const x0 = useEditorStore.getState().layers[0].x
    // Simulate a slider drag: many rapid updates within the window.
    for (let i = 1; i <= 20; i++) s.updateLayer(id, { x: x0 + i })
    expect(useEditorStore.getState().layers[0].x).toBe(x0 + 20)
    useEditorStore.temporal.getState().undo()
    // One undo returns to BEFORE the burst, not to an intermediate step.
    expect(useEditorStore.getState().layers[0].x).toBe(x0)
  })

  it('batches multi-layer patches into a single set/undo step', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    s.addLayer(createShapeLayer('rect', canvas))
    tick()
    const [a, b] = useEditorStore.getState().layers
    useEditorStore.getState().updateLayers([
      { id: a.id, patch: { x: 11 } },
      { id: b.id, patch: { x: 22 } }
    ])
    expect(useEditorStore.getState().layers[0].x).toBe(11)
    expect(useEditorStore.getState().layers[1].x).toBe(22)
    useEditorStore.temporal.getState().undo()
    expect(useEditorStore.getState().layers[0].x).toBe(a.x)
    expect(useEditorStore.getState().layers[1].x).toBe(b.x)
  })

  it('layerAabb accounts for rotation (90° swaps width/height)', () => {
    const l = createShapeLayer('rect', canvas)
    l.x = 100
    l.y = 100
    l.width = 200
    l.height = 50
    l.rotation = 90
    const bb = layerAabb(l)
    expect(bb.w).toBeCloseTo(50, 5)
    expect(bb.h).toBeCloseTo(200, 5)
    // Rotated around the origin: the box extends left of x by the height.
    expect(bb.x).toBeCloseTo(50, 5)
    expect(bb.y).toBeCloseTo(100, 5)
  })

  it('aligns rotated layers by their visual bounding box', () => {
    const s = useEditorStore.getState()
    const a = createShapeLayer('rect', canvas)
    a.x = 300
    a.y = 100
    a.width = 200
    a.height = 50
    a.rotation = 90
    s.addLayer(a)
    tick()
    useEditorStore.getState().setSelection([a.id])
    useEditorStore.getState().alignSelected('left', 'canvas')
    const out = useEditorStore.getState().layers.find((l) => l.id === a.id)!
    // The VISUAL left edge (x - height when rotated 90°) sits at 0.
    expect(layerAabb(out).x).toBeCloseTo(0, 5)
  })

  it('coalesceHistory records the first write of a burst only', () => {
    const recorded: number[] = []
    const wrapped = coalesceHistory<number>(300)((v) => recorded.push(v))
    tick()
    wrapped(1)
    wrapped(2)
    wrapped(3)
    tick(500)
    wrapped(4)
    expect(recorded).toEqual([1, 4])
  })

  it('checkpointHistory forces the next write past the coalescing window', () => {
    const recorded: number[] = []
    const wrapped = coalesceHistory<number>(300)((v) => recorded.push(v))
    tick()
    wrapped(1) // recorded (window open)
    wrapped(2) // coalesced away
    checkpointHistory()
    wrapped(3) // forced through despite being within the window
    expect(recorded).toEqual([1, 3])
  })

  it('moves a layer to the top of the z-order', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    s.addLayer(createShapeLayer('rect', canvas))
    const bottomId = useEditorStore.getState().layers[0].id
    s.moveLayer(bottomId, 'top')
    const layers = useEditorStore.getState().layers
    expect(layers[layers.length - 1].id).toBe(bottomId)
  })

  it('removes a layer', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    const id = useEditorStore.getState().layers[0].id
    s.removeLayer(id)
    expect(useEditorStore.getState().layers).toHaveLength(0)
  })
})

describe('template variables', () => {
  it('extracts {{VAR}} tokens', () => {
    const tl = createTextLayer(canvas)
    tl.text = 'Hello {{TITLE}} on {{DATE}} at {{LOCATION}}'
    const vars = extractVariables([tl])
    expect(vars).toEqual(expect.arrayContaining(['TITLE', 'DATE', 'LOCATION']))
    expect(vars).toHaveLength(3)
  })

  it('substitutes variables', () => {
    const tl = createTextLayer(canvas)
    tl.text = 'Hello {{TITLE}} on {{DATE}} at {{LOCATION}}'
    const applied = applyVariables([tl], { TITLE: 'Party', DATE: 'Fri', LOCATION: 'Club' })
    expect(applied[0].text).toBe('Hello Party on Fri at Club')
  })

  it('reassigns ids when cloning', () => {
    const tl = createTextLayer(canvas)
    const cloned = cloneLayers([tl])
    expect(cloned[0].id).not.toBe(tl.id)
    expect(cloned[0].text).toBe(tl.text)
  })
})

describe('presets', () => {
  it('looks up a preset by type', () => {
    expect(presetByType('instagram_post')?.width).toBe(1080)
  })

  it('has a populated catalog', () => {
    expect(SIZE_PRESETS.length).toBeGreaterThanOrEqual(13)
  })
})
