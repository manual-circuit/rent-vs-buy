export { computeScenario } from './compute'
export { EngineInputError, MAX_HORIZON_YEARS } from './types'
export { FEDERAL_TAX_AS_OF_DATE, computeCapitalGainsTax } from './tax'
export type {
  ScenarioInput,
  ScenarioResult,
  OwnershipInput,
  RentalInput,
  SharedInput,
  TaxInput,
  FilingStatus,
  MonthlyRow,
  YearlySummary,
  ScenarioTotals,
  Verdict,
  SaleDisposition,
} from './types'
export type { TaxBenefitBreakdown, CapitalGainsBreakdown } from './tax'
