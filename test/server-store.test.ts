import { describe, it, expect } from 'vitest'
import { MatchStore } from '../server/state'
import type { Match, MatchEvent } from '../server/types'

function seedMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    leagueId: '1572',
    stage: 'GS',
    group: 'A',
    home: 'USA',
    away: 'MEX',
    homeScore: 0,
    awayScore: 0,
    homePenalty: null,
    awayPenalty: null,
    minute: null,
    state: 'live',
    kickoffAt: '2026-06-15T18:00:00Z',
    venue: 'Test Stadium',
    events: [],
    resolvesFrom: null,
    ...overrides,
  }
}

const goal = (overrides: Partial<MatchEvent> = {}): MatchEvent => ({
  eventId: `e-${Math.floor(Math.random() * 1e9)}`,
  type: 'goal',
  minute: 30,
  side: 'home',
  ...overrides,
})

describe('MatchStore.upsertEvent — score reconciliation', () => {
  it('promotes home score when a goal event arrives ahead of /livescores', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))

    expect(store.get('m1')!.homeScore).toBe(1)
    expect(store.get('m1')!.awayScore).toBe(0)
  })

  it('promotes both sides independently from per-side goal counts', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))
    store.upsertEvent('m1', goal({ eventId: 'g2', side: 'away', minute: 30 }))
    store.upsertEvent('m1', goal({ eventId: 'g3', side: 'home', minute: 70 }))

    const m = store.get('m1')!
    expect(m.homeScore).toBe(2)
    expect(m.awayScore).toBe(1)
  })

  it('never decreases an already-higher score (iSports stays authoritative)', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 3, awayScore: 0 })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))

    expect(store.get('m1')!.homeScore).toBe(3)
  })

  it('does not double-count when the same goal event is re-upserted', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))
    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))

    expect(store.get('m1')!.homeScore).toBe(1)
    expect(store.get('m1')!.events.length).toBe(1)
  })

  it('ignores non-goal events for score reconciliation', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.upsertEvent('m1', { eventId: 'y1', type: 'yellow', minute: 22, side: 'home' })
    store.upsertEvent('m1', { eventId: 'r1', type: 'red', minute: 44, side: 'away' })
    store.upsertEvent('m1', { eventId: 's1', type: 'sub', minute: 60, side: 'home' })

    const m = store.get('m1')!
    expect(m.homeScore).toBe(0)
    expect(m.awayScore).toBe(0)
  })

  it('initialises null score to the goal count', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: null, awayScore: null })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))

    expect(store.get('m1')!.homeScore).toBe(1)
    expect(store.get('m1')!.awayScore).toBeNull()
  })

  it('skips score update when side is null (defensive)', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.upsertEvent('m1', goal({ eventId: 'g1', side: null, minute: 12 }))

    const m = store.get('m1')!
    expect(m.homeScore).toBe(0)
    expect(m.awayScore).toBe(0)
  })

  it('broadcasts an event-applied delta carrying the bumped score', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    const seen: Array<{ home: number | null; away: number | null }> = []
    store.subscribe(d => {
      if (d.type === 'event-applied') {
        seen.push({ home: d.match.homeScore, away: d.match.awayScore })
      }
    })

    store.upsertEvent('m1', goal({ eventId: 'g1', side: 'home', minute: 12 }))
    store.upsertEvent('m1', goal({ eventId: 'g2', side: 'home', minute: 40 }))

    expect(seen).toEqual([
      { home: 1, away: 0 },
      { home: 2, away: 0 },
    ])
  })
})
