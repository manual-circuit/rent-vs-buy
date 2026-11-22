import { describe, it, expect } from 'vitest'
import {
  estimateStateIncomeTax,
  isNoTaxState,
  normalizeStateName,
  stateTaxProvenance,
  STATE_TAX_SOURCE,
} from '../state-tax'

// ---------------------------------------------------------------------------
// Group 1 — Guard conditions
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — guard conditions', () => {
  it('returns 0 when grossIncome is 0', () => {
    expect(estimateStateIncomeTax('Maryland', 0, 'single')).toBe(0)
  })

  it('returns 0 when grossIncome is negative', () => {
    expect(estimateStateIncomeTax('California', -1000, 'single')).toBe(0)
  })

  it('returns 0 for unrecognized state name', () => {
    expect(estimateStateIncomeTax('Atlantis', 100_000, 'single')).toBe(0)
  })

  it('returns 0 for no-tax state (Alaska)', () => {
    expect(estimateStateIncomeTax('Alaska', 100_000, 'single')).toBe(0)
  })

  it('returns 0 for no-tax state (Florida)', () => {
    expect(estimateStateIncomeTax('Florida', 100_000, 'single')).toBe(0)
  })

  it('returns 0 for no-tax state (Texas)', () => {
    expect(estimateStateIncomeTax('Texas', 100_000, 'single')).toBe(0)
  })

  it('returns 0 for Washington (capital gains only — treated as no-tax for wages)', () => {
    expect(estimateStateIncomeTax('Washington', 100_000, 'single')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Group 2 — No-tax states (verify all 9)
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — all 9 no-tax states return 0', () => {
  const noTaxStates = [
    'Alaska',
    'Florida',
    'Nevada',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Washington',
    'Wyoming',
    'New Hampshire',
  ]
  it.each(noTaxStates)('%s returns 0 for $100K single', (state) => {
    expect(estimateStateIncomeTax(state, 100_000, 'single')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Group 3 — Flat-rate states
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — flat-rate states', () => {
  it('Illinois 4.95% flat, $2,925 exemption allowance: ($80K − $2,925) × 4.95% = $3,815.21', () => {
    // IL bulletin: exemption allowance = $2,925 x exemptions (single claims one); 4.95% flat
    // taxable = $77,075; tax = $77,075 × 0.0495 = $3,815.2125
    expect(estimateStateIncomeTax('Illinois', 80_000, 'single')).toBeCloseTo(3_815.21, 1)
  })

  it('Pennsylvania 3.07% flat, no deduction: $60K × 3.07% = $1,842', () => {
    // PA bulletin (2004): 3.07% flat, no deduction
    // taxable = $60,000; tax = $60,000 × 0.0307 = $1,842
    expect(estimateStateIncomeTax('Pennsylvania', 60_000, 'single')).toBeCloseTo(1_842, 0)
  })

  it('Indiana 2.95% flat, $1,000 personal exemption: ($75K − $1,000) × 2.95% = $2,183', () => {
    // IN bulletin: personal exemption allowance = $1,000 x exemptions (single claims one)
    // taxable = $74,000; tax = $74,000 × 0.0295 = $2,183
    expect(estimateStateIncomeTax('Indiana', 75_000, 'single')).toBeCloseTo(2_183, 2)
  })
})

// ---------------------------------------------------------------------------
// Group 4 — Multi-bracket states (single filer)
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — multi-bracket states (single)', () => {
  it('Maryland single $100K: deductions $3,400 + $3,200 → taxable=$93,400 → $4,436.50', () => {
    // MD bulletin: standard deduction $3,400, exemption $3,200 (single claims one).
    // The table shows $4,750 at $100,000, which is 4.75% flat below that point.
    // taxable = $93,400; tax = $93,400 × 0.0475 = $4,436.50
    expect(estimateStateIncomeTax('Maryland', 100_000, 'single')).toBeCloseTo(4_436.5, 1)
  })

  it('California single $150K: std_ded=$5,706 → taxable=$144,294 → $10,843.78', () => {
    // CA single table: 1.1%@$0, 2.2%@$11,079, 4.4%@$26,264, 6.6%@$41,452, 8.8%@$57,542,
    // 10.23%@$72,724. The bulletin prints $3,522.17 as the tax at $72,724.
    // $3,522.17 + ($144,294 − $72,724) × 0.1023 = $3,522.17 + $7,321.61 = $10,843.78
    expect(estimateStateIncomeTax('California', 150_000, 'single')).toBeCloseTo(10_843.78, 1)
  })

  it('New York single $200K: std_ded=$7,400 + $1,000 allowance → taxable=$191,600 → $11,843.51', () => {
    // NY single table: 3.9%@$0, 4.4%@$8,500, 5.15%@$11,700, 5.4%@$13,900, 5.9%@$80,650,
    // 7.03%@$96,800, 7.53%@$107,650, 6.4%@$157,650 (the bulletin builds recapture into its rates)
    // $331.50 + $140.80 + $113.30 + $3,604.50 + $952.85 + $762.755 + $3,765 + $2,172.80
    // = $11,843.505
    expect(estimateStateIncomeTax('New York', 200_000, 'single')).toBeCloseTo(11_843.5, 1)
  })
})

// ---------------------------------------------------------------------------
// Group 4b — Virginia, South Carolina and Idaho (bulletin tables)
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — bulletin-table states', () => {
  it('Virginia single $50K: $8,750 + $930 exemption → taxable=$40,320 → $2,060.90', () => {
    // VA single brackets: 2%@$0, 3%@$3K, 5%@$5K, 5.75%@$17K
    // $3000×0.02 + $2000×0.03 + $12000×0.05 + $23320×0.0575
    // = $60 + $60 + $600 + $1340.90 = $2,060.90
    expect(estimateStateIncomeTax('Virginia', 50_000, 'single')).toBeCloseTo(2_060.9, 1)
  })

  it('South Carolina single $50K: $7,500 + $5,000 exemption → taxable=$37,500 → $1,593.90', () => {
    // SC single brackets: 0%@$0, 3%@$3,640, 6%@$18,230
    // $3640×0 + $14590×0.03 + $19270×0.06 = $0 + $437.70 + $1,156.20 = $1,593.90
    expect(estimateStateIncomeTax('South Carolina', 50_000, 'single')).toBeCloseTo(1_593.9, 1)
  })

  it('Idaho single $50K: 0% to $16,100 then 5.3% → ($50,000 − $16,100) × 5.3% = $1,796.70', () => {
    // The bulletin's table has no separate deduction; the first $16,100 is the 0% bracket.
    expect(estimateStateIncomeTax('Idaho', 50_000, 'single')).toBeCloseTo(1_796.7, 1)
  })

  it('Iowa single $50K uses the 3.8% flat rate and $16,100 deduction in effect since 2025', () => {
    // Both figures override the 2023 NFC bulletin (graduated rates, $13,850 deduction).
    // taxable = $33,900; tax = $33,900 × 0.038 = $1,288.20
    expect(estimateStateIncomeTax('Iowa', 50_000, 'single')).toBeCloseTo(1_288.2, 1)
  })

  it('Iowa joint $100K uses the $32,200 deduction', () => {
    // taxable = $67,800; tax = $67,800 × 0.038 = $2,576.40
    expect(estimateStateIncomeTax('Iowa', 100_000, 'married_filing_jointly')).toBeCloseTo(
      2_576.4,
      1,
    )
  })
})

// ---------------------------------------------------------------------------
// Group 5 — MFJ filing status
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — MFJ filing status', () => {
  it('Maryland MFJ $150K: $3,400 + 2 × $3,200 → taxable=$140,200 → $6,659.50', () => {
    // MD married table: $7,125 at $150,000 = 4.75% flat below that point
    // taxable = $140,200; tax = $140,200 × 0.0475 = $6,659.50
    expect(estimateStateIncomeTax('Maryland', 150_000, 'married_filing_jointly')).toBeCloseTo(
      6_659.5,
      1,
    )
  })

  it('California MFJ $200K: std_ded=$11,412 → taxable=$188,588 → $11,457.56', () => {
    // CA married table: 1.1%@$0, 2.2%@$22,158, 4.4%@$52,528, 6.6%@$82,904, 8.8%@$115,084,
    // 10.23%@$145,448. The bulletin prints $7,044.33 as the tax at $145,448.
    // $7,044.33 + ($188,588 − $145,448) × 0.1023 = $7,044.33 + $4,413.22 = $11,457.56
    expect(estimateStateIncomeTax('California', 200_000, 'married_filing_jointly')).toBeCloseTo(
      11_457.56,
      1,
    )
  })
})

// ---------------------------------------------------------------------------
// Group 6 — Filing status bracket selection
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — filing status bracket selection', () => {
  it('Maryland: single and MFJ produce different results for same gross income', () => {
    // The married table keeps its lower rate to $150K vs single at $100K, and the married
    // deduction is larger
    const single = estimateStateIncomeTax('Maryland', 100_000, 'single')
    const mfj = estimateStateIncomeTax('Maryland', 100_000, 'married_filing_jointly')
    // MFJ deductions = $9,800 (vs single $6,600) → lower taxable → lower tax
    expect(mfj).toBeLessThan(single)
  })

  it('California MFJ uses doubled standard deduction vs single', () => {
    // CA single std_ded = $5,706; MFJ = $11,412
    // For the same $150K gross, MFJ taxable = $138,588 vs single $144,294 → MFJ tax lower
    const single = estimateStateIncomeTax('California', 150_000, 'single')
    const mfj = estimateStateIncomeTax('California', 150_000, 'married_filing_jointly')
    expect(mfj).toBeLessThan(single)
  })
})

// ---------------------------------------------------------------------------
// Group 7 — State name normalization
// ---------------------------------------------------------------------------
describe('normalizeStateName', () => {
  it("'Maryland' → 'Maryland' (canonical pass-through)", () => {
    expect(normalizeStateName('Maryland')).toBe('Maryland')
  })

  it("'Md.' → 'Maryland' (abbreviation lookup)", () => {
    expect(normalizeStateName('Md.')).toBe('Maryland')
  })

  it("'md.' → 'Maryland' (case-insensitive)", () => {
    expect(normalizeStateName('md.')).toBe('Maryland')
  })

  it("'DC' → 'D.C.'", () => {
    expect(normalizeStateName('DC')).toBe('D.C.')
  })

  it("'Washington DC' → 'D.C.'", () => {
    expect(normalizeStateName('Washington DC')).toBe('D.C.')
  })

  it("'not a state' → null", () => {
    expect(normalizeStateName('not a state')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Group 8 — isNoTaxState
// ---------------------------------------------------------------------------
describe('isNoTaxState', () => {
  it("'Alaska' → true", () => {
    expect(isNoTaxState('Alaska')).toBe(true)
  })

  it("'California' → false", () => {
    expect(isNoTaxState('California')).toBe(false)
  })

  it("'Washington' → true (capital gains only)", () => {
    expect(isNoTaxState('Washington')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group 9 — Edge cases
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — edge cases', () => {
  it('income below the exemption allowance (Illinois $500 vs $2,925) is untaxed', () => {
    const result = estimateStateIncomeTax('Illinois', 500, 'single')
    expect(result).toBe(0)
  })

  it('very low taxable income in Illinois (first bracket at $0): returns small amount', () => {
    // $5,000 − $2,925 = $2,075 taxable; × 0.0495 = $102.7125
    const result = estimateStateIncomeTax('Illinois', 5_000, 'single')
    expect(result).toBeCloseTo(102.71, 1)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('very high income ($2M) in California (top bracket 14.63%): returns finite positive', () => {
    const result = estimateStateIncomeTax('California', 2_000_000, 'single')
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })

  it('income exactly at a bracket boundary (VA $3,000) is taxed at the lower bracket only', () => {
    // VA single: 2%@$0, 3%@$3,000; deductions $8,750 + $930 = $9,680
    // grossIncome = $12,680 → taxable = $3,000 (exactly at the 3% floor)
    // bracket loop: $3,000 <= $3,000 floor → break before adding the 3% band
    // Tax = $3,000 × 0.02 = $60
    const result = estimateStateIncomeTax('Virginia', 12_680, 'single')
    expect(result).toBeCloseTo(60, 2)
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('module constants', () => {
  it('STATE_TAX_SOURCE names the NFC bulletins', () => {
    expect(STATE_TAX_SOURCE).toContain('National Finance Center')
  })
})

describe('stateTaxProvenance', () => {
  it('names the bulletin file, reference number and published date', () => {
    expect(stateTaxProvenance('Maryland')).toEqual({
      source_md: 'data/state-tax/MD.md',
      nfc_reference: 'NFC-26-1783003892',
      as_of_date: '2026-07-16',
    })
  })

  it('accepts abbreviations', () => {
    expect(stateTaxProvenance('Md.')?.source_md).toBe('data/state-tax/MD.md')
  })

  it('is null for no-income-tax and unrecognized states', () => {
    expect(stateTaxProvenance('Texas')).toBeNull()
    expect(stateTaxProvenance('Atlantis')).toBeNull()
  })
})
