import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getLivescores,
  getLivescoresChanges,
  getEvents,
  getSchedule,
  getTeam,
  getLeague,
} from '../server/isports/client'

const TEST_KEY = 'test-key-xyz'

/* Capture every fetch call so we can assert on the URL. */
let calls: string[] = []
let savedFetch: typeof globalThis.fetch | undefined
let savedKey: string | undefined

function installFetchMock(body: unknown = { code: 0, message: 'success', data: [] }, status = 200) {
  calls = []
  const mock = vi.fn(async (url: string | URL | Request) => {
    calls.push(typeof url === 'string' ? url : url.toString())
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  globalThis.fetch = mock as unknown as typeof globalThis.fetch
  return mock
}

beforeEach(() => {
  savedFetch = globalThis.fetch
  savedKey = process.env.ISPORTS_API_KEY
  process.env.ISPORTS_API_KEY = TEST_KEY
})

afterEach(() => {
  if (savedFetch) globalThis.fetch = savedFetch
  if (savedKey !== undefined) process.env.ISPORTS_API_KEY = savedKey
  else delete process.env.ISPORTS_API_KEY
  vi.restoreAllMocks()
})

describe('iSports HTTP client', () => {
  it('throws when ISPORTS_API_KEY is missing', async () => {
    delete process.env.ISPORTS_API_KEY
    installFetchMock()
    await expect(getLivescores()).rejects.toThrow(/ISPORTS_API_KEY/)
  })

  it('getLivescores hits /livescores with api_key', async () => {
    installFetchMock()
    const res = await getLivescores()
    expect(calls).toHaveLength(1)
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/livescores')
    expect(url.searchParams.get('api_key')).toBe(TEST_KEY)
    expect(res).toEqual({ code: 0, message: 'success', data: [] })
  })

  it('getLivescoresChanges hits /livescores/changes', async () => {
    installFetchMock()
    await getLivescoresChanges()
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/livescores/changes')
    expect(url.searchParams.get('api_key')).toBe(TEST_KEY)
  })

  it('getEvents hits /events', async () => {
    installFetchMock()
    await getEvents()
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/events')
  })

  it('getSchedule with leagueId passes it through', async () => {
    installFetchMock()
    await getSchedule({ leagueId: '1572' })
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/schedule')
    expect(url.searchParams.get('leagueId')).toBe('1572')
    expect(url.searchParams.get('date')).toBeNull()
  })

  it('getSchedule with date passes it through', async () => {
    installFetchMock()
    await getSchedule({ date: '2026-06-11' })
    const url = new URL(calls[0])
    expect(url.searchParams.get('date')).toBe('2026-06-11')
    expect(url.searchParams.get('leagueId')).toBeNull()
  })

  it('getTeam encodes teamId', async () => {
    installFetchMock()
    await getTeam('819')
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/team')
    expect(url.searchParams.get('teamId')).toBe('819')
  })

  it('getLeague hits /league', async () => {
    installFetchMock()
    await getLeague()
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/sport/football/league')
  })

  it('parses the response envelope correctly', async () => {
    installFetchMock({ code: 0, message: 'ok', data: [{ matchId: 'm1' }] })
    const res = await getLivescores()
    expect(res.data).toEqual([{ matchId: 'm1' }])
    expect(res.code).toBe(0)
  })

  it('returns iSports application errors as data (does not throw)', async () => {
    installFetchMock({ code: 2, message: "haven't purchased", data: [] })
    const res = await getLivescores()
    expect(res.code).toBe(2)
    expect(res.data).toEqual([])
  })

  it('throws on non-2xx HTTP responses', async () => {
    installFetchMock({}, 500)
    await expect(getLivescores()).rejects.toThrow(/HTTP 500/)
  })

  it('throws on network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof globalThis.fetch
    await expect(getLivescores()).rejects.toThrow(/fetch failed.*ECONNREFUSED/)
  })
})
