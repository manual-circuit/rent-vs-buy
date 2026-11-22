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
## Relation to the existing bracket pipeline

The calculator already loads state brackets from a different source:

- `scripts/parse-state-brackets.ts` reads
  `reference/income-tax-brackets/2026-State-Individual-Income-Tax-Rate-Brackets.xlsx`
  and writes `src/lib/state-brackets.json`.
- `src/lib/state-tax.ts` merges that with `src/lib/state-brackets-pdf.json`
  (`source: 'excel' | 'pdf'`) and exports `STATE_TAX_SOURCE` and
  `STATE_TAX_AS_OF_DATE`.

Nothing reads this folder yet. Integration is a separate decision: use these files to
cross-check the existing JSON after each refresh, or replace the Excel source with them.
Either way, map bracket floors, rates and standard deductions into `StateBracketSchedule`;
the payroll steps do not carry over. This folder is tracked in git and committed by the
refresh workflow (it lives in `data/`, not `reference/`, because `reference/` is gitignored).

## Refresh

Runs Feb 1 and Oct 1 via `.github/workflows/nfc-tax-refs.yml` and opens a pull request
when anything changed. The repository must allow GitHub Actions to create pull requests
(Settings → Actions → General). Manual run from the repo root:
`python scripts/nfc_tax_refs.py`.
