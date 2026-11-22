import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function Boom(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  const reload = vi.fn()
  const assign = vi.fn()

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/rent-vs-buy/', reload, assign },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    reload.mockClear()
    assign.mockClear()
  })

  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>calculator</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('calculator')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a recoverable message instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Something went wrong')
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /start over/i })).toBeTruthy()
  })

  it('Reload reloads the page, which restores the last inputs from the address', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('Start over goes to the page address without the saved inputs, in case they caused the failure', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: /start over/i }))
    expect(assign).toHaveBeenCalledWith('/rent-vs-buy/')
  })
})
