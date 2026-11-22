// Shared axis logic for the three line charts (Net Worth, Annual Costs, Monthly Costs).
// Pure functions, no React. Replaces the per-tick formatCurrencyCompact and the
// category-axis computeXAxisInterval, neither of which could keep an axis consistent.

const NICE_MULTIPLIERS = [1, 2, 5, 10] as const
const EPSILON = 1e-9
const MINUS = '−'

export const AXIS_TICK_STYLE = {
  fill: '#8C8884',
  fontSize: 11,
  fontFamily: '"IBM Plex Mono", monospace',
} as const

export type NiceTicks = {
  domain: [number, number]
  ticks: number[]
  step: number
}

// A zero is normalised so a domain never renders "-0".
function clean(value: number): number {
  return value === 0 ? 0 : value
}

// Axis from zero (or the lowest value, when negative) to a rounded-up maximum, in 1/2/5 x 10^n steps.
export function niceTicks(values: number[], targetIntervals = 4): NiceTicks {
  const finite = values.filter(Number.isFinite)
  const lo = Math.min(0, ...finite)
  const hi = Math.max(0, ...finite)
  const span = hi - lo > 0 ? hi - lo : targetIntervals
  const raw = span / targetIntervals
  const mag = 10 ** Math.floor(Math.log10(raw) + EPSILON)
  const multiplier = NICE_MULTIPLIERS.find((m) => m * mag >= raw * (1 - EPSILON)) ?? 10
  const step = Math.max(1, multiplier * mag)

  const first = Math.floor(lo / step + EPSILON)
  const last = Math.max(Math.ceil(hi / step - EPSILON), first + 1)
  const ticks: number[] = []
  for (let i = first; i <= last; i++) ticks.push(clean(Math.round(i * step)))

  return { domain: [ticks[0] as number, ticks[ticks.length - 1] as number], ticks, step }
}

// One unit and one decimal count for the whole axis, so labels never mix $500K with $1M.
export function currencyTickFormatter(ticks: number[], step: number): (value: number) => string {
  const maxAbs = Math.max(0, ...ticks.map(Math.abs))
  const [divisor, suffix] = maxAbs >= 1e6 ? [1e6, 'M'] : maxAbs >= 1e3 ? [1e3, 'K'] : [1, '']
  const decimals = Math.max(0, -Math.floor(Math.log10(step / divisor) + EPSILON))
  return (value: number) => {
    if (value === 0) return '$0'
    const body = `$${(Math.abs(value) / divisor).toFixed(decimals)}${suffix}`
    return value < 0 ? `${MINUS}${body}` : body
  }
}

// Year labels at 1/2/5/10-year spacing: normally at most 6, and at least 3 from horizon 3 up
// (horizon 14 would otherwise get only 5 and 10, so it steps back to every 2 years).
export function yearTicks(horizon: number): number[] {
  const years = Math.floor(horizon)
  const multiples = (step: number) => {
    const out: number[] = []
    for (let year = step; year <= years; year += step) out.push(year)
    return out
  }
  const index = NICE_MULTIPLIERS.findIndex((s) => Math.floor(years / s) <= 6)
  const chosen = index === -1 ? NICE_MULTIPLIERS.length - 1 : index
  const ticks = multiples(NICE_MULTIPLIERS[chosen] as number)
  if (ticks.length >= 3 || years < 3 || chosen === 0) return ticks
  return multiples(NICE_MULTIPLIERS[chosen - 1] as number)
}

export function yearAxisProps(horizon: number) {
  return {
    type: 'number' as const,
    domain: (horizon <= 1 ? [horizon - 0.5, horizon + 0.5] : [1, horizon]) as [number, number],
    ticks: yearTicks(horizon),
    allowDecimals: false,
    tickLine: false,
    tick: AXIS_TICK_STYLE,
  }
}

export function currencyAxisProps(values: number[]) {
  const { domain, ticks, step } = niceTicks(values)
  return {
    domain,
    ticks,
    tickFormatter: currencyTickFormatter(ticks, step),
    width: 44,
    axisLine: false,
    tickLine: false,
    tick: AXIS_TICK_STYLE,
  }
}
