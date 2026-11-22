import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { isValidElement, type ReactNode } from 'react'
import { CartesianGrid, Legend, ReferenceLine, XAxis, YAxis } from 'recharts'
import { BreakEvenChart } from '../BreakEvenChart'
import { computeScenario } from '../../engine'
import { DEFAULT_INPUT } from '../../lib/defaults'
import { deflate } from '../../lib/inflation'
import { yearTicks } from '../../lib/chart-axes'

type ChartPoint = { year: number; owner: number; renter: number }
type ChartMargin = { top: number; right: number; bottom: number; left: number }
let capturedChartData: ChartPoint[] = []
let capturedMargin: ChartMargin | undefined
let capturedChildren: ReactNode
let capturedContainerHeight: unknown

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      height,
    }: {
      children: React.ReactNode
      height?: unknown
    }) => {
      capturedContainerHeight = height
      return <div data-testid="responsive-container">{children}</div>
    },
    LineChart: (
      props: {
        data: ChartPoint[]
        margin?: ChartMargin
        children: ReactNode
      } & Record<string, unknown>,
    ) => {
      capturedChartData = props.data
      capturedMargin = props.margin
      capturedChildren = props.children
      const ActualLineChart = actual.LineChart
      return <ActualLineChart {...props} />
    },
  }
})

function findChildProps(children: ReactNode, type: unknown): Record<string, unknown> | undefined {
  const match = React.Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === type,
  )
  if (!match || !isValidElement(match)) return undefined
  return match.props as Record<string, unknown>
}

function yAxisLabels(children: ReactNode): string[] {
  const props = findChildProps(children, YAxis) as {
    ticks: number[]
    tickFormatter: (v: number) => string
  }
  return props.ticks.map(props.tickFormatter)
}

function resultForHorizon(horizon: number) {
  return computeScenario({
    ...DEFAULT_INPUT,
    shared: { ...DEFAULT_INPUT.shared, horizon_years: horizon },
  })
}

beforeEach(() => {
  Object.defineProperty(window, 'location', { value: { search: '' }, writable: true })
  vi.spyOn(history, 'replaceState').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BreakEvenChart', () => {
  it('renders heading without crashing', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    expect(screen.getByText('Net Worth Over Time')).toBeTruthy()
  })

  it('renders the chart horizon slider', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    expect(screen.getByRole('slider', { name: /chart horizon/i })).toBeTruthy()
  })

  it('calls updateShared with new horizon_years when slider changes', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    const slider = screen.getByRole('slider', { name: /chart horizon/i })
    fireEvent.change(slider, { target: { value: '15' } })
    expect(updateShared).toHaveBeenCalledWith({ horizon_years: 15 })
  })

  it('slider value reflects current horizon_years', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    const slider = screen.getByRole('slider', { name: /chart horizon/i }) as HTMLInputElement
    expect(slider.value).toBe(String(DEFAULT_INPUT.shared.horizon_years))
  })

  it('does not show Break-even text when one side always leads', () => {
    // High purchase price scenario: renting wins the full horizon with no crossover
    const rentingWinsInput = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: 900000, interest_rate: 7.5 },
      rental: { ...DEFAULT_INPUT.rental, base_rent_monthly: 2000 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 5 },
    }
    const result = computeScenario(rentingWinsInput)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    expect(screen.queryByText('Break-even')).toBeNull()
  })

  it('INF-9: chart data points are deflated per-year when real_dollars is true, not by a flat multiplier', () => {
    const nominalResult = computeScenario({
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 10 },
    })
    const updateShared = vi.fn()
    render(<BreakEvenChart result={nominalResult} updateShared={updateShared} />)
    const nominalData = capturedChartData
    const nominalYear3 = nominalData.find((p) => p.year === 3)
    const nominalYear9 = nominalData.find((p) => p.year === 9)
    expect(nominalYear3).toBeDefined()
    expect(nominalYear9).toBeDefined()

    const realResult = {
      ...nominalResult,
      inputs: {
        ...nominalResult.inputs,
        shared: { ...nominalResult.inputs.shared, real_dollars: true, inflation_rate: 0.03 },
      },
    }
    render(<BreakEvenChart result={realResult} updateShared={updateShared} />)
    const realData = capturedChartData
    const realYear3 = realData.find((p) => p.year === 3)
    const realYear9 = realData.find((p) => p.year === 9)

    expect(realYear3?.owner).toBeCloseTo(deflate(nominalYear3!.owner, 0.03, 3), 6)
    expect(realYear9?.owner).toBeCloseTo(deflate(nominalYear9!.owner, 0.03, 9), 6)
  })

  it('S14-12: chart margin.top is increased to prevent the break-even label from clipping', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    expect(capturedMargin?.top).toBe(28)
  })

  it('INF-10: chart reproduces nominal values when real_dollars is false', () => {
    const result = computeScenario(DEFAULT_INPUT)
    const updateShared = vi.fn()
    render(<BreakEvenChart result={result} updateShared={updateShared} />)
    expect(capturedChartData).toEqual(
      result.yearly_summary.map((row) => ({
        year: row.year,
        owner: row.owner_net_worth,
        renter: row.renter_net_worth,
      })),
    )
  })

  it.each([1, 10, 23, 30, 40])('x-axis ticks equal yearTicks(%i) on a numeric axis', (horizon) => {
    render(<BreakEvenChart result={resultForHorizon(horizon)} updateShared={vi.fn()} />)
    const xAxis = findChildProps(capturedChildren, XAxis)
    expect(xAxis?.ticks).toEqual(yearTicks(horizon))
    expect(xAxis?.type).toBe('number')
    expect(xAxis?.interval).toBeUndefined()
  })

  it.each([
    [10, ['$0', '$200K', '$400K', '$600K']],
    [30, ['$0', '$0.5M', '$1.0M', '$1.5M', '$2.0M']],
    [40, ['$0', '$1M', '$2M', '$3M', '$4M']],
  ])('y-axis labels at horizon %i (DEFAULT_INPUT) share one unit', (horizon, expected) => {
    render(<BreakEvenChart result={resultForHorizon(horizon)} updateShared={vi.fn()} />)
    expect(yAxisLabels(capturedChildren)).toEqual(expected)
  })

  it('y-axis domain covers every plotted value, including negative net worth', () => {
    const result = computeScenario({
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 5 },
    })
    render(<BreakEvenChart result={result} updateShared={vi.fn()} />)
    const [lo, hi] = (findChildProps(capturedChildren, YAxis) as { domain: [number, number] })
      .domain
    for (const p of capturedChartData) {
      expect(p.owner).toBeGreaterThanOrEqual(lo)
      expect(p.owner).toBeLessThanOrEqual(hi)
      expect(p.renter).toBeGreaterThanOrEqual(lo)
      expect(p.renter).toBeLessThanOrEqual(hi)
    }
  })

  it('removes the vertical grid lines and the x-axis title', () => {
    render(<BreakEvenChart result={resultForHorizon(10)} updateShared={vi.fn()} />)
    expect(findChildProps(capturedChildren, CartesianGrid)?.vertical).toBe(false)
    expect(findChildProps(capturedChildren, XAxis)?.label).toBeUndefined()
  })

  it('legend is 12px with a 10px icon', () => {
    render(<BreakEvenChart result={resultForHorizon(10)} updateShared={vi.fn()} />)
    const legend = findChildProps(capturedChildren, Legend)
    expect(legend?.wrapperStyle).toEqual({ fontSize: 12 })
    expect(legend?.iconSize).toBe(10)
  })

  it('keeps top 28 but tightens left/right margins and uses a responsive height', () => {
    const { container } = render(
      <BreakEvenChart result={resultForHorizon(10)} updateShared={vi.fn()} />,
    )
    expect(capturedMargin).toEqual({ top: 28, right: 8, bottom: 8, left: 0 })
    expect(capturedContainerHeight).toBe('100%')
    expect(container.querySelector('.h-64.sm\\:h-80')).not.toBeNull()
  })

  it('break-even reference line sits on a year inside the numeric x-domain', () => {
    // DEFAULT_INPUT never crosses; this price/rate/rent combination flips at year 17 of 30.
    const crossing = computeScenario({
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: 800000, interest_rate: 7.5 },
      rental: { ...DEFAULT_INPUT.rental, base_rent_monthly: 1800 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 30 },
    })
    render(<BreakEvenChart result={crossing} updateShared={vi.fn()} />)
    const ref = findChildProps(capturedChildren, ReferenceLine)
    expect(ref).toBeDefined()
    expect(ref?.x).toBe(17)
    const domain = (findChildProps(capturedChildren, XAxis) as { domain: [number, number] }).domain
    expect(ref?.x as number).toBeGreaterThanOrEqual(domain[0])
    expect(ref?.x as number).toBeLessThanOrEqual(domain[1])
  })
})
