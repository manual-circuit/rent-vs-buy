// State income tax schedules, transcribed by hand from the USDA National Finance Center (NFC)
// withholding bulletins in data/state-tax/*.md. These bulletins are the calculator's only source
// of state brackets; scripts/build-nfc-brackets.ts turns this file into state-brackets-nfc.json.
//
// A spec is a transcription, not a parse: NFC publishes payroll formulas whose shape differs by
// state (flat rates, "base plus rate" tables, rate-minus-adjustment tables, deductions that shrink
// with income), so each state is read by a person. The safeguard is the test in
// __tests__/nfc-state-specs.test.ts: every deduction, floor and rate below must appear in that
// state's bulletin, so a bulletin that changes in a refresh fails the test until the spec is
// updated.
//
// Modeling rules, applied the same way to every state:
//   1. Filing statuses are single and married filing jointly. Tables for "Single or Head of
//      Household" are used for single; "Married" tables for joint filers.
//   2. Deductions from income are modeled: the standard deduction, plus a personal exemption or
//      allowance amount where the bulletin subtracts one per exemption. A single filer claims one
//      exemption and a married couple two; no dependents or additional allowances.
//   3. Tax credits are not modeled (personal and low-income credits, federal-tax deductions).
//   4. A deduction that shrinks with income uses the value the bulletin gives for its highest
//      income band, since that is what applies to higher earners.
//   5. Where a table's first row says "$0.00" but the next row's base amount implies a rate (for
//      example $4,750 at $100,000 is 4.75%), the implied rate is used and the base is recorded as
//      the third element so the test can check it. State tax only; local and county tax excluded.
//   6. Floors are on taxable income after the deduction, as in the bulletin's own tables.

export type DeductionPart = readonly [label: string, amount: number, count?: number]
// [floor $, marginal rate %, implied base $]
export type BracketSpec = readonly [floor: number, percent: number, impliedBase?: number]
export type FilingSpec = { deduction: readonly DeductionPart[]; brackets: readonly BracketSpec[] }
// A state whose law has moved on while NFC's bulletin has not. `percents` and `dollars` are
// figures taken from outside the bulletin, so the verification test lets them through;
// `superseded` is text the stale bulletin still prints, which the test requires, so the override
// is flagged for removal once NFC publishes the update.
export type Override = {
  reason: string
  percents?: readonly number[]
  dollars?: readonly number[]
  superseded: readonly string[]
}
export type AllowedFigures = Pick<Override, 'percents' | 'dollars'>
export type StateSpec = {
  single: FilingSpec
  married: FilingSpec
  notes?: string
  override?: Override
}

export type NfcSchedule = {
  no_tax: false
  single: Array<{ floor: number; rate: number }>
  married_filing_jointly: Array<{ floor: number; rate: number }>
  single_standard_deduction: number
  mfj_standard_deduction: number
  single_deduction_basis: string
  mfj_deduction_basis: string
  source_md: string
  nfc_reference: string
  as_of_date: string
  override_note?: string
}

// NFC jurisdiction code (the data/state-tax file name) -> state name as the calculator knows it.
export const NFC_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'D.C.',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WV: 'West Virginia',
  WI: 'Wisconsin',
}

const flat = (percent: number, deduction: readonly DeductionPart[] = []): FilingSpec => ({
  deduction,
  brackets: [[0, percent]],
})
const both = (f: FilingSpec): Pick<StateSpec, 'single' | 'married'> => ({ single: f, married: f })

export const NFC_STATE_SPECS: Record<string, StateSpec> = {
  Alabama: {
    single: {
      deduction: [
        ['standard deduction (top income band)', 2500],
        ['personal exemption', 1500],
      ],
      brackets: [
        [0, 2],
        [500, 4],
        [3000, 5],
      ],
    },
    married: {
      deduction: [
        ['standard deduction (top income band)', 5000],
        ['personal exemption', 3000],
      ],
      brackets: [
        [0, 2],
        [1000, 4],
        [6000, 5],
      ],
    },
    notes:
      'Bulletin is from 2022. Federal-tax deduction and dependent exemption are not modeled. Married uses the Married (status M) tables.',
  },
  Arizona: {
    ...both(flat(2.0)),
    notes:
      'No rate schedule: the employee elects 0% to 3.5% on Form A-4, and the bulletin defaults to 2.0%. Bulletin is from 2023.',
  },
  Arkansas: {
    ...both({
      deduction: [['standard deduction', 2470]],
      brackets: [
        [0, 0],
        [5600, 2],
        [11200, 3],
        [16000, 3.4],
        [26400, 3.7],
      ],
    }),
    notes:
      'Bulletin gives "rate minus adjustment" rows, which are continuous brackets. The 100-dollar-wide rows between $94,701 and $97,601 (a roughly $287 step) and the personal and low-income credits are not modeled.',
  },
  California: {
    single: {
      deduction: [['standard deduction', 5706]],
      brackets: [
        [0, 1.1],
        [11079, 2.2],
        [26264, 4.4],
        [41452, 6.6],
        [57542, 8.8],
        [72724, 10.23],
        [371479, 11.33],
        [445771, 12.43],
        [742953, 13.53],
        [1000000, 14.63],
      ],
    },
    married: {
      deduction: [['standard deduction (married, 2+ exemptions)', 11412]],
      brackets: [
        [0, 1.1],
        [22158, 2.2],
        [52528, 4.4],
        [82904, 6.6],
        [115084, 8.8],
        [145448, 10.23],
        [742958, 11.33],
        [891542, 12.43],
        [1000000, 13.53],
        [1485906, 14.63],
      ],
    },
    notes: 'Low-income exemption table and the per-allowance credit are not modeled.',
  },
  Colorado: {
    single: flat(4.4, [['standard deduction (all other statuses)', 5500]]),
    married: flat(4.4, [['standard deduction (married filing jointly)', 11000]]),
  },
  Connecticut: {
    single: {
      deduction: [],
      brackets: [
        [0, 2],
        [10000, 4.5],
        [50000, 5.5],
        [100000, 6],
        [200000, 6.5],
        [250000, 6.9],
        [500000, 6.99],
      ],
    },
    married: {
      deduction: [],
      brackets: [
        [0, 2],
        [20000, 4.5],
        [100000, 5.5],
        [200000, 6],
        [400000, 6.5],
        [500000, 6.9],
        [1000000, 6.99],
      ],
    },
    notes:
      'Single uses Option F, married Option C. The personal exemption phases to $0 above $44,000 (single) and $71,000 (married), so none is applied. The 2% and 3% phase-out add-back tables are not modeled, which understates tax at higher incomes. Bulletin is from 2024.',
  },
  Delaware: {
    single: {
      deduction: [['standard deduction', 3250]],
      brackets: [
        [0, 0],
        [2000, 2.2],
        [5000, 3.9],
        [10000, 4.8],
        [20000, 5.2],
        [25000, 5.55],
        [60000, 6.6],
      ],
    },
    married: {
      deduction: [['standard deduction (joint return)', 6500]],
      brackets: [
        [0, 0],
        [2000, 2.2],
        [5000, 3.9],
        [10000, 4.8],
        [20000, 5.2],
        [25000, 5.55],
        [60000, 6.6],
      ],
    },
    notes:
      'The $110 per-exemption allowance is a credit and is not modeled. Bulletin is from 2020.',
  },
  'D.C.': {
    ...both({
      deduction: [],
      brackets: [
        [0, 4],
        [10000, 6],
        [40000, 6.5],
        [60000, 8.5],
        [250000, 9.25],
        [500000, 9.75],
        [1000000, 10.75],
      ],
    }),
    notes:
      'The bulletin has a dependent allowance only and no standard deduction. Bulletin is from 2022.',
  },
  Georgia: {
    single: flat(4.99, [['standard deduction (single)', 15000]]),
    married: flat(4.99, [['standard deduction (joint, one spouse working)', 30000]]),
  },
  Hawaii: {
    single: {
      deduction: [
        ['extra lump-sum withholding allowance', 4350],
        ['exemption', 1144],
      ],
      brackets: [
        [0, 1.4],
        [9600, 3.2],
        [14400, 5.5],
        [19200, 6.4],
        [24000, 6.8],
        [36000, 7.2],
        [48000, 7.6],
        [125000, 7.9],
      ],
    },
    married: {
      deduction: [
        ['extra lump-sum withholding allowance', 4350],
        ['exemption', 1144, 2],
      ],
      brackets: [
        [0, 1.4],
        [19200, 3.2],
        [28800, 5.5],
        [38400, 6.4],
        [48000, 6.8],
        [72000, 7.2],
        [96000, 7.6],
        [250000, 7.9],
      ],
    },
  },
  Idaho: {
    single: {
      deduction: [],
      brackets: [
        [0, 0],
        [16100, 5.3],
      ],
    },
    married: {
      deduction: [],
      brackets: [
        [0, 0],
        [32200, 5.3],
      ],
    },
    notes:
      'The standard deduction is built into the first 0% bracket; the per-exemption deduction is $0.',
  },
  Illinois: {
    single: flat(4.95, [['exemption allowance', 2925]]),
    married: flat(4.95, [['exemption allowance', 2925, 2]]),
  },
  Indiana: {
    single: flat(2.95, [['personal exemption', 1000]]),
    married: flat(2.95, [['personal exemption', 1000, 2]]),
  },
  Iowa: {
    single: {
      deduction: [['standard deduction (single)', 16100]],
      brackets: [[0, 3.8]],
    },
    married: {
      deduction: [['standard deduction (married filing jointly)', 32200]],
      brackets: [[0, 3.8]],
    },
    override: {
      reason:
        'Iowa has taxed wages at a flat 3.8% since January 1, 2025, with a standard deduction of $16,100 single and $32,200 joint. NFC has not republished its formula, which still lists the graduated rates 4.40%, 4.82%, 5.70% and 6.00% and deductions of $13,850 and $27,700.',
      percents: [3.8],
      dollars: [16100, 32200],
      superseded: ['4.40%', '4.82%', '5.70%', '6.00%', '$13,850', '$27,700'],
    },
    notes: 'The $40 per-allowance credit is not modeled.',
  },
  Kansas: {
    single: {
      deduction: [['personal allowance (single, 1 exemption)', 9160]],
      brackets: [
        [0, 0],
        [3605, 5.2],
        [26605, 5.58],
      ],
    },
    married: {
      deduction: [['personal allowance (married, 2 exemptions)', 18320]],
      brackets: [
        [0, 0],
        [8240, 5.2],
        [54240, 5.58],
      ],
    },
    notes: 'Bulletin is from 2024. No additional dependent allowances.',
  },
  Kentucky: {
    ...both(flat(3.5, [['standard deduction', 3360]])),
  },
  Louisiana: {
    single: flat(3.09, [['standard deduction (single)', 12875]]),
    married: flat(3.09, [['standard deduction (married, two claimed)', 25750]]),
  },
  Maine: {
    single: {
      deduction: [['exemption', 5300]],
      brackets: [
        [0, 5.8],
        [27400, 6.75],
        [64850, 7.15],
        [1000000, 9.15],
      ],
    },
    married: {
      deduction: [['exemption', 5300, 2]],
      brackets: [
        [0, 5.8],
        [54850, 6.75],
        [129750, 7.15],
        [1500000, 9.15],
      ],
    },
    notes:
      'The standard deduction adjustment ($12,850 single, $28,550 married) phases out to $0 above $177,250 and $354,550, so none is applied.',
  },
  Maryland: {
    single: {
      deduction: [
        ['standard deduction', 3400],
        ['exemption', 3200],
      ],
      brackets: [
        [0, 4.75, 4750],
        [100000, 5],
        [125000, 5.25],
        [150000, 5.5],
        [250000, 5.75],
        [500000, 6.25],
        [1000000, 6.5],
      ],
    },
    married: {
      deduction: [
        ['standard deduction', 3400],
        ['exemption', 3200, 2],
      ],
      brackets: [
        [0, 4.75, 7125],
        [150000, 5],
        [175000, 5.25],
        [225000, 5.5],
        [300000, 5.75],
        [600000, 6.25],
        [1200000, 6.5],
      ],
    },
    notes:
      'The bulletin shows "$0.00" for the first $100,000 (single) and $150,000 (married) but $4,750 and $7,125 at those points; the implied 4.75% is used. County tax is excluded.',
  },
  Massachusetts: {
    single: {
      deduction: [['exemption (one exemption)', 4400]],
      brackets: [
        [0, 5],
        [1107750, 9],
      ],
    },
    married: {
      deduction: [
        ['exemption amount per exemption', 1000, 2],
        ['additional exemption amount', 3400],
      ],
      brackets: [
        [0, 5],
        [1107750, 9],
      ],
    },
    notes: 'Retirement-contribution deduction and credits are not modeled.',
  },
  Michigan: {
    single: flat(4.25, [['exemption allowance', 5900]]),
    married: flat(4.25, [['exemption allowance', 5900, 2]]),
  },
  Minnesota: {
    single: {
      deduction: [['allowance', 5300]],
      brackets: [
        [0, 0],
        [4700, 5.35],
        [38010, 6.8],
        [114130, 7.85],
        [207850, 9.85],
      ],
    },
    married: {
      deduction: [['allowance', 5300, 2]],
      brackets: [
        [0, 0],
        [14700, 5.35],
        [63400, 6.8],
        [208180, 7.85],
        [352630, 9.85],
      ],
    },
  },
  Mississippi: {
    single: {
      deduction: [
        ['standard deduction', 2300],
        ['standard personal exemption', 6000],
      ],
      brackets: [
        [0, 0],
        [10000, 4],
      ],
    },
    married: {
      deduction: [
        ['standard deduction', 4600],
        ['standard personal exemption', 12000],
      ],
      brackets: [
        [0, 0],
        [10000, 4],
      ],
    },
  },
  Missouri: {
    single: {
      deduction: [['standard deduction', 16100]],
      brackets: [
        [0, 0],
        [1348, 2],
        [2696, 2.5],
        [4044, 3],
        [5392, 3.5],
        [6740, 4],
        [8088, 4.5],
        [9436, 4.7],
      ],
    },
    married: {
      deduction: [['standard deduction (spouse does not work)', 32200]],
      brackets: [
        [0, 0],
        [1348, 2],
        [2696, 2.5],
        [4044, 3],
        [5392, 3.5],
        [6740, 4],
        [8088, 4.5],
        [9436, 4.7],
      ],
    },
  },
  Montana: {
    single: {
      deduction: [],
      brackets: [
        [0, 0],
        [16100, 4.7],
        [63600, 5.65],
      ],
    },
    married: {
      deduction: [],
      brackets: [
        [0, 0],
        [32200, 4.7],
        [127200, 5.65],
      ],
    },
  },
  Nebraska: {
    single: {
      deduction: [['allowance', 2440]],
      brackets: [
        [0, 0],
        [3430, 2.26],
        [6710, 3.22],
        [21810, 4.21],
        [31610, 4.35],
        [40130, 4.48],
        [75370, 4.6],
      ],
    },
    married: {
      deduction: [['allowance', 2440, 2]],
      brackets: [
        [0, 0],
        [8190, 2.26],
        [13010, 3.22],
        [32400, 4.21],
        [50400, 4.35],
        [62530, 4.48],
        [82920, 4.6],
      ],
    },
  },
  'New Jersey': {
    single: {
      deduction: [['exemption allowance', 1000]],
      brackets: [
        [0, 1.5],
        [20000, 2],
        [35000, 3.9],
        [40000, 6.1],
        [75000, 7],
        [500000, 9.9],
        [1000000, 11.8],
      ],
    },
    married: {
      deduction: [['exemption allowance', 1000, 2]],
      brackets: [
        [0, 1.5],
        [20000, 2],
        [50000, 2.7],
        [70000, 3.9],
        [80000, 6.1],
        [150000, 7],
        [500000, 9.9],
        [1000000, 11.8],
      ],
    },
    notes:
      'Single uses Rate Table A, married Rate Table B; the optional Rate Table C is not used. Bulletin is from 2021.',
  },
  'New Mexico': {
    single: {
      deduction: [],
      brackets: [
        [0, 0],
        [8050, 1.5],
        [13550, 3.2],
        [20550, 3.2],
        [24550, 4.3],
        [33550, 4.3],
        [41550, 4.7],
        [58550, 4.7],
        [74550, 4.9],
        [218050, 5.9],
      ],
    },
    married: {
      deduction: [],
      brackets: [
        [0, 0],
        [16100, 1.5],
        [24100, 3.2],
        [32100, 3.2],
        [41100, 4.3],
        [57100, 4.3],
        [66100, 4.7],
        [102100, 4.7],
        [116100, 4.9],
        [331100, 5.9],
      ],
    },
  },
  'New York': {
    single: {
      deduction: [
        ['standard deduction', 7400],
        ['allowance', 1000],
      ],
      brackets: [
        [0, 3.9],
        [8500, 4.4],
        [11700, 5.15],
        [13900, 5.4],
        [80650, 5.9],
        [96800, 7.03],
        [107650, 7.53],
        [157650, 6.4],
        [215400, 11.44],
        [265400, 7.35],
        [1077549.99, 10.45],
        [4999999.99, 11.1],
        [24999999.99, 11.7],
      ],
    },
    married: {
      deduction: [
        ['standard deduction', 7950],
        ['allowance', 1000, 2],
      ],
      brackets: [
        [0, 3.9],
        [8500, 4.4],
        [11700, 5.15],
        [13900, 5.4],
        [80650, 5.9],
        [96800, 6.57],
        [107650, 7.07],
        [157650, 8.01],
        [211550, 6.4],
        [323200, 13.49],
        [373200, 7.35],
        [1077550, 7.65],
        [2155349.99, 10.45],
        [4999999.99, 11.1],
        [24999999.99, 11.7],
      ],
    },
    notes:
      'The bulletin builds recapture into its rates (for example 11.44% from $215,400), and above $1,077,549.99 it taxes all income at one rate; both are entered as published, as marginal rates.',
  },
  'North Carolina': {
    single: flat(4.09, [
      ['standard deduction', 12750],
      ['allowance', 2500],
    ]),
    married: flat(4.09, [
      ['standard deduction', 12750],
      ['allowance', 2500, 2],
    ]),
  },
  'North Dakota': {
    single: {
      deduction: [],
      brackets: [
        [0, 0],
        [57625, 1.95],
        [258450, 2.5],
      ],
    },
    married: {
      deduction: [],
      brackets: [
        [0, 0],
        [57500, 1.95],
        [168525, 2.5],
      ],
    },
    notes:
      'Uses the tables for a federal W-4 dated 2020 or later, which have no exemption allowance.',
  },
  Ohio: {
    single: {
      deduction: [['exemption allowance', 650]],
      brackets: [
        [0, 1.6],
        [26050, 2.99],
        [100000, 3.4],
      ],
    },
    married: {
      deduction: [['exemption allowance', 650, 2]],
      brackets: [
        [0, 1.6],
        [26050, 2.99],
        [100000, 3.4],
      ],
    },
  },
  Oklahoma: {
    single: {
      deduction: [['exemption allowance', 1000]],
      brackets: [
        [0, 0],
        [10100, 2.5],
        [11250, 3.5],
        [13550, 4.5],
      ],
    },
    married: {
      deduction: [['exemption allowance', 1000, 2]],
      brackets: [
        [0, 0],
        [20200, 2.5],
        [22500, 3.5],
        [27100, 4.5],
      ],
    },
  },
  Oregon: {
    single: {
      deduction: [['standard deduction (single, under 3 exemptions)', 2910]],
      brackets: [
        [0, (678 / 11400) * 100, 678],
        [11400, 8.75],
        [125000, 9.9],
      ],
    },
    married: {
      deduction: [['standard deduction (married)', 5820]],
      brackets: [
        [0, (1357 / 22800) * 100, 1357],
        [22800, 8.75],
        [250000, 9.9],
      ],
    },
    notes:
      'Uses the tables for annualized wages of $50,000 or more. The federal-tax deduction phases to $0 above $144,999.99 (single) and $289,999.99 (married), so none is applied; the $263 exemption credit is not modeled. The first row shows "$0.00" but the next row implies a flat rate to the first floor.',
  },
  Pennsylvania: {
    ...both(flat(3.07)),
    notes:
      'The only bulletin NFC has on file is from February 2004 and states the 3.07% rate; there is no table.',
  },
  'Rhode Island': {
    single: {
      deduction: [['exemption amount', 1000]],
      brackets: [
        [0, 3.75],
        [82050, 4.75],
        [186450, 5.99],
      ],
    },
    married: {
      deduction: [['exemption amount', 1000, 2]],
      brackets: [
        [0, 3.75],
        [82050, 4.75],
        [186450, 5.99],
      ],
    },
  },
  'South Carolina': {
    single: {
      deduction: [
        ['standard deduction (capped amount)', 7500],
        ['personal exemption', 5000],
      ],
      brackets: [
        [0, 0],
        [3640, 3],
        [18230, 6],
      ],
    },
    married: {
      deduction: [
        ['standard deduction (capped amount)', 7500],
        ['personal exemption', 5000, 2],
      ],
      brackets: [
        [0, 0],
        [3640, 3],
        [18230, 6],
      ],
    },
    notes: 'The standard deduction is 10% of wages or $7,500, whichever is less; $7,500 is used.',
  },
  Utah: {
    ...both(flat(4.45)),
    notes: 'The withholding-allowance credit and its income reduction are not modeled.',
  },
  Vermont: {
    single: {
      deduction: [['allowance', 5400]],
      brackets: [
        [0, 0],
        [3925, 3.35],
        [54675, 6.6],
        [126775, 7.6],
        [260225, 8.75],
      ],
    },
    married: {
      deduction: [['allowance', 5400, 2]],
      brackets: [
        [0, 0],
        [11775, 3.35],
        [96475, 6.6],
        [216525, 7.6],
        [323825, 8.75],
      ],
    },
  },
  Virginia: {
    single: {
      deduction: [
        ['standard deduction', 8750],
        ['exemption', 930],
      ],
      brackets: [
        [0, 2],
        [3000, 3],
        [5000, 5],
        [17000, 5.75],
      ],
    },
    married: {
      deduction: [
        ['standard deduction', 8750],
        ['exemption', 930, 2],
      ],
      brackets: [
        [0, 2],
        [3000, 3],
        [5000, 5],
        [17000, 5.75],
      ],
    },
    notes: 'The bulletin subtracts one $8,750 standard deduction regardless of filing status.',
  },
  'West Virginia': {
    single: {
      deduction: [['exemption allowance', 2000]],
      brackets: [
        [0, 2.11],
        [10000, 2.81],
        [25000, 3.16],
        [40000, 4.22],
        [60000, 4.58],
      ],
    },
    married: {
      deduction: [['exemption allowance', 2000, 2]],
      brackets: [
        [0, 2.11],
        [10000, 2.81],
        [25000, 3.16],
        [40000, 4.22],
        [60000, 4.58],
      ],
    },
    notes: 'Uses the optional one-earner/one-job table (filing status N) for both.',
  },
  Wisconsin: {
    single: {
      deduction: [['exemption allowance', 400]],
      brackets: [
        [0, 3.54],
        [12760, 4.65],
        [25520, 5.3],
        [280950, 7.65],
      ],
    },
    married: {
      deduction: [['exemption allowance', 400, 2]],
      brackets: [
        [0, 3.54],
        [12760, 4.65],
        [25520, 5.3],
        [280950, 7.65],
      ],
    },
    notes:
      'Bulletin is from 2022. The standard deduction phases to $0 above $73,630 (single) and $73,032 (married), so none is applied. One tax table is published for both.',
  },
}

export const deductionTotal = (parts: readonly DeductionPart[]): number =>
  parts.reduce((sum, [, amount, count = 1]) => sum + amount * count, 0)

const describeDeduction = (parts: readonly DeductionPart[]): string =>
  parts.length === 0
    ? 'none'
    : parts
        .map(
          ([label, amount, count = 1]) =>
            `${label} $${amount.toLocaleString('en-US')}${count > 1 ? ` x ${count}` : ''}`,
        )
        .join(' + ')

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function toIsoDate(text: string): string {
  const match = /^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$/.exec(text.trim())
  const month = match ? MONTHS.indexOf((match[1] ?? '').toLowerCase()) : -1
  if (!match || month < 0) return text
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`
}

const rate = (percent: number) => Math.round(percent * 1e4) / 1e6

export function buildNfcSchedules(
  specs: Record<string, StateSpec>,
  codeByState: Record<string, string>,
  manifest: Record<string, { reference?: string; published?: string }>,
): Record<string, NfcSchedule> {
  const out: Record<string, NfcSchedule> = {}
  for (const state of Object.keys(specs).sort()) {
    const spec = specs[state]
    const code = codeByState[state]
    if (!spec || !code) continue
    const info = manifest[code] ?? {}
    const rows = (f: FilingSpec) =>
      f.brackets.map(([floor, percent]) => ({ floor, rate: rate(percent) }))
    out[state] = {
      no_tax: false,
      single: rows(spec.single),
      married_filing_jointly: rows(spec.married),
      single_standard_deduction: deductionTotal(spec.single.deduction),
      mfj_standard_deduction: deductionTotal(spec.married.deduction),
      single_deduction_basis: describeDeduction(spec.single.deduction),
      mfj_deduction_basis: describeDeduction(spec.married.deduction),
      source_md: `data/state-tax/${code}.md`,
      nfc_reference: info.reference ?? '',
      as_of_date: toIsoDate(info.published ?? ''),
      ...(spec.override ? { override_note: spec.override.reason } : {}),
    }
  }
  return out
}

// Dollar and percent figures that appear anywhere in a bulletin's text.
function figuresIn(markdown: string): { dollars: Set<number>; percents: Set<number> } {
  const dollars = new Set<number>()
  const percents = new Set<number>()
  for (const m of markdown.matchAll(/\$([\d,]+(?:\.\d+)?)/g))
    dollars.add(Number((m[1] ?? '').replace(/,/g, '')))
  for (const m of markdown.matchAll(/([\d.]+)\s*(?:%|percent)/g))
    percents.add(Math.round(Number(m[1]) * 1e4) / 1e4)
  return { dollars, percents }
}

// Everything in a spec that the bulletin does not actually print; empty means the transcription
// is backed by the source text.
export function unverifiedFigures(
  filing: FilingSpec,
  markdown: string,
  allowed: AllowedFigures = {},
): string[] {
  const { dollars, percents } = figuresIn(markdown)
  const missing: string[] = []
  for (const [label, amount] of filing.deduction) {
    if (!dollars.has(amount) && !allowed.dollars?.includes(amount)) {
      missing.push(`deduction ${label} $${amount}`)
    }
  }
  filing.brackets.forEach(([floor, percent, impliedBase], i) => {
    if (floor !== 0 && !dollars.has(floor)) missing.push(`floor $${floor}`)
    if (impliedBase !== undefined) {
      const nextFloor = filing.brackets[i + 1]?.[0] ?? 0
      if (!dollars.has(impliedBase)) missing.push(`base $${impliedBase}`)
      if (nextFloor === 0 || Math.abs(percent - (impliedBase / nextFloor) * 100) > 1e-6) {
        missing.push(`implied rate ${percent}% != $${impliedBase} / $${nextFloor}`)
      }
    } else if (
      percent !== 0 &&
      !allowed.percents?.includes(percent) &&
      !percents.has(Math.round(percent * 1e4) / 1e4)
    ) {
      missing.push(`rate ${percent}%`)
    }
  })
  return missing
}
