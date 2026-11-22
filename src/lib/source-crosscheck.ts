// Cross-checks our statutory state schedules against independent sources, so a change we did
// not already know about shows up as a difference to investigate.
//
// Sources compared (single-filer rates only):
//   - ITEP's state tax rate workbook (top rate, 50 states + D.C.), supplied as a local file.
//   - Our NFC withholding schedules (state-brackets-nfc.json): top and first taxed rate.
//
// Differences that have been investigated and explained are listed in KNOWN_DIFFERENCES with
// their reason. The check reports only differences that are not listed (new, investigate) and
// listed ones that no longer exist (stale, remove). Pure functions, no I/O: the script in
// scripts/cross-check-sources.ts reads the files.

export type BracketRow = { floor: number; rate: number }
export type Source = 'itep' | 'nfc'
export type Field = 'top' | 'first'

export type Known = { state: string; source: Source; field: Field; reason: string }
export type Finding = { state: string; source: Source; field: Field; ours: number; other: number }

export type Report = {
  newDifferences: Finding[]
  known: Array<Finding & { reason: string }>
  staleKnown: Known[]
  missing: Partial<Record<Source, string[]>>
  compared: number
}

export type OursEntry = { no_tax: boolean; single: BracketRow[] }

const TOLERANCE = 5e-5

export const topRate = (rows: BracketRow[]): number => Math.max(0, ...rows.map((r) => r.rate))
export const firstTaxedRate = (rows: BracketRow[]): number =>
  rows.find((r) => r.rate > 0)?.rate ?? 0

const ITEP_NAMES: Record<string, string> = { 'District of Columbia': 'D.C.' }

// ITEP's PIT_history sheet: a header row holding the years, then one row per state. Rates are
// decimals in some editions and percents in others.
export function readItepTopRates(sheet: unknown[][], year: number): Record<string, number> {
  const headerIndex = sheet.findIndex((row) => row?.some((c) => Number(c) === year))
  if (headerIndex < 0) return {}
  const col = (sheet[headerIndex] ?? []).findIndex((c) => Number(c) === year)
  const out: Record<string, number> = {}
  for (const row of sheet.slice(headerIndex + 1)) {
    const name = row?.[0]
    const value = row?.[col]
    if (typeof name !== 'string' || !name.trim() || typeof value !== 'number') continue
    out[ITEP_NAMES[name.trim()] ?? name.trim()] = value > 1 ? Math.round(value * 1e4) / 1e6 : value
  }
  return out
}

export function crossCheck(input: {
  ours: Record<string, OursEntry>
  itep?: Record<string, number>
  nfc?: Record<string, { single: BracketRow[] }>
  known: Known[]
}): Report {
  const { ours, itep, nfc, known } = input
  const found: Finding[] = []
  const comparedKeys = new Set<string>()
  const missing: Partial<Record<Source, string[]>> = {}
  let compared = 0

  const compare = (state: string, source: Source, field: Field, a: number, b: number) => {
    compared++
    comparedKeys.add(`${state}|${source}|${field}`)
    if (Math.abs(a - b) > TOLERANCE) found.push({ state, source, field, ours: a, other: b })
  }

  for (const [state, entry] of Object.entries(ours)) {
    const ourTop = entry.no_tax ? 0 : topRate(entry.single)
    const ourFirst = entry.no_tax ? 0 : firstTaxedRate(entry.single)
    if (itep) {
      const value = itep[state]
      if (value === undefined) (missing.itep ??= []).push(state)
      else compare(state, 'itep', 'top', ourTop, value)
    }
    if (nfc && !entry.no_tax) {
      const n = nfc[state]
      if (!n) (missing.nfc ??= []).push(state)
      else {
        compare(state, 'nfc', 'top', ourTop, topRate(n.single))
        compare(state, 'nfc', 'first', ourFirst, firstTaxedRate(n.single))
      }
    }
  }
  for (const list of Object.values(missing)) list.sort()

  const knownByKey = new Map(known.map((k) => [`${k.state}|${k.source}|${k.field}`, k]))
  const newDifferences: Finding[] = []
  const knownFindings: Report['known'] = []
  const matched = new Set<string>()
  for (const f of found) {
    const key = `${f.state}|${f.source}|${f.field}`
    const k = knownByKey.get(key)
    if (k) {
      matched.add(key)
      knownFindings.push({ ...f, reason: k.reason })
    } else newDifferences.push(f)
  }
  const staleKnown = known.filter((k) => {
    const key = `${k.state}|${k.source}|${k.field}`
    return comparedKeys.has(key) && !matched.has(key)
  })

  return { newDifferences, known: knownFindings, staleKnown, missing, compared }
}

const pct = (rate: number) => `${+(rate * 100).toFixed(4)}%`

export function formatReport(report: Report): string {
  const { newDifferences, known, staleKnown, missing, compared } = report
  const lines = ['# State tax source cross-check', '']
  if (newDifferences.length === 0 && staleKnown.length === 0) {
    lines.push(
      `No new differences across ${compared} comparisons (${known.length} known differences explained).`,
    )
  }
  if (newDifferences.length > 0) {
    lines.push(
      "## New differences (investigate against the state's own publication)",
      '',
      '| State | Source | Rate | Ours | Other |',
      '|---|---|---|---|---|',
      ...newDifferences.map(
        (f) => `| ${f.state} | ${f.source} | ${f.field} | ${pct(f.ours)} | ${pct(f.other)} |`,
      ),
      '',
    )
  }
  if (staleKnown.length > 0) {
    lines.push(
      '## Remove these known differences (they no longer exist)',
      '',
      ...staleKnown.map((k) => `- ${k.state} / ${k.source} / ${k.field}: ${k.reason}`),
      '',
    )
  }
  for (const [source, states] of Object.entries(missing)) {
    if (states && states.length > 0)
      lines.push(`Not covered by ${source}: ${states.join(', ')}`, '')
  }
  return lines.join('\n') + '\n'
}

const both = (state: string, source: Source, reason: string): Known[] => [
  { state, source, field: 'top', reason },
  { state, source, field: 'first', reason },
]

// Explained differences. Each was checked against a state or NFC publication when added.
export const KNOWN_DIFFERENCES: Known[] = [
  {
    state: 'Arkansas',
    source: 'itep',
    field: 'top',
    reason:
      'ITEP (as of June 8, 2026) still shows 3.9%; H.B. 1001 cut the rate to 3.7% on May 6, 2026.',
  },
  {
    state: 'Georgia',
    source: 'itep',
    field: 'top',
    reason:
      'ITEP shows 5.09%; the Georgia DOR 2026 guide shows 4.99% (HB 463, signed May 11, 2026).',
  },
  ...both(
    'Arizona',
    'nfc',
    'NFC prints the default withholding election (2.0%); the statutory rate is 2.5%.',
  ),
  ...both(
    'California',
    'nfc',
    'NFC prints California withholding tables, which scale the statutory rates by 1.1.',
  ),
  {
    state: 'Hawaii',
    source: 'nfc',
    field: 'top',
    reason: "NFC's withholding table stops at 7.9%; the statutory schedule runs to 11%.",
  },
  ...both(
    'Louisiana',
    'nfc',
    'NFC prints the 3.09% withholding cushion; the statutory rate is 3%.',
  ),
  {
    state: 'Maryland',
    source: 'nfc',
    field: 'first',
    reason: "NFC's first $100,000 is an implied flat 4.75%, not the statutory 2/3/4/4.75% steps.",
  },
  ...both(
    'Nebraska',
    'nfc',
    "NFC prints Nebraska's withholding percentage-method rates, not the statutory 2.46/3.51/4.55%.",
  ),
  ...both(
    'New Jersey',
    'nfc',
    "NFC's 2021 bulletin carries withholding-table rates (up to 11.8%), not the statutory 1.4% to 10.75%.",
  ),
  {
    state: 'New York',
    source: 'nfc',
    field: 'top',
    reason:
      'NFC builds recapture into its withholding rates (top 11.7%); the statutory top is 10.9%.',
  },
  ...both('North Carolina', 'nfc', 'NFC prints the withholding rate (statutory 3.99% plus 0.1%).'),
  ...both(
    'Ohio',
    'nfc',
    "NFC's Ohio rates (1.6/2.99/3.4%) differ from the statutory 0%/2.75%; Ohio's own 2026 withholding tables were not examined.",
  ),
  {
    state: 'Oregon',
    source: 'nfc',
    field: 'first',
    reason: "NFC flattens Oregon's first two brackets to an implied 5.95%.",
  },
  ...both(
    'South Carolina',
    'nfc',
    "NFC's March 2026 bulletin predates the 2026 law (H. 4216): 3%/6% vs 1.99%/5.21%.",
  ),
  {
    state: 'Wisconsin',
    source: 'nfc',
    field: 'first',
    reason: "NFC prints Wisconsin's withholding rate of 3.54% (W-166); the statutory rate is 3.5%.",
  },
]
