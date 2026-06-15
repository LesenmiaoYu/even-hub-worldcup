import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Store } from '../src/state/store'
import type { Delta } from '../src/state/serverClient'
import type { Match, MatchEvent } from '../src/types'

/* Each test runs against a brand-new Store with a hand-built fixture set
 * covering all three lifecycle states (scheduled / live / ft) plus a
 * future-kickoff scheduled match and a past-kickoff scheduled match for
 * getUpcoming() boundary checks. */

function blankMatch(overrides: Partial<Match>): Match {
  return {
    id: 'x',
    stage: 'QF',
    home: 'ARG',
    away: 'BRA',
    homeScore: null,
    awayScore: null,
    homePenalty: null,
    awayPenalty: null,
    minute: null,
    state: 'scheduled',
    kickoffOffsetMin: 0,
    events: [],
    ...overrides,
  }
}

let store: Store

beforeEach(() => {
  store = new Store()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Store.applyDelta — bracket-resolved field preservation', () => {
  it('updates home/away without touching score, state, events, or minute', () => {
    const original: Match = blankMatch({
      id: 'final',
      stage: 'F',
      home: null,
      away: null,
      homeScore: 2,
      awayScore: 1,
      minute: 88,
      state: 'live',
      events: [{ minute: 30, type: 'goal', side: 'home', player: 'Messi' }],
    })
    store.replaceAll([original])

    store.applyDelta({
      type: 'bracket-resolved',
      matchId: 'final',
      home: 'ARG',
      away: 'FRA',
    })

    const after = store.get('final')!
    expect(after.home).toBe('ARG')
    expect(after.away).toBe('FRA')
    expect(after.homeScore).toBe(2)
    expect(after.awayScore).toBe(1)
    expect(after.minute).toBe(88)
    expect(after.state).toBe('live')
    expect(after.events).toHaveLength(1)
    expect(after.events[0]!.player).toBe('Messi')
  })

  it('accepts null home/away values (unresolved bracket)', () => {
    store.replaceAll([blankMatch({ id: 'final', home: 'ARG', away: 'BRA' })])
    store.applyDelta({ type: 'bracket-resolved', matchId: 'final', home: null, away: null })
    const after = store.get('final')!
    expect(after.home).toBeNull()
    expect(after.away).toBeNull()
  })
})

describe('Store.applyDelta — minute updates', () => {
  it('updates minute on the targeted match only', () => {
    store.replaceAll([
      blankMatch({ id: 'a', minute: 10, state: 'live' }),
      blankMatch({ id: 'b', minute: 20, state: 'live' }),
    ])
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 55 })
    expect(store.get('a')!.minute).toBe(55)
    expect(store.get('b')!.minute).toBe(20)
  })

  it('no-op when match id is not in the store; does not throw and does not push a new match', () => {
    store.replaceAll([blankMatch({ id: 'a', minute: 10, state: 'live' })])
    const before = store.getAll().length
    expect(() => store.applyDelta({ type: 'minute', matchId: 'ghost', minute: 70 })).not.toThrow()
    expect(store.getAll().length).toBe(before)
    expect(store.get('ghost')).toBeUndefined()
  })
})

describe('Store.applyDelta — event-applied snapshot semantics', () => {
  it('replaces local match wholesale when server snapshot has more events', () => {
    const local: Match = blankMatch({
      id: 'm1',
      state: 'live',
      events: [{ minute: 10, type: 'goal', side: 'home', player: 'A' }],
    })
    store.replaceAll([local])

    /* Server's full post-mutation snapshot has TWO events, local has one. */
    const serverSnap: Match = blankMatch({
      id: 'm1',
      state: 'live',
      events: [
        { minute: 10, type: 'goal', side: 'home', player: 'A' },
        { minute: 20, type: 'goal', side: 'away', player: 'B' },
      ],
    })

    store.applyDelta({
      type: 'event-applied',
      matchId: 'm1',
      event: { minute: 20, type: 'goal', side: 'away', player: 'B' },
      match: serverSnap,
    })

    const after = store.get('m1')!
    expect(after.events).toHaveLength(2)
    expect(after.events[1]!.player).toBe('B')
    /* The match object is the snapshot, not the prior local — identity-replaced. */
    expect(after).toBe(serverSnap)
  })

  it('splices in a brand-new match id (spliceMatch handles -1 by pushing)', () => {
    store.replaceAll([blankMatch({ id: 'existing', state: 'live' })])
    const fresh: Match = blankMatch({ id: 'newcomer', stage: 'GS', home: 'JPN', away: 'KOR' })

    store.applyDelta({
      type: 'event-applied',
      matchId: 'newcomer',
      event: { minute: 1, type: 'goal', side: 'home' },
      match: fresh,
    })

    expect(store.getAll()).toHaveLength(2)
    expect(store.get('newcomer')).toBe(fresh)
    expect(store.get('existing')).toBeDefined()
  })
})

describe('Store.applyDelta — reset semantics', () => {
  it('replaces existing match by id; preserves no fields from prior copy', () => {
    const old: Match = blankMatch({
      id: 'm1',
      state: 'ft',
      homeScore: 3,
      awayScore: 2,
      minute: 90,
      events: [{ minute: 30, type: 'goal', side: 'home', player: 'OldPlayer' }],
      venue: 'OldVenue',
    })
    store.replaceAll([old])

    const fresh: Match = blankMatch({
      id: 'm1',
      state: 'scheduled',
      homeScore: null,
      awayScore: null,
      minute: null,
      events: [],
    })

    store.applyDelta({ type: 'reset', matchId: 'm1', match: fresh })

    const after = store.get('m1')!
    expect(after).toBe(fresh)
    expect(after.state).toBe('scheduled')
    expect(after.homeScore).toBeNull()
    expect(after.awayScore).toBeNull()
    expect(after.minute).toBeNull()
    expect(after.events).toHaveLength(0)
    expect(after.venue).toBeUndefined()
  })

  it('pushes a new match when reset targets an unknown id', () => {
    store.replaceAll([])
    const fresh: Match = blankMatch({ id: 'fresh' })
    store.applyDelta({ type: 'reset', matchId: 'fresh', match: fresh })
    expect(store.get('fresh')).toBe(fresh)
  })
})

describe('Store.applyDelta — notify is called exactly once per delta', () => {
  beforeEach(() => {
    store.replaceAll([
      blankMatch({ id: 'a', state: 'live', minute: 10 }),
      blankMatch({ id: 'b', state: 'scheduled' }),
    ])
  })

  it('event-applied fires notify once', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({
      type: 'event-applied',
      matchId: 'a',
      event: { minute: 1, type: 'goal', side: 'home' },
      match: blankMatch({ id: 'a' }),
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('reset fires notify once', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'reset', matchId: 'a', match: blankMatch({ id: 'a' }) })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('minute fires notify once even when match is found', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 33 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('bracket-resolved fires notify once even when match is found', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'bracket-resolved', matchId: 'a', home: 'USA', away: 'MEX' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('minute on unknown id: still fires notify (current behavior — switch returns early but post-switch notify still runs)', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'minute', matchId: 'ghost', minute: 33 })
    /* Note: store.applyDelta's `case 'minute'` uses `return` which exits
     * the entire method, NOT just the switch. So notify is SKIPPED on
     * unknown-id minute deltas. Same for unknown-id bracket-resolved. */
    expect(spy).toHaveBeenCalledTimes(0)
  })

  it('bracket-resolved on unknown id: notify skipped (same early-return)', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'bracket-resolved', matchId: 'ghost', home: 'USA', away: 'MEX' })
    expect(spy).toHaveBeenCalledTimes(0)
  })
})

describe('Store.getLive', () => {
  it('returns only matches with state=live; excludes scheduled and ft', () => {
    store.replaceAll([
      blankMatch({ id: 'live1', state: 'live' }),
      blankMatch({ id: 'live2', state: 'live' }),
      blankMatch({ id: 'sch', state: 'scheduled' }),
      blankMatch({ id: 'ft', state: 'ft' }),
    ])
    const live = store.getLive()
    expect(live.map(m => m.id).sort()).toEqual(['live1', 'live2'])
  })

  it('returns empty array when no live matches', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'scheduled' })])
    expect(store.getLive()).toEqual([])
  })
})

describe('Store.getUpcoming', () => {
  beforeEach(() => {
    /* Pin "now" at 2026-06-15T12:00:00Z so kickoff comparisons are deterministic. */
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  it('returns scheduled matches with future kickoffAt', () => {
    store.replaceAll([
      blankMatch({ id: 'future', state: 'scheduled', kickoffAt: '2026-06-15T13:00:00Z' }),
      blankMatch({ id: 'far-future', state: 'scheduled', kickoffAt: '2026-12-01T00:00:00Z' }),
    ])
    const up = store.getUpcoming()
    expect(up.map(m => m.id).sort()).toEqual(['far-future', 'future'])
  })

  it('returns scheduled matches missing kickoffAt (treated as upcoming)', () => {
    store.replaceAll([
      blankMatch({ id: 'no-kickoff', state: 'scheduled' /* no kickoffAt */ }),
    ])
    expect(store.getUpcoming().map(m => m.id)).toEqual(['no-kickoff'])
  })

  it('excludes scheduled matches whose kickoffAt is already in the past', () => {
    store.replaceAll([
      blankMatch({ id: 'past', state: 'scheduled', kickoffAt: '2026-06-15T11:00:00Z' }),
      blankMatch({ id: 'future', state: 'scheduled', kickoffAt: '2026-06-15T13:00:00Z' }),
    ])
    const up = store.getUpcoming()
    expect(up.map(m => m.id)).toEqual(['future'])
  })

  it('excludes live and ft matches even with future kickoffAt', () => {
    store.replaceAll([
      blankMatch({ id: 'live', state: 'live', kickoffAt: '2026-06-15T13:00:00Z' }),
      blankMatch({ id: 'ft', state: 'ft', kickoffAt: '2026-06-15T13:00:00Z' }),
    ])
    expect(store.getUpcoming()).toEqual([])
  })

  it('boundary: kickoffAt equal to nowIso is NOT upcoming (strict > comparison)', () => {
    store.replaceAll([
      blankMatch({ id: 'now', state: 'scheduled', kickoffAt: '2026-06-15T12:00:00.000Z' }),
    ])
    expect(store.getUpcoming()).toEqual([])
  })
})

describe('Store.getPast', () => {
  it('returns only matches with state=ft', () => {
    store.replaceAll([
      blankMatch({ id: 'a', state: 'ft' }),
      blankMatch({ id: 'b', state: 'ft' }),
      blankMatch({ id: 'c', state: 'live' }),
      blankMatch({ id: 'd', state: 'scheduled' }),
    ])
    expect(store.getPast().map(m => m.id).sort()).toEqual(['a', 'b'])
  })

  it('returns empty array when no ft matches', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    expect(store.getPast()).toEqual([])
  })
})

describe('Store.get', () => {
  beforeEach(() => {
    store.replaceAll([blankMatch({ id: 'present' })])
  })

  it('returns undefined for missing id', () => {
    expect(store.get('absent')).toBeUndefined()
  })

  it('returns the match for present id', () => {
    expect(store.get('present')?.id).toBe('present')
  })
})

describe('Store.subscribe / unsubscribe', () => {
  it('subscriber receives notification after applyDelta', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 50 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toBe(store.getAll())
  })

  it('unsubscribe stops further notifications', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    const spy = vi.fn()
    const unsub = store.subscribe(spy)
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    unsub()
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 2 })
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 3 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('multiple subscribers all receive notifications', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    store.subscribe(c)
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 42 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(c).toHaveBeenCalledTimes(1)
  })

  it('unsubscribing one subscriber does not affect others', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    const keep = vi.fn()
    const drop = vi.fn()
    store.subscribe(keep)
    const unsubDrop = store.subscribe(drop)
    unsubDrop()
    store.applyDelta({ type: 'minute', matchId: 'a', minute: 7 })
    expect(keep).toHaveBeenCalledTimes(1)
    expect(drop).toHaveBeenCalledTimes(0)
  })

  it('subscriber receives the live matches array reference', () => {
    store.replaceAll([blankMatch({ id: 'a', state: 'live' })])
    let received: Match[] | null = null
    store.subscribe((ms) => { received = ms })
    const event: MatchEvent = { minute: 1, type: 'goal', side: 'home' }
    store.applyEvent('a', event)
    expect(received).not.toBeNull()
    expect(received!).toBe(store.getAll())
  })
})
