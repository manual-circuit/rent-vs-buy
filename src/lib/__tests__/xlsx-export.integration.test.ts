import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import * as XLSX from 'xlsx'
import { CostTable } from '../../components/CostTable'
import { buildWorkbook } from '../xlsx-export'
import { computeScenarioForDisplay } from '../inflation'
import { DEFAULT_INPUT } from '../defaults'
import type { ScenarioInput } from '../../engine'

// Stage 22 end-to-end verification: renders the real CostTable component and cross-checks its
// displayed values against the exported Summary sheet, for representative scenarios. Individually
// passing unit tests in xlsx-export.test.ts don't prove the export actually matches what a user
// sees on screen — this bridges both code paths independently.

function parseCurrencyCell(text: string): number | null {
  if (text === '—') return null
  const negative = text.trim().startsWith('-')
  const digits = text.replace(/[^0-9.]/g, '')
  const value = Math.round(Number(digits))
  return negative ? -value : value
}

function summaryRows(buffer: ArrayBuffer): Map<string, [number | string, number | string]> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Summary'] as XLSX.WorkSheet, {
    header: 1,
  }) as (string | number)[][]
  const map = new Map<string, [number | string, number | string]>()
  for (const row of rows.slice(1)) {
    map.set(row[0] as string, [row[1] as number | string, row[2] as number | string])
  }
  return map
}

function checkScenarioMatchesExport(input: ScenarioInput) {
  const result = computeScenarioForDisplay(input)
  const { unmount } = render(CostTable({ result }))
  const table = screen.getByRole('table')
  const rows = within(table).getAllByRole('row').slice(1) // skip header row

  const exported = summaryRows(buildWorkbook(result))

  for (const row of rows) {
    const cells = within(row).getAllByRole('cell')
    const label = cells[0]?.textContent ?? ''
    const ownerText = cells[1]?.textContent ?? ''
    const renterText = cells[2]?.textContent ?? ''
    const exportedRow = exported.get(label)
    expect(exportedRow, `expected an exported row for "${label}"`).toBeDefined()
    if (!exportedRow) continue

    const ownerValue = parseCurrencyCell(ownerText)
    const renterValue = parseCurrencyCell(renterText)

    expect(exportedRow[0]).toBe(ownerValue === null ? '' : ownerValue)
    expect(exportedRow[1]).toBe(renterValue === null ? '' : renterValue)
  }

  unmount()
}

describe('xlsx export matches on-screen CostTable', () => {
  it('default scenario, nominal dollars, refinance disabled', () => {
    checkScenarioMatchesExport(DEFAULT_INPUT)
  })

  it('refinance active', () => {
    checkScenarioMatchesExport({
      ...DEFAULT_INPUT,
      ownership: {
        ...DEFAULT_INPUT.ownership,
        refinance_enabled: true,
        refinance_trigger_month: 24,
        refinance_new_interest_rate: 5.5,
      },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 10 },
    })
  })

  it('real-dollars display enabled', () => {
    checkScenarioMatchesExport({
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, real_dollars: true, inflation_rate: 0.03 },
    })
  })

  it('taxes and capital gains enabled', () => {
    checkScenarioMatchesExport({
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, home_appreciation_rate: 0.15 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 5 },
      tax: {
        ...DEFAULT_INPUT.tax,
        taxes_enabled: true,
        itemizes: true,
        include_capital_gains: true,
        gross_annual_income: 150000,
        filing_status: 'single',
      },
    })
  })
})
