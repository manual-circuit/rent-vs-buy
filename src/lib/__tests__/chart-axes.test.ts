import { describe, it, expect } from 'vitest'
import {
  niceTicks,
  currencyTickFormatter,
  yearTicks,
  yearAxisProps,
  currencyAxisProps,
} from '../chart-axes'

function labelsFor(values: number[]): string[] {
  const { ticks, step } = niceTicks(values)
  const format = currencyTickFormatter(ticks, step)
  return ticks.map(format)
}

describe('niceTicks + currencyTickFormatter', () => {
  const cases: Array<[string, number[], string[]]> = [
    ['max 1,940,000', [1_940_000], ['$0', '$0.5M', '$1.0M', '$1.5M', '$2.0M']],
    ['max 1,000,000', [1_000_000], ['$0', '$0.5M', '$1.0M']],
    ['max 1,200,000', [1_200_000], ['$0', '$0.5M', '$1.0M', '$1.5M']],
    ['max 780,000', [780_000], ['$0', '$200K', '$400K', '$600K', '$800K']],
    ['max 150,000', [150_000], ['$0', '$50K', '$100K', '$150K']],
    ['max 52,300', [52_300], ['$0', '$20K', '$40K', '$60K']],
    ['max 3,100', [3_100], ['$0', '$1K', '$2K', '$3K', '$4K']],
    ['max 800', [800], ['$0', '$200', '$400', '$600', '$800']],
    [
      'min -40,000 / max 1,940,000',
      [-40_000, 1_940_000],
      ['−$0.5M', '$0', '$0.5M', '$1.0M', '$1.5M', '$2.0M'],
    ],
  ]

  it.each(cases)('%s', (_name, values, expected) => {
    expect(labelsFor(values)).toEqual(expected)
  })

  it('always includes zero in the domain, even when every value is positive', () => {
    const { domain } = niceTicks([500_000, 900_000])
    expect(domain[0]).toBe(0)
  })

  it('starts at zero rather than -0', () => {
    const { ticks, domain } = niceTicks([1_940_000])
    expect(Object.is(ticks[0], 0)).toBe(true)
    expect(Object.is(domain[0], 0)).toBe(true)
  })

  it('domain spans the ticks exactly, one step apart', () => {
    const { domain, ticks, step } = niceTicks([-40_000, 1_940_000])
    expect(ticks[0]).toBe(domain[0])
    expect(ticks[ticks.length - 1]).toBe(domain[1])
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBe(step)
    }
  })

  it('all zeros: no throw, no NaN', () => {
    const result = niceTicks([0, 0, 0])
    expect(result.domain.every(Number.isFinite)).toBe(true)
    expect(result.ticks.every(Number.isFinite)).toBe(true)
    expect(Number.isFinite(result.step)).toBe(true)
    expect(result.ticks.length).toBeGreaterThanOrEqual(2)
    const labels = currencyTickFormatter(result.ticks, result.step)
    expect(result.ticks.map(labels).some((l) => l.includes('NaN'))).toBe(false)
  })

  it('empty array: no throw, no NaN', () => {
    const result = niceTicks([])
    expect(result.domain.every(Number.isFinite)).toBe(true)
    expect(result.ticks.every(Number.isFinite)).toBe(true)
  })

  it('ignores non-finite values rather than propagating NaN', () => {
    const result = niceTicks([100, Number.NaN, Number.POSITIVE_INFINITY])
    expect(result.ticks.every(Number.isFinite)).toBe(true)
    expect(result.domain.every(Number.isFinite)).toBe(true)
  })

  it('stays within 3-7 ticks across a wide range of magnitudes', () => {
    for (let exp = 2; exp <= 7; exp++) {
      for (const mantissa of [1, 1.01, 1.5, 2, 2.4, 3.1, 4.9, 5, 7.5, 9.99]) {
        const { ticks } = niceTicks([mantissa * 10 ** exp])
        expect(ticks.length).toBeGreaterThanOrEqual(3)
        expect(ticks.length).toBeLessThanOrEqual(7)
      }
    }
  })

  it('uses one unit and one decimal count for every label on the axis', () => {
    const labels = labelsFor([1_940_000])
    expect(labels.filter((l) => l !== '$0').every((l) => l.endsWith('M'))).toBe(true)
    expect(labels.filter((l) => l !== '$0').every((l) => /\.\d$/.test(l.replace('M', '')))).toBe(
      true,
    )
  })
})

describe('yearTicks', () => {
  const cases: Array<[number, number[]]> = [
    [1, [1]],
    [5, [1, 2, 3, 4, 5]],
    [7, [2, 4, 6]],
    [10, [2, 4, 6, 8, 10]],
    [23, [5, 10, 15, 20]],
    [30, [5, 10, 15, 20, 25, 30]],
    [40, [10, 20, 30, 40]],
  ]

  it.each(cases)('horizon %i', (horizon, expected) => {
    expect(yearTicks(horizon)).toEqual(expected)
  })

  it('returns 3-7 ticks for every horizon from 3 to 40 (1-2 ticks below that)', () => {
    for (let h = 1; h <= 40; h++) {
      const count = yearTicks(h).length
      expect(count).toBeLessThanOrEqual(7)
      expect(count).toBeGreaterThanOrEqual(h >= 3 ? 3 : h)
    }
  })

  it('horizon 14 falls back to a 2-year step rather than showing only 5 and 10', () => {
    expect(yearTicks(14)).toEqual([2, 4, 6, 8, 10, 12, 14])
  })

  it('never returns a tick outside [1, horizon]', () => {
    for (let h = 1; h <= 40; h++) {
      for (const t of yearTicks(h)) {
        expect(t).toBeGreaterThanOrEqual(1)
        expect(t).toBeLessThanOrEqual(h)
      }
    }
  })
})

describe('yearAxisProps', () => {
  it('is a numeric axis spanning 1..horizon with ticks from yearTicks', () => {
    const props = yearAxisProps(30)
    expect(props.type).toBe('number')
    expect(props.domain).toEqual([1, 30])
    expect(props.ticks).toEqual(yearTicks(30))
    expect(props.allowDecimals).toBe(false)
    expect(props.tickLine).toBe(false)
  })

  it('has no label and no interval', () => {
    const props = yearAxisProps(30) as Record<string, unknown>
    expect('label' in props).toBe(false)
    expect('interval' in props).toBe(false)
  })

  it('widens the domain by 0.5 each side at horizon 1 so it still renders', () => {
    expect(yearAxisProps(1).domain).toEqual([0.5, 1.5])
    expect(yearAxisProps(1).ticks).toEqual([1])
  })

  it('uses the brand monospace tick style at 11px', () => {
    expect(yearAxisProps(10).tick).toEqual({
      fill: '#8C8884',
      fontSize: 11,
      fontFamily: '"IBM Plex Mono", monospace',
    })
  })
})

describe('currencyAxisProps', () => {
  it('derives domain, ticks and formatter from the series values', () => {
    const props = currencyAxisProps([0, 1_940_000])
    expect(props.domain).toEqual([0, 2_000_000])
    expect(props.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000])
    expect(props.tickFormatter(1_500_000)).toBe('$1.5M')
  })

  it('is a compact axis with no line or tick marks', () => {
    const props = currencyAxisProps([100])
    expect(props.width).toBe(44)
    expect(props.axisLine).toBe(false)
    expect(props.tickLine).toBe(false)
  })

  it('uses the brand monospace tick style at 11px', () => {
    expect(currencyAxisProps([100]).tick).toEqual({
      fill: '#8C8884',
      fontSize: 11,
      fontFamily: '"IBM Plex Mono", monospace',
    })
  })
})
