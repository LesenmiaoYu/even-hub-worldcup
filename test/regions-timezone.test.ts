import { describe, it, expect } from 'vitest'
import {
  REGIONS,
  REGION_BY_IANA,
  REGION_BY_COUNTRY,
  ianaForCountry,
  DEFAULT_IANA,
  type RegionOption,
} from '../src/state/regions'

/* Regions + country-to-IANA mapping is the source of truth for the
 * Settings timezone picker and for the bridge.getUserInfo().country
 * fallback path. Bugs here surface as the wrong default zone for an
 * entire country (e.g. Vancouver users seeing Toronto time, or AU
 * users not being able to pick Sydney at all). */

const KNOWN_GROUPS = ['Europe', 'North America', 'South America', 'Asia', 'Oceania']

describe('REGIONS catalog integrity', () => {
  it('contains at least 150 entries (current ~157)', () => {
    expect(REGIONS.length).toBeGreaterThanOrEqual(150)
  })

  it('matches the expected catalog size (157) — drift guard', () => {
    /* If you intentionally add/remove regions, bump this. The number is
     * a regression tripwire, not a hard ceiling. */
    expect(REGIONS.length).toBe(157)
  })

  it('every entry has non-empty iana, label, country, group', () => {
    for (const r of REGIONS) {
      expect(r.iana, `iana for ${r.label}`).toBeTruthy()
      expect(r.label, `label for ${r.iana}`).toBeTruthy()
      expect(r.country, `country for ${r.iana}`).toBeTruthy()
      expect(r.group, `group for ${r.iana}`).toBeTruthy()
      expect(typeof r.iana).toBe('string')
      expect(typeof r.label).toBe('string')
      expect(typeof r.country).toBe('string')
      expect(typeof r.group).toBe('string')
    }
  })

  it('country codes are uppercase ISO 3166-1 alpha-2 (two letters)', () => {
    for (const r of REGIONS) {
      expect(r.country, `country for ${r.iana}`).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('every group is one of the known continent buckets', () => {
    for (const r of REGIONS) {
      expect(KNOWN_GROUPS, `group for ${r.iana}`).toContain(r.group)
    }
  })

  it('has no duplicate iana values', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const r of REGIONS) {
      if (seen.has(r.iana)) dupes.push(r.iana)
      seen.add(r.iana)
    }
    expect(dupes).toEqual([])
  })

  it('every iana is a valid identifier per Intl.DateTimeFormat', () => {
    for (const r of REGIONS) {
      expect(
        () => new Intl.DateTimeFormat('en-US', { timeZone: r.iana }),
        `iana ${r.iana}`,
      ).not.toThrow()
    }
  })
})

describe('REGION_BY_IANA lookup', () => {
  it('contains an entry for every REGIONS row', () => {
    for (const r of REGIONS) {
      expect(REGION_BY_IANA[r.iana], `lookup for ${r.iana}`).toBeDefined()
    }
  })

  it('lookup returns the same RegionOption object as in REGIONS', () => {
    for (const r of REGIONS) {
      const fromMap = REGION_BY_IANA[r.iana]
      expect(fromMap.iana).toBe(r.iana)
      expect(fromMap.country).toBe(r.country)
      expect(fromMap.group).toBe(r.group)
      expect(fromMap.label).toBe(r.label)
    }
  })

  it('returns undefined for an unknown iana', () => {
    expect(REGION_BY_IANA['Made/Up_Zone']).toBeUndefined()
    expect(REGION_BY_IANA['']).toBeUndefined()
  })

  it('size matches the number of distinct iana values in REGIONS', () => {
    const distinct = new Set(REGIONS.map(r => r.iana)).size
    expect(Object.keys(REGION_BY_IANA).length).toBe(distinct)
  })
})

describe('REGION_BY_COUNTRY lookup', () => {
  it('every country code maps to a region whose country matches', () => {
    for (const [country, region] of Object.entries(REGION_BY_COUNTRY)) {
      expect(region.country, `country key ${country}`).toBe(country)
    }
  })

  it('every country appearing in REGIONS is reachable via REGION_BY_COUNTRY', () => {
    const countries = new Set(REGIONS.map(r => r.country))
    for (const c of countries) {
      expect(REGION_BY_COUNTRY[c], `country ${c} missing from REGION_BY_COUNTRY`).toBeDefined()
    }
  })

  it('multi-zone countries default to their primary commercial/capital zone', () => {
    /* Order in REGIONS matters — first entry wins. These pick-firsts are
     * the documented contract in the source comment. */
    const expectations: Record<string, string> = {
      US: 'America/New_York',
      CA: 'America/Toronto',
      AU: 'Australia/Sydney',
      RU: 'Europe/Moscow',
      BR: 'America/Sao_Paulo',
      MX: 'America/Mexico_City',
    }
    for (const [country, iana] of Object.entries(expectations)) {
      expect(REGION_BY_COUNTRY[country]?.iana, `${country} default`).toBe(iana)
    }
  })

  it('country count equals distinct countries in REGIONS', () => {
    const distinct = new Set(REGIONS.map(r => r.country)).size
    expect(Object.keys(REGION_BY_COUNTRY).length).toBe(distinct)
  })
})

describe('ianaForCountry()', () => {
  it('returns the right iana for every known country', () => {
    for (const [country, region] of Object.entries(REGION_BY_COUNTRY)) {
      expect(ianaForCountry(country)).toBe(region.iana)
    }
  })

  it('accepts lowercase country codes (uppercased internally)', () => {
    expect(ianaForCountry('us')).toBe('America/New_York')
    expect(ianaForCountry('fr')).toBe('Europe/Paris')
    expect(ianaForCountry('jp')).toBe('Asia/Tokyo')
  })

  it('accepts mixed-case country codes', () => {
    expect(ianaForCountry('Us')).toBe('America/New_York')
    expect(ianaForCountry('gB')).toBe('Europe/London')
  })

  it('returns null for null input', () => {
    /* Source: `if (!country) return null`. */
    expect(ianaForCountry(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(ianaForCountry(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(ianaForCountry('')).toBeNull()
  })

  it('returns null for an unknown country code', () => {
    /* Source: `return r?.iana ?? null`. */
    expect(ianaForCountry('ZZ')).toBeNull()
    expect(ianaForCountry('XX')).toBeNull()
  })
})

describe('DEFAULT_IANA', () => {
  it('is America/New_York', () => {
    expect(DEFAULT_IANA).toBe('America/New_York')
  })

  it('appears in REGIONS', () => {
    const match = REGIONS.find(r => r.iana === DEFAULT_IANA)
    expect(match).toBeDefined()
  })

  it('is reachable via REGION_BY_IANA', () => {
    expect(REGION_BY_IANA[DEFAULT_IANA]).toBeDefined()
    expect(REGION_BY_IANA[DEFAULT_IANA].country).toBe('US')
  })

  it('is a valid Intl identifier', () => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_IANA })).not.toThrow()
  })
})

describe('group coverage', () => {
  it.each(KNOWN_GROUPS)('has at least one entry for group %s', (group) => {
    const entries = REGIONS.filter(r => r.group === group)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('Europe has the major Western European capitals', () => {
    const europe = REGIONS.filter(r => r.group === 'Europe').map(r => r.iana)
    for (const iana of ['Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome']) {
      expect(europe, `Europe missing ${iana}`).toContain(iana)
    }
  })

  it('Asia has the major commercial zones', () => {
    const asia = REGIONS.filter(r => r.group === 'Asia').map(r => r.iana)
    for (const iana of ['Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Dubai']) {
      expect(asia, `Asia missing ${iana}`).toContain(iana)
    }
  })

  it('South America has the major continental capitals', () => {
    const sa = REGIONS.filter(r => r.group === 'South America').map(r => r.iana)
    for (const iana of [
      'America/Argentina/Buenos_Aires',
      'America/Sao_Paulo',
      'America/Santiago',
      'America/Bogota',
      'America/Lima',
    ]) {
      expect(sa, `South America missing ${iana}`).toContain(iana)
    }
  })
})

describe('Oceania coverage (regression for missing-AU-tz bug)', () => {
  const oceania = (): RegionOption[] => REGIONS.filter(r => r.group === 'Oceania')

  it.each([
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Pacific/Auckland',
  ])('includes %s in Oceania', (iana) => {
    expect(oceania().map(r => r.iana)).toContain(iana)
  })

  it('Sydney is the AU default (first AU entry wins)', () => {
    expect(REGION_BY_COUNTRY['AU']?.iana).toBe('Australia/Sydney')
    expect(ianaForCountry('AU')).toBe('Australia/Sydney')
  })

  it('Auckland is the NZ default', () => {
    expect(REGION_BY_COUNTRY['NZ']?.iana).toBe('Pacific/Auckland')
    expect(ianaForCountry('NZ')).toBe('Pacific/Auckland')
  })
})

describe('North America Canadian coverage (regression for missing-Vancouver bug)', () => {
  const ca = (): RegionOption[] => REGIONS.filter(r => r.country === 'CA')

  it.each([
    'America/Toronto',
    'America/Vancouver',
    'America/Edmonton',
    'America/Winnipeg',
    'America/Halifax',
  ])('includes %s for Canada', (iana) => {
    expect(ca().map(r => r.iana)).toContain(iana)
  })

  it('Toronto is the CA default (first CA entry wins)', () => {
    expect(REGION_BY_COUNTRY['CA']?.iana).toBe('America/Toronto')
    expect(ianaForCountry('CA')).toBe('America/Toronto')
  })

  it('all Canadian entries are grouped under North America', () => {
    for (const r of ca()) {
      expect(r.group, `${r.iana} group`).toBe('North America')
    }
  })
})

describe('United States coverage', () => {
  const us = (): RegionOption[] => REGIONS.filter(r => r.country === 'US')

  it.each([
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ])('includes %s for US', (iana) => {
    expect(us().map(r => r.iana)).toContain(iana)
  })

  it('New York is the US default (first US entry wins)', () => {
    expect(REGION_BY_COUNTRY['US']?.iana).toBe('America/New_York')
    expect(ianaForCountry('US')).toBe('America/New_York')
  })
})
