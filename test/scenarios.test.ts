import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MatchStore } from '../server/state'
import { LIVE_TICK } from '../server/seed'
import { Store as ClientStore } from '../src/state/store'
import { hasShootout } from '../src/g2/format'

/* These scenarios wire the server MatchStore straight into the client
 * Store via the SSE delta protocol — bypassing the HTTP layer keeps the
 * scenario assertions focused on data flow + fake-timer behavior, which
 * the HTTP file already covers from the other end. */

function bridge(server: MatchStore, client: ClientStore): () => void {
  client.replaceAll(JSON.parse(JSON.stringify(server.getAll())))
  return server.subscribe(delta => client.applyDelta(delta))
}

let server: MatchStore
let client: ClientStore
let unsub: (() => void) | null = null

beforeEach(() => {
  server = new MatchStore()
  client = new ClientStore()
})

afterEach(() => {
  unsub?.()
  unsub = null
  vi.useRealTimers()
})

describe('Scenario A: live game full arc', () => {
  it('start_live → ticks to FT → bracket-resolved delta repopulates Final.home', () => {
    vi.useFakeTimers()
    unsub = bridge(server, client)

    server.startLive('sf1')

    /* The reset delta carries the sf1 snapshot — client mirrors live
     * state immediately. (The server also clears its own final.home as
     * a side effect of startLive but does NOT emit a bracket delta for
     * that clear; the client side stays at the bridge-time value until
     * a real bracket-resolved delta arrives at FT.) */
    expect(client.get('sf1')!.state).toBe('live')
    expect(client.get('sf1')!.minute).toBe(1)
    expect(client.get('sf1')!.homeScore).toBe(0)
    expect(client.get('sf1')!.awayScore).toBe(0)

    /* Wipe client.final.home locally so the post-FT bracket-resolved
     * delta is the ONLY thing that could legitimately restore it. */
    client.get('final')!.home = null

    /* Advance through the full scripted 94 minutes. */
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 100)

    expect(client.get('sf1')!.state).toBe('ft')
    expect(client.get('final')!.home).not.toBeNull()
  })
})

describe('Scenario B: penalty UI visibility on default seed', () => {
  it('QF4 has shootout and Final.home is seeded as ARG', () => {
    unsub = bridge(server, client)
    expect(hasShootout(client.get('qf4')!)).toBe(true)
    expect(hasShootout(client.get('sf1')!)).toBe(true)
    expect(client.get('final')!.home).toBe('ARG')
  })
})

describe('Scenario C: substitution propagation', () => {
  it('after start_live + tick past minute 65, a sub event is in the client store', () => {
    vi.useFakeTimers()
    unsub = bridge(server, client)
    server.startLive('sf1')
    /* Minute 65 is the first scripted sub. Tick a bit past to be safe. */
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 66)
    const subs = client.get('sf1')!.events.filter(e => e.type === 'sub')
    expect(subs.length).toBeGreaterThan(0)
    /* iSports models a sub as a single event with both names. */
    expect(subs[0]!.playerIn).toBeTruthy()
  })
})
