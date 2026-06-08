import { describe, it, expect } from 'vitest'
import {
  statusVerbose,
  listLeft,
  listRight,
  hasShootout,
  penaltyText,
  eventChip,
  scoreText,
  asciiName,
  stageLabel,
} from '../src/g2/format'
import type { Match, MatchEvent } from '../src/types'

/* Builders that return a fresh Match so a mutation in one test cannot
 * bleed into another. The fields we don't care about per-test default to
 * shapes that pass through statusVerbose / scoreText / listRight cleanly. */
function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm',
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

describe('stageLabel', () => {
  it('returns QUARTERFINAL for QF', () => {
    expect(stageLabel(makeMatch({ stage: 'QF' }))).toBe('QUARTERFINAL')
  })
  it('returns SEMIFINAL for SF', () => {
    expect(stageLabel(makeMatch({ stage: 'SF' }))).toBe('SEMIFINAL')
  })
  it('returns 3RD PLACE for 3rd', () => {
    expect(stageLabel(makeMatch({ stage: '3rd' }))).toBe('3RD PLACE')
  })
  it('returns FINAL for F', () => {
    expect(stageLabel(makeMatch({ stage: 'F' }))).toBe('FINAL')
  })
})

describe('statusVerbose', () => {
  it('shows FIRST HALF with minute when live and minute < 45', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 12 }))).toBe('FIRST HALF  12 MIN')
  })
  it('shows SECOND HALF with minute when live and minute in [47,89]', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 67 }))).toBe('SECOND HALF  67 MIN')
  })
  it('shows HALF TIME at minute 45 or 46', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 45 }))).toBe('HALF TIME')
    expect(statusVerbose(makeMatch({ state: 'live', minute: 46 }))).toBe('HALF TIME')
  })
  it('shows EXTRA TIME during 90-104', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 95 }))).toBe('EXTRA TIME  95 MIN')
  })
  it('shows EXTRA TIME 2 during 105-119', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 110 }))).toBe('EXTRA TIME 2  110 MIN')
  })
  it('shows PENALTIES at minute >= 120', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 120 }))).toBe('PENALTIES')
  })
  it('shows FULL TIME when state=ft (no PEN suffix even when shootout occurred)', () => {
    /* Regression guard: header verbose status must stay clean — the PEN
     * indicator lives in a separate Layer-2 slot. */
    expect(
      statusVerbose(
        makeMatch({
          state: 'ft',
          minute: 120,
          homeScore: 2,
          awayScore: 2,
          homePenalty: 4,
          awayPenalty: 3,
        }),
      ),
    ).toBe('FULL TIME')
  })
  it('shows KICKOFF IN <min> MIN when scheduled and offset < 60', () => {
    expect(statusVerbose(makeMatch({ state: 'scheduled', kickoffOffsetMin: 30 }))).toBe(
      'KICKOFF IN 30 MIN',
    )
  })
  it('shows KICKOFF IN <h>H when scheduled and offset < a day', () => {
    expect(statusVerbose(makeMatch({ state: 'scheduled', kickoffOffsetMin: 60 * 5 }))).toBe(
      'KICKOFF IN 5H',
    )
  })
  it('shows KICKOFF IN <d> DAYS when scheduled and offset >= a day', () => {
    expect(statusVerbose(makeMatch({ state: 'scheduled', kickoffOffsetMin: 60 * 49 }))).toBe(
      'KICKOFF IN 2 DAYS',
    )
  })
})

describe('listLeft', () => {
  it('joins home vs away codes', () => {
    expect(listLeft(makeMatch({ home: 'ARG', away: 'FRA' }))).toBe('ARG vs FRA')
  })
  it('substitutes TBD when a side is unresolved', () => {
    expect(listLeft(makeMatch({ home: null, away: 'BRA' }))).toBe('TBD vs BRA')
    expect(listLeft(makeMatch({ home: 'BRA', away: null }))).toBe('BRA vs TBD')
  })
})

describe('listRight', () => {
  it('shows LIVE <minute>  <h>-<a> when live', () => {
    expect(
      listRight(makeMatch({ state: 'live', minute: 67, homeScore: 1, awayScore: 0 })),
    ).toBe('LIVE 67  1-0')
  })
  it('shows FT <h>-<a> when ft without shootout', () => {
    expect(listRight(makeMatch({ state: 'ft', homeScore: 2, awayScore: 1 }))).toBe('FT  2-1')
  })
  it('shows FT <h>-<a> (<hp>-<ap>p) when ft with shootout', () => {
    /* The "(4-3p)" suffix is THE shootout signal in the list view —
     * regression here would silently drop penalty info from the bracket.*/
    expect(
      listRight(
        makeMatch({
          state: 'ft',
          homeScore: 2,
          awayScore: 2,
          homePenalty: 4,
          awayPenalty: 3,
        }),
      ),
    ).toBe('FT 2-2 (4-3p)')
  })
  it('falls back to kickoffLabel when scheduled', () => {
    expect(listRight(makeMatch({ state: 'scheduled', kickoffOffsetMin: 30 }))).toBe('in 30m')
    /* 25h rounds to 1 day → "Tomorrow" by kickoffLabel's bucketing. */
    expect(listRight(makeMatch({ state: 'scheduled', kickoffOffsetMin: 60 * 25 }))).toBe('Tomorrow')
    /* 3h doesn't round into days yet, so we see the hour bucket. */
    expect(listRight(makeMatch({ state: 'scheduled', kickoffOffsetMin: 60 * 3 }))).toBe('3h')
  })
})

describe('hasShootout', () => {
  it('returns true when both penalty fields are set', () => {
    expect(hasShootout(makeMatch({ homePenalty: 4, awayPenalty: 3 }))).toBe(true)
  })
  it('returns false when either penalty field is null', () => {
    expect(hasShootout(makeMatch({ homePenalty: null, awayPenalty: 3 }))).toBe(false)
    expect(hasShootout(makeMatch({ homePenalty: 4, awayPenalty: null }))).toBe(false)
    expect(hasShootout(makeMatch({ homePenalty: null, awayPenalty: null }))).toBe(false)
  })
})

describe('penaltyText', () => {
  it('returns "" when no shootout', () => {
    expect(penaltyText(makeMatch({ homePenalty: null, awayPenalty: null }))).toBe('')
  })
  it('returns PEN <h>-<a> when shootout', () => {
    expect(penaltyText(makeMatch({ homePenalty: 4, awayPenalty: 3 }))).toBe('PEN 4-3')
  })
})

describe('eventChip', () => {
  const cases: Array<[MatchEvent['type'], string]> = [
    ['goal', 'GOAL'],
    ['yellow', 'YEL'],
    ['red', 'RED'],
    ['ht', 'HT'],
    ['ft', 'FT'],
    ['sub', 'SUB'],
  ]
  for (const [type, expected] of cases) {
    it(`maps ${type} → ${expected}`, () => {
      expect(eventChip({ minute: 0, type, side: null })).toBe(expected)
    })
  }
})

describe('scoreText', () => {
  it('returns "h : a" with spaces around the colon when live', () => {
    expect(scoreText(makeMatch({ state: 'live', homeScore: 1, awayScore: 0 }))).toBe('1 : 0')
  })
  it('returns "h : a" when ft', () => {
    expect(scoreText(makeMatch({ state: 'ft', homeScore: 2, awayScore: 1 }))).toBe('2 : 1')
  })
  it('returns "v" when scheduled', () => {
    expect(scoreText(makeMatch({ state: 'scheduled' }))).toBe('v')
  })
})

describe('asciiName', () => {
  it('strips diacritics from common Latin accented chars', () => {
    /* NFD decomposes é → e + combining acute, then the combining-mark
     * regex strips the acute, leaving e. */
    expect(asciiName('Mbappé')).toBe('Mbappe')
    expect(asciiName('Álvarez')).toBe('Alvarez')
    expect(asciiName('Di María')).toBe('Di Maria')
  })
  it('strips non-printable + non-ASCII chars', () => {
    expect(asciiName('helloworld')).toBe('helloworld')
    /* Smart quotes / em dash / CJK — outside printable ASCII, all stripped. */
    expect(asciiName('“quote” — 中文')).toBe('quote  ')
  })
  it('PRESERVES \\n so multi-line strings survive sanitization', () => {
    /* Regression guard: callers join lines with \n then asciiName the
     * result in one pass. Earlier impl stripped \n, which collapsed
     * stage+status onto one line on the G2 display. */
    expect(asciiName('PEN\n4-2')).toBe('PEN\n4-2')
    expect(asciiName('QUARTERFINAL\nFULL TIME')).toBe('QUARTERFINAL\nFULL TIME')
    expect(asciiName('Mbappé\nÁlvarez')).toBe('Mbappe\nAlvarez')
  })
})
