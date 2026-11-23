import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'
import { DEFAULT_INPUT } from '../lib/defaults'
import { REFERENCES } from '../lib/references'

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

describe('App — rapid slider changes on a browser that rate-limits history.replaceState', () => {
  // Mobile Safari throws a SecurityError after 100 replaceState calls in 30 seconds. Dragging a
  // slider used to trigger one call per step, and the thrown error unmounted the whole page.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the page on screen through 200 slider steps, and ends on the last value', () => {
    let calls = 0
    vi.spyOn(history, 'replaceState').mockImplementation(() => {
      calls++
      if (calls > 100) throw new DOMException('rate limited', 'SecurityError')
    })
    render(<App />)
    const slider = screen.getByLabelText('Analysis horizon in years')
    expect(() => {
      for (let i = 0; i < 200; i++) {
        fireEvent.change(slider, { target: { value: String(1 + (i % 30)) } })
      }
      vi.advanceTimersByTime(1000)
    }).not.toThrow()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect((slider as HTMLInputElement).value).toBe(String(1 + (199 % 30)))
    expect(calls).toBeLessThan(5)
  })
})

describe('App — horizon cap', () => {
  it('the horizon slider stops at 30 years', () => {
    render(<App />)
    const slider = screen.getByLabelText('Analysis horizon in years') as HTMLInputElement
    expect(slider.max).toBe('30')
  })

  it('the chart horizon slider stops at 30 years and is labelled to match', () => {
    render(<App />)
    const slider = screen.getByLabelText('Chart horizon in years') as HTMLInputElement
    expect(slider.max).toBe('30')
    expect(screen.getByText('30 yrs')).toBeInTheDocument()
    expect(screen.queryByText('40 yrs')).toBeNull()
  })

  it('a shared link with a 40-year horizon loads at 30 with the other inputs intact', () => {
    const old = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: 725000 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 40 },
    }
    Object.defineProperty(window, 'location', {
      value: { search: `?s=${btoa(encodeURIComponent(JSON.stringify(old)))}` },
      writable: true,
    })
    render(<App />)
    expect((screen.getByLabelText('Analysis horizon in years') as HTMLInputElement).value).toBe(
      '30',
    )
    expect(screen.getByDisplayValue('725000')).toBeInTheDocument()
  })
})

describe('App — References button', () => {
  it('renders beside Export Data in one row: stacked on phones, two columns from sm up', () => {
    render(<App />)
    const exportBtn = screen.getByRole('button', { name: 'Export Data' })
    const refsBtn = screen.getByRole('button', { name: 'References' })
    expect(exportBtn.parentElement).toBe(refsBtn.parentElement)
    const row = exportBtn.parentElement as HTMLElement
    expect(row.className).toContain('grid-cols-1')
    expect(row.className).toContain('sm:grid-cols-2')
  })

  it('both buttons carry identical sizing classes so they stay equal', () => {
    render(<App />)
    const exportBtn = screen.getByRole('button', { name: 'Export Data' })
    const refsBtn = screen.getByRole('button', { name: 'References' })
    expect(refsBtn.className).toBe(exportBtn.className)
    expect(refsBtn.className).toContain('w-full')
  })

  it('starts closed', () => {
    render(<App />)
    const refsBtn = screen.getByRole('button', { name: 'References' })
    expect(refsBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'References' })).toBeNull()
  })

  it('opens a panel directly under the row, and closes again on a second click', () => {
    render(<App />)
    const refsBtn = screen.getByRole('button', { name: 'References' })
    fireEvent.click(refsBtn)
    expect(refsBtn).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', { name: 'References' })
    expect(refsBtn).toHaveAttribute('aria-controls', panel.id)
    const row = refsBtn.parentElement as HTMLElement
    expect(row.nextElementSibling).toBe(panel)
    fireEvent.click(refsBtn)
    expect(refsBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'References' })).toBeNull()
  })

  it('Escape closes the panel and returns focus to the button', () => {
    render(<App />)
    const refsBtn = screen.getByRole('button', { name: 'References' })
    fireEvent.click(refsBtn)
    const firstLink = screen.getAllByRole('link', { name: /Revenue Procedure/ })[0] as HTMLElement
    firstLink.focus()
    fireEvent.keyDown(firstLink, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'References' })).toBeNull()
    expect(refsBtn).toHaveFocus()
  })

  it('shows every source as a link that opens safely in a new tab', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'References' }))
    const panel = screen.getByRole('region', { name: 'References' })
    const links = panel.querySelectorAll('a')
    expect(links.length).toBe(REFERENCES.length)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//)
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('groups the sources under their headings', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'References' }))
    for (const g of ['Federal tax', 'State income tax', 'Cross-checks']) {
      expect(screen.getByRole('heading', { name: g })).toBeInTheDocument()
    }
  })

  it('does not disturb Export Data', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'References' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export Data' }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
