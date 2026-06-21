// Module-level handle to the canvas fit() function so hotkeys can call it
// without prop-drilling through the component tree.
let fitFn: (() => void) | null = null

export function setFitFn(fn: (() => void) | null): void {
  fitFn = fn
}

export function callFit(): void {
  fitFn?.()
}
