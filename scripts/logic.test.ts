import { useEditorStore } from '../src/renderer/src/stores/editorStore'
import { createTextLayer, createShapeLayer } from '../src/renderer/src/editor/factory'
import { extractVariables, applyVariables, cloneLayers } from '../src/renderer/src/lib/variables'
import { presetByType, SIZE_PRESETS } from '../src/renderer/src/lib/presets'

let failures = 0
function check(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL:', label)
    failures++
  } else {
    console.log('ok:', label)
  }
}

const canvas = { width: 1080, height: 1080, background: '#ffffff' }
const store = useEditorStore.getState()

// --- layer ops ---
store.addLayer(createTextLayer(canvas))
store.addLayer(createShapeLayer('rect', canvas))
check(useEditorStore.getState().layers.length === 2, 'addLayer adds two layers')

const firstId = useEditorStore.getState().layers[0].id
store.updateLayer(firstId, { x: 123 })
check(useEditorStore.getState().layers[0].x === 123, 'updateLayer sets x')

// --- undo / redo via zundo ---
useEditorStore.temporal.getState().undo()
check(useEditorStore.getState().layers[0].x !== 123, 'undo reverts x')
useEditorStore.temporal.getState().redo()
check(useEditorStore.getState().layers[0].x === 123, 'redo reapplies x')

// --- z-order ---
const bottomId = useEditorStore.getState().layers[0].id
store.moveLayer(bottomId, 'top')
check(
  useEditorStore.getState().layers[useEditorStore.getState().layers.length - 1].id === bottomId,
  'moveLayer to top'
)

// --- remove ---
store.removeLayer(bottomId)
check(useEditorStore.getState().layers.length === 1, 'removeLayer')

// --- template variables ---
const tl = createTextLayer(canvas)
tl.text = 'Hello {{TITLE}} on {{DATE}} at {{LOCATION}}'
const vars = extractVariables([tl])
check(vars.length === 3 && vars.includes('TITLE') && vars.includes('DATE'), 'extractVariables')

const applied = applyVariables([tl], { TITLE: 'Party', DATE: 'Fri', LOCATION: 'Club' })
check(applied[0].text === 'Hello Party on Fri at Club', 'applyVariables substitutes')

const cloned = cloneLayers([tl])
check(cloned[0].id !== tl.id && cloned[0].text === tl.text, 'cloneLayers reassigns ids')

// --- presets ---
check(presetByType('instagram_post')?.width === 1080, 'preset lookup')
check(SIZE_PRESETS.length >= 13, 'preset catalog present')

console.log(failures === 0 ? '\nALL LOGIC TESTS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
