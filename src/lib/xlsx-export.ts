import * as XLSX from 'xlsx'
import type { ScenarioResult, TaxInput } from '../engine'
import { deflateIfEnabled } from './inflation'
import { toPercent } from './format'

// Empirically verified (Stage 20): XLSX.utils.aoa_to_sheet writes every string value as a literal
// string cell (`t: 's'`), including strings starting with `=`, `+`, `-`, `@`. It never auto-promotes
// a leading formula character into a formula cell (`f` property) the way opening a raw CSV in Excel
// would. Unlike CSV, the xlsx/OOXML format encodes cell type explicitly, so a string-typed cell
// always renders as literal text regardless of its first character. No prefix-guard is needed for
// cells built through this API — confirmed by direct inspection of aoa_to_sheet's output, not assumed.

// xlsx@0.18.5 has two known, unpatched-on-npm HIGH advisories (CVE-2023-30533 prototype pollution,
// CVE-2024-22363 ReDoS — SheetJS stopped publishing to npm after 0.18.5). Both are parser-triggered;
// this module never calls XLSX.read/parse on external input, only writes (aoa_to_sheet/book_new/
// write), so neither is reachable through this app. pnpm's documented suppression mechanism
// (auditConfig.ignoreCves/ignoreGhsas, both package.json- and pnpm-workspace.yaml-based) does not
// actually suppress these in the pinned pnpm@9.0.0 — confirmed empirically, not a config mistake.
// `pnpm audit --prod` and CI's audit step will therefore fail on these two advisories until either
// SheetJS publishes a patched npm release or pnpm's suppression bug is fixed. See CLAUDE.md's
// Security constraints section.

const FILING_STATUS_LABELS: Record<TaxInput['filing_status'], string> = {
  single: 'Single',
  married_filing_jointly: 'Married filing jointly',
  married_filing_separately: 'Married filing separately',
  head_of_household: 'Head of household',
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}

// Matches CostTable.tsx's formatCurrency rounding (maximumFractionDigits: 0) so exported Summary
// values match the on-screen table exactly, cell for cell, while remaining a real number (not a
// formatted string) so the sheet stays usable for further spreadsheet math.
function roundCurrency(value: number): number {
  return Math.round(value)
}

function buildSummarySheet(result: ScenarioResult): XLSX.WorkSheet {
  const { totals, inputs } = result
  const lastRow = result.monthly_schedule[result.monthly_schedule.length - 1] ?? null
  const downPayment = inputs.ownership.purchase_price * (inputs.ownership.down_payment_pct / 100)
  const { real_dollars, inflation_rate, horizon_years } = inputs.shared

  function atHorizon(value: number): number {
    return deflateIfEnabled(value, real_dollars, inflation_rate, horizon_years)
  }

  const ownerNetGainLoss = totals.owner_final_net_worth - totals.total_ownership_outflows
  const renterNetGainLoss = totals.renter_final_net_worth - totals.total_rentership_outflows

  type Row = [string, number | string, number | string]
  const rows: Row[] = [
    ['Down payment', roundCurrency(downPayment), ''],
    ['Closing costs', roundCurrency(totals.total_closing_costs), ''],
  ]

  if (inputs.ownership.refinance_enabled && totals.total_refinance_closing_costs !== 0) {
    rows.push(['Refinance closing costs', roundCurrency(totals.total_refinance_closing_costs), ''])
  }

  rows.push(
    ['Admin fee', '', roundCurrency(totals.total_admin_fee)],
    ['Mortgage principal', roundCurrency(totals.total_principal_paid), ''],
    ['Mortgage interest', roundCurrency(totals.total_interest_paid), ''],
    ['PMI', roundCurrency(totals.total_pmi_paid), ''],
    ['Property taxes', roundCurrency(totals.total_property_taxes), ''],
    ['Home insurance', roundCurrency(totals.total_homeowner_insurance), ''],
    ['HOA fees', roundCurrency(totals.total_hoa), ''],
    ['Maintenance', roundCurrency(totals.total_maintenance), ''],
    ['Rent paid', '', roundCurrency(totals.total_rent_paid)],
    ['Pet rent', '', roundCurrency(totals.total_pet_rent)],
    ['Parking fees', '', roundCurrency(totals.total_parking_fees)],
    ['Renters insurance', '', roundCurrency(totals.total_renters_insurance)],
    [
      'Utilities',
      roundCurrency(totals.total_utilities_owner),
      roundCurrency(totals.total_utilities_renter),
    ],
  )

  if (inputs.tax.taxes_enabled && totals.total_tax_benefit !== 0) {
    rows.push(['Federal tax benefit', roundCurrency(-totals.total_tax_benefit), ''])
  }

  rows.push([
    'Total Outflows',
    roundCurrency(totals.total_ownership_outflows),
    roundCurrency(totals.total_rentership_outflows),
  ])

  rows.push(['Sale proceeds', roundCurrency(atHorizon(totals.sale_proceeds)), ''])

  if (inputs.tax.taxes_enabled && totals.total_capital_gains_tax !== 0) {
    rows.push(['Capital gains tax', roundCurrency(atHorizon(totals.total_capital_gains_tax)), ''])
  }

  rows.push(
    [
      'Investment portfolio',
      roundCurrency(atHorizon(lastRow?.owner_investment_balance ?? 0)),
      roundCurrency(atHorizon(lastRow?.renter_investment_balance ?? 0)),
    ],
    [
      'Final Net Worth',
      roundCurrency(atHorizon(totals.owner_final_net_worth)),
      roundCurrency(atHorizon(totals.renter_final_net_worth)),
    ],
    [
      ownerNetGainLoss >= 0 && renterNetGainLoss >= 0
        ? 'Net Gain'
        : ownerNetGainLoss < 0 && renterNetGainLoss < 0
          ? 'Net Loss'
          : 'Net Gain / Loss',
      roundCurrency(atHorizon(ownerNetGainLoss)),
      roundCurrency(atHorizon(renterNetGainLoss)),
    ],
  )

  return XLSX.utils.aoa_to_sheet([['Category', 'Buying', 'Renting'], ...rows])
}

function buildAmortizationSheet(result: ScenarioResult): XLSX.WorkSheet {
  const header = [
    'Month',
    'Year',
    'Principal Payment',
    'Interest Payment',
    'PMI Payment',
    'Property Tax',
    'Homeowner Insurance',
    'Remaining Loan Balance',
  ]
  const rows = result.monthly_schedule.map((row) => [
    row.month_index,
    row.year_index,
    row.principal_payment,
    row.interest_payment,
    row.pmi_payment,
    row.property_tax,
    row.homeowner_insurance,
    row.remaining_loan_balance,
  ])
  return XLSX.utils.aoa_to_sheet([header, ...rows])
}

function buildChartSheet(
  result: ScenarioResult,
  ownerField: (row: ScenarioResult['yearly_summary'][number]) => number,
  renterField: (row: ScenarioResult['yearly_summary'][number]) => number,
): XLSX.WorkSheet {
  const { real_dollars, inflation_rate } = result.inputs.shared
  const rows = result.yearly_summary.map((row) => [
    row.year,
    deflateIfEnabled(ownerField(row), real_dollars, inflation_rate, row.year),
    deflateIfEnabled(renterField(row), real_dollars, inflation_rate, row.year),
  ])
  return XLSX.utils.aoa_to_sheet([['Year', 'Buying', 'Renting'], ...rows])
}

function buildInputsSheet(result: ScenarioResult): XLSX.WorkSheet {
  const { ownership, rental, shared, tax } = result.inputs

  const ownershipRows: [string, string | number][] = [
    ['Purchase Price', ownership.purchase_price],
    ['Down Payment (%)', ownership.down_payment_pct],
    ['Interest Rate (%/yr)', ownership.interest_rate],
    ['Loan Term (yrs)', ownership.loan_term_years],
    ['PMI Rate (%/yr)', ownership.pmi_rate],
    ['Property Tax Rate (%/yr)', ownership.real_estate_tax_rate],
    ['Assessed Value', ownership.assessed_value],
    ['Home Insurance (annual)', ownership.homeowner_insurance_annual],
    ['HOA Fee (monthly)', ownership.hoa_monthly],
    ['Home Size (sqft)', ownership.home_size_sqft],
    ['Closing Costs (%)', ownership.closing_costs_pct],
    ['Maintenance (%/yr)', ownership.maintenance_pct_annual],
    ['Home Appreciation (%/yr)', toPercent(ownership.home_appreciation_rate)],
    ['HOA Escalation (%/yr)', toPercent(ownership.hoa_increase_rate)],
    ['Maintenance Escalation (%/yr)', toPercent(ownership.maintenance_increase_rate)],
    ['Insurance Escalation (%/yr)', toPercent(ownership.insurance_increase_rate)],
    ['Selling Cost (%)', ownership.selling_cost_pct],
    ['Enable Refinance', yesNo(ownership.refinance_enabled)],
    ['Refinance Trigger Month', ownership.refinance_trigger_month],
    ['Refinance New Interest Rate (%/yr)', ownership.refinance_new_interest_rate],
    ['Refinance New Loan Term (yrs)', ownership.refinance_new_loan_term_years],
    ['Refinance New Closing Costs (%)', ownership.refinance_closing_costs_pct],
  ]

  const rentalRows: [string, string | number][] = [
    ['Monthly Rent', rental.base_rent_monthly],
    ['Pet Rent (monthly)', rental.pet_rent_monthly],
    ['Parking Fee (monthly)', rental.parking_fee_monthly],
    ['Renters Insurance (monthly)', rental.renters_insurance_monthly],
    ['Admin Fee', rental.admin_fee],
    ['Security Deposit', rental.security_deposit],
    ['Pet Deposit', rental.pet_deposit],
    ['Rent Escalation (%/yr)', toPercent(rental.rent_increase_rate)],
    ['Pet Rent Escalation (%/yr)', toPercent(rental.pet_rent_increase_rate)],
    ['Parking Escalation (%/yr)', toPercent(rental.parking_increase_rate)],
  ]

  const sharedRows: [string, string | number][] = [
    ['Utilities (monthly)', shared.utilities_monthly_base],
    ['Utilities Escalation (%/yr)', toPercent(shared.utilities_increase_rate)],
    ['Analysis Horizon (yrs)', shared.horizon_years],
    ['Investment Return (%/yr)', toPercent(shared.investment_return_rate)],
    ['Invest vs. Spend (%)', Math.round(shared.invest_vs_spend_ratio * 100)],
    ["Show in Today's Dollars", yesNo(shared.real_dollars)],
    ['Inflation Rate Assumption (%/yr)', toPercent(shared.inflation_rate)],
  ]

  const taxRows: [string, string | number][] = [
    ['Include Federal Tax Effects', yesNo(tax.taxes_enabled)],
    ['Filing Status', FILING_STATUS_LABELS[tax.filing_status]],
    ['Gross Annual Income', tax.gross_annual_income],
    // Derived from the selected state (useScenario.ts), not a direct on-screen input field.
    ['State Income Tax (Annual, Est.)', tax.state_income_tax_annual],
    ['State', tax.state],
    ['Itemized Mortgage Expenses', yesNo(tax.itemizes)],
    ['Include Capital Gains Tax on Sale', yesNo(tax.include_capital_gains)],
  ]

  return XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ...ownershipRows,
    ...rentalRows,
    ...sharedRows,
    ...taxRows,
  ])
}

// Returns a complete, write-ready xlsx workbook as an ArrayBuffer (confirmed via direct testing:
// XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) returns an ArrayBuffer with this SheetJS
// version, not a Uint8Array — Stage 21's Blob construction consumes it directly).
export function buildWorkbook(result: ScenarioResult): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(result), 'Summary')
  XLSX.utils.book_append_sheet(wb, buildAmortizationSheet(result), 'Amortization')
  XLSX.utils.book_append_sheet(
    wb,
    buildChartSheet(
      result,
      (row) => row.owner_net_worth,
      (row) => row.renter_net_worth,
    ),
    'Net Worth',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildChartSheet(
      result,
      (row) => row.owner_costs_this_year,
      (row) => row.renter_costs_this_year,
    ),
    'Annual Costs',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildChartSheet(
      result,
      (row) => row.owner_costs_this_year / 12,
      (row) => row.renter_costs_this_year / 12,
    ),
    'Monthly Costs',
  )
  XLSX.utils.book_append_sheet(wb, buildInputsSheet(result), 'Inputs')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
