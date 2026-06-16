import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Store } from '../src/state/store'
import type { Delta } from '../src/state/serverClient'
import type { Match } from '../src/types'

/* Each test gets a brand-new Store + a fresh fixture set. Store is empty
 * on construction (prod hydrates from SSE) so tests inject their own
 * matches via replaceAll. */
let store: Store

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
    events: [],
    ...overrides,
  }
}

/* Fixture: a minimal QF + SF + Final shape that exercises bracket
 * resolution (Final.home resolves from sf1's winner). */
function loadFixtures(): void {
  store.replaceAll([
    blankMatch({ id: 'qf1', stage: 'QF', home: 'ARG', away: 'NED', homeScore: 1, awayScore: 0, minute: 90, state: 'ft' }),
    blankMatch({ id: 'sf1', stage: 'SF', home: 'ARG', away: 'FRA', minute: null, state: 'scheduled' }),
    blankMatch({ id: 'sf2', stage: 'SF', home: 'BRA', away: 'POR', minute: null, state: 'scheduled' }),
    blankMatch({ id: 'final', stage: 'F', home: null, away: null, minute: null, state: 'scheduled', resolvesFrom: { home: 'sf1', away: 'sf2' } }),
  ])
}

beforeEach(() => {
  store = new Store()
  loadFixtures()
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
    const sf1 = store.get('sf1')!
    sf1.state = 'live'
    sf1.minute = 90
    sf1.homeScore = 2
    sf1.awayScore = 1

    const final = store.get('final')!
    final.home = null

    store.applyEvent('sf1', { minute: 90, type: 'ft', side: null })

    expect(sf1.state).toBe('ft')
    expect(final.home).toBe('ARG')
  })
})

describe('Store.winnerOf (via FT → bracket-resolved)', () => {
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
      blankMatch({ id: 'only', stage: 'F', home: 'USA', away: 'MEX', homeScore: 0, awayScore: 0, minute: 1, state: 'live' }),
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
    const fresh: Match = blankMatch({
      id: 'sf1', stage: 'SF', home: 'ARG', away: 'FRA', minute: 1, state: 'live',
      homeScore: 0, awayScore: 0,
    })
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
