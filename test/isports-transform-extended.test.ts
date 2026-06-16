/* Extended edge-case coverage for the iSports transform layer.
 *
 * The base test file (isports-transform.test.ts) covers the happy paths
 * with the live fixtures. This file goes after the boundary conditions —
 * unusual event types, score-fallback rules, side resolution, stage
 * decoder fan-out, and the dropped-row paths in transformMatch.
 *
 * Determinism: any test that depends on "now" stubs the clock with
 * vi.useFakeTimers so kickoffAt-derived assertions are stable across machines.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  transformMatch,
  transformEvent,
  transformEvents,
  type ISportsMatch,
  type ISportsEvent,
} from '../server/isports/transform'

/* ────────────────────────────────────────────────────────────────────────
 * transformEvent — event-type fan-out
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformEvent — full event-type coverage', () => {
  it('type=8 (own goal) decodes to "goal" with side derived from homeEvent=true', () => {
    const ev = transformEvent({
      eventId: 'og-1',
      minute: '34',
      type: 8,
      playerName: 'Own Goaler',
      homeEvent: true,
    })
    expect(ev.type).toBe('goal')
    expect(ev.side).toBe('home')
    expect(ev.player).toBe('Own Goaler')
    expect(ev.minute).toBe(34)
  })

  it('type=8 (own goal) decodes to "goal" with side="away" when homeEvent=false', () => {
    const ev = transformEvent({
      eventId: 'og-2',
      minute: '57',
      type: 8,
      playerName: 'Defender X',
      homeEvent: false,
    })
    expect(ev.type).toBe('goal')
    expect(ev.side).toBe('away')
  })

  it('type=7 (penalty scored) decodes to "goal"', () => {
    const ev = transformEvent({
      eventId: 'pk-1',
      minute: '78',
      type: 7,
      playerName: 'Pen Taker',
      homeEvent: true,
    })
    expect(ev.type).toBe('goal')
    expect(ev.player).toBe('Pen Taker')
  })

  it('type=9 (second yellow → red) decodes to "red"', () => {
    const ev = transformEvent({
      eventId: 'sy-1',
      minute: '88',
      type: 9,
      playerName: 'Two Yellows',
      homeEvent: false,
    })
    expect(ev.type).toBe('red')
    expect(ev.side).toBe('away')
  })

  it('transformEvents drops unknown type ints', () => {
    /* type=4 was a historical guess that turned out wrong; type=99 is
     * a sentinel "never been seen" int. Both must vanish. */
    const rows: ISportsEvent[] = [
      { type: 4, playerName: 'gone-A', minute: '5', homeEvent: true },
      { type: 99, playerName: 'gone-B', minute: '6', homeEvent: false },
    ]
    expect(transformEvents(rows)).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformEvent — overtime / minute precedence
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformEvent — overtime + minute precedence', () => {
  it('overtime > 0 wins over baseMinute (e.g. 96 + 0 base)', () => {
    const ev = transformEvent({
      type: 1, minute: '0', overtime: '96',
      playerName: 'Late Hero', homeEvent: true,
    })
    expect(ev.minute).toBe(96)
  })

  it('overtime > 0 wins over baseMinute when both non-zero', () => {
    /* When iSports reports e.g. minute=90, overtime=95 ("90+5") we want
     * the overtime value because that's the meaningful "added time"
     * clock the UI shows. */
    const ev = transformEvent({
      type: 1, minute: '90', overtime: '95',
      playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(95)
  })

  it('both zero → minute = 0', () => {
    const ev = transformEvent({
      type: 1, minute: '0', overtime: '0',
      playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(0)
  })

  it('overtime=0 + baseMinute>0 → baseMinute wins', () => {
    const ev = transformEvent({
      type: 1, minute: '45', overtime: '0',
      playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(45)
  })

  it('both fields missing → minute = 0', () => {
    const ev = transformEvent({
      type: 1, playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(0)
  })

  it('accepts numeric minute (extraExplain shape) as well as string', () => {
    const ev = transformEvent({
      type: 1, minute: 67, playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(67)
  })

  it('non-numeric minute string degrades to 0 instead of NaN', () => {
    const ev = transformEvent({
      type: 1, minute: 'abc', playerName: 'X', homeEvent: true,
    })
    expect(ev.minute).toBe(0)
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformEvent — substitution name parsing
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformEvent — substitution name parsing', () => {
  it('arrow form: PlayerOn↑PlayerOff↓ → player=Off, playerIn=On', () => {
    const ev = transformEvent({
      eventId: 's',
      type: 11,
      minute: '60',
      playerName: 'NewGuy↑OldGuy↓',
      homeEvent: true,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBe('OldGuy')
    expect(ev.playerIn).toBe('NewGuy')
  })

  it('arrow form tolerates surrounding whitespace', () => {
    const ev = transformEvent({
      type: 11, minute: '70',
      playerName: '  NewGuy  ↑  OldGuy  ↓  ',
      homeEvent: false,
    })
    expect(ev.player).toBe('OldGuy')
    expect(ev.playerIn).toBe('NewGuy')
  })

  it('paren fallback: Off(Assists:On) → player=Off, playerIn=On', () => {
    const ev = transformEvent({
      type: 11, minute: '70',
      playerName: 'OffGuy(Assists:OnGuy)',
      homeEvent: false,
    })
    expect(ev.player).toBe('OffGuy')
    expect(ev.playerIn).toBe('OnGuy')
  })

  it('paren fallback also accepts singular "Assist:" spelling (case-insensitive)', () => {
    const ev = transformEvent({
      type: 11, minute: '70',
      playerName: 'OffGuy(assist:OnGuy)',
      homeEvent: true,
    })
    expect(ev.player).toBe('OffGuy')
    expect(ev.playerIn).toBe('OnGuy')
  })

  it('sub with raw name only (no pattern match) → player=rawName, playerIn from assistPlayerName', () => {
    const ev = transformEvent({
      type: 11, minute: '80',
      playerName: 'SoloName',
      assistPlayerName: 'OtherSolo',
      homeEvent: true,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBe('SoloName')
    expect(ev.playerIn).toBe('OtherSolo')
  })

  it('sub with raw name only and no assistPlayerName leaves playerIn undefined', () => {
    const ev = transformEvent({
      type: 11, minute: '81',
      playerName: 'JustOne',
      homeEvent: true,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBe('JustOne')
    expect(ev.playerIn).toBeUndefined()
  })

  it('sub with empty playerName leaves player + playerIn unset', () => {
    const ev = transformEvent({
      type: 11, minute: '82',
      playerName: '',
      homeEvent: true,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBeUndefined()
    expect(ev.playerIn).toBeUndefined()
  })

  it('non-sub events keep full string in player (goal+assist preserved)', () => {
    const ev = transformEvent({
      type: 1, minute: '20',
      playerName: 'Scorer(Assist:Assister)',
      homeEvent: true,
    })
    expect(ev.type).toBe('goal')
    /* Critical: do NOT split the assist into playerIn for non-sub events. */
    expect(ev.player).toBe('Scorer(Assist:Assister)')
    expect(ev.playerIn).toBeUndefined()
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformEvent — side resolution
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformEvent — side resolution', () => {
  it('homeEvent=true → side=home', () => {
    const ev = transformEvent({ type: 1, minute: '1', playerName: 'X', homeEvent: true })
    expect(ev.side).toBe('home')
  })

  it('homeEvent=false → side=away', () => {
    const ev = transformEvent({ type: 1, minute: '1', playerName: 'X', homeEvent: false })
    expect(ev.side).toBe('away')
  })

  it('missing homeEvent → side=null', () => {
    const ev = transformEvent({ type: 1, minute: '1', playerName: 'X' })
    expect(ev.side).toBeNull()
  })

  it('homeEvent explicitly undefined → side=null', () => {
    const ev = transformEvent({
      type: 1, minute: '1', playerName: 'X', homeEvent: undefined,
    })
    expect(ev.side).toBeNull()
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformEvents — array semantics
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformEvents — order + filtering', () => {
  it('preserves order of mappable rows while dropping unmappable in-between', () => {
    const rows: ISportsEvent[] = [
      { type: 1, playerName: 'A', minute: '5', homeEvent: true },
      { type: 13, playerName: 'PenMiss', minute: '6', homeEvent: false }, // drop
      { type: 3, playerName: 'B', minute: '7', homeEvent: false },
      { type: 14, playerName: 'VAR', minute: '8', homeEvent: true }, // drop
      { type: 11, playerName: 'On↑Off↓', minute: '9', homeEvent: true },
      { type: 99, playerName: 'Unknown', minute: '10', homeEvent: false }, // drop
      { type: 8, playerName: 'OG', minute: '11', homeEvent: true },
    ]
    const out = transformEvents(rows)
    expect(out.map((e) => e.type)).toEqual(['goal', 'yellow', 'sub', 'goal'])
    expect(out.map((e) => e.player)).toEqual(['A', 'B', 'Off', 'OG'])
  })

  it('returns empty array for empty input', () => {
    expect(transformEvents([])).toEqual([])
  })

  it('returns empty array if every row is unmappable', () => {
    const rows: ISportsEvent[] = [
      { type: 13, playerName: 'x', minute: '1', homeEvent: true },
      { type: 14, playerName: 'y', minute: '2', homeEvent: false },
      { type: 99, playerName: 'z', minute: '3', homeEvent: true },
    ]
    expect(transformEvents(rows)).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformMatch — score / penalty handling
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformMatch — score + penalty extraction', () => {
  /* Fixed "now" so kickoffAt-derived assertions are deterministic. */
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('extracts pen scores from extraExplain when status=5 (shootout in progress)', () => {
    const synth: ISportsMatch = {
      matchId: 'shoot-1',
      status: 5, // penalty shootout in progress
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 1, awayScore: 1,
      extraExplain: {
        minute: 120,
        penHomeScore: 3, penAwayScore: 2,
      },
    }
    const out = transformMatch(synth)
    expect(out).not.toBeNull()
    expect(out!.state).toBe('live') // shootout still counts as live per decode
    expect(out!.homePenalty).toBe(3)
    expect(out!.awayPenalty).toBe(2)
  })

  it('extracts pen scores when extraTimeStatus indicates shootout (status=-1)', () => {
    const synth: ISportsMatch = {
      matchId: 'shoot-2',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 1, awayScore: 1,
      extraExplain: {
        extraTimeStatus: 1,
        penHomeScore: 4, penAwayScore: 5,
      },
    }
    const out = transformMatch(synth)
    expect(out!.state).toBe('ft')
    expect(out!.homePenalty).toBe(4)
    expect(out!.awayPenalty).toBe(5)
  })

  it('treats penHome=0 + penAway>0 as a real shootout (preserves zero)', () => {
    /* Defensive: if only ONE pen score is non-zero, the other side took
     * zero — but it still happened. The transform should surface both,
     * not collapse the zero to null. */
    const synth: ISportsMatch = {
      matchId: 'shoot-3',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 0, awayScore: 0,
      extraExplain: { penHomeScore: 0, penAwayScore: 3 },
    }
    const out = transformMatch(synth)
    expect(out!.homePenalty).toBe(0)
    expect(out!.awayPenalty).toBe(3)
  })

  it('no pen fields → homePenalty/awayPenalty both null', () => {
    const synth: ISportsMatch = {
      matchId: 'no-pen',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 2, awayScore: 1,
      extraExplain: { minute: 90 },
    }
    const out = transformMatch(synth)
    expect(out!.homePenalty).toBeNull()
    expect(out!.awayPenalty).toBeNull()
  })

  it('both pen scores 0 (or missing) → null (no shootout flagged)', () => {
    const synth: ISportsMatch = {
      matchId: 'no-pen-2',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 1, awayScore: 0,
      extraExplain: { penHomeScore: 0, penAwayScore: 0 },
    }
    const out = transformMatch(synth)
    expect(out!.homePenalty).toBeNull()
    expect(out!.awayPenalty).toBeNull()
  })

  it('scheduled match has null scores even when raw carries 0,0', () => {
    const synth: ISportsMatch = {
      matchId: 'sched-1',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 0, awayScore: 0,
    }
    const out = transformMatch(synth)
    expect(out!.state).toBe('scheduled')
    expect(out!.homeScore).toBeNull()
    expect(out!.awayScore).toBeNull()
    expect(out!.minute).toBeNull()
  })

  it('live match with extraExplain.minute=0 → minute=null (clock not started)', () => {
    const synth: ISportsMatch = {
      matchId: 'live-zero',
      status: 1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 0, awayScore: 0,
      extraExplain: { minute: 0 },
    }
    const out = transformMatch(synth)
    expect(out!.state).toBe('live')
    expect(out!.minute).toBeNull()
  })

  it('live match with no extraExplain block → minute=null', () => {
    const synth: ISportsMatch = {
      matchId: 'live-no-ex',
      status: 1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 0, awayScore: 0,
    }
    const out = transformMatch(synth)
    expect(out!.minute).toBeNull()
  })

  it('ft match has homeScore/awayScore fallback to 0 when undefined', () => {
    const synth: ISportsMatch = {
      matchId: 'ft-noscore',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
    }
    const out = transformMatch(synth)
    expect(out!.state).toBe('ft')
    expect(out!.homeScore).toBe(0)
    expect(out!.awayScore).toBe(0)
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformMatch — dropped rows
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformMatch — drop conditions', () => {
  it('returns null when both homeId and homeName are missing', () => {
    const synth: ISportsMatch = {
      matchId: 'no-home',
      status: 0,
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null when both awayId and awayName are missing', () => {
    const synth: ISportsMatch = {
      matchId: 'no-away',
      status: 0,
      homeId: '772', homeName: 'Spain',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null when team name is unknown and id is unknown', () => {
    const synth: ISportsMatch = {
      matchId: 'unknown-team',
      status: 0,
      homeId: '999999', homeName: 'Atlantis',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('resolves via name even when id is unknown (fallback path)', () => {
    /* homeId is not in TEAM_ID_TO_CODE but homeName "Spain" IS in the
     * name map, so the row should still survive. */
    const synth: ISportsMatch = {
      matchId: 'name-fallback',
      status: 0,
      homeId: 'unknown-id-9999', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    const out = transformMatch(synth)
    expect(out).not.toBeNull()
    expect(out!.home).toBe('ESP')
  })

  it('returns null for round = "1/16Final" (no Stage slot)', () => {
    const synth: ISportsMatch = {
      matchId: 'r32',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: '1/16Final', group: '',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null for an unknown round string', () => {
    const synth: ISportsMatch = {
      matchId: 'wat',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Friendlies', group: '',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null when round is missing entirely (defaults to empty → unknown)', () => {
    const synth: ISportsMatch = {
      matchId: 'no-round',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null for cancelled status (-10)', () => {
    const synth: ISportsMatch = {
      matchId: 'canc',
      status: -10,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth)).toBeNull()
  })

  it('returns null when leagueId filter is set and row is from a different league', () => {
    const synth: ISportsMatch = {
      matchId: 'wrong-league',
      leagueId: '9999',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth, { leagueId: '1572' })).toBeNull()
  })

  it('passes through when leagueId matches the filter', () => {
    const synth: ISportsMatch = {
      matchId: 'right-league',
      leagueId: '1572',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth, { leagueId: '1572' })).not.toBeNull()
  })

  it('returns null when leagueId filter is set but row has no leagueId field', () => {
    /* raw.leagueId === undefined !== '1572' so the filter rejects. */
    const synth: ISportsMatch = {
      matchId: 'no-league',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    expect(transformMatch(synth, { leagueId: '1572' })).toBeNull()
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformMatch — group handling + stage decoder integration
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformMatch — stage decoder + group handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  /* Shared synth helper — supplies real WC team ids for each row. */
  function synth(round: string, group?: string): ISportsMatch {
    return {
      matchId: `stage-${round}-${group ?? 'none'}`,
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round,
      group,
    }
  }

  it('every observed iSports round value decodes to the right Stage', () => {
    expect(transformMatch(synth('Group stage', 'A'))!.stage).toBe('GS')
    expect(transformMatch(synth('1/8 Final', ''))!.stage).toBe('R16')
    expect(transformMatch(synth('Quarterfinals', ''))!.stage).toBe('QF')
    expect(transformMatch(synth('Semifinal', ''))!.stage).toBe('SF')
    expect(transformMatch(synth('Third runner', ''))!.stage).toBe('3rd')
    expect(transformMatch(synth('Finals', ''))!.stage).toBe('F')
    /* 1/16Final has no Stage slot → row dropped. */
    expect(transformMatch(synth('1/16Final', ''))).toBeNull()
  })

  it('group="" vs group=undefined both decode fine — group is unused by stage decoder', () => {
    expect(transformMatch(synth('Group stage', ''))!.stage).toBe('GS')
    expect(transformMatch(synth('Group stage', undefined))!.stage).toBe('GS')
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformMatch — status fan-out
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformMatch — state from status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  function base(status: number): ISportsMatch {
    return {
      matchId: `state-${status}`,
      status,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 1, awayScore: 0,
    }
  }

  it('status=0 → scheduled', () => {
    expect(transformMatch(base(0))!.state).toBe('scheduled')
  })

  it('status=1 → live (first half)', () => {
    expect(transformMatch(base(1))!.state).toBe('live')
  })

  it('status=2 → live (half time)', () => {
    expect(transformMatch(base(2))!.state).toBe('live')
  })

  it('status=3 → live (second half)', () => {
    expect(transformMatch(base(3))!.state).toBe('live')
  })

  it('status=4 → live (extra time)', () => {
    expect(transformMatch(base(4))!.state).toBe('live')
  })

  it('status=5 → live (shootout)', () => {
    expect(transformMatch(base(5))!.state).toBe('live')
  })

  it('status=-1 → ft', () => {
    expect(transformMatch(base(-1))!.state).toBe('ft')
  })

  it('status=-11 (TBD) → scheduled', () => {
    expect(transformMatch(base(-11))!.state).toBe('scheduled')
  })
})

/* ────────────────────────────────────────────────────────────────────────
 * transformMatch — kickoff fields
 * ──────────────────────────────────────────────────────────────────────── */

describe('transformMatch — kickoff conversion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('positive matchTime → kickoffAt ISO', () => {
    /* matchTime is Unix seconds. Pick 30 min from "now" = 2026-06-15T12:30:00Z.
     * No "offset" assertion — that field was removed; the offset is derived
     * at render time via minutesUntilKickoff(kickoffAt). */
    const futureSec = Math.floor(new Date('2026-06-15T12:30:00Z').getTime() / 1000)
    const synth: ISportsMatch = {
      matchId: 'k-1',
      status: 0,
      matchTime: futureSec,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    const out = transformMatch(synth)
    expect(out!.kickoffAt).toBe('2026-06-15T12:30:00.000Z')
  })

  it('matchTime in the past → kickoffAt set to that past instant', () => {
    const pastSec = Math.floor(new Date('2026-06-15T11:00:00Z').getTime() / 1000)
    const synth: ISportsMatch = {
      matchId: 'k-2',
      status: -1,
      matchTime: pastSec,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 2, awayScore: 1,
    }
    const out = transformMatch(synth)
    expect(out!.kickoffAt).toBe('2026-06-15T11:00:00.000Z')
  })

  it('matchTime missing → kickoffAt undefined', () => {
    const synth: ISportsMatch = {
      matchId: 'k-3',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    const out = transformMatch(synth)
    expect(out!.kickoffAt).toBeUndefined()
  })

  it('matchTime === 0 treated as "missing" (no kickoffAt)', () => {
    const synth: ISportsMatch = {
      matchId: 'k-4',
      status: 0,
      matchTime: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    const out = transformMatch(synth)
    expect(out!.kickoffAt).toBeUndefined()
  })

  it('venue is carried through when location is set', () => {
    const synth: ISportsMatch = {
      matchId: 'k-5',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      location: 'MetLife Stadium',
    }
    const out = transformMatch(synth)
    expect(out!.venue).toBe('MetLife Stadium')
  })

  it('venue is undefined when location is not set', () => {
    const synth: ISportsMatch = {
      matchId: 'k-6',
      status: 0,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
    }
    const out = transformMatch(synth)
    expect(out!.venue).toBeUndefined()
  })

  it('events array on output is always empty (events come from a separate feed)', () => {
    const synth: ISportsMatch = {
      matchId: 'k-7',
      status: 1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Group stage', group: 'A',
      homeScore: 0, awayScore: 0,
    }
    const out = transformMatch(synth)
    expect(out!.events).toEqual([])
  })
})
