import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScenario } from '../useScenario'
import { computeScenario } from '../../engine'
import { deriveNominalRate } from '../../lib/inflation'
import { decode } from '../../lib/url-state'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useScenario — real/nominal investment return', () => {
  it('S18-6: updateShared({ real_dollars: true }) produces a result reflecting the Fisher-derived nominal rate, not the raw entered rate', () => {
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateShared({ real_dollars: true, inflation_rate: 0.03 })
    })
    const { input, result: scenarioResult } = result.current

    const nominalRate = deriveNominalRate(
      input.shared.investment_return_rate,
      input.shared.inflation_rate,
    )
    const expected = computeScenario({
      ...input,
      shared: { ...input.shared, investment_return_rate: nominalRate },
    })
    expect(scenarioResult.totals.renter_final_net_worth).toBeCloseTo(
      expected.totals.renter_final_net_worth,
      6,
    )

    // Distinguishable from naively using the raw entered rate directly
    const naive = computeScenario(input)
    expect(scenarioResult.totals.renter_final_net_worth).not.toBeCloseTo(
      naive.totals.renter_final_net_worth,
      0,
    )
  })
})

describe('useScenario — updateTax', () => {
  it('updateTax({ taxes_enabled: true }) updates state.input.tax.taxes_enabled', () => {
    const { result } = renderHook(() => useScenario())
    expect(result.current.input.tax.taxes_enabled).toBe(false)
    act(() => {
      result.current.updateTax({ taxes_enabled: true })
    })
    expect(result.current.input.tax.taxes_enabled).toBe(true)
  })

  it('taxes_enabled + state + income → state_income_tax_annual is non-zero', () => {
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateTax({
        taxes_enabled: true,
        state: 'Maryland',
        gross_annual_income: 100000,
      })
    })
    expect(result.current.input.tax.state_income_tax_annual).toBeGreaterThan(0)
  })

  it('taxes_enabled: false → state_income_tax_annual stays 0 regardless of state and income', () => {
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateTax({
        taxes_enabled: false,
        state: 'Maryland',
        gross_annual_income: 100000,
      })
    })
    expect(result.current.input.tax.state_income_tax_annual).toBe(0)
  })

  it('state is empty string → state_income_tax_annual stays 0', () => {
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateTax({
        taxes_enabled: true,
        state: '',
        gross_annual_income: 100000,
      })
    })
    expect(result.current.input.tax.state_income_tax_annual).toBe(0)
  })

  it('filing_status MFS is stored as MFS in input.tax even though estimation maps to single', () => {
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateTax({ filing_status: 'married_filing_separately' })
    })
    expect(result.current.input.tax.filing_status).toBe('married_filing_separately')
  })
})

describe('useScenario — URL sync under rapid input (mobile slider drags)', () => {
  // Mobile Safari throws a SecurityError once a page calls history.replaceState more than 100
  // times in 30 seconds. A slider drag changes the input on every step, and an error thrown from
  // an effect with no error boundary unmounts the whole app.
  function installSafariRateLimit() {
    let calls = 0
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      calls++
      if (calls > 100) {
        throw new DOMException(
          'Attempt to use history.replaceState() more than 100 times per 30 seconds',
          'SecurityError',
        )
      }
    })
    return spy
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('survives 150 rapid slider changes under a 100-calls-per-30s replaceState limit', () => {
    installSafariRateLimit()
    const { result } = renderHook(() => useScenario())
    expect(() => {
      for (let i = 0; i < 150; i++) {
        act(() => {
          result.current.updateShared({ horizon_years: 1 + (i % 40) })
        })
      }
    }).not.toThrow()
    expect(result.current.input.shared.horizon_years).toBe(1 + (149 % 40))
  })

  it('writes the URL once, with the final value, after the changes stop', () => {
    const spy = installSafariRateLimit()
    const { result } = renderHook(() => useScenario())
    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.updateShared({ horizon_years: 1 + (i % 40) })
      })
    }
    expect(spy).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const url = String(spy.mock.calls[0]?.[2])
    const decoded = decode(new URLSearchParams(url.slice(1)).get('s') ?? '')
    expect(decoded?.shared.horizon_years).toBe(1 + (29 % 40))
  })

  it('keeps working when replaceState always throws', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { result } = renderHook(() => useScenario())
    expect(() => {
      act(() => {
        result.current.updateShared({ horizon_years: 12 })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
    }).not.toThrow()
    expect(result.current.input.shared.horizon_years).toBe(12)
  })

  it('does not rewrite a URL that already matches the current state', () => {
    const spy = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useScenario())
    act(() => {
      result.current.updateShared({ horizon_years: 17 })
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(spy).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.updateShared({ horizon_years: 17 })
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
