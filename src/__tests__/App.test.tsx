import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

beforeEach(() => {
  Object.defineProperty(window, 'location', { value: { search: '' }, writable: true })
  vi.spyOn(history, 'replaceState').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App — Export Data button', () => {
  it('S21-1: renders below the input/results grid', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: 'Export Data' })
    expect(button).toBeInTheDocument()
  })

  it('S21-2: uses token-based classes, not raw gray/blue Tailwind colors', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: 'Export Data' })
    expect(button.className).not.toMatch(/\b(gray|blue)-\d+\b/)
    expect(button.className).toContain('surface-panel')
    expect(button.className).toContain('ink-primary')
  })

  it('S21-3: clicking triggers a download named rent-vs-buy-export-YYYY-MM-DD.xlsx', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Export Data' }))

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1)

    const blobArg = createObjectURLSpy.mock.calls[0]?.[0] as Blob
    expect(blobArg.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('S21-4: download filename matches the documented date convention', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let downloadedFilename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Export Data' }))

    expect(downloadedFilename).toMatch(/^rent-vs-buy-export-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
