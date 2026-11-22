import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { failed: boolean }

const buttonClass =
  'rounded-lg border border-surface-rule bg-surface-base px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-panel focus:outline-none focus:ring-1 focus:ring-accent'

// Without a boundary, one uncaught error anywhere in the tree unmounts the whole page and leaves
// it blank until the user refreshes. This keeps a way back on screen.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in the calculator', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div
          role="alert"
          className="space-y-4 rounded-lg border border-surface-rule bg-surface-panel p-6 text-ink-secondary"
        >
          <h1 className="text-lg font-semibold text-ink-primary">Something went wrong</h1>
          <p className="text-sm">
            Reloading restores your last inputs, which are saved in the page address. If it fails
            again, start over with the default values.
          </p>
          <div className="flex gap-3">
            <button type="button" className={buttonClass} onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => window.location.assign(window.location.pathname)}
            >
              Start over
            </button>
          </div>
        </div>
      </main>
    )
  }
}
