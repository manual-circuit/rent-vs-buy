import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook } from '../xlsx-export'
import { computeScenario } from '../../engine'
import { deflateIfEnabled } from '../inflation'
import { DEFAULT_INPUT } from '../defaults'
import type { ScenarioInput } from '../../engine'

function toRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
}

function readBack(buffer: ArrayBuffer) {
  return XLSX.read(buffer, { type: 'array' })
}

describe('buildWorkbook', () => {
  it('S20-1: produces 6 sheets in the documented order', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const wb = readBack(buildWorkbook(result))
    expect(wb.SheetNames).toEqual([
      'Summary',
      'Amortization',
      'Net Worth',
      'Annual Costs',
      'Monthly Costs',
      'Inputs',
    ])
  })

  it('S20-2: Summary omits the refinance-closing-costs row when refinance is disabled', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Summary'] as XLSX.WorkSheet)
    expect(rows.some((r) => r[0] === 'Refinance closing costs')).toBe(false)
  })

  it('S20-3: Summary includes the refinance-closing-costs row when refinance is active', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      ownership: {
        ...DEFAULT_INPUT.ownership,
        refinance_enabled: true,
        refinance_trigger_month: 24,
      },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Summary'] as XLSX.WorkSheet)
    expect(rows.some((r) => r[0] === 'Refinance closing costs')).toBe(true)
  })

  it('S20-4: Summary includes the federal-tax-benefit row only when taxes are enabled and nonzero', () => {
    const withTax: ScenarioInput = {
      ...DEFAULT_INPUT,
      tax: {
        ...DEFAULT_INPUT.tax,
        taxes_enabled: true,
        itemizes: true,
        gross_annual_income: 150000,
        filing_status: 'married_filing_jointly',
      },
    }
    const withoutTax = DEFAULT_INPUT
    const wbWith = readBack(buildWorkbook(computeScenario(withTax)))
    const wbWithout = readBack(buildWorkbook(computeScenario(withoutTax)))
    const rowsWith = toRows(wbWith.Sheets['Summary'] as XLSX.WorkSheet)
    const rowsWithout = toRows(wbWithout.Sheets['Summary'] as XLSX.WorkSheet)
    expect(rowsWith.some((r) => r[0] === 'Federal tax benefit')).toBe(true)
    expect(rowsWithout.some((r) => r[0] === 'Federal tax benefit')).toBe(false)
  })

  it('S20-5: Summary includes the capital-gains-tax row only when taxes are enabled, capital gains included, and nonzero', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, home_appreciation_rate: 0.15 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 5 },
      tax: {
        ...DEFAULT_INPUT.tax,
        taxes_enabled: true,
        include_capital_gains: true,
        gross_annual_income: 150000,
        filing_status: 'single',
      },
    }
    const result = computeScenario(input)
    expect(result.totals.total_capital_gains_tax).not.toBe(0)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Summary'] as XLSX.WorkSheet)
    expect(rows.some((r) => r[0] === 'Capital gains tax')).toBe(true)
  })

  it('S20-6: Total Outflows is not deflated while Final Net Worth is, under real_dollars', () => {
    const nominalInput: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: false },
    }
    const realInput: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: true, inflation_rate: 0.03 },
    }
    const nominalResult = computeScenario(nominalInput)
    const realResult = computeScenario(realInput)
    const nominalRows = toRows(
      readBack(buildWorkbook(nominalResult)).Sheets['Summary'] as XLSX.WorkSheet,
    )
    const realRows = toRows(readBack(buildWorkbook(realResult)).Sheets['Summary'] as XLSX.WorkSheet)

    const nominalOutflows = nominalRows.find((r) => r[0] === 'Total Outflows')
    const realOutflows = realRows.find((r) => r[0] === 'Total Outflows')
    expect(realOutflows?.[1]).toBe(nominalOutflows?.[1])

    const nominalNetWorth = nominalRows.find((r) => r[0] === 'Final Net Worth')
    const realNetWorth = realRows.find((r) => r[0] === 'Final Net Worth')
    expect(realNetWorth?.[1]).not.toBe(nominalNetWorth?.[1])
  })

  it('S20-7: Amortization row count equals horizon_years * 12; remaining balance matches engine output', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Amortization'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)
    expect(dataRows).toHaveLength(DEFAULT_INPUT.shared.horizon_years * 12)

    const lastEngineRow = result.monthly_schedule[result.monthly_schedule.length - 1]
    const lastSheetRow = dataRows[dataRows.length - 1]
    expect(lastSheetRow?.[7]).toBeCloseTo(lastEngineRow?.remaining_loan_balance ?? NaN, 2)
  })

  it('S20-8: PMI payment is nonzero early and exactly 0 once remaining balance crosses the 80% threshold', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, pmi_rate: 0.5, down_payment_pct: 10 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 15 },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Amortization'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)

    expect(dataRows[0]?.[4]).toBeGreaterThan(0)

    const threshold = 0.8 * input.ownership.purchase_price
    for (const row of dataRows) {
      const balance = row[7] as number
      const pmi = row[4] as number
      if (balance <= threshold) {
        expect(pmi).toBe(0)
      }
    }
  })

  it('S20-9: Net Worth sheet matches hand-computed deflation for a real_dollars scenario', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: true, inflation_rate: 0.03 },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Net Worth'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)
    const targetRow = result.yearly_summary[4]
    if (!targetRow) throw new Error('expected yearly_summary[4]')
    const expectedOwner = deflateIfEnabled(targetRow.owner_net_worth, true, 0.03, targetRow.year)
    const sheetRow = dataRows.find((r) => r[0] === targetRow.year)
    expect(sheetRow?.[1]).toBeCloseTo(expectedOwner, 2)
  })

  it('S20-10: Annual Costs sheet matches hand-computed deflation for a real_dollars scenario', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: true, inflation_rate: 0.03 },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Annual Costs'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)
    const targetRow = result.yearly_summary[4]
    if (!targetRow) throw new Error('expected yearly_summary[4]')
    const expectedRenter = deflateIfEnabled(
      targetRow.renter_costs_this_year,
      true,
      0.03,
      targetRow.year,
    )
    const sheetRow = dataRows.find((r) => r[0] === targetRow.year)
    expect(sheetRow?.[2]).toBeCloseTo(expectedRenter, 2)
  })

  it('S20-11: Monthly Costs sheet divides by 12 before deflating, matching the live chart', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: true, inflation_rate: 0.03 },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Monthly Costs'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)
    const targetRow = result.yearly_summary[4]
    if (!targetRow) throw new Error('expected yearly_summary[4]')
    const expectedOwner = deflateIfEnabled(
      targetRow.owner_costs_this_year / 12,
      true,
      0.03,
      targetRow.year,
    )
    const sheetRow = dataRows.find((r) => r[0] === targetRow.year)
    expect(sheetRow?.[1]).toBeCloseTo(expectedOwner, 2)
  })

  it('S20-12: Inputs sheet contains one row per set input field, with form-style labels', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Inputs'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)

    // 23 ownership + 10 rental + 7 shared + 7 tax fields = 47
    expect(dataRows).toHaveLength(47)
    expect(
      dataRows.every((r) => typeof r[0] === 'string' && !/[a-z]_[a-z]/.test(r[0] as string)),
    ).toBe(true)
    expect(dataRows.some((r) => r[0] === 'Purchase Price')).toBe(true)
    expect(dataRows.some((r) => r[0] === 'Filing Status')).toBe(true)
  })

  it('S20-13: refinance-active scenario reflects the stitched pre/post-refinance amortization schedule', () => {
    const input: ScenarioInput = {
      ...DEFAULT_INPUT,
      ownership: {
        ...DEFAULT_INPUT.ownership,
        refinance_enabled: true,
        refinance_trigger_month: 36,
        refinance_new_interest_rate: 4.5,
        refinance_new_loan_term_years: 30,
      },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 10 },
    }
    const result = computeScenario(input)
    const wb = readBack(buildWorkbook(result))
    const rows = toRows(wb.Sheets['Amortization'] as XLSX.WorkSheet)
    const dataRows = rows.slice(1)

    const beforeTrigger = dataRows[34] // month 35
    const afterTrigger = dataRows[36] // month 37
    expect(beforeTrigger?.[3]).not.toBeCloseTo(afterTrigger?.[3] as number, 0)
  })

  it('S20-14: aoa_to_sheet never auto-promotes a leading formula character into a formula cell', () => {
    const ws = XLSX.utils.aoa_to_sheet([['=SUM(A1:A2)', '+1+1', '@cmd', '-1', 'normal']])
    for (const addr of ['A1', 'B1', 'C1', 'D1', 'E1']) {
      const cell = ws[addr] as XLSX.CellObject
      expect(cell.t).toBe('s')
      expect(cell.f).toBeUndefined()
    }
  })

  describe('sale disposition', () => {
    const base: ScenarioInput = {
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 20 },
      tax: { ...DEFAULT_INPUT.tax, taxes_enabled: true, gross_annual_income: 150000 },
    }
    const keepInput: ScenarioInput = {
      ...base,
      ownership: { ...base.ownership, sale_disposition: 'keep' },
    }
    const summary = (input: ScenarioInput) =>
      toRows(readBack(buildWorkbook(computeScenario(input))).Sheets['Summary'] as XLSX.WorkSheet)

    it('sell: Summary keeps the Sale proceeds label', () => {
      const rows = summary(base)
      expect(rows.some((r) => r[0] === 'Sale proceeds')).toBe(true)
      expect(rows.some((r) => r[0] === 'Home equity (unsold)')).toBe(false)
    })

    it('keep: Summary shows home equity and a dash for capital gains tax', () => {
      const result = computeScenario(keepInput)
      const rows = toRows(readBack(buildWorkbook(result)).Sheets['Summary'] as XLSX.WorkSheet)
      const equity = rows.find((r) => r[0] === 'Home equity (unsold)')
      expect(equity?.[1]).toBeCloseTo(result.totals.home_equity_at_horizon, 2)
      expect(rows.some((r) => r[0] === 'Sale proceeds')).toBe(false)
      expect(rows.find((r) => r[0] === 'Capital gains tax')?.[1]).toBe('—')
    })

    it('keep: Summary final net worth equals the verdict value', () => {
      const result = computeScenario(keepInput)
      const rows = toRows(readBack(buildWorkbook(result)).Sheets['Summary'] as XLSX.WorkSheet)
      const finalRow = rows.find((r) => r[0] === 'Final Net Worth')
      expect(finalRow?.[1]).toBeCloseTo(result.verdict.owner_net_worth, 2)
    })

    it('keep: the Net Worth sheet ends on the same number as Summary', () => {
      const result = computeScenario(keepInput)
      const wb = readBack(buildWorkbook(result))
      const chartRows = toRows(wb.Sheets['Net Worth'] as XLSX.WorkSheet).slice(1)
      const last = chartRows[chartRows.length - 1]
      expect(last?.[1]).toBeCloseTo(result.totals.owner_final_net_worth, 2)
    })

    it('Inputs sheet records the selected disposition', () => {
      const read = (input: ScenarioInput) =>
        toRows(
          readBack(buildWorkbook(computeScenario(input))).Sheets['Inputs'] as XLSX.WorkSheet,
        ).find((r) => r[0] === 'Sell Home at Horizon')
      expect(read(base)?.[1]).toBe('Yes')
      expect(read(keepInput)?.[1]).toBe('No')
    })
  })
})
