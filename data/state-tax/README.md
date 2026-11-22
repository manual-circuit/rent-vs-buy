# State income tax withholding references

Source: USDA National Finance Center tax map, https://help.nfc.usda.gov/systems/taxes/

One Markdown file per state with an income tax (`MD.md`, `OR.md`, …), captured by
`scripts/nfc_tax_refs.py`. Each file starts with a header block (source URL, NFC
reference number, published date, effective pay period, NFC formula ID), followed by
the bulletin itself: summary of changes, formula fields, withholding steps, and every
bracket table as written.

- `manifest.json` — current bulletin and content hash per state.
- `CHANGELOG.md` — newest first; each refresh lists changed states with a diff.

Read these before using them:

- These are **payroll withholding formulas for federal employees**, not tax-liability
  schedules. Steps for TSP, FEHB and biweekly annualization are payroll mechanics.
- **Effective dates differ by state** and often fall mid-year (pay period 12, 16, 17).
  Check `effective:` before treating a table as the tax-year schedule.
- Maryland's county rates are inside `MD.md`. Other city, county and transit taxes are
  not captured unless the script runs with `--include-local`.
- States with no file have no NFC income tax formula.
- Do not edit these files by hand; the next refresh overwrites them.
## How the calculator uses these files

The calculator has two selectable sources of state brackets (`estimateStateIncomeTax`'s
`source` argument):

- **`statutory` (default):** the statutory rate schedules and standard deductions in the Tax
  Foundation workbook (`reference/income-tax-brackets/`, parsed by
  `scripts/parse-state-brackets.ts` into `src/lib/state-brackets.json`), plus the corrections in
  `src/lib/state-corrections.ts`. Each correction names the state or NFC publication it was
  checked against, and a test fails once a refreshed workbook catches up with it.
- **`nfc`:** these bulletins. They are payroll withholding formulas, which can differ from the
  statute on purpose (Louisiana's 3.09% cushion, Arizona's 2.0% default election, California's
  rates scaled by 1.1, default W-4 allowances), so they are not the default.

For `nfc`, `src/lib/nfc-state-specs.ts` holds one hand-written spec per state (deductions,
bracket floors and rates), because NFC's formulas differ by state: flat rates, "base plus
rate" tables, rate-minus-adjustment tables, and deductions that shrink with income.
`node scripts/build-nfc-brackets.ts` generates `src/lib/state-brackets-nfc.json` from the specs
and `manifest.json`; each entry records its source file, NFC reference number and the
bulletin's published date. `pnpm test` checks that every deduction, floor and rate in a spec is
printed in that state's bulletin, and that the JSON matches the specs, so a refresh that
changes a bulletin fails the tests until the spec is updated.

The NFC modeling rules (single and joint filers, deductions but no credits, one exemption per
taxpayer and none for dependents, top-income-band values where a deduction phases out) are
listed at the top of `nfc-state-specs.ts`. Some bulletins are years old (Pennsylvania 2004,
Delaware 2020); check `as_of_date` before treating a schedule as current law. Where NFC has
not republished after a law change, the spec carries a documented `override` (Iowa's flat 3.8%
rate since 2025); a test fails once NFC prints something different, so the override gets
removed. The nine states with no wage income tax have no bulletin and are listed in
`src/lib/state-tax.ts`.

This folder is tracked in git and committed by the refresh workflow (it lives in `data/`,
not `reference/`, because `reference/` is gitignored).

## Cross-checking the sources

The calculator's statutory schedules are checked against independent sources so a law change
nobody has noticed shows up as a difference:

- `node scripts/cross-check-sources.ts [--itep itep.json] [--out report.md]` compares our final
  statutory schedule with ITEP's published 2026 top rates and with our NFC schedules, and
  exits 1 when something new disagrees or an explained difference has gone away.
- ITEP's workbook (https://itep.org/historical-state-tax-rate-data/) is read with
  `python3 scripts/itep_top_rates.py FILE.xlsx > itep.json`, which uses only the Python
  standard library, so a downloaded file never reaches the spreadsheet library with known
  parser advisories.
- Explained differences live in `KNOWN_DIFFERENCES` (`src/lib/source-crosscheck.ts`), each with
  its reason. `pnpm test` fails if an NFC entry stops being true or a new NFC difference
  appears, so the list cannot drift.
- `.github/workflows/source-crosscheck.yml` runs the ITEP check each January, April, July and
  October and opens an issue only when something needs a person.

A new difference is resolved against the state's own publication, then fixed in
`state-corrections.ts` (with its evidence) or added to `KNOWN_DIFFERENCES` (with its reason).

## Refresh

Runs Feb 1 and Oct 1 via `.github/workflows/nfc-tax-refs.yml` and opens a pull request
when anything changed. The repository must allow GitHub Actions to create pull requests
(Settings → Actions → General). Manual run from the repo root:
`python scripts/nfc_tax_refs.py`.
