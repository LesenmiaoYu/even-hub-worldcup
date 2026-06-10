import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AddressInfo } from 'node:net'
import http from 'node:http'
import { createApp, closeApp, type AppHandle } from '../server/app'
import { MatchStore, type Delta } from '../server/state'

/* Spin up a real HTTP server (random free port) for the duration of this
 * file. Each test reuses the same listener — they only mutate the store
 * in known-isolated ways. Heartbeat is sped up to avoid any 15s wait
 * before the connection cleans up at teardown. */

let store: MatchStore
let handle: AppHandle
let baseUrl: string

beforeAll(async () => {
  store = new MatchStore()
  handle = createApp({ store, heartbeatMs: 1000 })
  await new Promise<void>(resolve => handle.server.listen(0, '127.0.0.1', resolve))
  const addr = handle.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await closeApp(handle)
})

/* Tiny SSE consumer — opens GET /events, parses `event:` + `data:`
 * frames, exposes a `nextEvent(predicate)` that resolves on the first
 * frame matching the predicate (with a short timeout so a missing
 * delta fails the test instead of hanging forever). */
function openSse(url: string): {
  nextEvent: (
    predicate: (event: string, data: unknown) => boolean,
    timeoutMs?: number,
  ) => Promise<{ event: string; data: unknown }>
  close: () => void
} {
  const req = http.get(url)
  const queue: Array<{ event: string; data: unknown }> = []
  const waiters: Array<(ev: { event: string; data: unknown }) => void> = []
  let buffer = ''
  let pendingEvent = 'message'

  req.on('response', res => {
    res.setEncoding('utf8')
    res.on('data', chunk => {
      buffer += chunk
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
          const waiter = waiters.shift()
          if (waiter) waiter(item)
          else queue.push(item)
        }
      }
    })
  })

  return {
    nextEvent(predicate, timeoutMs = 1000) {
      return new Promise((resolve, reject) => {
        /* Drain anything already queued. */
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
    close() {
      req.destroy()
    },
  }
}

describe('GET /health', () => {
  it('returns 200 and ok:true', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.uptimeSec).toBe('number')
  })

  it('exposes CORS headers', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('OPTIONS preflight', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await fetch(`${baseUrl}/events`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('GET /events (SSE)', () => {
  it('streams a snapshot event within 500ms of connect (empty initial)', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      const snap = await sse.nextEvent(ev => ev === 'snapshot', 500)
      expect(snap.event).toBe('snapshot')
      const data = snap.data as { matches: Array<{ id: string }> }
      expect(Array.isArray(data.matches)).toBe(true)
      expect(data.matches.length).toBe(0)
    } finally {
      sse.close()
    }
  })

  it('streams a delta after a store mutation', async () => {
    const sse = openSse(`${baseUrl}/events`)
    try {
      await sse.nextEvent(ev => ev === 'snapshot', 500)
      store.replaceAll([{
        id: 't1', stage: 'QF', home: 'ARG', away: 'BRA',
        homeScore: null, awayScore: null,
        homePenalty: null, awayPenalty: null,
        minute: null, state: 'scheduled',
        kickoffOffsetMin: 60, events: [],
      }])
      const reset = await sse.nextEvent(
        (ev, data) => ev === 'delta' && (data as Delta).type === 'reset',
        500,
      )
      expect((reset.data as Delta).type).toBe('reset')
    } finally {
      sse.close()
    }
  })
})

describe('404 fallthrough', () => {
  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${baseUrl}/nope`)
    expect(res.status).toBe(404)
  })
})
