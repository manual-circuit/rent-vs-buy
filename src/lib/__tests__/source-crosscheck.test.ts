import { describe, it, expect } from 'vitest'
import {
  topRate,
  firstTaxedRate,
  readItepTopRates,
  crossCheck,
  formatReport,
  KNOWN_DIFFERENCES,
  type Known,
} from '../source-crosscheck'
import RAW_BRACKETS from '../state-brackets.json'
import RAW_NFC from '../state-brackets-nfc.json'
import { STATE_CORRECTIONS, applyCorrection, type RawStateEntry } from '../state-corrections'

const rows = (...r: Array<[number, number]>) => r.map(([floor, rate]) => ({ floor, rate }))

describe('topRate and firstTaxedRate', () => {
  it('topRate is the highest marginal rate', () => {
    expect(topRate(rows([0, 0.02], [1000, 0.05], [5000, 0.04]))).toBe(0.05)
  })

  it('firstTaxedRate skips leading 0% brackets', () => {
    expect(firstTaxedRate(rows([0, 0], [5000, 0.02], [9000, 0.04]))).toBe(0.02)
  })

  it('both are 0 for no brackets', () => {
    expect(topRate([])).toBe(0)
    expect(firstTaxedRate([])).toBe(0)
  })
})

describe('readItepTopRates', () => {
  const sheet = [
    ['State', 2025, 2026],
    ['Alabama', 0.05, 0.05],
    ['District of Columbia', 0.1075, 0.1075],
    ['Georgia', 5.19, 5.09],
    [null, null, null],
    ['Texas', 0, 0],
  ]

  it('reads the requested year, mapping D.C. and converting percents', () => {
    expect(readItepTopRates(sheet, 2026)).toEqual({
      Alabama: 0.05,
      'D.C.': 0.1075,
      Georgia: 0.0509,
      Texas: 0,
    })
  })

  it('returns an empty map when the year is not in the header', () => {
    expect(readItepTopRates(sheet, 2031)).toEqual({})
  })
})

describe('crossCheck', () => {
  const ours = {
    Alabama: { no_tax: false, single: rows([0, 0.02], [500, 0.05]) },
    Texas: { no_tax: true, single: [] },
    Iowa: { no_tax: false, single: rows([0, 0.038]) },
  }
  const nfc = {
    Alabama: { single: rows([0, 0.02], [500, 0.05]) },
    Iowa: { single: rows([0, 0.044], [4800, 0.06]) },
  }

  it('reports no differences when sources agree', () => {
    const r = crossCheck({
      ours,
      itep: { Alabama: 0.05, Texas: 0, Iowa: 0.038 },
      nfc: { Alabama: nfc.Alabama },
      known: [],
    })
    expect(r.newDifferences).toEqual([])
    expect(r.staleKnown).toEqual([])
  })

  it('reports an ITEP top-rate difference as new', () => {
    const r = crossCheck({ ours, itep: { Alabama: 0.06, Texas: 0, Iowa: 0.038 }, known: [] })
    expect(r.newDifferences).toEqual([
      { state: 'Alabama', source: 'itep', field: 'top', ours: 0.05, other: 0.06 },
    ])
  })

  it('treats a no-tax state that ITEP taxes as a difference', () => {
    const r = crossCheck({ ours, itep: { Alabama: 0.05, Texas: 0.04, Iowa: 0.038 }, known: [] })
    expect(r.newDifferences).toContainEqual({
      state: 'Texas',
      source: 'itep',
      field: 'top',
      ours: 0,
      other: 0.04,
    })
  })

  it('compares NFC top and first taxed rates', () => {
    const r = crossCheck({ ours, nfc: { Iowa: nfc.Iowa }, known: [] })
    expect(r.newDifferences).toEqual([
      { state: 'Iowa', source: 'nfc', field: 'top', ours: 0.038, other: 0.06 },
      { state: 'Iowa', source: 'nfc', field: 'first', ours: 0.038, other: 0.044 },
    ])
  })

  it('moves a difference to known when it is listed, with its reason', () => {
    const known: Known[] = [
      { state: 'Iowa', source: 'nfc', field: 'top', reason: 'bulletin predates the flat tax' },
      { state: 'Iowa', source: 'nfc', field: 'first', reason: 'bulletin predates the flat tax' },
    ]
    const r = crossCheck({ ours, nfc: { Iowa: nfc.Iowa }, known })
    expect(r.newDifferences).toEqual([])
    expect(r.known).toHaveLength(2)
    expect(r.known[0]?.reason).toBe('bulletin predates the flat tax')
  })

  it('flags a known difference that no longer exists as stale', () => {
    const known: Known[] = [{ state: 'Alabama', source: 'nfc', field: 'top', reason: 'old' }]
    const r = crossCheck({ ours, nfc: { Alabama: nfc.Alabama }, known })
    expect(r.staleKnown).toEqual(known)
  })

  it('does not flag a known entry stale for a source that was not supplied', () => {
    const known: Known[] = [{ state: 'Alabama', source: 'itep', field: 'top', reason: 'lags' }]
    const r = crossCheck({ ours, nfc: { Alabama: nfc.Alabama }, known })
    expect(r.staleKnown).toEqual([])
  })

  it('lists states a source did not cover', () => {
    const r = crossCheck({ ours, itep: { Alabama: 0.05 }, known: [] })
    expect(r.missing).toEqual({ itep: ['Iowa', 'Texas'] })
  })
})

describe('formatReport', () => {
  it('summarizes a clean run in one line', () => {
    const text = formatReport({
      newDifferences: [],
      known: [],
      staleKnown: [],
      missing: {},
      compared: 40,
    })
    expect(text).toContain('No new differences')
    expect(text).toContain('40')
  })

  it('lists new differences and stale known entries as actions', () => {
    const text = formatReport({
      newDifferences: [{ state: 'Ohio', source: 'itep', field: 'top', ours: 0.0275, other: 0.03 }],
      known: [],
      staleKnown: [{ state: 'Iowa', source: 'nfc', field: 'top', reason: 'x' }],
      missing: {},
      compared: 40,
    })
    expect(text).toContain('Ohio')
    expect(text).toContain('2.75%')
    expect(text).toContain('3%')
    expect(text).toContain('Remove')
    expect(text).toContain('Iowa')
  })
})

describe('KNOWN_DIFFERENCES against the current data', () => {
  const excel = RAW_BRACKETS as Record<string, RawStateEntry>
  const statutory: Record<string, { no_tax: boolean; single: RawStateEntry['single'] }> = {}
  for (const [s, e] of Object.entries(excel)) {
    const c = STATE_CORRECTIONS[s]
    const merged = c ? applyCorrection(e, c) : e
    statutory[s] = { no_tax: merged.no_tax, single: merged.single }
  }
  const nfc = RAW_NFC as Record<string, { single: RawStateEntry['single'] }>

  it('every known NFC difference still exists, and every NFC difference is known', () => {
    const r = crossCheck({
      ours: statutory,
      nfc,
      known: KNOWN_DIFFERENCES.filter((k) => k.source === 'nfc'),
    })
    expect(r.newDifferences).toEqual([])
    expect(r.staleKnown).toEqual([])
  })

  it('each known entry carries a reason', () => {
    for (const k of KNOWN_DIFFERENCES) expect(k.reason.length).toBeGreaterThan(15)
  })
})
