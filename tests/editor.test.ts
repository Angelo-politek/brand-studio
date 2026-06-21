import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '@renderer/stores/editorStore'
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

describe('editor store — layer operations', () => {
  beforeEach(resetStore)

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

  it('supports undo/redo via zundo', () => {
    const s = useEditorStore.getState()
    s.addLayer(createTextLayer(canvas))
    const id = useEditorStore.getState().layers[0].id
    s.updateLayer(id, { x: 123 })
    useEditorStore.temporal.getState().undo()
    expect(useEditorStore.getState().layers[0].x).not.toBe(123)
    useEditorStore.temporal.getState().redo()
    expect(useEditorStore.getState().layers[0].x).toBe(123)
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
