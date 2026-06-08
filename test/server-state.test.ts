import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MatchStore, type Delta } from '../server/state'
import { LIVE_TICK } from '../server/seed'

let store: MatchStore

beforeEach(() => {
  store = new MatchStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MatchStore initial snapshot', () => {
  it('seeds QF1-4 as FT and SF1 as FT', () => {
    const ids = ['qf1', 'qf2', 'qf3', 'qf4', 'sf1']
    for (const id of ids) {
      expect(store.get(id)?.state, `${id}.state`).toBe('ft')
    }
  })

  it('QF4 (ESP-POR) carries a penalty shootout', () => {
    const qf4 = store.get('qf4')!
    expect(qf4.homeScore).toBe(2)
    expect(qf4.awayScore).toBe(2)
    expect(qf4.homePenalty).toBe(3)
    expect(qf4.awayPenalty).toBe(4)
  })

  it('SF1 is the ARG-FRA 3-3 (4-2p) seed and feeds Final.home directly', () => {
    const sf1 = store.get('sf1')!
    expect(sf1.home).toBe('ARG')
    expect(sf1.away).toBe('FRA')
    expect(sf1.homePenalty).toBe(4)
    expect(sf1.awayPenalty).toBe(2)
    expect(store.get('final')!.home).toBe('ARG')
  })

  it('SF2, third, final are scheduled with no scores', () => {
    for (const id of ['sf2', 'third', 'final']) {
      const m = store.get(id)!
      expect(m.state, `${id}.state`).toBe('scheduled')
      expect(m.homeScore, `${id}.homeScore`).toBeNull()
    }
  })
})

describe('MatchStore broadcast', () => {
  it('applyEvent emits an event-applied delta with the full match', () => {
    /* sf1 has to be live for the tick path, but applyEvent itself
     * doesn't care about state — push the event directly. */
    const sf1 = store.get('sf1')!
    sf1.state = 'live'
    sf1.minute = 10
    sf1.homeScore = 0
    sf1.awayScore = 0

    const seen: Delta[] = []
    store.subscribe(d => seen.push(d))
    store.applyEvent('sf1', { minute: 11, type: 'goal', side: 'home', player: 'X' }, { home: 1 })

    expect(seen.length).toBe(1)
    const d = seen[0]
    expect(d.type).toBe('event-applied')
    if (d.type === 'event-applied') {
      expect(d.matchId).toBe('sf1')
      expect(d.match.homeScore).toBe(1)
    }
  })

  it('FT event triggers bracket resolution (final.home cleared then re-set)', () => {
    /* Reset Final.home so we can prove the FT path re-set it. */
    const sf1 = store.get('sf1')!
    sf1.state = 'live'
    sf1.minute = 90
    sf1.homeScore = 2
    sf1.awayScore = 1
    sf1.homePenalty = null
    sf1.awayPenalty = null
    store.get('final')!.home = null

    const bracket: Delta[] = []
    store.subscribe(d => {
      if (d.type === 'bracket-resolved') bracket.push(d)
    })
    store.applyEvent('sf1', { minute: 90, type: 'ft', side: null })

    expect(bracket.length).toBe(1)
    expect(bracket[0]!.matchId).toBe('final')
    expect(store.get('final')!.home).toBe('ARG')
  })
})

describe('MatchStore.startLive', () => {
  it('resets sf1 to a fresh kickoff state', () => {
    expect(store.startLive('sf1')).toBe(true)
    const sf1 = store.get('sf1')!
    expect(sf1.state).toBe('live')
    expect(sf1.minute).toBe(1)
    expect(sf1.homeScore).toBe(0)
    expect(sf1.awayScore).toBe(0)
    expect(sf1.homePenalty).toBeNull()
    expect(sf1.awayPenalty).toBeNull()
    expect(sf1.events).toEqual([])
    expect(sf1.kickoffOffsetMin).toBe(0)
  })

  it('clears Final.home (downstream slot that depends on sf1)', () => {
    expect(store.get('final')!.home).toBe('ARG')
    store.startLive('sf1')
    expect(store.get('final')!.home).toBeNull()
  })

  it('emits a reset delta', () => {
    const seen: Delta[] = []
    store.subscribe(d => seen.push(d))
    store.startLive('sf1')
    const reset = seen.find(d => d.type === 'reset')
    expect(reset).toBeDefined()
    if (reset && reset.type === 'reset') {
      expect(reset.matchId).toBe('sf1')
      expect(reset.match.state).toBe('live')
    }
  })

  it('returns false for an unknown match id (no throw)', () => {
    expect(store.startLive('nope')).toBe(false)
  })
})

describe('MatchStore tick (scripted events)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('advances minute on each msPerMinute interval', () => {
    store.startLive('sf1')
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 5)
    expect(store.get('sf1')!.minute).toBe(6) /* started at 1, +5 ticks */
  })

  it('fires the yellow at minute 45 and ht at 47', () => {
    store.startLive('sf1')
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 50)
    const types = store.get('sf1')!.events.map(e => e.type)
    expect(types).toContain('yellow')
    expect(types).toContain('ht')
  })

  it('fires the FT at minute 94, sets state=ft, and resolves bracket', () => {
    store.get('final')!.home = null
    store.startLive('sf1')
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 100)
    expect(store.get('sf1')!.state).toBe('ft')
    expect(store.get('final')!.home).not.toBeNull()
  })

  it('does not pile up intervals on repeated start_live calls', () => {
    /* Two consecutive start_live calls should leave a SINGLE tick
     * driving the minute forward — not two ticks doubling it. */
    store.startLive('sf1')
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 2) /* minute = 3 */
    store.startLive('sf1') /* second call resets to minute=1 with a fresh tick */
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 3) /* minute should be 4, not 7 */
    expect(store.get('sf1')!.minute).toBe(4)
  })

  it('ignores tick start for matches without a scripted tick config', () => {
    /* sf2 has no LIVE_TICK config — startLive should still flip state
     * and emit reset, but NO ticks should fire. */
    store.startLive('sf2')
    const minuteAfterReset = store.get('sf2')!.minute
    vi.advanceTimersByTime(LIVE_TICK.msPerMinute * 10)
    expect(store.get('sf2')!.minute).toBe(minuteAfterReset)
  })
})
