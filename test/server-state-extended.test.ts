import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MatchStore, type Delta } from '../server/state'
import type { Match, MatchEvent } from '../server/types'

function seedMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    stage: 'GS',
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
    ...overrides,
  }
}

function collectDeltas(store: MatchStore): Delta[] {
  const seen: Delta[] = []
  store.subscribe(d => seen.push(d))
  return seen
}

describe('MatchStore.patchLivescore', () => {
  it('emits a minute delta when only minute changed', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 10 })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { minute: 11 })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ type: 'minute', matchId: 'm1', minute: 11 })
    expect(store.get('m1')!.minute).toBe(11)
  })

  it('emits a reset delta when a non-minute field changed', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0 })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { homeScore: 1 })

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
    if (seen[0].type === 'reset') {
      expect(seen[0].matchId).toBe('m1')
      expect(seen[0].match.homeScore).toBe(1)
    }
    expect(store.get('m1')!.homeScore).toBe(1)
  })

  it('emits nothing when no field actually differs', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 10, homeScore: 1, awayScore: 2 })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { minute: 10, homeScore: 1, awayScore: 2 })

    expect(seen).toHaveLength(0)
  })

  it('emits bracket-resolved when home flipped', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ home: 'USA' })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { home: 'BRA' })

    const kinds = seen.map(d => d.type)
    expect(kinds).toContain('reset')
    expect(kinds).toContain('bracket-resolved')
    const br = seen.find(d => d.type === 'bracket-resolved')!
    if (br.type === 'bracket-resolved') {
      expect(br.home).toBe('BRA')
      expect(br.away).toBe('MEX')
    }
  })

  it('emits bracket-resolved when away flipped', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ away: 'MEX' })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { away: 'CAN' })

    const br = seen.find(d => d.type === 'bracket-resolved')
    expect(br).toBeDefined()
    if (br && br.type === 'bracket-resolved') {
      expect(br.away).toBe('CAN')
    }
  })

  it('handles partial patches that include only some fields', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ homeScore: 0, awayScore: 0, minute: 5, state: 'live' }),
    ])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { homeScore: 2 })

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
    const m = store.get('m1')!
    expect(m.homeScore).toBe(2)
    expect(m.awayScore).toBe(0)
    expect(m.minute).toBe(5)
    expect(m.state).toBe('live')
  })

  it('handles state transition scheduled to live', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ state: 'scheduled' })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { state: 'live' })

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
    expect(store.get('m1')!.state).toBe('live')
  })

  it('handles state transition live to ft', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ state: 'live' })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { state: 'ft' })

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
    expect(store.get('m1')!.state).toBe('ft')
  })

  it('no-ops silently when the match does not exist', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch()])
    const seen = collectDeltas(store)

    store.patchLivescore('does-not-exist', { homeScore: 99 })

    expect(seen).toHaveLength(0)
  })

  it('does not emit minute delta when minute changes alongside another field', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 10, homeScore: 0 })])
    const seen = collectDeltas(store)

    store.patchLivescore('m1', { minute: 11, homeScore: 1 })

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
  })
})

describe('MatchStore.sweepStaleStates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when no matches are stale', () => {
    vi.setSystemTime(new Date('2026-06-15T18:00:00Z'))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ state: 'scheduled', kickoffAt: '2026-06-15T19:00:00Z' }),
    ])

    expect(store.sweepStaleStates()).toBe(0)
    expect(store.get('m1')!.state).toBe('scheduled')
  })

  it('promotes only scheduled matches (skips live and ft)', () => {
    /* Sweep is scheduled→live ONLY. Demoting live→ft is fabrication;
     * authoritative ft transitions come from the /schedule reconcile
     * poll (reconcileFromSchedule), not from elapsed-time guesses. */
    vi.setSystemTime(new Date('2026-06-15T19:00:00Z'))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ id: 'a', state: 'scheduled', kickoffAt: '2026-06-15T18:00:00Z' }),
      seedMatch({ id: 'b', state: 'live', kickoffAt: '2026-06-15T18:00:00Z' }),
      seedMatch({ id: 'c', state: 'ft', kickoffAt: '2026-06-15T18:00:00Z' }),
    ])

    const promoted = store.sweepStaleStates()

    expect(promoted).toBe(1)
    expect(store.get('a')!.state).toBe('live')
    expect(store.get('b')!.state).toBe('live')
    expect(store.get('c')!.state).toBe('ft')
  })

  it('does NOT demote a live match no matter how long it has been live (no fabrication)', () => {
    /* Critical invariant: even at 6 hours past kickoff with a real score,
     * the sweep must not fabricate ft. Authoritative ft comes from
     * /schedule reconcile only. */
    const kickoff = new Date('2026-06-15T18:00:00Z')
    vi.setSystemTime(new Date(kickoff.getTime() + 6 * 60 * 60 * 1000))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        state: 'live',
        kickoffAt: kickoff.toISOString(),
        homeScore: 3, awayScore: 0,
      }),
    ])
    expect(store.sweepStaleStates()).toBe(0)
    expect(store.get('m1')!.state).toBe('live')
  })

  it('does not promote at 4:59 elapsed (inside grace window)', () => {
    const kickoff = new Date('2026-06-15T18:00:00Z')
    vi.setSystemTime(new Date(kickoff.getTime() + 4 * 60_000 + 59_000))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ state: 'scheduled', kickoffAt: kickoff.toISOString() }),
    ])

    expect(store.sweepStaleStates()).toBe(0)
    expect(store.get('m1')!.state).toBe('scheduled')
  })

  it('promotes at 5:01 elapsed (past grace window)', () => {
    const kickoff = new Date('2026-06-15T18:00:00Z')
    vi.setSystemTime(new Date(kickoff.getTime() + 5 * 60_000 + 1_000))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ state: 'scheduled', kickoffAt: kickoff.toISOString() }),
    ])

    expect(store.sweepStaleStates()).toBe(1)
    expect(store.get('m1')!.state).toBe('live')
  })

  it('skips matches with null/undefined kickoffAt', () => {
    vi.setSystemTime(new Date('2026-06-15T19:00:00Z'))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ id: 'a', state: 'scheduled', kickoffAt: undefined }),
    ])

    expect(store.sweepStaleStates()).toBe(0)
    expect(store.get('a')!.state).toBe('scheduled')
  })

  it('emits a reset delta for each promoted match', () => {
    const kickoff = new Date('2026-06-15T18:00:00Z')
    vi.setSystemTime(new Date(kickoff.getTime() + 10 * 60_000))
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ id: 'a', state: 'scheduled', kickoffAt: kickoff.toISOString() }),
      seedMatch({ id: 'b', state: 'scheduled', kickoffAt: kickoff.toISOString() }),
    ])
    const seen = collectDeltas(store)

    store.sweepStaleStates()

    const resets = seen.filter(d => d.type === 'reset')
    expect(resets).toHaveLength(2)
    const ids = resets.map(d => (d as { matchId: string }).matchId).sort()
    expect(ids).toEqual(['a', 'b'])
    for (const r of resets) {
      if (r.type === 'reset') expect(r.match.state).toBe('live')
    }
  })
})

describe('MatchStore.reconcileFromSchedule', () => {
  /* Authoritative state reconcile from a fresh /schedule fetch. Catches
   * iSports lag on transitions (esp. live→ft) without wiping events. */

  it('flips live→ft when iSports authoritatively reports ft, fires bracket resolve', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'qf1', stage: 'QF', state: 'live',
        homeScore: 2, awayScore: 1,
        events: [{ id: 'e1', minute: 12, type: 'goal', side: 'home' } as MatchEvent],
      }),
      /* A downstream slot whose home is the winner of qf1 */
      seedMatch({
        id: 'sf1', stage: 'SF', state: 'scheduled',
        home: null, away: null,
        events: [],
        resolvesFrom: { home: 'qf1' },
      }),
    ])
    const seen = collectDeltas(store)

    const changed = store.reconcileFromSchedule([
      { ...seedMatch({ id: 'qf1', stage: 'QF' }), state: 'ft', homeScore: 2, awayScore: 1 },
    ])

    expect(changed).toBe(1)
    expect(store.get('qf1')!.state).toBe('ft')
    /* Events were preserved — reconcile does not nuke the events list. */
    expect(store.get('qf1')!.events).toHaveLength(1)
    /* Bracket was resolved — sf1.home is now the qf1 winner. */
    expect(store.get('sf1')!.home).toBe('USA')  /* qf1 default home from seedMatch */
    /* Reset delta for qf1 was emitted. */
    const resets = seen.filter(d => d.type === 'reset' && (d as { matchId: string }).matchId === 'qf1')
    expect(resets.length).toBeGreaterThan(0)
  })

  it('updates scores without changing state', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ state: 'live', homeScore: 1, awayScore: 0 }),
    ])
    const seen = collectDeltas(store)

    const changed = store.reconcileFromSchedule([
      { ...seedMatch({}), state: 'live', homeScore: 3, awayScore: 0 },
    ])

    expect(changed).toBe(1)
    expect(store.get('m1')!.homeScore).toBe(3)
    expect(store.get('m1')!.state).toBe('live')
    expect(seen.some(d => d.type === 'reset')).toBe(true)
  })

  it('returns 0 and emits nothing when nothing changed', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ state: 'live', homeScore: 1, awayScore: 0 }),
    ])
    const seen = collectDeltas(store)

    const changed = store.reconcileFromSchedule([
      { ...seedMatch({}), state: 'live', homeScore: 1, awayScore: 0 },
    ])

    expect(changed).toBe(0)
    expect(seen).toHaveLength(0)
  })

  it('preserves the events array even when state changes', () => {
    /* Regression guard against replaceAll-style wipe. If reconcile ever
     * goes back to nuking events, this test fails loudly. */
    const events: MatchEvent[] = [
      { id: 'e1', minute: 12, type: 'goal', side: 'home' } as MatchEvent,
      { id: 'e2', minute: 67, type: 'yellow', side: 'away' } as MatchEvent,
    ]
    const store = new MatchStore()
    store.replaceAll([seedMatch({ state: 'live', homeScore: 1, awayScore: 0, events })])

    store.reconcileFromSchedule([
      { ...seedMatch({}), state: 'ft', homeScore: 1, awayScore: 0 },
    ])

    expect(store.get('m1')!.events).toEqual(events)
  })

  it('adds a brand-new match (newly-resolved knockout slot)', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ id: 'a' })])

    const changed = store.reconcileFromSchedule([
      seedMatch({ id: 'b', stage: 'R16', home: 'BRA', away: 'POR' }),
    ])

    expect(changed).toBe(1)
    expect(store.get('b')!.home).toBe('BRA')
  })

  it('does NOT delete matches missing from the fresh list', () => {
    /* /schedule reconcile is additive + corrective only. It must never
     * delete — deletion belongs to the boot hydrate path. */
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({ id: 'keep1' }),
      seedMatch({ id: 'keep2' }),
    ])

    store.reconcileFromSchedule([seedMatch({ id: 'keep1' })])

    expect(store.get('keep1')).toBeDefined()
    expect(store.get('keep2')).toBeDefined()
  })
})

describe('MatchStore.applyEvent', () => {
  it('pushes the event onto the match timeline', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch()])

    const ev: MatchEvent = { type: 'yellow', minute: 12, side: 'home', player: 'X' }
    store.applyEvent('m1', ev)

    expect(store.get('m1')!.events).toHaveLength(1)
    expect(store.get('m1')!.events[0]).toBe(ev)
  })

  it('applies scoreDelta to home', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 1, awayScore: 0 })])

    store.applyEvent(
      'm1',
      { type: 'goal', minute: 30, side: 'home' },
      { home: 1 },
    )

    expect(store.get('m1')!.homeScore).toBe(2)
    expect(store.get('m1')!.awayScore).toBe(0)
  })

  it('applies scoreDelta to away', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0, awayScore: 0 })])

    store.applyEvent(
      'm1',
      { type: 'goal', minute: 30, side: 'away' },
      { away: 1 },
    )

    expect(store.get('m1')!.awayScore).toBe(1)
  })

  it('honours a negative scoreDelta (score correction)', () => {
    /* Regression for the old truthy-check bug: `if (scoreDelta?.home && ...)`
     * silently dropped negative deltas. Score corrections should land. */
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 2, awayScore: 0 })])

    store.applyEvent(
      'm1',
      { type: 'goal', minute: 30, side: 'home' },
      { home: -1 },
    )

    expect(store.get('m1')!.homeScore).toBe(1)
  })

  it('sets state to ft when type is ft', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ state: 'live' })])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    expect(store.get('m1')!.state).toBe('ft')
  })

  it('cascades to resolveBracket when type is ft', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'sf1',
        state: 'live',
        home: 'USA',
        away: 'MEX',
        homeScore: 2,
        awayScore: 1,
      }),
      seedMatch({
        id: 'final',
        stage: 'F',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        state: 'scheduled',
        resolvesFrom: { home: 'sf1' },
      }),
    ])
    const seen = collectDeltas(store)

    store.applyEvent('sf1', { type: 'ft', minute: 90, side: null })

    expect(store.get('final')!.home).toBe('USA')
    const bracket = seen.find(d => d.type === 'bracket-resolved')
    expect(bracket).toBeDefined()
    if (bracket && bracket.type === 'bracket-resolved') {
      expect(bracket.matchId).toBe('final')
      expect(bracket.home).toBe('USA')
    }
  })

  it('emits an event-applied delta with the scoreDelta and a cloned match', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: 0 })])
    const seen = collectDeltas(store)

    store.applyEvent(
      'm1',
      { type: 'goal', minute: 30, side: 'home' },
      { home: 1 },
    )

    const ea = seen.find(d => d.type === 'event-applied')
    expect(ea).toBeDefined()
    if (ea && ea.type === 'event-applied') {
      expect(ea.scoreDelta).toEqual({ home: 1 })
      expect(ea.match.homeScore).toBe(1)
      /* structuredClone — mutating the live match must not bleed into delta */
      store.get('m1')!.homeScore = 99
      expect(ea.match.homeScore).toBe(1)
    }
  })

  it('no-ops silently when the match does not exist', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch()])
    const seen = collectDeltas(store)

    store.applyEvent('missing', { type: 'goal', minute: 1, side: 'home' }, { home: 1 })

    expect(seen).toHaveLength(0)
  })

  it('does not increment when the score is null (defensive)', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ homeScore: null, awayScore: null })])

    store.applyEvent(
      'm1',
      { type: 'goal', minute: 30, side: 'home' },
      { home: 1 },
    )

    expect(store.get('m1')!.homeScore).toBeNull()
  })
})

describe('MatchStore.resolveBracket (via applyEvent ft)', () => {
  it('resolves m2.home when m2.resolvesFrom.home points at finished m1', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 2,
        awayScore: 1,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'm2',
        home: null,
        away: 'BRA',
        homeScore: null,
        awayScore: null,
        state: 'scheduled',
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    expect(store.get('m2')!.home).toBe('USA')
    expect(store.get('m2')!.away).toBe('BRA')
  })

  it('resolves m2.away when m2.resolvesFrom.away points at finished m1', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 1,
        awayScore: 3,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'm2',
        home: 'BRA',
        away: null,
        homeScore: null,
        awayScore: null,
        state: 'scheduled',
        resolvesFrom: { away: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    expect(store.get('m2')!.home).toBe('BRA')
    expect(store.get('m2')!.away).toBe('MEX')
  })

  it('resolves both home and away when both resolvesFrom point at finished m1', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 2,
        awayScore: 0,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'm2',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        state: 'scheduled',
        resolvesFrom: { home: 'm1', away: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    /* When both slots resolve from the same finished match, both winners
     * collapse to the same team (winnerOf is deterministic per match). */
    expect(store.get('m2')!.home).toBe('USA')
    expect(store.get('m2')!.away).toBe('USA')
  })

  it('winnerOf picks home on regulation home win', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 3,
        awayScore: 0,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    expect(store.get('next')!.home).toBe('USA')
  })

  it('winnerOf picks away on regulation away win', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 0,
        awayScore: 2,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    expect(store.get('next')!.home).toBe('MEX')
  })

  it('winnerOf uses penalty score on regulation tie when home pens win', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 1,
        awayScore: 1,
        homePenalty: 5,
        awayPenalty: 3,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 120, side: null })

    expect(store.get('next')!.home).toBe('USA')
  })

  it('winnerOf uses penalty score on regulation tie when away pens win', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 1,
        awayScore: 1,
        homePenalty: 3,
        awayPenalty: 5,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 120, side: null })

    expect(store.get('next')!.home).toBe('MEX')
  })

  it('winnerOf returns null on a regulation tie with no penalty data (unresolvable)', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 1,
        awayScore: 1,
        homePenalty: null,
        awayPenalty: null,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 120, side: null })

    /* Refusing to invent a winner — bracket slot stays null (TBD). */
    expect(store.get('next')!.home).toBeNull()
  })

  it('winnerOf returns null on a tied penalty shootout (impossible data, no fake winner)', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 1,
        awayScore: 1,
        homePenalty: 4,
        awayPenalty: 4,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: null,
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])

    store.applyEvent('m1', { type: 'ft', minute: 120, side: null })

    expect(store.get('next')!.home).toBeNull()
  })

  it('emits a bracket-resolved delta with the resolved teams', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 2,
        awayScore: 1,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'next',
        home: null,
        away: 'BRA',
        homeScore: null,
        awayScore: null,
        resolvesFrom: { home: 'm1' },
      }),
    ])
    const seen = collectDeltas(store)

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    const br = seen.find(d => d.type === 'bracket-resolved')
    expect(br).toBeDefined()
    if (br && br.type === 'bracket-resolved') {
      expect(br.matchId).toBe('next')
      expect(br.home).toBe('USA')
      expect(br.away).toBe('BRA')
    }
  })

  it('skips matches without resolvesFrom', () => {
    const store = new MatchStore()
    store.replaceAll([
      seedMatch({
        id: 'm1',
        homeScore: 2,
        awayScore: 1,
        home: 'USA',
        away: 'MEX',
      }),
      seedMatch({
        id: 'unrelated',
        home: 'BRA',
        away: 'ARG',
      }),
    ])
    const seen = collectDeltas(store)

    store.applyEvent('m1', { type: 'ft', minute: 90, side: null })

    const brackets = seen.filter(d => d.type === 'bracket-resolved')
    expect(brackets).toHaveLength(0)
    expect(store.get('unrelated')!.home).toBe('BRA')
  })
})

describe('MatchStore.setMinute', () => {
  it('emits a minute delta', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 5 })])
    const seen = collectDeltas(store)

    store.setMinute('m1', 12)

    expect(seen).toEqual([{ type: 'minute', matchId: 'm1', minute: 12 }])
    expect(store.get('m1')!.minute).toBe(12)
  })

  it('no-ops if match is missing', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch()])
    const seen = collectDeltas(store)

    store.setMinute('does-not-exist', 90)

    expect(seen).toHaveLength(0)
  })
})

describe('MatchStore.replaceAll', () => {
  it('emits a reset delta per match', () => {
    const store = new MatchStore()
    const seen = collectDeltas(store)

    store.replaceAll([
      seedMatch({ id: 'a' }),
      seedMatch({ id: 'b' }),
      seedMatch({ id: 'c' }),
    ])

    const resets = seen.filter(d => d.type === 'reset')
    expect(resets).toHaveLength(3)
    const ids = resets.map(d => (d as { matchId: string }).matchId)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('replaces store contents wholesale', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ id: 'old' })])
    expect(store.getAll().map(m => m.id)).toEqual(['old'])

    store.replaceAll([seedMatch({ id: 'new1' }), seedMatch({ id: 'new2' })])

    expect(store.getAll().map(m => m.id)).toEqual(['new1', 'new2'])
    expect(store.get('old')).toBeUndefined()
  })

  it('reset delta carries a cloned match snapshot', () => {
    const store = new MatchStore()
    const seen = collectDeltas(store)
    const m = seedMatch({ id: 'a', homeScore: 0 })

    store.replaceAll([m])
    const r = seen.find(d => d.type === 'reset')
    expect(r).toBeDefined()
    if (r && r.type === 'reset') {
      /* mutating the stored copy after the emit must not bleed into the delta */
      store.get('a')!.homeScore = 99
      expect(r.match.homeScore).toBe(0)
    }
  })
})

describe('MatchStore.subscribe / unsubscribe', () => {
  it('subscriber receives broadcast deltas', () => {
    const store = new MatchStore()
    const seen: Delta[] = []
    store.subscribe(d => seen.push(d))

    store.replaceAll([seedMatch()])

    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('reset')
  })

  it('unsubscribe stops delivery to that listener only', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 0 })])

    const seenA: Delta[] = []
    const seenB: Delta[] = []
    const unsubA = store.subscribe(d => seenA.push(d))
    store.subscribe(d => seenB.push(d))

    store.setMinute('m1', 1)
    unsubA()
    store.setMinute('m1', 2)

    expect(seenA).toHaveLength(1)
    expect(seenB).toHaveLength(2)
  })

  it('one throwing subscriber does not poison the broadcast loop', () => {
    const store = new MatchStore()
    store.replaceAll([seedMatch({ minute: 0 })])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const calls: string[] = []
    store.subscribe(() => {
      calls.push('before')
    })
    store.subscribe(() => {
      throw new Error('bad listener')
    })
    store.subscribe(() => {
      calls.push('after')
    })

    store.setMinute('m1', 7)

    expect(calls).toEqual(['before', 'after'])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('unsubscribe is idempotent (calling twice does not throw)', () => {
    const store = new MatchStore()
    const unsub = store.subscribe(() => {})
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})
