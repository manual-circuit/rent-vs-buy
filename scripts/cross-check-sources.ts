// Cross-checks the calculator's statutory state schedules against independent sources and
// reports differences nobody has explained yet. See src/lib/source-crosscheck.ts.
//
//   python3 scripts/itep_top_rates.py ITEP.xlsx > itep.json     # optional: ITEP top rates
//   node scripts/cross-check-sources.ts [--itep itep.json] [--out report.md]
//
// Compares our final statutory schedule (Tax Foundation workbook plus state-corrections.ts)
// against ITEP's top rate (when --itep is given) and against our NFC schedules. Exits 1 when
// there is a new difference to investigate or a known difference to remove, so a scheduled job
// can open an issue.

import * as fs from 'fs'
import * as path from 'path'
import {
  STATE_CORRECTIONS,
  applyCorrection,
  type RawStateEntry,
} from '../src/lib/state-corrections.ts'
import {
  KNOWN_DIFFERENCES,
  crossCheck,
  formatReport,
  readItepTopRates,
} from '../src/lib/source-crosscheck.ts'

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const root = process.cwd()
const readJson = <T>(p: string): T =>
  JSON.parse(fs.readFileSync(path.resolve(root, p), 'utf-8')) as T

const workbook = readJson<Record<string, RawStateEntry>>('src/lib/state-brackets.json')
const nfc = readJson<Record<string, { single: RawStateEntry['single'] }>>(
  'src/lib/state-brackets-nfc.json',
)

const ours: Record<string, { no_tax: boolean; single: RawStateEntry['single'] }> = {}
for (const [state, entry] of Object.entries(workbook)) {
  const correction = STATE_CORRECTIONS[state]
  const merged = correction ? applyCorrection(entry, correction) : entry
  ours[state] = { no_tax: merged.no_tax, single: merged.single }
}

let itep: Record<string, number> | undefined
const itepFile = option('--itep')
if (itepFile) {
  const { year, rows } = readJson<{ year: number; rows: Array<[string, number]> }>(itepFile)
  itep = readItepTopRates([['State', year], ...rows], year)
}

const report = crossCheck({
  ours,
  nfc,
  itep,
  known: KNOWN_DIFFERENCES.filter((k) => k.source === 'nfc' || itep !== undefined),
})
const text = formatReport(report)
const out = option('--out')
if (out) fs.writeFileSync(path.resolve(root, out), text, 'utf-8')
console.log(text)
if (!itep) console.log('ITEP was not checked (no --itep file).')
process.exit(report.newDifferences.length + report.staleKnown.length > 0 ? 1 : 0)
