import { describe, it, expect } from 'vitest'
import { encode, decode } from '../url-state'
import { DEFAULT_INPUT } from '../defaults'

describe('encode / decode', () => {
  it('round-trips DEFAULT_INPUT', () => {
    const result = decode(encode(DEFAULT_INPUT))
    expect(result).toEqual(DEFAULT_INPUT)
  })

  it('round-trips with non-default values', () => {
    const custom = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: 750000 },
      rental: { ...DEFAULT_INPUT.rental, base_rent_monthly: 3200 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 15 },
    }
    const result = decode(encode(custom))
    expect(result).toEqual(custom)
  })

  it('returns null for empty string', () => {
    expect(decode('')).toBeNull()
  })

  it('returns null for valid base64 that decodes to non-JSON', () => {
    const notJson = btoa(encodeURIComponent('not valid json {{{'))
    expect(decode(notJson)).toBeNull()
  })

  it('returns null for valid JSON failing schema validation (horizon_years: 0)', () => {
    const bad = { ...DEFAULT_INPUT, shared: { ...DEFAULT_INPUT.shared, horizon_years: 0 } }
    const encoded = btoa(encodeURIComponent(JSON.stringify(bad)))
    expect(decode(encoded)).toBeNull()
  })

  it('returns null for valid JSON with null field', () => {
    const bad = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: null },
    }
    const encoded = btoa(encodeURIComponent(JSON.stringify(bad)))
    expect(decode(encoded)).toBeNull()
  })

  it('does not throw for any failure case', () => {
    expect(() => decode('')).not.toThrow()
    expect(() => decode('not-base64!!!')).not.toThrow()
    expect(() => decode(btoa(encodeURIComponent('{}')))).not.toThrow()
  })
})

describe('decode: sale disposition and the 30-year horizon cap', () => {
  const encodeRaw = (obj: unknown) => btoa(encodeURIComponent(JSON.stringify(obj)))

  it('a link made before the disposition field existed loads as sell', () => {
    const { sale_disposition: _omit, ...legacyOwnership } = DEFAULT_INPUT.ownership
    const legacy = { ...DEFAULT_INPUT, ownership: legacyOwnership }
    const result = decode(encodeRaw(legacy))
    expect(result?.ownership.sale_disposition).toBe('sell')
    expect(result).toEqual(DEFAULT_INPUT)
  })

  it('keep survives a round trip', () => {
    const keep = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, sale_disposition: 'keep' as const },
    }
    expect(decode(encode(keep))?.ownership.sale_disposition).toBe('keep')
  })

  it('rejects an unknown disposition value', () => {
    const bad = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, sale_disposition: 'rent-out' },
    }
    expect(decode(encodeRaw(bad))).toBeNull()
  })

  it('a link with a 40-year horizon loads at 30 with every other input preserved', () => {
    const old = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: 725000 },
      rental: { ...DEFAULT_INPUT.rental, base_rent_monthly: 3100 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 40 },
    }
    const result = decode(encodeRaw(old))
    expect(result).toEqual({ ...old, shared: { ...old.shared, horizon_years: 30 } })
  })

  it('a horizon of exactly 30 is left alone', () => {
    const at30 = { ...DEFAULT_INPUT, shared: { ...DEFAULT_INPUT.shared, horizon_years: 30 } }
    expect(decode(encodeRaw(at30))?.shared.horizon_years).toBe(30)
  })

  it('clamping a long horizon does not rescue a link that is otherwise invalid', () => {
    const bad = {
      ...DEFAULT_INPUT,
      ownership: { ...DEFAULT_INPUT.ownership, purchase_price: -1 },
      shared: { ...DEFAULT_INPUT.shared, horizon_years: 40 },
    }
    expect(decode(encodeRaw(bad))).toBeNull()
  })

  it('a non-numeric horizon is still rejected, not clamped', () => {
    const bad = { ...DEFAULT_INPUT, shared: { ...DEFAULT_INPUT.shared, horizon_years: 'forty' } }
    expect(decode(encodeRaw(bad))).toBeNull()
  })
})
