import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  liveMinute,
  asciiName,
  statusVerbose,
  listLeft,
  listRight,
  eventChip,
  stageLabel,
  penaltyText,
  hasShootout,
  kickoffGlassesLabel,
} from '../src/g2/format'
import type { Match, MatchEvent, Stage } from '../src/types'
import type { Locale } from '../src/i18n'
import { settingsStore } from '../src/state/settingsStore'

/* Match builder mirroring test/format.test.ts — fresh object per test so
 * one test's mutation can't bleed into the next. */
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
    events: [],
    ...overrides,
  }
}

/* Restore the settingsStore singleton between tests. The store is shared
 * module-level state — any test that flips language/timezone has to put
 * it back or it leaks into format.test.ts (which assumes EN + system TZ). */
let savedLanguage: Locale
let savedTimezone: string

beforeEach(() => {
  const s = settingsStore.get()
  savedLanguage = s.language
  savedTimezone = s.timezone
})

afterEach(() => {
  settingsStore.set({ language: savedLanguage, timezone: savedTimezone })
  vi.useRealTimers()
})

/* ── liveMinute ─────────────────────────────────────────────────────────── */

describe('liveMinute', () => {
  /* Pin Date.now to a known wall clock so elapsed math is deterministic.
   * Match kicked off at NOW - <elapsed minutes>. */
  function withFrozenNow(nowIso: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(nowIso))
  }
  function kickoffMinutesAgo(now: string, minutes: number): string {
    return new Date(new Date(now).getTime() - minutes * 60_000).toISOString()
  }

  it('returns null when state is not live (even with kickoffAt)', () => {
    withFrozenNow('2026-06-15T12:00:00Z')
    const m = makeMatch({ state: 'scheduled', kickoffAt: kickoffMinutesAgo('2026-06-15T12:00:00Z', 30) })
    expect(liveMinute(m)).toBeNull()
  })

  it('returns null when live but no kickoffAt and no server minute', () => {
    const m = makeMatch({ state: 'live' })
    expect(liveMinute(m)).toBeNull()
  })

  it('returns null when kickoff is in the future (negative elapsed)', () => {
    withFrozenNow('2026-06-15T12:00:00Z')
    const m = makeMatch({
      state: 'live',
      kickoffAt: new Date('2026-06-15T12:05:00Z').toISOString(),
    })
    expect(liveMinute(m)).toBeNull()
  })

  it('returns elapsed during the 1st half (elapsed 0..44)', () => {
    const now = '2026-06-15T12:00:00Z'
    withFrozenNow(now)
    for (const e of [0, 1, 12, 30, 44]) {
      const m = makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, e) })
      expect(liveMinute(m)).toBe(e)
    }
  })

  it('pins at 45 during the halftime window (elapsed 45..59)', () => {
    const now = '2026-06-15T12:00:00Z'
    withFrozenNow(now)
    for (const e of [45, 46, 50, 59]) {
      const m = makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, e) })
      expect(liveMinute(m)).toBe(45)
    }
  })

  it('subtracts the 15min HT break after elapsed >= 60', () => {
    const now = '2026-06-15T12:00:00Z'
    withFrozenNow(now)
    expect(liveMinute(makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, 60) }))).toBe(45)
    expect(liveMinute(makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, 75) }))).toBe(60)
    expect(liveMinute(makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, 105) }))).toBe(90)
  })

  it('caps the derived clock at 120 (end of ET regulation)', () => {
    const now = '2026-06-15T12:00:00Z'
    withFrozenNow(now)
    /* 200 min elapsed - 15 HT = 185, capped at 120. */
    const m = makeMatch({ state: 'live', kickoffAt: kickoffMinutesAgo(now, 200) })
    expect(liveMinute(m)).toBe(120)
  })

  it('server-provided minute always wins, even when state is not live', () => {
    /* `m.minute != null` returns first, no state or kickoff check. */
    const m = makeMatch({ state: 'scheduled', minute: 77 })
    expect(liveMinute(m)).toBe(77)
  })

  it('server-provided minute beats the derived elapsed clock', () => {
    const now = '2026-06-15T12:00:00Z'
    withFrozenNow(now)
    /* Elapsed would derive 30, but the server says 88 — server wins. */
    const m = makeMatch({
      state: 'live',
      minute: 88,
      kickoffAt: kickoffMinutesAgo(now, 30),
    })
    expect(liveMinute(m)).toBe(88)
  })

  it('treats server minute 0 as a real value (not null)', () => {
    const m = makeMatch({ state: 'live', minute: 0 })
    expect(liveMinute(m)).toBe(0)
  })
})

/* ── asciiName ──────────────────────────────────────────────────────────── */

describe('asciiName extended', () => {
  it('returns empty string for empty input', () => {
    expect(asciiName('')).toBe('')
  })

  it('passes CJK (Chinese/Japanese) names through unchanged', () => {
    /* Hangul jamo decompose under NFD into L/V/T sequences (not combining
     * marks, so visually identical but byte-different). Only assert
     * Chinese + Japanese here — Korean would assert NFD-form equivalence,
     * not the canonical "passes through" intent. */
    expect(asciiName('美国')).toBe('美国')
    expect(asciiName('日本')).toBe('日本')
    expect(asciiName('テスト')).toBe('テスト')
  })

  it('mixed CJK + Latin: CJK preserved, Latin accent stripped', () => {
    expect(asciiName('Mbappé 美国')).toBe('Mbappe 美国')
    expect(asciiName('中文 Álvarez')).toBe('中文 Alvarez')
  })

  it('does not truncate long names — sanitization is length-preserving', () => {
    const long = 'A'.repeat(200)
    expect(asciiName(long)).toBe(long)
    expect(asciiName(long).length).toBe(200)
  })

  it('preserves uppercase Latin accents (Á É Í Ó Ú) → ASCII letters', () => {
    expect(asciiName('ÁÉÍÓÚ')).toBe('AEIOU')
  })

  it('preserves ñ as n (NFD decomposes ñ → n + combining tilde)', () => {
    expect(asciiName('España')).toBe('Espana')
  })

  it('preserves smart quotes, em dash, full-width punct verbatim', () => {
    expect(asciiName('“hi” — 中')).toBe('“hi” — 中')
  })
})

/* ── statusVerbose: live (with/without server minute) + halftime + FT locales ── */

describe('statusVerbose: live minute paths', () => {
  it('live with server minute → uses minute directly', () => {
    expect(statusVerbose(makeMatch({ state: 'live', minute: 12 }))).toBe('FIRST HALF  12 MIN')
    expect(statusVerbose(makeMatch({ state: 'live', minute: 67 }))).toBe('SECOND HALF  67 MIN')
  })

  it('live without server minute → derives from liveMinute (1st half)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const m = makeMatch({
      state: 'live',
      kickoffAt: new Date('2026-06-15T11:30:00Z').toISOString(),
    })
    /* elapsed = 30 → liveMinute = 30 → FIRST HALF 30 MIN. */
    expect(statusVerbose(m)).toBe('FIRST HALF  30 MIN')
  })

  it('live without server minute → halftime window pins at 45 → HALF TIME', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const m = makeMatch({
      state: 'live',
      kickoffAt: new Date('2026-06-15T11:10:00Z').toISOString(),
    })
    /* elapsed = 50 → liveMinute = 45 → HALF TIME. */
    expect(statusVerbose(m)).toBe('HALF TIME')
  })

  it('live without server minute, no kickoffAt → liveMinute null → defaults to 0 → FIRST HALF 0', () => {
    /* Regression guard for the `?? 0` fallback in statusVerbose. */
    const m = makeMatch({ state: 'live' })
    expect(statusVerbose(m)).toBe('FIRST HALF  0 MIN')
  })
})

describe('statusVerbose: FULL TIME across locales', () => {
  const ftCases: Array<[Locale, string]> = [
    ['en', 'FULL TIME'],
    ['zh', '全场结束'],
    ['ja', '試合終了'],
    ['es', 'FINAL'],
  ]
  for (const [loc, expected] of ftCases) {
    it(`renders FULL TIME equivalent in ${loc}`, () => {
      settingsStore.set({ language: loc })
      expect(statusVerbose(makeMatch({ state: 'ft' }))).toBe(expected)
    })
  }
})

/* ── listLeft / listRight: locale + asciiName interplay ─────────────────── */

describe('listLeft / listRight per locale', () => {
  /* Layer 1 left/right strings use the {home}/{away} placeholders verbatim
   * — they don't run names through asciiName at the format.ts layer
   * (asciiName is applied by pageView.ts when it materializes the list).
   * So both CJK input and accented input survive listLeft as-is — the
   * caller is responsible for sanitizing. */
  it('listLeft preserves Latin accents when present (asciiName applied at render layer, not format)', () => {
    /* TeamCode is a string union but assignable from any string at runtime. */
    const m = makeMatch({ home: 'Mbappé' as Match['home'], away: 'Álvarez' as Match['home'] })
    expect(listLeft(m)).toBe('Mbappé vs Álvarez')
  })

  it('listLeft preserves CJK home/away codes', () => {
    const m = makeMatch({ home: '美国' as Match['home'], away: '日本' as Match['home'] })
    expect(listLeft(m)).toBe('美国 vs 日本')
  })

  it('listLeft localizes the "vs" connector per locale via template (en/zh/ja/es share " vs " here)', () => {
    /* All four locales use "{home} vs {away}" in glasses_list_left_vs as
     * of v1.4. This asserts no locale broke the template shape. */
    for (const loc of ['en', 'zh', 'ja', 'es'] as Locale[]) {
      settingsStore.set({ language: loc })
      expect(listLeft(makeMatch({ home: 'ARG', away: 'BRA' }))).toMatch(/ARG.*BRA/)
    }
  })

  it('listRight LIVE format includes minute and scores', () => {
    const m = makeMatch({ state: 'live', minute: 22, homeScore: 0, awayScore: 1 })
    expect(listRight(m)).toBe('LIVE 22  0-1')
  })

  it('listRight FT shootout suffix uses (h-ap) format', () => {
    const m = makeMatch({
      state: 'ft', homeScore: 1, awayScore: 1, homePenalty: 5, awayPenalty: 4,
    })
    expect(listRight(m)).toBe('FT 1-1 (5-4p)')
  })
})

/* ── eventChip: every event type across every locale ────────────────────── */

describe('eventChip across locales', () => {
  type Case = { type: MatchEvent['type']; en: string; zh: string; ja: string; es: string }
  const cases: Case[] = [
    { type: 'goal',   en: 'GOAL', zh: '进球', ja: 'ゴール', es: 'GOL' },
    { type: 'yellow', en: 'YEL',  zh: '黄牌', ja: '警告',   es: 'AMA' },
    { type: 'red',    en: 'RED',  zh: '红牌', ja: '退場',   es: 'ROJ' },
    /* sub/ht/ft don't always have a translated key — t() falls back to EN
     * dictionary. Whatever the dictionary returns is what we assert. */
    { type: 'sub',    en: 'SUB',  zh: '换人', ja: '交代',   es: 'CAM' },
    { type: 'ht',     en: 'HT',   zh: '中休', ja: 'HT',     es: 'D' },
    { type: 'ft',     en: 'FT',   zh: '完场', ja: '終了',   es: 'F' },
  ]
  for (const c of cases) {
    for (const loc of ['en', 'zh', 'ja', 'es'] as Locale[]) {
      it(`${c.type} → ${c[loc]} (${loc})`, () => {
        settingsStore.set({ language: loc })
        const e: MatchEvent = { minute: 10, type: c.type, side: 'home' }
        expect(eventChip(e)).toBe(c[loc])
      })
    }
  }

  it('unknown event type returns empty string', () => {
    const e = { minute: 10, type: 'mystery' as MatchEvent['type'], side: 'home' as const }
    expect(eventChip(e)).toBe('')
  })
})

/* ── kickoffGlassesLabel: tz-aware day boundaries + locale ──────────────── */

describe('kickoffGlassesLabel', () => {
  it('returns empty string when kickoffAt is missing (TBD knockout slot)', () => {
    /* No kickoffAt = unscheduled / TBD. The glasses event log header
     * should render nothing rather than guess "in 0m" from a missing field. */
    expect(kickoffGlassesLabel(makeMatch({}))).toBe('')
  })

  it('"Today, in <n>m" when kickoff is same calendar day and offset < 60', () => {
    settingsStore.set({ timezone: 'UTC' })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const m = makeMatch({ kickoffAt: '2026-06-15T12:30:00Z' })
    expect(kickoffGlassesLabel(m)).toBe('Today, in 30m')
  })

  it('"Today, in <n>h" when same calendar day and 60 <= offset < 24h', () => {
    settingsStore.set({ timezone: 'UTC' })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T01:00:00Z'))
    const m = makeMatch({ kickoffAt: '2026-06-15T06:00:00Z' })
    expect(kickoffGlassesLabel(m)).toBe('Today, in 5h')
  })

  it('"Tomorrow, <clock>" when kickoff is the next calendar day in user TZ', () => {
    settingsStore.set({ timezone: 'UTC' })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T22:00:00Z'))
    /* +4h kickoff → 2026-06-16 02:00 UTC → calendar day +1 in UTC. */
    const m = makeMatch({ kickoffAt: '2026-06-16T02:00:00Z' })
    /* Clock formatting uses Intl with hour12, e.g. "2AM". Exact string
     * depends on en-US output but the prefix is stable. */
    expect(kickoffGlassesLabel(m)).toMatch(/^Tomorrow, /)
  })

  it('day-boundary case: kickoff is tomorrow in user TZ but same UTC day', () => {
    /* Now = 2026-06-15 23:30 UTC = 2026-06-16 07:30 in Asia/Shanghai (UTC+8).
     * Kickoff = 2026-06-16 18:00 in Shanghai = 2026-06-16 10:00 UTC, which is
     * THE SAME UTC calendar day as "now" — but in Shanghai it's tomorrow. */
    settingsStore.set({ timezone: 'Asia/Shanghai' })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T23:30:00Z'))
    const m = makeMatch({ kickoffAt: '2026-06-16T10:00:00Z' })
    /* Should be "Today, ..." in Shanghai (both dates land on 2026-06-16 SH). */
    expect(kickoffGlassesLabel(m).startsWith('Today,')).toBe(true)
  })
})

/* ── stageLabel: localized + non-final stages never collapse to FINAL ───── */

describe('stageLabel for every Stage in every locale', () => {
  type StageRow = { stage: Stage; en: string; zh: string; ja: string; es: string }
  const rows: StageRow[] = [
    { stage: 'GS',  en: 'GROUP STAGE',  zh: '小组赛',     ja: 'グループ',   es: 'FASE DE GRUPOS' },
    { stage: 'R16', en: 'ROUND OF 16',  zh: '十六强',     ja: 'ラウンド16', es: 'OCTAVOS' },
    { stage: 'QF',  en: 'QUARTERFINAL', zh: '八强赛',     ja: '準々決勝',   es: 'CUARTOS' },
    { stage: 'SF',  en: 'SEMIFINAL',    zh: '半决赛',     ja: '準決勝',     es: 'SEMIFINAL' },
    { stage: '3rd', en: '3RD PLACE',    zh: '三四名',     ja: '3位決定戦',  es: 'TERCER PUESTO' },
    { stage: 'F',   en: 'FINAL',        zh: '决赛',       ja: '決勝',       es: 'FINAL' },
  ]
  for (const row of rows) {
    for (const loc of ['en', 'zh', 'ja', 'es'] as Locale[]) {
      it(`stage ${row.stage} in ${loc} → ${row[loc]}`, () => {
        settingsStore.set({ language: loc })
        expect(stageLabel(makeMatch({ stage: row.stage }))).toBe(row[loc])
      })
    }
  }

  it('regression: GS/R16/QF/SF/3rd never collapse to FINAL in EN', () => {
    /* Guard against a "default to final" bug — every non-F stage should
     * be distinct from the final label. */
    settingsStore.set({ language: 'en' })
    const finalLbl = stageLabel(makeMatch({ stage: 'F' }))
    for (const s of ['GS', 'R16', 'QF', 'SF', '3rd'] as Stage[]) {
      expect(stageLabel(makeMatch({ stage: s }))).not.toBe(finalLbl)
    }
  })
})

/* ── penaltyText: present + localized ───────────────────────────────────── */

describe('penaltyText across locales', () => {
  const cases: Array<[Locale, string]> = [
    ['en', 'PEN 4-3'],
    ['zh', '点球 4-3'],
    ['ja', 'PK 4-3'],
    ['es', 'PEN 4-3'],
  ]
  for (const [loc, expected] of cases) {
    it(`shootout indicator in ${loc}`, () => {
      settingsStore.set({ language: loc })
      expect(penaltyText(makeMatch({ homePenalty: 4, awayPenalty: 3 }))).toBe(expected)
    })
  }

  it('hasShootout false when only one side has a penalty score', () => {
    expect(hasShootout(makeMatch({ homePenalty: 5, awayPenalty: null }))).toBe(false)
    expect(hasShootout(makeMatch({ homePenalty: null, awayPenalty: 5 }))).toBe(false)
  })

  it('penaltyText returns "" when no shootout, regardless of locale', () => {
    for (const loc of ['en', 'zh', 'ja', 'es'] as Locale[]) {
      settingsStore.set({ language: loc })
      expect(penaltyText(makeMatch({ homePenalty: null, awayPenalty: null }))).toBe('')
    }
  })

  it('penaltyText with 0-0 shootout still renders (edge: hasShootout uses != null, not truthy)', () => {
    expect(penaltyText(makeMatch({ homePenalty: 0, awayPenalty: 0 }))).toBe('PEN 0-0')
  })
})
