import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  transformMatch,
  transformEvent,
  transformEvents,
  type ISportsMatch,
  type ISportsEvent,
} from '../server/isports/transform'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadFixture<T = unknown>(name: string): T {
  const path = resolve(__dirname, '..', 'server', 'fixtures', name)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

interface FixtureEnvelope<T> {
  code: number
  message: string
  data: T[]
}

const wcSchedule = loadFixture<FixtureEnvelope<ISportsMatch>>('schedule-wc2026.json')
const livescores = loadFixture<FixtureEnvelope<ISportsMatch>>('livescores.json')
const eventsFixture = loadFixture<FixtureEnvelope<{ matchId: string; events: ISportsEvent[] }>>('events.json')

describe('transformMatch — WC 2026 schedule', () => {
  it('produces at least one clean Match from the WC fixture', () => {
    const transformed = wcSchedule.data
      .map((row) => transformMatch(row))
      .filter((m): m is NonNullable<typeof m> => m !== null)
    expect(transformed.length).toBeGreaterThan(0)
  })

  it('Mexico vs South Africa: both teams map after #1A expansion (MEX vs RSA)', () => {
    const row = wcSchedule.data.find(
      (m) => m.homeName === 'Mexico' && m.awayName === 'South Africa',
    )
    expect(row).toBeDefined()
    /* RSA was added to TeamCode + teamMap per David's #1A decision (the
     * iSports projection had 10 nations missing from the original mock).
     * Now the match transforms cleanly instead of dropping. */
    const out = transformMatch(row!)
    expect(out).not.toBeNull()
    expect(out!.home).toBe('MEX')
    expect(out!.away).toBe('RSA')
    expect(out!.stage).toBe('GS')
  })

  it('USA vs Paraguay group-stage match maps cleanly', () => {
    const row = wcSchedule.data.find(
      (m) => m.homeName === 'USA' && m.awayName === 'Paraguay',
    )
    expect(row).toBeDefined()
    const out = transformMatch(row!)
    expect(out).not.toBeNull()
    expect(out!.home).toBe('USA')
    expect(out!.away).toBe('PAR')
    expect(out!.state).toBe('scheduled')
    expect(out!.stage).toBe('GS')
    expect(out!.id).toBe(row!.matchId)
    /* Scheduled matches don't carry scores. */
    expect(out!.homeScore).toBeNull()
    expect(out!.awayScore).toBeNull()
    expect(out!.homePenalty).toBeNull()
    expect(out!.awayPenalty).toBeNull()
    expect(out!.minute).toBeNull()
  })

  it('drops matches not in the requested league when leagueId is set', () => {
    /* /livescores is multi-league; filter to leagueId=1572 (WC). The
     * sample doesn't have any live WC matches, so the filtered output
     * should be empty without throwing. */
    const filtered = livescores.data
      .map((row) => transformMatch(row, { leagueId: '1572' }))
      .filter((m): m is NonNullable<typeof m> => m !== null)
    expect(filtered).toEqual([])
  })

  it('drops cancelled / postponed statuses', () => {
    const cancelled: ISportsMatch = {
      matchId: 'x',
      status: -14, // postponed
      homeId: '797', homeName: 'USA',
      awayId: '776', awayName: 'Paraguay',
      round: 'Group stage', group: 'D',
    }
    expect(transformMatch(cancelled)).toBeNull()
  })

  it('drops 1/16Final (round of 32) matches — no slot in Stage', () => {
    const r32 = wcSchedule.data.find((m) => m.round === '1/16Final')
    expect(r32).toBeDefined()
    expect(transformMatch(r32!)).toBeNull()
  })

  it('carries pen scores through when a shootout happened', () => {
    /* Synthesise a FT match with a shootout — uses real WC team ids. */
    const synth: ISportsMatch = {
      matchId: 'pen-1',
      leagueId: '1572',
      status: -1,
      homeId: '772', homeName: 'Spain',
      awayId: '649', awayName: 'France',
      round: 'Finals', group: '',
      homeScore: 1, awayScore: 1,
      extraExplain: {
        minute: 120,
        homeScore: 1, awayScore: 1,
        extraTimeStatus: 1,
        extraHomeScore: 1, extraAwayScore: 1,
        penHomeScore: 5, penAwayScore: 3,
      },
    }
    const out = transformMatch(synth)
    expect(out).not.toBeNull()
    expect(out!.state).toBe('ft')
    expect(out!.stage).toBe('F')
    expect(out!.homeScore).toBe(1)
    expect(out!.awayScore).toBe(1)
    expect(out!.homePenalty).toBe(5)
    expect(out!.awayPenalty).toBe(3)
  })

  it('reports current minute for a live match', () => {
    const synth: ISportsMatch = {
      matchId: 'live-1',
      leagueId: '1572',
      status: 3, // second half
      homeId: '766', homeName: 'Argentina',
      awayId: '778', awayName: 'Brazil',
      round: 'Group stage', group: 'C',
      homeScore: 1, awayScore: 0,
      extraExplain: { minute: 67 },
    }
    const out = transformMatch(synth)
    expect(out).not.toBeNull()
    expect(out!.state).toBe('live')
    expect(out!.minute).toBe(67)
    expect(out!.homeScore).toBe(1)
    expect(out!.awayScore).toBe(0)
    /* No shootout reported → penalty fields stay null. */
    expect(out!.homePenalty).toBeNull()
    expect(out!.awayPenalty).toBeNull()
  })
})

describe('transformEvent — events fixture', () => {
  /* Pick the first real events row that has a goal. */
  const matchWithGoal = eventsFixture.data.find((r) =>
    r.events.some((e) => e.type === 1),
  )!
  const goalRow = matchWithGoal.events.find((e) => e.type === 1)!

  it('maps a goal event with side + minute + player', () => {
    const ev = transformEvent(goalRow)
    expect(ev.type).toBe('goal')
    /* homeEvent=true → 'home', homeEvent=false → 'away'. */
    expect(ev.side).toBe(goalRow.homeEvent ? 'home' : 'away')
    expect(ev.minute).toBe(parseInt(String(goalRow.minute), 10))
    expect(ev.player).toBe(goalRow.playerName)
    expect(ev.eventId).toBe(goalRow.eventId)
  })

  it('maps a yellow card event (iSports type=3)', () => {
    const yelRow = eventsFixture.data
      .flatMap((r) => r.events)
      .find((e) => e.type === 3)
    expect(yelRow).toBeDefined()
    const ev = transformEvent(yelRow!)
    expect(ev.type).toBe('yellow')   /* docs: type=3 IS yellow card */
    expect(ev.side).toBe(yelRow!.homeEvent ? 'home' : 'away')
  })

  it('maps a red card event (iSports type=2)', () => {
    const redRow = eventsFixture.data
      .flatMap((r) => r.events)
      .find((e) => e.type === 2)
    expect(redRow).toBeDefined()
    const ev = transformEvent(redRow!)
    expect(ev.type).toBe('red')      /* docs: type=2 IS red card */
  })

  it('uses overtime minute when present (e.g. 95+)', () => {
    const ev = transformEvent({
      eventId: 'x', minute: '90', type: 1,
      playerName: 'X', overtime: '95', homeEvent: true,
    })
    expect(ev.minute).toBe(95)
  })

  it('splits sub events using iSports arrow form (PlayerOn↑PlayerOff↓)', () => {
    /* Authoritative per docs id=15. Type=11 (not 4). */
    const ev = transformEvent({
      eventId: 'sub-1',
      minute: '67',
      type: 11,
      playerName: 'Kacper Nowakowski↑Szymon Bartlewicz↓',
      homeEvent: true,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBe('Szymon Bartlewicz')   /* down arrow = off */
    expect(ev.playerIn).toBe('Kacper Nowakowski') /* up arrow = on */
    expect(ev.side).toBe('home')
  })

  it('falls back to (Assists:…) form for sub if arrow form is absent', () => {
    const ev = transformEvent({
      eventId: 'sub-2', minute: '70', type: 11,
      playerName: 'PlayerOff(Assists:PlayerOn)', homeEvent: false,
    })
    expect(ev.type).toBe('sub')
    expect(ev.player).toBe('PlayerOff')
    expect(ev.playerIn).toBe('PlayerOn')
  })

  it('transformEvents drops events with unmapped types (penalty missed=13, VAR=14)', () => {
    const rows: ISportsEvent[] = [
      { type: 1, playerName: 'Goal', minute: '10', homeEvent: true },
      { type: 13, playerName: 'PenMissed', minute: '20', homeEvent: false },
      { type: 14, playerName: 'VAR', minute: '21', homeEvent: false },
      { type: 3, playerName: 'Yel', minute: '30', homeEvent: false },
    ]
    const out = transformEvents(rows)
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.type)).toEqual(['goal', 'yellow'])
  })

  it('penalty scored (type=7) and own goal (type=8) both map to goal', () => {
    expect(transformEvent({ type: 7, minute: '12', playerName: 'P', homeEvent: true }).type).toBe('goal')
    expect(transformEvent({ type: 8, minute: '13', playerName: 'OG', homeEvent: false }).type).toBe('goal')
  })

  it('second yellow (type=9) maps to red', () => {
    expect(transformEvent({ type: 9, minute: '88', playerName: 'X', homeEvent: true }).type).toBe('red')
  })

  it('handles null homeEvent → side=null without crashing', () => {
    const ev = transformEvent({
      type: 1, minute: '5', playerName: 'Mystery',
    })
    expect(ev.side).toBeNull()
  })
})
