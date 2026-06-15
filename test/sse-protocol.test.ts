import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import http from 'node:http'
import { createApp, closeApp, type AppHandle } from '../server/app'
import { MatchStore, type Delta } from '../server/state'
import type { Match } from '../server/types'

/* Single shared HTTP listener for the suite. Each test resets the store
 * (via replaceAll([])) at the start of beforeEach so cross-test pollution
 * is impossible. heartbeatMs is short so the heartbeat case can assert
 * an actual `: ping` comment without waiting 15s. */

let store: MatchStore
let handle: AppHandle
let baseUrl: string
const HEARTBEAT_MS = 100

beforeAll(async () => {
  store = new MatchStore()
  handle = createApp({ store, heartbeatMs: HEARTBEAT_MS })
  await new Promise<void>(resolve => handle.server.listen(0, '127.0.0.1', resolve))
  const addr = handle.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await closeApp(handle)
})

beforeEach(() => {
  /* Wipe between tests. replaceAll([]) leaves the listener set intact —
   * any leftover SSE subscribers from prior tests should already have
   * been .close()d in those tests' finally blocks. */
  store.replaceAll([])
})

function mkMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: overrides.id ?? 'm1',
    stage: overrides.stage ?? 'QF',
    home: overrides.home ?? 'ARG',
    away: overrides.away ?? 'BRA',
    homeScore: overrides.homeScore ?? null,
    awayScore: overrides.awayScore ?? null,
    homePenalty: overrides.homePenalty ?? null,
    awayPenalty: overrides.awayPenalty ?? null,
    minute: overrides.minute ?? null,
    state: overrides.state ?? 'scheduled',
    kickoffOffsetMin: overrides.kickoffOffsetMin ?? 60,
    events: overrides.events ?? [],
    ...overrides,
  }
}

/* Raw-buffer SSE consumer. Unlike server-http.test.ts's helper this
 * exposes the unparsed buffer too — heartbeat assertions need to see
 * comment lines (`: ping`) that aren't event frames. */
interface SseClient {
  nextEvent(
    predicate: (event: string, data: unknown) => boolean,
    timeoutMs?: number,
  ): Promise<{ event: string; data: unknown }>
  waitForRaw(predicate: (raw: string) => boolean, timeoutMs?: number): Promise<string>
  rawBuffer(): string
  response(): Promise<http.IncomingMessage>
  close(): void
  events: Array<{ event: string; data: unknown }>
}

function openSse(url: string): SseClient {
  const req = http.get(url)
  const queue: Array<{ event: string; data: unknown }> = []
  const waiters: Array<(ev: { event: string; data: unknown }) => void> = []
  const events: Array<{ event: string; data: unknown }> = []
  let raw = ''
  let buffer = ''
  let pendingEvent = 'message'
  let resolveResponse: (r: http.IncomingMessage) => void
  const responsePromise = new Promise<http.IncomingMessage>(res => { resolveResponse = res })
  const rawWaiters: Array<() => void> = []

  req.on('response', res => {
    resolveResponse(res)
    res.setEncoding('utf8')
    res.on('data', chunk => {
      raw += chunk
      buffer += chunk
      for (const cb of rawWaiters.splice(0)) cb()
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const lines = frame.split('\n')
        let ev = pendingEvent
        let dataLine: string | null = null
        for (const ln of lines) {
          if (ln.startsWith('event: ')) ev = ln.slice(7).trim()
          else if (ln.startsWith('data: ')) dataLine = ln.slice(6)
        }
        if (dataLine !== null) {
          let parsed: unknown
          try {
            parsed = JSON.parse(dataLine)
          } catch {
            parsed = dataLine
          }
          const item = { event: ev, data: parsed }
          events.push(item)
          const waiter = waiters.shift()
          if (waiter) waiter(item)
          else queue.push(item)
        }
      }
    })
  })

  return {
    events,
    response: () => responsePromise,
    rawBuffer: () => raw,
    nextEvent(predicate, timeoutMs = 1000) {
      return new Promise((resolve, reject) => {
        const idx = queue.findIndex(q => predicate(q.event, q.data))
        if (idx >= 0) {
          const [item] = queue.splice(idx, 1)
          resolve(item!)
          return
        }
        const timer = setTimeout(() => {
          reject(new Error('nextEvent timeout'))
        }, timeoutMs)
        waiters.push(item => {
          if (!predicate(item.event, item.data)) return
          clearTimeout(timer)
          resolve(item)
        })
      })
    },
    waitForRaw(predicate, timeoutMs = 1000) {
      return new Promise((resolve, reject) => {
        if (predicate(raw)) { resolve(raw); return }
        const timer = setTimeout(() => {
          reject(new Error('waitForRaw timeout'))
        }, timeoutMs)
        const check = () => {
          if (predicate(raw)) {
            clearTimeout(timer)
            resolve(raw)
          } else {
            rawWaiters.push(check)
          }
        }
        rawWaiters.push(check)
      })
    },
    close() { req.destroy() },
  }
}

/* Small helper: wait until the server reports `n` active subscribers via
 * the store's internal listener count. We don't read internals — instead
 * we just poll the store via a dummy subscription side-effect: every
 * SSE connect subscribes synchronously inside handleEvents. So we
 * approximate by waiting for the snapshot frame on each client. */
async function awaitSnapshot(c: SseClient): Promise<void> {
  await c.nextEvent(ev => ev === 'snapshot', 1000)
}

describe('SSE protocol: snapshot frame', () => {
  it('emits a snapshot with the full match list when the store is populated', async () => {
    store.replaceAll([
      mkMatch({ id: 'm1', stage: 'QF', home: 'ARG', away: 'BRA' }),
      mkMatch({ id: 'm2', stage: 'SF', home: 'FRA', away: 'GER' }),
    ])
    const sse = openSse(`${baseUrl}/events`)
    try {
      const snap = await sse.nextEvent(ev => ev === 'snapshot', 1000)
      expect(snap.event).toBe('snapshot')
      const data = snap.data as { matches: Match[] }
      expect(Array.isArray(data.matches)).toBe(true)
      expect(data.matches.length).toBe(2)
      const ids = data.matches.map(m => m.id).sort()
      expect(ids).toEqual(['m1', 'm2'])
    } finally {
      sse.close()
    }
  })

  it('emits a snapshot with matches=[] when the store is empty', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      const snap = await sse.nextEvent(ev => ev === 'snapshot', 1000)
      expect(snap.event).toBe('snapshot')
      const data = snap.data as { matches: Match[] }
      expect(data.matches).toEqual([])
    } finally {
      sse.close()
    }
  })
})

describe('SSE protocol: delta after connect', () => {
  it('streams a delta to a subscribed client when the store mutates', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      await awaitSnapshot(sse)
      store.replaceAll([mkMatch({ id: 'mx' })])
      const delta = await sse.nextEvent(
        (ev, data) => ev === 'delta' && (data as Delta).type === 'reset',
        1000,
      )
      const payload = delta.data as Delta
      expect(payload.type).toBe('reset')
      if (payload.type === 'reset') {
        expect(payload.matchId).toBe('mx')
        expect(payload.match.id).toBe('mx')
      }
    } finally {
      sse.close()
    }
  })

  it('emits a minute delta when only minute changes on an existing match', async () => {
    store.replaceAll([mkMatch({ id: 'm-min', minute: 10, state: 'live' })])
    const sse = openSse(`${baseUrl}/events`)
    try {
      await awaitSnapshot(sse)
      store.patchLivescore('m-min', { minute: 11 })
      const delta = await sse.nextEvent(
        (ev, data) => ev === 'delta' && (data as Delta).type === 'minute',
        1000,
      )
      const payload = delta.data as Delta
      if (payload.type === 'minute') {
        expect(payload.matchId).toBe('m-min')
        expect(payload.minute).toBe(11)
      }
    } finally {
      sse.close()
    }
  })
})

describe('SSE protocol: multiple concurrent clients', () => {
  it('broadcasts the same delta to every connected client', async () => {
    const clients = [
      openSse(`${baseUrl}/events`),
      openSse(`${baseUrl}/events`),
      openSse(`${baseUrl}/events`),
    ]
    try {
      await Promise.all(clients.map(awaitSnapshot))
      store.replaceAll([mkMatch({ id: 'broadcast-1' })])
      const deltas = await Promise.all(
        clients.map(c =>
          c.nextEvent(
            (ev, data) => ev === 'delta' && (data as Delta).type === 'reset',
            1000,
          ),
        ),
      )
      for (const d of deltas) {
        const payload = d.data as Delta
        expect(payload.type).toBe('reset')
        if (payload.type === 'reset') {
          expect(payload.matchId).toBe('broadcast-1')
        }
      }
    } finally {
      for (const c of clients) c.close()
    }
  })

  it('each client receives its own independent snapshot at connect time', async () => {
    store.replaceAll([mkMatch({ id: 'snap-a' })])
    const c1 = openSse(`${baseUrl}/events`)
    try {
      const snap1 = await c1.nextEvent(ev => ev === 'snapshot', 1000)
      expect((snap1.data as { matches: Match[] }).matches[0]!.id).toBe('snap-a')

      /* Mutate, then a second client connects — it must get the NEW
       * snapshot (snap-b), not the prior snapshot. */
      store.replaceAll([mkMatch({ id: 'snap-b' })])
      /* Drain c1's reset delta so the buffer doesn't fill. */
      await c1.nextEvent((ev, data) => ev === 'delta' && (data as Delta).type === 'reset', 1000)

      const c2 = openSse(`${baseUrl}/events`)
      try {
        const snap2 = await c2.nextEvent(ev => ev === 'snapshot', 1000)
        expect((snap2.data as { matches: Match[] }).matches[0]!.id).toBe('snap-b')
      } finally {
        c2.close()
      }
    } finally {
      c1.close()
    }
  })
})

describe('SSE protocol: CORS preflight', () => {
  it('returns 204 with Access-Control-Allow-Origin/Methods/Headers', async () => {
    const res = await fetch(`${baseUrl}/events`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toMatch(/GET/)
    expect(res.headers.get('access-control-allow-methods')).toMatch(/OPTIONS/)
    expect(res.headers.get('access-control-allow-headers')).toMatch(/Content-Type/i)
  })
})

describe('SSE protocol: /health', () => {
  it('returns ok:true with a numeric uptimeSec and JSON content-type', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.uptimeSec).toBe('number')
    expect(Number.isFinite(body.uptimeSec)).toBe(true)
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0)
  })
})

describe('SSE protocol: disconnect cleanup', () => {
  it('does not throw or leak when the store mutates after a client closes', async () => {
    const sse = openSse(`${baseUrl}/events`)
    await awaitSnapshot(sse)
    sse.close()
    /* Give the server a tick to process the socket close. */
    await new Promise(r => setTimeout(r, 50))

    /* Mutate — if the listener wasn't removed, the SSE write would
     * throw on a dead socket. We don't expect that error to surface in
     * this test process (the server swallows listener errors), but the
     * mutation itself must not throw. */
    expect(() => {
      store.replaceAll([mkMatch({ id: 'after-close' })])
    }).not.toThrow()
  })

  it('one client closing does not stop deltas reaching other clients', async () => {
    const survivor = openSse(`${baseUrl}/events`)
    const doomed = openSse(`${baseUrl}/events`)
    try {
      await awaitSnapshot(survivor)
      await awaitSnapshot(doomed)
      doomed.close()
      await new Promise(r => setTimeout(r, 50))

      store.replaceAll([mkMatch({ id: 'survives' })])
      const delta = await survivor.nextEvent(
        (ev, data) => ev === 'delta' && (data as Delta).type === 'reset',
        1000,
      )
      const payload = delta.data as Delta
      if (payload.type === 'reset') {
        expect(payload.matchId).toBe('survives')
      }
    } finally {
      survivor.close()
    }
  })
})

describe('SSE protocol: heartbeat', () => {
  it('emits `: ping` comment frames at the configured interval', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      await awaitSnapshot(sse)
      /* Heartbeat is HEARTBEAT_MS (100ms). Wait up to ~500ms for one. */
      await sse.waitForRaw(raw => raw.includes(': ping'), 1000)
      expect(sse.rawBuffer()).toContain(': ping')
    } finally {
      sse.close()
    }
  })
})

describe('SSE protocol: bad route', () => {
  it('returns 404 for an unknown path', async () => {
    const res = await fetch(`${baseUrl}/unknown`)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns 404 for an unknown method on /events', async () => {
    const res = await fetch(`${baseUrl}/events`, { method: 'POST' })
    expect(res.status).toBe(404)
  })
})

describe('SSE protocol: response headers', () => {
  it('sets text/event-stream, no-cache, and X-Accel-Buffering: no', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      const res = await sse.response()
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/event-stream/)
      expect(String(res.headers['cache-control'])).toMatch(/no-cache/)
      expect(res.headers['x-accel-buffering']).toBe('no')
      expect(res.headers['access-control-allow-origin']).toBe('*')
      expect(String(res.headers['connection']).toLowerCase()).toBe('keep-alive')
    } finally {
      sse.close()
    }
  })

  it('emits a `retry:` hint before the first event', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      await sse.waitForRaw(raw => raw.includes('retry:'), 1000)
      expect(sse.rawBuffer()).toMatch(/^retry: \d+/)
    } finally {
      sse.close()
    }
  })
})
