import type { ScenarioInput } from '../engine'
import { ScenarioInputSchema } from './schema'

export function encode(input: ScenarioInput): string {
  return btoa(encodeURIComponent(JSON.stringify(input)))
}

// Writes the scenario into the address bar so the page can be shared or reloaded. Browsers
// rate-limit history.replaceState (mobile Safari throws a SecurityError after 100 calls in 30
// seconds), and an error thrown from an effect unmounts the whole app, so a failed write is
// swallowed: the calculator keeps working and the next write simply tries again.
export function writeStateToUrl(input: ScenarioInput): boolean {
  const next = `?s=${encode(input)}`
  if (window.location.search === next) return true
  try {
    window.history.replaceState(null, '', next)
    return true
  } catch {
    return false
  }
}

export function decode(raw: string): ScenarioInput | null {
  try {
    const json = decodeURIComponent(atob(raw))
    const parsed: unknown = JSON.parse(json)
    const result = ScenarioInputSchema.safeParse(parsed)
    if (result.success) {
      // ValidatedScenarioInput is structurally identical to ScenarioInput
      return result.data as ScenarioInput
    }
    return null
  } catch {
    return null
  }
}
