// Regenerates src/lib/state-brackets-nfc.json from src/lib/nfc-state-specs.ts and the NFC
// manifest in data/state-tax/.
//
//   node scripts/build-nfc-brackets.ts
//
// Run it after editing a spec or after an NFC refresh. `pnpm test` fails if the JSON is out of
// date, or if a bulletin changed so that a spec figure is no longer printed in it.

import * as fs from 'fs'
import * as path from 'path'
import {
  NFC_STATE_NAMES,
  NFC_STATE_SPECS,
  buildNfcSchedules,
  unverifiedFigures,
} from '../src/lib/nfc-state-specs.ts'

const root = process.cwd()
const dataDir = path.resolve(root, 'data/state-tax')
const outPath = path.resolve(root, 'src/lib/state-brackets-nfc.json')

const manifest = (
  JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf-8')) as {
    jurisdictions: Record<string, { reference?: string; published?: string }>
  }
).jurisdictions

const codeByState = Object.fromEntries(Object.entries(NFC_STATE_NAMES).map(([c, s]) => [s, c]))

let problems = 0
for (const [code, state] of Object.entries(NFC_STATE_NAMES)) {
  const spec = NFC_STATE_SPECS[state]
  if (!spec) {
    console.error(`${code}: no spec for ${state}`)
    problems++
    continue
  }
  const text = fs.readFileSync(path.join(dataDir, `${code}.md`), 'utf-8')
  for (const [label, filing] of [
    ['single', spec.single],
    ['married', spec.married],
  ] as const) {
    for (const missing of unverifiedFigures(filing, text, spec.override)) {
      console.error(`${code} ${label}: ${missing} is not in the bulletin`)
      problems++
    }
  }
}
if (problems > 0) {
  console.error(`${problems} problem(s); nothing written.`)
  process.exit(1)
}

const schedules = buildNfcSchedules(NFC_STATE_SPECS, codeByState, manifest)
fs.writeFileSync(outPath, JSON.stringify(schedules, null, 2) + '\n', 'utf-8')
console.log(`Wrote ${Object.keys(schedules).length} states to ${path.relative(root, outPath)}`)
