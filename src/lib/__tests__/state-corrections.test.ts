import { describe, it, expect } from 'vitest'
import { STATE_CORRECTIONS, applyCorrection, type RawStateEntry } from '../state-corrections'
import RAW_BRACKETS from '../state-brackets.json'

const excel = RAW_BRACKETS as Record<string, RawStateEntry>

const BASE: RawStateEntry = {
  no_tax: false,
  single: [{ floor: 0, rate: 0.05 }],
  married_filing_jointly: [{ floor: 0, rate: 0.05 }],
  single_standard_deduction: 1000,
  mfj_standard_deduction: 2000,
}

describe('applyCorrection', () => {
  it('replaces only the fields the correction lists', () => {
    const merged = applyCorrection(BASE, {
      single_standard_deduction: 1500,
      mfj_standard_deduction: 3000,
      reason: 'r',
      evidence: 'e',
    })
    expect(merged.single_standard_deduction).toBe(1500)
    expect(merged.mfj_standard_deduction).toBe(3000)
    expect(merged.single).toEqual(BASE.single)
    expect(merged.married_filing_jointly).toEqual(BASE.married_filing_jointly)
  })

  it('replaces brackets when listed', () => {
    const merged = applyCorrection(BASE, {
      single: [{ floor: 0, rate: 0.04 }],
      married_filing_jointly: [{ floor: 0, rate: 0.04 }],
      reason: 'r',
      evidence: 'e',
    })
    expect(merged.single).toEqual([{ floor: 0, rate: 0.04 }])
    expect(merged.single_standard_deduction).toBe(1000)
  })

  it('does not mutate the original entry', () => {
    applyCorrection(BASE, { single_standard_deduction: 9, reason: 'r', evidence: 'e' })
    expect(BASE.single_standard_deduction).toBe(1000)
  })
})

describe('STATE_CORRECTIONS', () => {
  const states = Object.keys(STATE_CORRECTIONS)

  it('covers the states verified against a state or NFC publication', () => {
    expect(states.sort()).toEqual(
      [
        'Arizona',
        'Arkansas',
        'California',
        'Georgia',
        'Maine',
        'Massachusetts',
        'North Dakota',
        'South Carolina',
        'Utah',
        'West Virginia',
      ].sort(),
    )
  })

  it.each(states)('%s: names its reason and evidence', (state) => {
    const c = STATE_CORRECTIONS[state]!
    expect(c.reason.length).toBeGreaterThan(20)
    expect(c.evidence.length).toBeGreaterThan(20)
  })

  it.each(states)(
    '%s: still differs from the Excel data (remove it once the workbook catches up)',
    (state) => {
      const raw = excel[state]
      expect(raw).toBeDefined()
      const merged = applyCorrection(raw!, STATE_CORRECTIONS[state]!)
      expect(merged).not.toEqual(raw)
    },
  )

  it.each(states)('%s: brackets start at $0 with ascending floors', (state) => {
    const c = STATE_CORRECTIONS[state]!
    for (const rows of [c.single, c.married_filing_jointly]) {
      if (!rows) continue
      expect(rows[0]?.floor).toBe(0)
      rows.forEach((r, i) => {
        if (i > 0) expect(r.floor).toBeGreaterThan(rows[i - 1]!.floor)
        expect(r.rate).toBeGreaterThanOrEqual(0)
        expect(r.rate).toBeLessThan(0.15)
      })
    }
  })

  it('applies the 2026 law changes the workbook predates', () => {
    const merged = (s: string) => applyCorrection(excel[s]!, STATE_CORRECTIONS[s]!)
    expect(merged('Georgia').single).toEqual([{ floor: 0, rate: 0.0499 }])
    expect(merged('Georgia').single_standard_deduction).toBe(15000)
    expect(merged('Georgia').mfj_standard_deduction).toBe(30000)
    expect(merged('West Virginia').single.map((r) => r.rate)).toEqual([
      0.0211, 0.0281, 0.0316, 0.0422, 0.0458,
    ])
    expect(merged('South Carolina').single).toEqual([
      { floor: 0, rate: 0.0199 },
      { floor: 30000, rate: 0.0521 },
    ])
    expect(merged('South Carolina').single_standard_deduction).toBe(15000)
    expect(merged('Utah').single).toEqual([{ floor: 0, rate: 0.0445 }])
    expect(merged('Maine').single_standard_deduction).toBe(15700)
    expect(merged('Maine').single.slice(-1)[0]).toEqual({ floor: 1000000, rate: 0.0915 })
    expect(merged('Maine').married_filing_jointly.slice(-1)[0]).toEqual({
      floor: 1500000,
      rate: 0.0915,
    })
    expect(merged('Arizona').single_standard_deduction).toBe(15750)
    expect(merged('California').single_standard_deduction).toBe(5706)
    expect(merged('Massachusetts').single[1]).toEqual({ floor: 1107750, rate: 0.09 })
    expect(merged('Arkansas').single).toEqual([
      { floor: 0, rate: 0.02 },
      { floor: 4600, rate: 0.037 },
    ])
    expect(merged('Arkansas').single_standard_deduction).toBe(2470)
    expect(merged('North Dakota').single).toEqual([
      { floor: 0, rate: 0 },
      { floor: 49575, rate: 0.0195 },
      { floor: 250400, rate: 0.025 },
    ])
    expect(merged('North Dakota').married_filing_jointly).toEqual([
      { floor: 0, rate: 0 },
      { floor: 82800, rate: 0.0195 },
      { floor: 304850, rate: 0.025 },
    ])
  })
})
