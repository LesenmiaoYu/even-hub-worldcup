import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Store } from '../src/state/store'
import type { Delta } from '../src/state/serverClient'
import type { Match } from '../src/types'

/* Each test gets a brand-new Store — the singleton in src/state/store.ts
 * is wired to the seed (which we want for the SSE flow in production)
 * but tests need a clean slate so previous mutations don't leak. */
let store: Store

beforeEach(() => {
  store = new Store()
})

describe('Store.applyEvent', () => {
  it('appends event and applies scoreDelta to the right side', () => {
    const m = store.get('qf1')!
    const homeBefore = m.homeScore!
    const eventsBefore = m.events.length

    store.applyEvent('qf1', { minute: 70, type: 'goal', side: 'home', player: 'X' }, { home: 1 })

    expect(m.homeScore).toBe(homeBefore + 1)
    expect(m.events.length).toBe(eventsBefore + 1)
  })

  it('fires the subscribe notify on apply', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    store.applyEvent('qf1', { minute: 70, type: 'yellow', side: 'home', player: 'X' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('sets state=ft AND resolves bracket when an FT event lands on sf1', () => {
    /* sf1 is wired as Final.home via resolvesFrom. Reset sf1 to a live
     * 2-1 ARG win, then fire FT and check Final.home reflects ARG. */
    const sf1 = store.get('sf1')!
    sf1.state = 'live'
    sf1.minute = 90
    sf1.homeScore = 2
    sf1.awayScore = 1
    sf1.homePenalty = null
    sf1.awayPenalty = null

    /* Clear Final.home so we can prove resolveBracket re-set it. */
    const final = store.get('final')!
    final.home = null

    store.applyEvent('sf1', { minute: 90, type: 'ft', side: null })

    expect(sf1.state).toBe('ft')
    expect(final.home).toBe('ARG')
  })
})

describe('Store.winnerOf (via FT → bracket-resolved)', () => {
  /* winnerOf is private; exercise it via the public FT path. The Final
   * has resolvesFrom.home === 'sf1', so whichever team we leave as the
   * sf1 winner ends up in final.home. */
  function fireFt(overrides: Partial<Match>) {
    Object.assign(store.get('sf1')!, { state: 'live', ...overrides })
    store.get('final')!.home = null
    store.applyEvent('sf1', { minute: 120, type: 'ft', side: null })
    return store.get('final')!.home
  }

  it('returns home team when home wins by regulation', () => {
    expect(
      fireFt({ home: 'ARG', away: 'FRA', homeScore: 2, awayScore: 1, homePenalty: null, awayPenalty: null }),
    ).toBe('ARG')
  })
  it('returns away team when away wins by regulation', () => {
    expect(
      fireFt({ home: 'ARG', away: 'FRA', homeScore: 1, awayScore: 2, homePenalty: null, awayPenalty: null }),
    ).toBe('FRA')
  })
  it('returns penalty winner when regulation tied + shootout', () => {
    expect(
      fireFt({ home: 'ARG', away: 'FRA', homeScore: 3, awayScore: 3, homePenalty: 2, awayPenalty: 4 }),
    ).toBe('FRA')
  })
  it('falls back to home when tied with no shootout (current behavior — document the wart)', () => {
    /* Knockout matches in real life never end tied without a shootout,
     * but the store's winnerOf has a "return m.home" fallback. Pin it
     * here so anyone who tightens this path makes the tradeoff
     * deliberately. */
    expect(
      fireFt({ home: 'ARG', away: 'FRA', homeScore: 1, awayScore: 1, homePenalty: null, awayPenalty: null }),
    ).toBe('ARG')
  })
})

describe('Store.touch', () => {
  it('fires notify without mutating', () => {
    const before = JSON.stringify(store.getAll())
    const spy = vi.fn()
    store.subscribe(spy)
    store.touch()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(store.getAll())).toBe(before)
  })
})

describe('Store.replaceAll', () => {
  it('replaces the match list AND fires notify', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    const tiny: Match[] = [
      {
        id: 'only',
        stage: 'F',
        home: 'USA',
        away: 'MEX',
        homeScore: 0,
        awayScore: 0,
        homePenalty: null,
        awayPenalty: null,
        minute: 1,
        state: 'live',
        kickoffOffsetMin: 0,
        events: [],
      },
    ]
    store.replaceAll(tiny)
    expect(store.getAll()).toEqual(tiny)
    expect(store.get('only')?.home).toBe('USA')
    expect(store.get('qf1')).toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('Store.applyDelta', () => {
  it('event-applied: splices the included match snapshot and notifies', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    const next: Match = { ...store.get('qf1')!, homeScore: 99, awayScore: 7 }
    const delta: Delta = {
      type: 'event-applied',
      matchId: 'qf1',
      event: { minute: 1, type: 'goal', side: 'home' },
      match: next,
    }
    store.applyDelta(delta)
    const after = store.get('qf1')!
    expect(after.homeScore).toBe(99)
    expect(after.awayScore).toBe(7)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('minute: updates only the targeted match', () => {
    store.applyDelta({ type: 'minute', matchId: 'sf2', minute: 42 })
    expect(store.get('sf2')!.minute).toBe(42)
    expect(store.get('sf1')!.minute).not.toBe(42)
  })

  it('bracket-resolved: sets home AND away fields', () => {
    store.applyDelta({
      type: 'bracket-resolved',
      matchId: 'final',
      home: 'ARG',
      away: 'BRA',
    })
    const final = store.get('final')!
    expect(final.home).toBe('ARG')
    expect(final.away).toBe('BRA')
  })

  it('reset: replaces a single match with the included snapshot and notifies', () => {
    const spy = vi.fn()
    store.subscribe(spy)
    const fresh: Match = {
      id: 'sf1',
      stage: 'SF',
      home: 'ARG',
      away: 'FRA',
      homeScore: 0,
      awayScore: 0,
      homePenalty: null,
      awayPenalty: null,
      minute: 1,
      state: 'live',
      kickoffOffsetMin: 0,
      events: [],
    }
    store.applyDelta({ type: 'reset', matchId: 'sf1', match: fresh })
    expect(store.get('sf1')).toEqual(fresh)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('Store.subscribe lifecycle', () => {
  it('returns an unsubscribe that stops further notifications', () => {
    const spy = vi.fn()
    const unsub = store.subscribe(spy)
    store.touch()
    expect(spy).toHaveBeenCalledTimes(1)
    unsub()
    store.touch()
    store.touch()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
