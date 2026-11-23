import { describe, it, expect } from 'vitest'
import { REFERENCES, REFERENCE_GROUPS } from '../references'

describe('REFERENCES', () => {
  it('has unique ids', () => {
    const ids = REFERENCES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has a name, what it supplies and an as-of note', () => {
    for (const r of REFERENCES) {
      expect(r.name.trim().length).toBeGreaterThan(0)
      expect(r.supplies.trim().length).toBeGreaterThan(0)
      expect(r.asOf.trim().length).toBeGreaterThan(0)
    }
  })

  it('every link is https and parses as a URL', () => {
    for (const r of REFERENCES) {
      const url = new URL(r.url)
      expect(url.protocol).toBe('https:')
    }
  })

  it('every entry belongs to a known group, and every group has an entry', () => {
    for (const r of REFERENCES) expect(REFERENCE_GROUPS).toContain(r.group)
    for (const g of REFERENCE_GROUPS) expect(REFERENCES.some((r) => r.group === g)).toBe(true)
  })

  it('lists the spreadsheet sources the state data is built from', () => {
    const hosts = REFERENCES.map((r) => new URL(r.url).hostname)
    expect(hosts).toContain('taxfoundation.org')
    expect(hosts).toContain('itep.org')
    expect(hosts).toContain('help.nfc.usda.gov')
  })
})
