// Corrections applied on top of the Excel-derived statutory brackets (state-brackets.json).
//
// The workbook (Tax Foundation, State Individual Income Tax Rates and Brackets, 2026) was
// compiled in early 2026, so it misses law changes enacted afterwards and carries a few
// transcription errors. Each entry below replaces only the fields it lists, and records what
// the figure was checked against. A test requires every correction to still differ from the
// workbook: once a refreshed workbook catches up, the test fails and the entry should be
// deleted.
//
// Only figures confirmed against a state agency or a USDA NFC bulletin belong here. Other
// disagreements between the sources are listed in briefs/nfc-vs-sources-comparison-*.md.

export type BracketRow = { floor: number; rate: number }

export type RawStateEntry = {
  no_tax: boolean
  single: BracketRow[]
  married_filing_jointly: BracketRow[]
  single_standard_deduction: number | null
  mfj_standard_deduction: number | null
}

export type StateCorrection = Partial<Omit<RawStateEntry, 'no_tax'>> & {
  reason: string
  evidence: string
}

export function applyCorrection(raw: RawStateEntry, correction: StateCorrection): RawStateEntry {
  return {
    no_tax: raw.no_tax,
    single: correction.single ?? raw.single,
    married_filing_jointly: correction.married_filing_jointly ?? raw.married_filing_jointly,
    single_standard_deduction:
      correction.single_standard_deduction !== undefined
        ? correction.single_standard_deduction
        : raw.single_standard_deduction,
    mfj_standard_deduction:
      correction.mfj_standard_deduction !== undefined
        ? correction.mfj_standard_deduction
        : raw.mfj_standard_deduction,
  }
}

const flat = (rate: number): BracketRow[] => [{ floor: 0, rate }]

export const STATE_CORRECTIONS: Record<string, StateCorrection> = {
  Arizona: {
    single_standard_deduction: 15750,
    mfj_standard_deduction: 31500,
    reason:
      "The workbook shows a standard deduction of $8,350 single and $16,700 joint, which are another state's figures.",
    evidence:
      'Arizona DOR 2025 Form 140 instructions: $15,750 single, $31,500 married filing jointly. The 2026 amounts are not yet posted.',
  },
  Arkansas: {
    single: [
      { floor: 0, rate: 0.02 },
      { floor: 4600, rate: 0.037 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0.02 },
      { floor: 4600, rate: 0.037 },
    ],
    reason:
      "Arkansas cut its top individual rate from 3.9% to 3.7%, retroactive to January 1, 2026 (H.B. 1001, signed May 6, 2026), after the workbook was compiled. The $4,600 threshold is the workbook's.",
    evidence:
      'Tax Foundation, "Arkansas Cuts Income Tax Rates for the Fourth Time in Four Years" (May 18, 2026) and USDA NFC bulletin NFC-26-1781190112 (published August 24, 2026), which prints 3.70%. DFA\'s own withholding documents (revised December 2025) still show 3.9%.',
  },
  California: {
    single_standard_deduction: 5706,
    mfj_standard_deduction: 11412,
    reason: 'The workbook has the prior-year standard deduction ($5,540 single, $11,080 joint).',
    evidence:
      'California EDD 2026 Withholding Schedules, Method B standard deduction table: $5,706, and $11,412 for married with two or more allowances.',
  },
  Georgia: {
    single: flat(0.0499),
    married_filing_jointly: flat(0.0499),
    single_standard_deduction: 15000,
    mfj_standard_deduction: 30000,
    reason:
      'Georgia cut its flat rate from 5.19% to 4.99% and raised the standard deduction in 2026, after the workbook was compiled.',
    evidence:
      "Georgia DOR 2026 Employer's Withholding Tax Guide (revised September 2026): flat 4.99%, standard deduction $15,000 single and $30,000 married filing jointly.",
  },
  Maine: {
    single: [
      { floor: 0, rate: 0.058 },
      { floor: 27399, rate: 0.0675 },
      { floor: 64849, rate: 0.0715 },
      { floor: 1000000, rate: 0.0915 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0.058 },
      { floor: 54849, rate: 0.0675 },
      { floor: 129749, rate: 0.0715 },
      { floor: 1500000, rate: 0.0915 },
    ],
    single_standard_deduction: 15700,
    mfj_standard_deduction: 31400,
    reason:
      "The workbook shows a $8,350/$16,700 standard deduction (another state's figures) and omits the 2% surcharge that Maine adds from tax year 2026 on income above $1,000,000 single or $1,500,000 joint.",
    evidence:
      'Maine Revenue Services 2026 individual income tax rate schedule and 36 M.R.S. 5111: standard deduction $15,700 single / $31,400 joint (phased out at higher incomes, not modeled) and a 2% surcharge above $1M / $1.5M, which makes the top marginal rate 9.15%. USDA NFC bulletin NFC-26-1787745725 prints the same 9.15%.',
  },
  Massachusetts: {
    single: [
      { floor: 0, rate: 0.05 },
      { floor: 1107750, rate: 0.09 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0.05 },
      { floor: 1107750, rate: 0.09 },
    ],
    reason: 'The workbook has the 2025 threshold for the 9% bracket ($1,083,150).',
    evidence:
      'USDA NFC bulletin NFC-26-1769797447 (Massachusetts, published June 9, 2026): 9.00% above $1,107,750.',
  },
  'North Dakota': {
    single: [
      { floor: 0, rate: 0 },
      { floor: 49575, rate: 0.0195 },
      { floor: 250400, rate: 0.025 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0 },
      { floor: 82800, rate: 0.0195 },
      { floor: 304850, rate: 0.025 },
    ],
    reason:
      'North Dakota indexed its bracket thresholds for 2026; the workbook has the 2025 thresholds ($48,475 and $244,825 single, $80,975 and $298,075 joint).',
    evidence:
      'ND Office of State Tax Commissioner, Form ND-1ES (SFN 28709, 12-2025), "2026 Forms ND-1 and ND-EZ Tax Rate Schedules".',
  },
  'South Carolina': {
    single: [
      { floor: 0, rate: 0.0199 },
      { floor: 30000, rate: 0.0521 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0.0199 },
      { floor: 30000, rate: 0.0521 },
    ],
    single_standard_deduction: 15000,
    mfj_standard_deduction: 30000,
    reason:
      "South Carolina replaced its 3%/6% schedule for tax year 2026 (H. 4216, signed March 30, 2026), after both the workbook and NFC's March 2026 bulletin.",
    evidence:
      'SC DOR 2026 tax legislation update: 1.99% under $30,000 and 5.21% minus $966 above, with a $15,000 single / $30,000 joint South Carolina Income Adjusted Deduction (reduced at higher AGI, which is not modeled).',
  },
  Utah: {
    single: flat(0.0445),
    married_filing_jointly: flat(0.0445),
    reason: 'Utah lowered its rate from 4.50% to 4.45% for 2026, after the workbook was compiled.',
    evidence:
      'USDA NFC bulletin NFC-26-1782763921 (Utah, published July 6, 2026): rate decreased from 4.50 to 4.45 percent; draft 2026 TC-65 instructions use 4.45%.',
  },
  'West Virginia': {
    single: [
      { floor: 0, rate: 0.0211 },
      { floor: 10000, rate: 0.0281 },
      { floor: 25000, rate: 0.0316 },
      { floor: 40000, rate: 0.0422 },
      { floor: 60000, rate: 0.0458 },
    ],
    married_filing_jointly: [
      { floor: 0, rate: 0.0211 },
      { floor: 10000, rate: 0.0281 },
      { floor: 25000, rate: 0.0316 },
      { floor: 40000, rate: 0.0422 },
      { floor: 60000, rate: 0.0458 },
    ],
    reason: 'West Virginia enacted a 5% income tax cut retroactive to January 1, 2026.',
    evidence:
      'WV State Tax Division "2026 Income Tax Rate Cut" page and NFC bulletin NFC-26-1786455448 (published August 11, 2026): 2.11%, 2.81%, 3.16%, 4.22%, 4.58%.',
  },
}
