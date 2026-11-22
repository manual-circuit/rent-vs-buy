import { describe, it, expect } from 'vitest'
import { computeScenario, EngineInputError, MAX_HORIZON_YEARS } from '../index'
import type { ScenarioInput } from '../index'
import { DEFAULT_INPUT } from '../../lib/defaults'

// Reference scenario, worked by hand so no expected value comes from running the engine:
//   $200,000 home, 20% down -> $160,000 loan at 0% over 30 years = $160,000 / 360 = $444.444 a month
//   home appreciates 8% a year; selling costs 6% of the sale price; no PMI
//   a sale at the horizon uses purchase_price * 1.08^horizon
//
//   horizon 10: value = 200,000 * 1.08^10 = 431,784.99945
//               loan  = 160,000 - 120 * 444.444 = 106,666.66667
//               equity = 325,118.33279
//   horizon 20: value = 200,000 * 1.08^20 = 932,191.42877
//               loan  = 160,000 - 240 * 444.444 = 53,333.33333
//               equity = 878,858.09544
//               selling costs = 6% * value = 55,931.48573
//               gain = value - selling costs - 200,000 = 676,259.94304
//               single filer: $250,000 excluded, taxable 426,259.94304
//               income $100,000 - $16,100 standard deduction = $83,900 -> 15% bracket
//               capital gains tax = 426,259.94304 * 0.15 = 63,938.99146
//               cost to sell = 55,931.48573 + 63,938.99146 = 119,870.47718
function scenario(
  horizon: number,
  disposition: 'sell' | 'keep',
  over: {
    ownership?: Partial<ScenarioInput['ownership']>
    tax?: Partial<ScenarioInput['tax']>
  } = {},
): ScenarioInput {
  return {
    ...DEFAULT_INPUT,
    ownership: {
      ...DEFAULT_INPUT.ownership,
      purchase_price: 200_000,
      down_payment_pct: 20,
      interest_rate: 0,
      loan_term_years: 30,
      pmi_rate: 0,
      home_appreciation_rate: 0.08,
      selling_cost_pct: 6,
      sale_disposition: disposition,
      ...over.ownership,
    },
    shared: { ...DEFAULT_INPUT.shared, horizon_years: horizon },
    tax: {
      ...DEFAULT_INPUT.tax,
      taxes_enabled: true,
      filing_status: 'single',
      gross_annual_income: 100_000,
      include_capital_gains: true,
      ...over.tax,
    },
  }
}

const lastRow = (r: ReturnType<typeof computeScenario>) =>
  r.monthly_schedule[r.monthly_schedule.length - 1]!

describe('sale disposition: keep, mid-loan (horizon 10)', () => {
  const keep = computeScenario(scenario(10, 'keep'))

  it('home equity is home value less the remaining loan, with no transaction costs', () => {
    expect(keep.totals.home_equity_at_horizon).toBeCloseTo(325_118.33279, 2)
    expect(keep.totals.sale_proceeds).toBeCloseTo(325_118.33279, 2)
  })

  it('owner net worth is equity plus the investment balance', () => {
    expect(keep.totals.owner_final_net_worth).toBeCloseTo(
      325_118.33279 + lastRow(keep).owner_investment_balance,
      2,
    )
  })

  it('verdict reads the same number as the totals', () => {
    expect(keep.verdict.owner_net_worth).toBe(keep.totals.owner_final_net_worth)
  })

  it('the Net Worth chart final point equals owner final net worth', () => {
    const last = keep.yearly_summary[keep.yearly_summary.length - 1]!
    expect(last.owner_net_worth).toBe(keep.totals.owner_final_net_worth)
    expect(last.owner_equity_in_home).toBeCloseTo(325_118.33279, 2)
  })
})

describe('sale disposition: sell is unchanged', () => {
  it('sell: net sale proceeds are value less loan less selling costs (hand value)', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    expect(sell.totals.sale_proceeds).toBeCloseTo(822_926.60971, 2)
    expect(sell.totals.total_capital_gains_tax).toBeCloseTo(63_938.99146, 2)
    expect(sell.totals.owner_final_net_worth).toBeCloseTo(
      758_987.61825 + lastRow(sell).owner_investment_balance,
      2,
    )
  })

  it('sell is the default: an input built without the field behaves as sell', () => {
    const explicit = computeScenario(scenario(20, 'sell'))
    const base = scenario(20, 'sell')
    const fromDefault = computeScenario({
      ...base,
      ownership: { ...DEFAULT_INPUT.ownership, ...base.ownership, sale_disposition: 'sell' },
    })
    expect(fromDefault.totals).toEqual(explicit.totals)
    expect(DEFAULT_INPUT.ownership.sale_disposition).toBe('sell')
  })

  it('sell: the Net Worth chart keeps its paper-value last point', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const last = sell.yearly_summary[sell.yearly_summary.length - 1]!
    expect(last.owner_net_worth).toBe(lastRow(sell).owner_paper_net_worth)
  })
})

describe('sale disposition: keep, post-payoff', () => {
  it('a 15-year loan over a 20-year horizon: balance is 0 and equity equals home value', () => {
    const keep = computeScenario(scenario(20, 'keep', { ownership: { loan_term_years: 15 } }))
    expect(lastRow(keep).remaining_loan_balance).toBeCloseTo(0, 6)
    expect(keep.totals.home_equity_at_horizon).toBeCloseTo(932_191.42877, 2)
    expect(keep.totals.sale_proceeds).toBeCloseTo(932_191.42877, 2)
  })

  it('a 30-year horizon on a 30-year loan: balance is 0 at the end', () => {
    const keep = computeScenario(scenario(30, 'keep'))
    expect(lastRow(keep).remaining_loan_balance).toBeCloseTo(0, 6)
    // 200,000 * 1.08^30 = 2,012,531.37
    expect(keep.totals.home_equity_at_horizon).toBeCloseTo(2_012_531.37, 0)
  })
})

describe('sale disposition: keep ignores capital gains', () => {
  it('capital gains inputs do not change owner final net worth', () => {
    const a = computeScenario(scenario(20, 'keep', { tax: { include_capital_gains: true } }))
    const b = computeScenario(scenario(20, 'keep', { tax: { include_capital_gains: false } }))
    const c = computeScenario(
      scenario(20, 'keep', {
        tax: { gross_annual_income: 900_000, filing_status: 'married_filing_jointly' },
      }),
    )
    const d = computeScenario(scenario(20, 'keep', { tax: { taxes_enabled: false } }))
    expect(b.totals.owner_final_net_worth).toBe(a.totals.owner_final_net_worth)
    expect(c.totals.owner_final_net_worth).toBe(a.totals.owner_final_net_worth)
    expect(d.totals.owner_final_net_worth).toBe(a.totals.owner_final_net_worth)
    expect(a.totals.total_capital_gains_tax).toBe(0)
  })

  it('selling cost percentage does not change owner final net worth either', () => {
    const a = computeScenario(scenario(20, 'keep', { ownership: { selling_cost_pct: 0 } }))
    const b = computeScenario(scenario(20, 'keep', { ownership: { selling_cost_pct: 12 } }))
    expect(b.totals.owner_final_net_worth).toBe(a.totals.owner_final_net_worth)
  })
})

describe('sale disposition: estimated cost to sell', () => {
  it('keep reports selling costs plus capital gains tax (hand value)', () => {
    const keep = computeScenario(scenario(20, 'keep'))
    expect(keep.totals.estimated_cost_to_sell).toBeCloseTo(119_870.47718, 2)
  })

  it('keep equals gross sale value - net sale proceeds - loan payoff, from sell mode', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const keep = computeScenario(scenario(20, 'keep'))
    const grossSaleValue = 200_000 * Math.pow(1.08, 20)
    const loanPayoff = lastRow(sell).remaining_loan_balance
    const netProceedsAfterTax = sell.totals.sale_proceeds - sell.totals.total_capital_gains_tax
    expect(keep.totals.estimated_cost_to_sell).toBeCloseTo(
      grossSaleValue - netProceedsAfterTax - loanPayoff,
      6,
    )
  })

  it('is the same in both modes', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const keep = computeScenario(scenario(20, 'keep'))
    expect(sell.totals.estimated_cost_to_sell).toBe(keep.totals.estimated_cost_to_sell)
  })

  it('keep net worth exceeds sell net worth by exactly that cost', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const keep = computeScenario(scenario(20, 'keep'))
    expect(keep.totals.owner_final_net_worth - sell.totals.owner_final_net_worth).toBeCloseTo(
      119_870.47718,
      2,
    )
  })

  it('with taxes off the estimate is selling costs alone', () => {
    const keep = computeScenario(scenario(20, 'keep', { tax: { taxes_enabled: false } }))
    expect(keep.totals.estimated_cost_to_sell).toBeCloseTo(55_931.48573, 2)
  })
})

describe('sale disposition: unaffected figures', () => {
  it('renter final net worth is identical in both modes', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const keep = computeScenario(scenario(20, 'keep'))
    expect(keep.totals.renter_final_net_worth).toBe(sell.totals.renter_final_net_worth)
  })

  it('total ownership outflows are identical in both modes', () => {
    const sell = computeScenario(scenario(20, 'sell'))
    const keep = computeScenario(scenario(20, 'keep'))
    expect(keep.totals.total_ownership_outflows).toBe(sell.totals.total_ownership_outflows)
  })
})

describe('horizon cap', () => {
  it('the cap is 30 years', () => {
    expect(MAX_HORIZON_YEARS).toBe(30)
  })

  it('the engine rejects a horizon over 30', () => {
    expect(() => computeScenario(scenario(31, 'sell'))).toThrow(EngineInputError)
    expect(() => computeScenario(scenario(40, 'keep'))).toThrow(EngineInputError)
  })

  it('the engine accepts a horizon of exactly 30', () => {
    expect(() => computeScenario(scenario(30, 'sell'))).not.toThrow()
  })
})
