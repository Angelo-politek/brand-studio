import type Konva from 'konva'

// Module-level handle to the live editor Stage so the export flow can capture
// the artboard without prop-drilling the ref through the component tree.
let stage: Konva.Stage | null = null

export function setStage(s: Konva.Stage | null): void {
  stage = s
}

export function getStage(): Konva.Stage | null {
  return stage
}
