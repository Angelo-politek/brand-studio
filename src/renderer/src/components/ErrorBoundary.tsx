import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level error boundary. Prevents a render error from blanking the whole app
 * and offers a recovery path (reload) instead of a white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced to the main console (and main.log) via the captured console.
    console.error('renderer error boundary', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full w-full grid place-items-center bg-surface-0 text-center p-8">
        <div className="max-w-md space-y-4">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="text-sm text-ink-faint break-words">{this.state.error.message}</p>
          <button
            className="px-4 py-2 rounded bg-accent text-white text-sm"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
