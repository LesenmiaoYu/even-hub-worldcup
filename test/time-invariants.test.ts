import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { statusVerbose, kickoffLabel, kickoffGlassesLabel } from '../src/g2/format'
import { minutesUntilKickoff } from '../src/state/timeUntil'
import { settingsStore } from '../src/state/settingsStore'
import type { Match } from '../src/types'

/* INVARIANT tests for time-derived display.
 *
 * The class of test the prior 362-test coverage workflow failed to write
 * — it asserted snapshot semantics ("kickoffOffsetMin == 60") instead of
 * the user-facing invariant ("the displayed countdown reflects real
 * elapsed time"). That's why the stored-offset-rots bug shipped despite
 * full coverage.
 *
 * The rule under test: render the same Match at time t, then at time
 * t+Δ, and the displayed countdown must shrink by ~Δ. Stale stored
 * offsets fail this — derived-at-read-time passes it. Every "in N hours"
 * surface in the app is covered. */

function makeMatch(kickoffAt: string, overrides: Partial<Match> = {}): Match {
  return {
    id: 'inv',
    stage: 'QF',
    home: 'ARG',
    away: 'BRA',
    homeScore: null,
    awayScore: null,
    homePenalty: null,
    awayPenalty: null,
    minute: null,
    state: 'scheduled',
    kickoffAt,
    events: [],
    ...overrides,
  }
}

describe('time invariants — countdown shrinks as wall-clock advances', () => {
  /* Use a fixture-stable starting "now" with kickoff 12h ahead. Advance
   * time by 1h and assert the displayed countdown drops by ~1h. Repeat
   * for every public surface that shows a countdown. */
  const NOW = new Date('2026-06-15T00:00:00.000Z').getTime()
  const KICKOFF = new Date('2026-06-15T12:00:00.000Z').toISOString()  // 12h ahead at NOW

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    settingsStore.set({ language: 'en', timezone: 'UTC' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('minutesUntilKickoff: t → 720, t+1h → 660, t+12h → 0', () => {
    const m = makeMatch(KICKOFF)
    expect(minutesUntilKickoff(m)).toBe(720)
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    expect(minutesUntilKickoff(m)).toBe(660)
    vi.setSystemTime(NOW + 12 * 60 * 60 * 1000)
    expect(minutesUntilKickoff(m)).toBe(0)
  })

  it('statusVerbose: "KICKOFF IN 12H" → "KICKOFF IN 11H" after 1h elapses', () => {
    const m = makeMatch(KICKOFF)
    expect(statusVerbose(m)).toBe('KICKOFF IN 12H')
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    expect(statusVerbose(m)).toBe('KICKOFF IN 11H')
  })

  it('kickoffLabel: "12h" → "11h" after 1h elapses', () => {
    const m = makeMatch(KICKOFF)
    expect(kickoffLabel(m)).toBe('12h')
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    expect(kickoffLabel(m)).toBe('11h')
  })

  it('kickoffGlassesLabel: "Today, in 12h" → "Today, in 11h" after 1h elapses', () => {
    const m = makeMatch(KICKOFF)
    expect(kickoffGlassesLabel(m)).toBe('Today, in 12h')
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    expect(kickoffGlassesLabel(m)).toBe('Today, in 11h')
  })

  it('countdown reaches < 60 minute granularity as kickoff nears', () => {
    const m = makeMatch(KICKOFF)
    /* 30m before kickoff */
    vi.setSystemTime(NOW + (12 * 60 - 30) * 60 * 1000)
    expect(statusVerbose(m)).toBe('KICKOFF IN 30 MIN')
    /* 5m before kickoff */
    vi.setSystemTime(NOW + (12 * 60 - 5) * 60 * 1000)
    expect(statusVerbose(m)).toBe('KICKOFF IN 5 MIN')
  })

  it('cross-boundary: 26h → "1 DAYS", 4h later drops to "21H" (sub-day bucket)', () => {
    const kickoffFar = new Date(NOW + 26 * 60 * 60 * 1000).toISOString()
    const m = makeMatch(kickoffFar)
    /* statusVerbose bucketing: h<24 → hours, else round(h/24) → days. At
     * 26h, h=26 → "1 DAYS". At 21h remaining, h=21 → "21H". */
    expect(statusVerbose(m)).toBe('KICKOFF IN 1 DAYS')
    vi.setSystemTime(NOW + 5 * 60 * 60 * 1000)  // 21h remaining
    expect(statusVerbose(m)).toBe('KICKOFF IN 21H')
  })

  it('rendering does NOT mutate the Match (offset is computed, never written back)', () => {
    /* Regression guard: the fix moved offsetMin out of Match. This
     * confirms nobody silently re-adds it as a memoized cache. */
    const m = makeMatch(KICKOFF)
    void statusVerbose(m)
    void kickoffLabel(m)
    void kickoffGlassesLabel(m)
    /* Match has no kickoffOffsetMin field anymore — even a Record cast
     * should show undefined. */
    expect((m as unknown as Record<string, unknown>).kickoffOffsetMin).toBeUndefined()
  })
})

describe('time invariants — past kickoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
    settingsStore.set({ language: 'en', timezone: 'UTC' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('minutesUntilKickoff returns negative for past kickoff', () => {
    const m = makeMatch('2026-06-15T11:00:00.000Z')  // 1h ago
    expect(minutesUntilKickoff(m)).toBe(-60)
  })

  it('statusVerbose for scheduled state with past kickoff renders 0-min bucket', () => {
    /* If a match is still 'scheduled' but kickoff has passed, we render
     * "KICKOFF IN 0 MIN" rather than "KICKOFF IN -60 MIN" or NaN. */
    const m = makeMatch('2026-06-15T11:00:00.000Z')
    expect(statusVerbose(m)).toBe('KICKOFF IN 0 MIN')
  })

  it('kickoffLabel returns empty string when kickoff is in the past', () => {
    const m = makeMatch('2026-06-15T11:00:00.000Z')
    expect(kickoffLabel(m)).toBe('')
  })
})

describe('time invariants — null kickoffAt (TBD knockout slot)', () => {
  it('minutesUntilKickoff returns null when kickoffAt is missing', () => {
    const m: Match = {
      id: 'tbd', stage: 'R16',
      home: null, away: null,
      homeScore: null, awayScore: null,
      homePenalty: null, awayPenalty: null,
      minute: null, state: 'scheduled',
      events: [],
    }
    expect(minutesUntilKickoff(m)).toBeNull()
  })
})
