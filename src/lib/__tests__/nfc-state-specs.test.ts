/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import {
  NFC_STATE_SPECS,
  NFC_STATE_NAMES,
  buildNfcSchedules,
  deductionTotal,
  unverifiedFigures,
  type FilingSpec,
  type StateSpec,
} from '../nfc-state-specs'
import RAW_NFC_BRACKETS from '../state-brackets-nfc.json'
import MANIFEST from '../../../data/state-tax/manifest.json'

const BULLETINS = import.meta.glob('../../../data/state-tax/??.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const bulletin = (code: string) => {
  const text = BULLETINS[`../../../data/state-tax/${code}.md`]
  if (text === undefined) throw new Error(`no bulletin file for ${code}`)
  return text
}
const manifest = MANIFEST as {
  jurisdictions: Record<string, { reference: string; published: string }>
}

const BULLETIN = `
| If the Amount of Taxable Income Is: | The Amount of Tax Withholding Should Be: |
| Over $0 but not over $10,000 | 2.0% |
| Over $10,000 | $200 plus 4.5% of excess over $10,000 |
Subtract the Standard Deduction amount of $3,400.
Multiply the taxable wages by 4.40 percent.
`

const filing = (over: Partial<FilingSpec> = {}): FilingSpec => ({
  deduction: [['standard', 3400]],
  brackets: [
    [0, 2],
    [10000, 4.5],
  ],
  ...over,
})

describe('deductionTotal', () => {
  it('sums amount x count, with count defaulting to 1', () => {
    expect(
      deductionTotal([
        ['standard', 7400],
        ['allowance', 1000, 2],
      ]),
    ).toBe(9400)
  })

  it('is zero for no deductions', () => {
    expect(deductionTotal([])).toBe(0)
  })
})

describe('unverifiedFigures', () => {
  it('is empty when every deduction, floor and rate appears in the bulletin', () => {
    expect(unverifiedFigures(filing(), BULLETIN)).toEqual([])
  })

  it('reports a deduction that is not in the bulletin', () => {
    expect(unverifiedFigures(filing({ deduction: [['standard', 3500]] }), BULLETIN)).toEqual([
      'deduction standard $3500',
    ])
  })

  it('reports a floor that is not in the bulletin', () => {
    const result = unverifiedFigures(
      filing({
        brackets: [
          [0, 2],
          [12000, 4.5],
        ],
      }),
      BULLETIN,
    )
    expect(result).toEqual(['floor $12000'])
  })

  it('reports a rate that is not in the bulletin', () => {
    const result = unverifiedFigures(
      filing({
        brackets: [
          [0, 2],
          [10000, 4.6],
        ],
      }),
      BULLETIN,
    )
    expect(result).toEqual(['rate 4.6%'])
  })

  it('reads "N percent" as well as "N%"', () => {
    expect(unverifiedFigures(filing({ brackets: [[0, 4.4]] }), BULLETIN)).toEqual([])
  })

  it('checks an implied rate against its published base amount', () => {
    const md = `${BULLETIN}\n| Over $10,000 | $475 plus 5% of excess over $10,000 |`
    const ok = filing({
      brackets: [
        [0, 4.75, 475],
        [10000, 5],
      ],
    })
    expect(unverifiedFigures(ok, md)).toEqual([])
    const wrong = filing({
      brackets: [
        [0, 4.5, 475],
        [10000, 5],
      ],
    })
    expect(unverifiedFigures(wrong, md)).toEqual(['implied rate 4.5% != $475 / $10000'])
  })
})

describe('buildNfcSchedules', () => {
  const spec: StateSpec = { single: filing(), married: filing({ deduction: [['standard', 6800]] }) }
  const built = buildNfcSchedules(
    { Virginia: spec },
    { Virginia: 'VA' },
    { VA: { reference: 'NFC-25-1', published: 'July 31, 2025' } },
  )

  it('turns percents into decimal rates and sums deductions', () => {
    expect(built['Virginia']).toMatchObject({
      no_tax: false,
      single: [
        { floor: 0, rate: 0.02 },
        { floor: 10000, rate: 0.045 },
      ],
      single_standard_deduction: 3400,
      mfj_standard_deduction: 6800,
    })
  })

  it('records provenance from the manifest', () => {
    expect(built['Virginia']).toMatchObject({
      source_md: 'data/state-tax/VA.md',
      nfc_reference: 'NFC-25-1',
      as_of_date: '2025-07-31',
    })
  })
})

describe('overrides', () => {
  const overridden: StateSpec = {
    single: filing({ brackets: [[0, 3.8]] }),
    married: filing({ brackets: [[0, 3.8]] }),
    override: { reason: 'flat rate since 2025', percents: [3.8], superseded: ['2.0%'] },
  }

  it('lets a listed percent through even though the bulletin does not print it', () => {
    expect(unverifiedFigures(overridden.single, BULLETIN)).toEqual(['rate 3.8%'])
    expect(unverifiedFigures(overridden.single, BULLETIN, { percents: [3.8] })).toEqual([])
  })

  it('lets a listed deduction amount through even though the bulletin does not print it', () => {
    const f = filing({ deduction: [['standard', 16100]] })
    expect(unverifiedFigures(f, BULLETIN)).toEqual(['deduction standard $16100'])
    expect(unverifiedFigures(f, BULLETIN, { dollars: [16100] })).toEqual([])
  })

  it('still reports unlisted figures that are missing', () => {
    const other = filing({ brackets: [[0, 3.9]] })
    expect(unverifiedFigures(other, BULLETIN, { percents: [3.8] })).toEqual(['rate 3.9%'])
  })

  it('records the override reason in the generated schedule', () => {
    const built = buildNfcSchedules({ Iowa: overridden }, { Iowa: 'IA' }, {})
    expect(built['Iowa']?.override_note).toBe('flat rate since 2025')
  })

  it('leaves no override note on states without one', () => {
    const plain: StateSpec = { single: filing(), married: filing() }
    const built = buildNfcSchedules({ Iowa: plain }, { Iowa: 'IA' }, {})
    expect(built['Iowa']).not.toHaveProperty('override_note')
  })
})

describe('NFC_STATE_SPECS', () => {
  const codes = Object.keys(manifest.jurisdictions)

  it('covers every jurisdiction NFC publishes, and nothing else', () => {
    const specCodes = Object.keys(NFC_STATE_NAMES).filter(
      (c) => NFC_STATE_SPECS[NFC_STATE_NAMES[c] ?? ''],
    )
    expect(specCodes.sort()).toEqual([...codes].sort())
  })

  it.each(codes)('%s: every figure in the spec appears in its bulletin', (code) => {
    const spec = NFC_STATE_SPECS[NFC_STATE_NAMES[code] ?? '']
    expect(spec).toBeDefined()
    const text = bulletin(code)
    const allowed = spec!.override ?? {}
    expect(unverifiedFigures(spec!.single, text, allowed)).toEqual([])
    expect(unverifiedFigures(spec!.married, text, allowed)).toEqual([])
  })

  const overridden = codes.filter((c) => NFC_STATE_SPECS[NFC_STATE_NAMES[c] ?? '']?.override)

  it.each(overridden)(
    '%s: override is still needed, because the bulletin still prints the superseded rates',
    (code) => {
      const override = NFC_STATE_SPECS[NFC_STATE_NAMES[code] ?? '']!.override!
      const text = bulletin(code)
      for (const printed of override.superseded) {
        // If NFC now prints something different, the override is stale: update the spec from
        // the new bulletin and remove the override.
        expect(text).toContain(printed)
      }
    },
  )

  it.each(codes)('%s: brackets start at $0 and have strictly ascending floors', (code) => {
    const spec = NFC_STATE_SPECS[NFC_STATE_NAMES[code] ?? '']!
    for (const f of [spec.single, spec.married]) {
      expect(f.brackets[0]?.[0]).toBe(0)
      f.brackets.forEach((b, i) => {
        if (i > 0) expect(b[0]).toBeGreaterThan(f.brackets[i - 1]![0])
        expect(b[1]).toBeGreaterThanOrEqual(0)
        expect(b[1]).toBeLessThan(15)
      })
    }
  })

  it('state-brackets-nfc.json is exactly what the specs and manifest produce', () => {
    const rebuilt = buildNfcSchedules(
      NFC_STATE_SPECS,
      NFC_STATE_NAMES_BY_STATE,
      manifest.jurisdictions,
    )
    expect(RAW_NFC_BRACKETS).toEqual(JSON.parse(JSON.stringify(rebuilt)))
  })
})

const NFC_STATE_NAMES_BY_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(NFC_STATE_NAMES).map(([code, state]) => [state, code]),
)
