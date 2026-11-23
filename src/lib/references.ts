// Sources behind the calculator's tax figures, listed in the References panel. Every link was
// checked to resolve when it was added. A source belongs here only if the calculator's numbers
// come from it or are checked against it.

export type ReferenceGroup = 'Federal tax' | 'State income tax' | 'Cross-checks'

export type Reference = {
  id: string
  group: ReferenceGroup
  name: string
  supplies: string
  asOf: string
  url: string
}

export const REFERENCE_GROUPS: ReferenceGroup[] = [
  'Federal tax',
  'State income tax',
  'Cross-checks',
]

export const REFERENCES: Reference[] = [
  {
    id: 'irs-rev-proc-2025-32',
    group: 'Federal tax',
    name: 'IRS Revenue Procedure 2025-32',
    supplies: 'Federal brackets, standard deductions and capital gains thresholds',
    asOf: 'Tax year 2026',
    url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
  },
  {
    id: 'irc-164',
    group: 'Federal tax',
    name: '26 U.S.C. § 164',
    supplies: 'The cap on the state and local tax (SALT) deduction',
    asOf: '$40,400 for 2026',
    url: 'https://www.law.cornell.edu/uscode/text/26/164',
  },
  {
    id: 'irc-163',
    group: 'Federal tax',
    name: '26 U.S.C. § 163(h)',
    supplies: 'Mortgage interest deduction and its $750,000 debt limit',
    asOf: 'Current law',
    url: 'https://www.law.cornell.edu/uscode/text/26/163',
  },
  {
    id: 'irc-121',
    group: 'Federal tax',
    name: '26 U.S.C. § 121',
    supplies: 'Exclusion of gain on the sale of a primary residence',
    asOf: 'Current law',
    url: 'https://www.law.cornell.edu/uscode/text/26/121',
  },
  {
    id: 'tf-federal-2026',
    group: 'Federal tax',
    name: 'Tax Foundation: 2026 federal tax brackets',
    supplies: 'Cross-check of the federal brackets and standard deductions',
    asOf: 'Tax year 2026',
    url: 'https://taxfoundation.org/data/all/federal/2026-tax-brackets/',
  },
  {
    id: 'tf-state-2026',
    group: 'State income tax',
    name: 'Tax Foundation: 2026 state individual income tax rates and brackets',
    supplies:
      'Base state schedules, standard deductions and exemptions, with documented corrections',
    asOf: 'Tax year 2026 (workbook compiled February 2026)',
    url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
  },
  {
    id: 'usda-nfc',
    group: 'State income tax',
    name: 'USDA National Finance Center: state tax bulletins',
    supplies: 'The alternative state source: withholding formulas, not tax liability',
    asOf: 'Varies by state; each bulletin is dated',
    url: 'https://help.nfc.usda.gov/systems/taxes/',
  },
  {
    id: 'itep-history',
    group: 'Cross-checks',
    name: 'ITEP: state tax rate historical data',
    supplies: 'Independent check of each state’s top income tax rate',
    asOf: 'Tax year 2026',
    url: 'https://itep.org/historical-state-tax-rate-data/',
  },
]
