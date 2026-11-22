import { describe, it, expect } from 'vitest'
import {
  estimateStateIncomeTax,
  isNoTaxState,
  normalizeStateName,
  stateTaxProvenance,
  STATE_TAX_SOURCE,
  STATE_TAX_AS_OF_DATE,
} from '../state-tax'

// The calculator's default source: statutory rate schedules from the Tax Foundation workbook
// with the documented corrections in state-corrections.ts. NFC-source values are tested in
// state-tax-nfc.test.ts.

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
  it('Illinois 4.95% flat, no standard deduction: $80K × 4.95% = $3,960', () => {
    // IL rate: 4.95% flat, no std deduction (n.a.)
    // taxable = $80,000; tax = $80,000 × 0.0495 = $3,960
    expect(estimateStateIncomeTax('Illinois', 80_000, 'single')).toBeCloseTo(3_960, 0)
  })

  it('Pennsylvania 3.07% flat, no standard deduction: $60K × 3.07% = $1,842', () => {
    // PA rate: 3.07% flat, no std deduction (n.a.)
    // taxable = $60,000; tax = $60,000 × 0.0307 = $1,842
    expect(estimateStateIncomeTax('Pennsylvania', 60_000, 'single')).toBeCloseTo(1_842, 0)
  })

  it('Indiana 2.95% flat, no standard deduction: $75K × 2.95% = $2,212.50', () => {
    // IN rate: 2.95% flat, no std deduction (n.a.)
    // taxable = $75,000; tax = $75,000 × 0.0295 = $2,212.50
    expect(estimateStateIncomeTax('Indiana', 75_000, 'single')).toBe(2212.5)
  })
})

// ---------------------------------------------------------------------------
// Group 4 — Multi-bracket states (single filer)
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — multi-bracket states (single)', () => {
  it('Maryland single $100K: std_ded=$3,350 → taxable=$96,650 → $4,538', () => {
    // MD single brackets: 2%@$0, 3%@$1K, 4%@$2K, 4.75%@$3K, 5%@$100K, ...
    // std deduction: $3,350; taxable: $96,650
    // $1000×0.02 + $1000×0.03 + $1000×0.04 + $93650×0.0475 = $20+$30+$40+$4448.375 = $4538.375
    expect(estimateStateIncomeTax('Maryland', 100_000, 'single')).toBeCloseTo(4_538, 0)
  })

  it('California single $150K: std_ded=$5,706 → taxable=$144,294 → $9,858', () => {
    // CA single brackets: 1%@$0, 2%@$11079, 4%@$26264, 6%@$41452, 8%@$57542, 9.3%@$72724, ...
    // std deduction: $5,706 (EDD 2026, replaces the workbook's $5,540); taxable: $144,294
    // $11079×0.01 + $15185×0.02 + $15188×0.04 + $16090×0.06 + $15182×0.08 + $71570×0.093
    // = $110.79 + $303.70 + $607.52 + $965.40 + $1214.56 + $6656.01 = $9,857.98
    expect(estimateStateIncomeTax('California', 150_000, 'single')).toBeCloseTo(9_857.98, 1)
  })

  it('New York single $200K: std_ded=$8,000 → taxable=$192,000 → $10,760', () => {
    // NY single brackets: 3.9%@$0, 4.4%@$8500, 5.15%@$11700, 5.4%@$13900, 5.9%@$80650, 6.85%@$215400
    // std deduction: $8,000; taxable: $192,000
    // $8500×0.039 + $3200×0.044 + $2200×0.0515 + $66750×0.054 + $111350×0.059
    // = $331.50 + $140.80 + $113.30 + $3,604.50 + $6,569.65 = $10,759.75
    expect(estimateStateIncomeTax('New York', 200_000, 'single')).toBeCloseTo(10_760, 0)
  })
})

// ---------------------------------------------------------------------------
// Group 4b — Virginia, South Carolina (2026 law) and Idaho
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — Virginia, South Carolina and Idaho', () => {
  it('Virginia single $50K: std_ded=$8,750 → taxable=$41,250 → $2,114', () => {
    // VA single brackets: 2%@$0, 3%@$3K, 5%@$5K, 5.75%@$17K
    // std deduction: $8,750; taxable: $41,250
    // $3000×0.02 + $2000×0.03 + $12000×0.05 + $24250×0.0575
    // = $60 + $60 + $600 + $1394.375 = $2,114.375
    expect(estimateStateIncomeTax('Virginia', 50_000, 'single')).toBeCloseTo(2_114, 0)
  })

  it('South Carolina single $50K: 2026 law, SCIAD $15,000 → taxable=$35,000 → $857.50', () => {
    // SC 2026 (H. 4216): 1.99% under $30,000, 5.21% above; South Carolina Income Adjusted
    // Deduction $15,000 single
    // $30,000×0.0199 + $5,000×0.0521 = $597 + $260.50 = $857.50
    expect(estimateStateIncomeTax('South Carolina', 50_000, 'single')).toBeCloseTo(857.5, 1)
  })

  it('Idaho single $50K: flat 5.3% above $4,811 floor, std_ded=$16,100 → taxable=$33,900 → $1,542', () => {
    // Idaho single: single bracket, floor=$4,811, rate=5.3%
    // std deduction: $16,100; taxable: $33,900
    // ($33,900 - $4,811) × 0.053 = $29,089 × 0.053 = $1,541.72
    expect(estimateStateIncomeTax('Idaho', 50_000, 'single')).toBeCloseTo(1_542, 0)
  })
})

// ---------------------------------------------------------------------------
// Group 5 — MFJ filing status
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — MFJ filing status', () => {
  it('Maryland MFJ $150K: std_ded=$6,700 → taxable=$143,300 → $6,754', () => {
    // MD MFJ brackets: 2%@$0, 3%@$1K, 4%@$2K, 4.75%@$3K, 5%@$150K, ...
    // std deduction: $6,700; taxable: $143,300
    // $1000×0.02 + $1000×0.03 + $1000×0.04 + $140300×0.0475 = $20+$30+$40+$6664.25 = $6754.25
    expect(estimateStateIncomeTax('Maryland', 150_000, 'married_filing_jointly')).toBeCloseTo(
      6_754,
      0,
    )
  })

  it('California MFJ $200K: std_ded=$11,412 → taxable=$188,588 → $10,416', () => {
    // CA MFJ brackets: 1%@$0, 2%@$22158, 4%@$52528, 6%@$82904, 8%@$115084, 9.3%@$145448, ...
    // std deduction: $11,412 (EDD 2026); taxable: $188,588
    // $22158×0.01 + $30370×0.02 + $30376×0.04 + $32180×0.06 + $30364×0.08 + $43140×0.093
    // = $221.58 + $607.40 + $1215.04 + $1930.80 + $2429.12 + $4012.02 = $10,415.96
    expect(estimateStateIncomeTax('California', 200_000, 'married_filing_jointly')).toBeCloseTo(
      10_415.96,
      1,
    )
  })
})

// ---------------------------------------------------------------------------
// Group 6 — Filing status bracket selection
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — filing status bracket selection', () => {
  it('Maryland: single and MFJ produce different results for same gross income', () => {
    // MD single bracket for $100K: $4,538; MFJ bracket for $100K should differ
    // because MFJ brackets diverge at $150K vs single at $100K
    const single = estimateStateIncomeTax('Maryland', 100_000, 'single')
    const mfj = estimateStateIncomeTax('Maryland', 100_000, 'married_filing_jointly')
    // MFJ std ded = $6,700 (vs single $3,350) → lower taxable → lower tax
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
  it('very low income ($500) in Illinois (first bracket at $0): returns small amount', () => {
    // IL flat 4.95%, no std deduction; $500 × 0.0495 = $24.75
    const result = estimateStateIncomeTax('Illinois', 500, 'single')
    expect(result).toBeCloseTo(24.75, 1)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('very high income ($2M) in California (top bracket 13.3%): returns finite positive', () => {
    const result = estimateStateIncomeTax('California', 2_000_000, 'single')
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })

  it('income exactly at bracket boundary (MD $3,000) uses lower bracket (4%)', () => {
    // MD single: 4%@$2000, 4.75%@$3000; std ded $3,350
    // grossIncome = $6,350 → taxable = $3,000 (exactly at the 4.75% floor)
    // bracket loop: $3,000 <= $3,000 floor → break before adding 4.75% tax
    // Tax = $1000×0.02 + $1000×0.03 + $1000×0.04 = $90
    const result = estimateStateIncomeTax('Maryland', 6_350, 'single')
    expect(result).toBeCloseTo(90, 0)
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('module constants', () => {
  it('STATE_TAX_SOURCE points to the Excel file', () => {
    expect(STATE_TAX_SOURCE).toContain('2026-State-Individual-Income-Tax-Rate-Brackets.xlsx')
  })

  it('STATE_TAX_AS_OF_DATE is 2026', () => {
    expect(STATE_TAX_AS_OF_DATE).toBe('2026')
  })
})

// ---------------------------------------------------------------------------
// Corrections applied to the workbook (state-corrections.ts)
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — corrected states', () => {
  it('Georgia single $100K: 4.99% flat, $15,000 deduction → $4,241.50', () => {
    // GA DOR 2026 guide. taxable = $85,000; × 0.0499
    expect(estimateStateIncomeTax('Georgia', 100_000, 'single')).toBeCloseTo(4_241.5, 1)
  })

  it('West Virginia single $100K: 5%-cut rates, no deduction → $3,782.50', () => {
    // 2.11%@$0, 2.81%@$10K, 3.16%@$25K, 4.22%@$40K, 4.58%@$60K
    // $10000×0.0211 + $15000×0.0281 + $15000×0.0316 + $20000×0.0422 + $40000×0.0458
    // = $211 + $421.50 + $474 + $844 + $1,832 = $3,782.50
    expect(estimateStateIncomeTax('West Virginia', 100_000, 'single')).toBeCloseTo(3_782.5, 1)
  })

  it('Utah single $100K: 4.45% flat → $4,450', () => {
    expect(estimateStateIncomeTax('Utah', 100_000, 'single')).toBeCloseTo(4_450, 1)
  })

  it('Maine single $100K: $15,700 deduction → taxable $84,300', () => {
    // 5.8%@$0, 6.75%@$27,399, 7.15%@$64,849
    // $27399×0.058 + $37450×0.0675 + $19451×0.0715 = $1,589.14 + $2,527.88 + $1,390.80
    expect(estimateStateIncomeTax('Maine', 100_000, 'single')).toBeCloseTo(5_507.81, 1)
  })

  it('Arizona single $100K: 2.5% flat, $15,750 deduction → $2,106.25', () => {
    expect(estimateStateIncomeTax('Arizona', 100_000, 'single')).toBeCloseTo(2_106.25, 2)
  })

  it('Massachusetts single $1,200,000: 9% above the 2026 threshold of $1,107,750', () => {
    // $1,107,750×0.05 + $92,250×0.09 = $55,387.50 + $8,302.50
    expect(estimateStateIncomeTax('Massachusetts', 1_200_000, 'single')).toBeCloseTo(63_690, 1)
  })
})

// ---------------------------------------------------------------------------
// Source option
// ---------------------------------------------------------------------------
describe('estimateStateIncomeTax — source option', () => {
  it('defaults to the statutory schedules', () => {
    expect(estimateStateIncomeTax('Louisiana', 100_000, 'single')).toBe(
      estimateStateIncomeTax('Louisiana', 100_000, 'single', 'statutory'),
    )
  })

  it('Louisiana: statutory 3% vs NFC 3.09% withholding cushion, same $12,875 deduction', () => {
    // taxable = $87,125
    expect(estimateStateIncomeTax('Louisiana', 100_000, 'single', 'statutory')).toBeCloseTo(
      2_613.75,
      2,
    )
    expect(estimateStateIncomeTax('Louisiana', 100_000, 'single', 'nfc')).toBeCloseTo(2_692.16, 1)
  })

  it('no-tax states return 0 under either source', () => {
    expect(estimateStateIncomeTax('Texas', 100_000, 'single', 'nfc')).toBe(0)
    expect(estimateStateIncomeTax('Texas', 100_000, 'single', 'statutory')).toBe(0)
  })
})

describe('stateTaxProvenance', () => {
  it('statutory: a corrected state names its reason and evidence', () => {
    const p = stateTaxProvenance('Georgia')
    expect(p).toMatchObject({ source: 'statutory' })
    expect(p && p.source === 'statutory' ? p.correction : null).toContain('4.99%')
    expect(p && p.source === 'statutory' ? p.evidence : null).toContain('Georgia DOR')
  })

  it('statutory: an uncorrected state has no correction', () => {
    const p = stateTaxProvenance('Ohio')
    expect(p && p.source === 'statutory' ? p.correction : 'x').toBeNull()
  })

  it('nfc: names the bulletin file, reference number and published date', () => {
    expect(stateTaxProvenance('Maryland', 'nfc')).toEqual({
      source: 'nfc',
      source_md: 'data/state-tax/MD.md',
      nfc_reference: 'NFC-26-1783003892',
      as_of_date: '2026-07-16',
    })
  })

  it('is null for no-income-tax and unrecognized states', () => {
    expect(stateTaxProvenance('Texas')).toBeNull()
    expect(stateTaxProvenance('Atlantis', 'nfc')).toBeNull()
  })
})
