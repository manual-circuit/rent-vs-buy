import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React, { isValidElement, type ReactNode } from 'react'
import { CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { MonthlyCostsChart } from '../MonthlyCostsChart'
import { computeScenario } from '../../engine'
import { DEFAULT_INPUT } from '../../lib/defaults'
import { deflate } from '../../lib/inflation'
import { yearTicks } from '../../lib/chart-axes'

type ChartPoint = { year: number; owner: number; renter: number }
type ChartMargin = { top: number; right: number; bottom: number; left: number }
type LegendFormatter = (value: string) => string
let capturedChartData: ChartPoint[] = []
let capturedChildren: ReactNode
let capturedMargin: ChartMargin | undefined
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

function findLegendFormatter(children: ReactNode): LegendFormatter | undefined {
  const match = React.Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === Legend,
  )
  if (!match || !isValidElement(match)) return undefined
  return (match.props as { formatter: LegendFormatter }).formatter
}

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

describe('MonthlyCostsChart', () => {
  it('renders without crashing', () => {
    const result = computeScenario(DEFAULT_INPUT)
    render(<MonthlyCostsChart result={result} />)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('chart reproduces nominal monthly cost values (yearly total / 12) when real_dollars is false, including year 1', () => {
    const result = computeScenario(DEFAULT_INPUT)
    render(<MonthlyCostsChart result={result} />)
    expect(capturedChartData).toEqual(
      result.yearly_summary.map((row) => ({
        year: row.year,
        owner: row.owner_costs_this_year / 12,
        renter: row.renter_costs_this_year / 12,
      })),
    )
    expect(capturedChartData.find((p) => p.year === 1)).toBeDefined()
  })

  it('chart data points are deflated per-year when real_dollars is true', () => {
    const nominalResult = computeScenario({
      ...DEFAULT_INPUT,
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 10 },
    })
    render(<MonthlyCostsChart result={nominalResult} />)
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
    render(<MonthlyCostsChart result={realResult} />)
    const realData = capturedChartData
    const realYear3 = realData.find((p) => p.year === 3)
    const realYear9 = realData.find((p) => p.year === 9)

    expect(realYear3?.owner).toBeCloseTo(deflate(nominalYear3!.owner, 0.03, 3), 6)
    expect(realYear9?.owner).toBeCloseTo(deflate(nominalYear9!.owner, 0.03, 9), 6)
  })

  it('legend formatter maps owner to Buying and renter to Renting', () => {
    const result = computeScenario(DEFAULT_INPUT)
    render(<MonthlyCostsChart result={result} />)
    const formatter = findLegendFormatter(capturedChildren)
    expect(formatter?.('owner')).toBe('Buying')
    expect(formatter?.('renter')).toBe('Renting')
  })

  it.each([1, 10, 23, 30, 40])('x-axis ticks equal yearTicks(%i) on a numeric axis', (horizon) => {
    render(<MonthlyCostsChart result={resultForHorizon(horizon)} />)
    const xAxis = findChildProps(capturedChildren, XAxis)
    expect(xAxis?.ticks).toEqual(yearTicks(horizon))
    expect(xAxis?.type).toBe('number')
    expect(xAxis?.interval).toBeUndefined()
  })

  it.each([
    [10, ['$0', '$2K', '$4K', '$6K']],
    [30, ['$0', '$5K', '$10K']],
    [40, ['$0', '$5K', '$10K', '$15K']],
  ])('y-axis labels at horizon %i (DEFAULT_INPUT) share one unit', (horizon, expected) => {
    render(<MonthlyCostsChart result={resultForHorizon(horizon)} />)
    expect(yAxisLabels(capturedChildren)).toEqual(expected)
  })

  it('y-axis domain covers every plotted value', () => {
    render(<MonthlyCostsChart result={resultForHorizon(30)} />)
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
    render(<MonthlyCostsChart result={resultForHorizon(10)} />)
    expect(findChildProps(capturedChildren, CartesianGrid)?.vertical).toBe(false)
    expect(findChildProps(capturedChildren, XAxis)?.label).toBeUndefined()
  })

  it('legend is 12px with a 10px icon', () => {
    render(<MonthlyCostsChart result={resultForHorizon(10)} />)
    const legend = findChildProps(capturedChildren, Legend)
    expect(legend?.wrapperStyle).toEqual({ fontSize: 12 })
    expect(legend?.iconSize).toBe(10)
  })

  it('uses tight margins and a responsive height (256px mobile, 320px from sm)', () => {
    const { container } = render(<MonthlyCostsChart result={resultForHorizon(10)} />)
    expect(capturedMargin).toEqual({ top: 8, right: 8, bottom: 8, left: 0 })
    expect(capturedContainerHeight).toBe('100%')
    expect(container.querySelector('.h-64.sm\\:h-80')).not.toBeNull()
  })
})
