import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ScenarioResult } from '../engine'
import { formatCurrency } from '../lib/format'
import { currencyAxisProps, yearAxisProps } from '../lib/chart-axes'
import { deflateIfEnabled } from '../lib/inflation'

type MonthlyCostsChartProps = {
  result: ScenarioResult
}

export function MonthlyCostsChart({ result }: MonthlyCostsChartProps) {
  const { real_dollars, inflation_rate } = result.inputs.shared
  const chartData = result.yearly_summary.map((row) => ({
    year: row.year,
    owner: deflateIfEnabled(row.owner_costs_this_year / 12, real_dollars, inflation_rate, row.year),
    renter: deflateIfEnabled(
      row.renter_costs_this_year / 12,
      real_dollars,
      inflation_rate,
      row.year,
    ),
  }))

  return (
    <div
      role="img"
      aria-label={`Monthly costs chart over ${result.inputs.shared.horizon_years} years.`}
    >
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD6" vertical={false} />
            <XAxis dataKey="year" {...yearAxisProps(result.inputs.shared.horizon_years)} />
            <YAxis {...currencyAxisProps(chartData.flatMap((p) => [p.owner, p.renter]))} />
            <ChartTooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'owner' ? 'Buying' : 'Renting',
              ]}
              labelFormatter={(label: number) => `Year ${label}`}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2DDD6',
                color: '#1A1A18',
              }}
            />
            <Legend
              formatter={(value: string) => (value === 'owner' ? 'Buying' : 'Renting')}
              wrapperStyle={{ fontSize: 12 }}
              iconSize={10}
            />
            <Line
              type="monotone"
              dataKey="owner"
              stroke="#3B6EA5"
              strokeWidth={2}
              dot={false}
              name="owner"
            />
            <Line
              type="monotone"
              dataKey="renter"
              stroke="#7A6E5F"
              strokeWidth={2}
              dot={false}
              name="renter"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
