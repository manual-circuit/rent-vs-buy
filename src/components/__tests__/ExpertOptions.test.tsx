import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExpertOptions } from '../ExpertOptions'
import { DEFAULT_INPUT } from '../../lib/defaults'

describe('ExpertOptions', () => {
  it('S15-1: renders three sections titled "Tax & Income", "Capital Gains", "Display Options" with no "(Expert)" suffix', () => {
    render(
      <ExpertOptions
        input={DEFAULT_INPUT}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    expect(screen.getByText('Tax & Income')).toBeTruthy()
    expect(screen.getByText('Capital Gains')).toBeTruthy()
    expect(screen.getByText('Display Options')).toBeTruthy()
    expect(screen.queryByText(/\(Expert\)/)).toBeNull()
  })

  it('S15-2: Capital Gains checkbox reflects include_capital_gains and calls updateTax on change', () => {
    const updateTax = vi.fn()
    render(
      <ExpertOptions
        input={{ ...DEFAULT_INPUT, tax: { ...DEFAULT_INPUT.tax, taxes_enabled: true } }}
        updateTax={updateTax}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    const checkbox = screen.getByLabelText('Include capital gains tax on sale') as HTMLInputElement
    expect(checkbox.checked).toBe(DEFAULT_INPUT.tax.include_capital_gains)
    fireEvent.click(checkbox)
    expect(updateTax).toHaveBeenCalledWith({
      include_capital_gains: !DEFAULT_INPUT.tax.include_capital_gains,
    })
  })

  it('S15-3: Capital Gains checkbox is disabled and dimmed when taxes_enabled is false', () => {
    render(
      <ExpertOptions
        input={{ ...DEFAULT_INPUT, tax: { ...DEFAULT_INPUT.tax, taxes_enabled: false } }}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    const checkbox = screen.getByLabelText('Include capital gains tax on sale') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
    expect(checkbox.closest('.opacity-50')).not.toBeNull()
  })

  it('S15-4: Display Options reveals inflation rate field only when real_dollars is true', () => {
    const updateShared = vi.fn()
    const { rerender } = render(
      <ExpertOptions
        input={{ ...DEFAULT_INPUT, shared: { ...DEFAULT_INPUT.shared, real_dollars: false } }}
        updateTax={vi.fn()}
        updateShared={updateShared}
        updateOwnership={vi.fn()}
      />,
    )
    expect(screen.queryByText('Inflation rate assumption')).toBeNull()

    rerender(
      <ExpertOptions
        input={{ ...DEFAULT_INPUT, shared: { ...DEFAULT_INPUT.shared, real_dollars: true } }}
        updateTax={vi.fn()}
        updateShared={updateShared}
        updateOwnership={vi.fn()}
      />,
    )
    expect(screen.getByText('Inflation rate assumption')).toBeTruthy()

    fireEvent.click(screen.getByLabelText("Show in today's dollars"))
    expect(updateShared).toHaveBeenCalledWith({ real_dollars: false })
  })

  it('S17-1: renders a "Refinancing" section', () => {
    render(
      <ExpertOptions
        input={DEFAULT_INPUT}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    expect(screen.getByText('Refinancing')).toBeTruthy()
    expect(screen.getByLabelText('Enable refinance')).toBeTruthy()
  })

  it('S17-2: refinance fields are dimmed/pointer-events-none when refinance_enabled is false', () => {
    render(
      <ExpertOptions
        input={{
          ...DEFAULT_INPUT,
          ownership: { ...DEFAULT_INPUT.ownership, refinance_enabled: false },
        }}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    const triggerMonthLabel = screen.getByText('Trigger Month')
    expect(triggerMonthLabel.closest('.opacity-50')).not.toBeNull()
  })

  it('S17-3: refinance fields are enabled (not dimmed) when refinance_enabled is true', () => {
    render(
      <ExpertOptions
        input={{
          ...DEFAULT_INPUT,
          ownership: { ...DEFAULT_INPUT.ownership, refinance_enabled: true },
        }}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={vi.fn()}
      />,
    )
    const triggerMonthLabel = screen.getByText('Trigger Month')
    expect(triggerMonthLabel.closest('.opacity-50')).toBeNull()
  })

  it('S17-4: toggling "Enable refinance" calls updateOwnership with refinance_enabled', () => {
    const updateOwnership = vi.fn()
    render(
      <ExpertOptions
        input={{
          ...DEFAULT_INPUT,
          ownership: { ...DEFAULT_INPUT.ownership, refinance_enabled: false },
        }}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={updateOwnership}
      />,
    )
    fireEvent.click(screen.getByLabelText('Enable refinance'))
    expect(updateOwnership).toHaveBeenCalledWith({ refinance_enabled: true })
  })

  it('S17-5: each refinance field calls updateOwnership with the correct patch on change', () => {
    const updateOwnership = vi.fn()
    render(
      <ExpertOptions
        input={{
          ...DEFAULT_INPUT,
          ownership: { ...DEFAULT_INPUT.ownership, refinance_enabled: true },
        }}
        updateTax={vi.fn()}
        updateShared={vi.fn()}
        updateOwnership={updateOwnership}
      />,
    )
    fireEvent.change(screen.getByLabelText('Trigger Month'), { target: { value: '84' } })
    expect(updateOwnership).toHaveBeenCalledWith({ refinance_trigger_month: 84 })

    fireEvent.change(screen.getByLabelText('New Interest Rate'), { target: { value: '5.25' } })
    expect(updateOwnership).toHaveBeenCalledWith({ refinance_new_interest_rate: 5.25 })

    fireEvent.change(screen.getByLabelText('New Loan Term'), { target: { value: '15' } })
    expect(updateOwnership).toHaveBeenCalledWith({ refinance_new_loan_term_years: 15 })

    fireEvent.change(screen.getByLabelText('New Closing Costs'), { target: { value: '3' } })
    expect(updateOwnership).toHaveBeenCalledWith({ refinance_closing_costs_pct: 3 })
  })

  describe('sale disposition toggle', () => {
    const renderWith = (input = DEFAULT_INPUT, updateOwnership = vi.fn()) =>
      render(
        <ExpertOptions
          input={input}
          updateTax={vi.fn()}
          updateShared={vi.fn()}
          updateOwnership={updateOwnership}
        />,
      )
    const keepInput = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, sale_disposition: 'keep' as const },
    }

    it('is labelled "Sell home at horizon" and checked by default', () => {
      renderWith()
      const box = screen.getByLabelText('Sell home at horizon') as HTMLInputElement
      expect(box.checked).toBe(true)
    })

    it('sits directly after the capital gains toggle', () => {
      renderWith()
      const cg = screen.getByLabelText('Include capital gains tax on sale')
      const sell = screen.getByLabelText('Sell home at horizon')
      expect(cg.compareDocumentPosition(sell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const boxes = screen.getAllByRole('checkbox')
      expect(boxes.indexOf(sell as HTMLInputElement)).toBe(
        boxes.indexOf(cg as HTMLInputElement) + 1,
      )
    })

    it('unchecking switches to keep; checking switches back to sell', () => {
      const update = vi.fn()
      const { unmount } = renderWith(DEFAULT_INPUT, update)
      fireEvent.click(screen.getByLabelText('Sell home at horizon'))
      expect(update).toHaveBeenCalledWith({ sale_disposition: 'keep' })
      unmount()

      const update2 = vi.fn()
      renderWith(keepInput, update2)
      fireEvent.click(screen.getByLabelText('Sell home at horizon'))
      expect(update2).toHaveBeenCalledWith({ sale_disposition: 'sell' })
    })

    it('stays enabled and undimmed when taxes are off', () => {
      renderWith({ ...DEFAULT_INPUT, tax: { ...DEFAULT_INPUT.tax, taxes_enabled: false } })
      const box = screen.getByLabelText('Sell home at horizon') as HTMLInputElement
      expect(box.disabled).toBe(false)
      expect(box.closest('.opacity-50')).toBeNull()
    })

    it('keep mode mutes the capital gains control, keeps it editable, and says why', () => {
      renderWith({ ...keepInput, tax: { ...keepInput.tax, taxes_enabled: true } })
      const cg = screen.getByLabelText('Include capital gains tax on sale') as HTMLInputElement
      expect(cg.disabled).toBe(false)
      expect(cg.closest('.opacity-50')).not.toBeNull()
      expect(screen.getByText('Not applied — home kept.')).toBeTruthy()
    })

    it('sell mode shows no "not applied" note', () => {
      renderWith({ ...DEFAULT_INPUT, tax: { ...DEFAULT_INPUT.tax, taxes_enabled: true } })
      expect(screen.queryByText('Not applied — home kept.')).toBeNull()
    })
  })
})
