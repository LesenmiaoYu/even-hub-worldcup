import type { Match, MatchEvent } from '../types'
import { settingsStore } from '../state/settingsStore'
import { t } from '../i18n'

/* BCP-47 tag for Intl.DateTimeFormat. Mirrors settingsStore.language. */
function intlLocale(): string {
  const lang = settingsStore.get().language
  return ({ en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', es: 'es-ES' } as const)[lang] ?? 'en-US'
}

/* Format a scheduled kickoff for the glasses event log.
 * Uses Match.kickoffAt + user timezone (settingsStore) to produce:
 *   - 'Today, in 2h'    (same calendar day in user TZ, < 24h)
 *   - 'Today, in 45m'   (same calendar day in user TZ, < 60m)
 *   - 'Tomorrow, 3PM'   (next calendar day in user TZ)
 *   - '7/15 3PM'        (later, MM/DD)
 * Falls back to the legacy relative 'Xm/Xh/Xd' if kickoffAt is missing.
 * Strings are routed through t() so non-EN locales get translated.
 * Date/time pieces (clock + MD) localize via intlLocale(). */
export function kickoffGlassesLabel(m: Match): string {
  const offMin = m.kickoffOffsetMin
  if (!m.kickoffAt) {
    if (offMin < 60) return t('glasses_kickoff_in_minutes', { n: offMin })
    if (offMin < 24 * 60) return t('glasses_kickoff_hours_short', { n: Math.floor(offMin / 60) })
    return t('glasses_kickoff_days_short', { n: Math.round(offMin / 60 / 24) })
  }
  const tz = settingsStore.get().timezone
  const now = new Date()
  const kick = new Date(m.kickoffAt)
  const sameDay = isSameDayInZone(now, kick, tz)
  const nextDay = isSameDayInZone(addDays(now, 1), kick, tz)
  const clock = formatClock(kick, tz)
  if (sameDay) {
    if (offMin < 60) return t('glasses_kickoff_today_in_minutes', { n: Math.max(0, offMin) })
    if (offMin < 24 * 60) return t('glasses_kickoff_today_in_hours', { n: Math.floor(offMin / 60) })
    return t('glasses_kickoff_today_at', { clock })
  }
  if (nextDay) return t('glasses_kickoff_tomorrow_at', { clock })
  return `${formatMD(kick, tz)} ${clock}`
}

function isSameDayInZone(a: Date, b: Date, tz: string): boolean {
  return ymdInZone(a, tz) === ymdInZone(b, tz)
}

/* "Is this match's kickoff (or live state) on today's calendar date in
 * the user's timezone?" Used by the L1 header to give an honest count
 * instead of pretending the next 5 upcoming are all today. */
export function isMatchToday(m: Match): boolean {
  if (m.state === 'live') return true
  if (!m.kickoffAt) return false
  const tz = settingsStore.get().timezone
  return isSameDayInZone(new Date(), new Date(m.kickoffAt), tz)
}

/* Short "Next: <when>" label for the L1 header when nothing is on today.
 * Calendar-day-aware in the user's TZ so it never disagrees with the list
 * row (which also uses calendar-day comparison via kickoffLabel).
 *   today (defensive) → ''      (shouldn't fire; caller's "today" check ran)
 *   tomorrow          → 'Next Tomorrow'
 *   2..6 calendar days → 'Next in Nd'
 *   else              → 'Next MM/DD'
 * A Beijing user looking at a 12:00 PT match: kickoff lands on 06/12 local,
 * which is 2 calendar days from 06/10 today → 'Next in 2d', not 'Next 6/12'. */
export function nextKickoffLabel(matches: Match[]): string {
  const tz = settingsStore.get().timezone
  const upcoming = matches
    .filter(m => m.state === 'scheduled' && m.kickoffAt)
    .sort((a, b) => a.kickoffOffsetMin - b.kickoffOffsetMin)
  const m = upcoming[0]
  if (!m || !m.kickoffAt) return ''
  const kick = new Date(m.kickoffAt)
  const days = calendarDaysUntilInZone(kick, tz)
  if (days <= 0) return ''
  if (days === 1) return t('glasses_next_tomorrow')
  if (days <= 6) return t('glasses_next_in_days', { n: days })
  return t('glasses_next_on_date', { date: formatMD(kick, tz) })
}

/* Calendar-day gap between now and `d`, in the user's TZ.
 *   0  = same calendar date
 *   1  = tomorrow
 *   2  = day after tomorrow
 *   ...
 *   31 = sentinel "more than a month" */
function calendarDaysUntilInZone(d: Date, tz: string): number {
  const now = new Date()
  for (let i = 0; i <= 30; i++) {
    if (isSameDayInZone(addDays(now, i), d, tz)) return i
  }
  return 31
}
function ymdInZone(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat(intlLocale(), { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value ?? ''
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const day = parts.find(p => p.type === 'day')?.value ?? ''
    return `${y}-${m}-${day}`
  } catch { return d.toISOString().slice(0, 10) }
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
}

/* Live match clock with iSports-lag fallback.
 *
 * Returns the displayable match minute for a LIVE match:
 *   - if iSports has emitted m.minute, that wins (canonical)
 *   - else derive from kickoffAt elapsed (with halftime-break adjustment)
 *   - else null (state isn't live, or no kickoff known)
 *
 * iSports occasionally flips a match to state:'live' before its clock
 * arrives — the score lands first, then the minute. Without a fallback
 * the UI would render '-' or 'null'. The derived clock is correct
 * within ~1 min for 1st half and within ~5 min for 2nd half (uncertainty
 * = actual stoppage time + how long extra-time / pause we don't know
 * about). Once iSports does emit, the SSE delta overrides everything. */
export function liveMinute(m: Match): number | null {
  if (m.minute != null) return m.minute
  if (m.state !== 'live') return null
  if (!m.kickoffAt) return null
  const elapsed = Math.floor((Date.now() - new Date(m.kickoffAt).getTime()) / 60000)
  if (elapsed < 0) return null
  if (elapsed < 45) return elapsed                /* 1st half */
  if (elapsed < 60) return 45                     /* halftime window — pin at 45 until 2nd half resumes */
  /* 2nd half / ET — subtract a 15min HT break from elapsed. Cap at 120
   * (end of regulation extra time); penalty shootouts are flagged
   * elsewhere via hasShootout(). */
  return Math.min(elapsed - 15, 120)
}
function formatClock(d: Date, tz: string): string {
  try {
    const s = new Intl.DateTimeFormat(intlLocale(), { timeZone: tz, hour: 'numeric', hour12: true }).format(d)
    return s.replace(/\s+/g, '').toUpperCase()
  } catch { return '' }
}
function formatMD(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat(intlLocale(), { timeZone: tz, month: 'numeric', day: 'numeric' }).formatToParts(d)
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const day = parts.find(p => p.type === 'day')?.value ?? ''
    return `${m}/${day}`
  } catch { return '' }
}

export function stageLabel(m: Match): string {
  if (m.stage === 'GS') return t('glasses_stage_group_stage')
  if (m.stage === 'R16') return t('glasses_stage_round_of_16')
  if (m.stage === 'QF') return t('glasses_stage_quarterfinal')
  if (m.stage === 'SF') return t('glasses_stage_semifinal')
  if (m.stage === '3rd') return t('glasses_stage_3rd_place')
  return t('glasses_stage_final')
}

/* short status (chip-style): "1H 42", "HT", "FT", "in 2h" — used inside the event log header */
export function statusLabel(m: Match): string {
  if (m.state === 'ft') return t('glasses_status_ft')
  if (m.state === 'scheduled') {
    const off = m.kickoffOffsetMin
    if (off < 60) return t('glasses_kickoff_in_minutes', { n: off })
    const h = Math.floor(off / 60)
    if (h < 24) return t('glasses_kickoff_in_hours', { n: h })
    const d = Math.round(h / 24)
    return t('glasses_kickoff_in_days', { n: d })
  }
  const min = liveMinute(m) ?? 0
  if (min < 45) return t('glasses_status_1h', { min })
  if (min === 45 || min === 46) return t('glasses_status_ht')
  if (min < 90) return t('glasses_status_2h', { min })
  if (min < 105) return t('glasses_status_et', { min })
  if (min < 120) return t('glasses_status_et2', { min })
  return t('glasses_status_pen')
}

/** Did this match go to a penalty shootout? Mirrors how iSports + most
 * football feeds expose it: regular score + an extra penalty pair. */
export function hasShootout(m: Match): boolean {
  return m.homePenalty != null && m.awayPenalty != null
}

/** "PEN 4-2" — empty string when no shootout. */
export function penaltyText(m: Match): string {
  if (!hasShootout(m)) return ''
  return t('glasses_penalty_text', { home: m.homePenalty as number, away: m.awayPenalty as number })
}

/* verbose status for the top strip: "SECOND HALF  35 MIN", "HALF TIME", "FULL TIME", "KICKOFF IN 2H".
 * Penalty shootout is NOT mixed in here — Layer 2 has a dedicated top-right PEN indicator
 * (see pageView.ts) so the header status row stays clean. */
export function statusVerbose(m: Match): string {
  if (m.state === 'ft') return t('glasses_status_full_time')
  if (m.state === 'scheduled') {
    const off = m.kickoffOffsetMin
    if (off < 60) return t('glasses_status_kickoff_min', { n: off })
    const h = Math.floor(off / 60)
    if (h < 24) return t('glasses_status_kickoff_hour', { n: h })
    return t('glasses_status_kickoff_days', { n: Math.round(h / 24) })
  }
  const min = liveMinute(m) ?? 0
  if (min < 45) return t('glasses_status_first_half', { min })
  if (min === 45 || min === 46) return t('glasses_status_half_time')
  if (min < 90) return t('glasses_status_second_half', { min })
  if (min < 105) return t('glasses_status_extra_time', { min })
  if (min < 120) return t('glasses_status_extra_time_2', { min })
  return t('glasses_status_penalties')
}

export function scoreText(m: Match): string {
  /* "1 : 1" — EvenTimeBigPixel covers digits + colon + space natively.
   * Spaces around colon for breathing room. */
  if (m.state === 'live' || m.state === 'ft') return `${m.homeScore} : ${m.awayScore}`
  return t('glasses_score_vs')  /* VS fallback handled outside via renderVsPng */
}

export function eventChip(e: MatchEvent): string {
  if (e.type === 'goal') return t('glasses_event_goal')
  if (e.type === 'yellow') return t('glasses_event_yellow_card')
  if (e.type === 'red') return t('glasses_event_red_card')
  if (e.type === 'ht') return t('glasses_status_ht')
  if (e.type === 'ft') return t('glasses_status_ft')
  if (e.type === 'sub') return t('glasses_event_substitution')
  return ''
}

export function lastEventByScorer(m: Match, side: 'home' | 'away'): string {
  /* most recent goal/card by that side. ASCII only. */
  const onSide = m.events.filter(e => e.side === side && (e.type === 'goal' || e.type === 'red'))
  if (onSide.length === 0) return ''
  return onSide.map(e => `${asciiName(e.player ?? '')} ${e.minute}`).join('  ')
}

/* Sanitize names for the glasses text container.
 *
 * v1.4: David confirmed the G2 firmware font renders CJK fine, so we
 * stopped stripping non-printable-ASCII. We still NFD-decompose and drop
 * Latin combining marks (Mbappé → Mbappe) because the firmware's Latin
 * glyph table drops accented codepoints to fallback rectangles — that
 * fix is still needed even with CJK pass-through. Everything outside the
 * combining-mark range (CJK, kana, Cyrillic, Arabic, full-width punct,
 * smart quotes, em dash) now passes through unchanged.
 *
 * Preserves \n so callers can sanitize multi-line strings in one pass —
 * see pageView.ts for the per-line workaround that predated this. */
function asciiName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
export { asciiName }

export function kickoffLabel(m: Match): string {
  const off = m.kickoffOffsetMin
  if (off < 0) return ''
  if (off < 60) return t('glasses_kickoff_in_minutes', { n: off })
  /* Hour bucket is timezone-agnostic (same in PT/Beijing/etc.) so the
   * sub-day rung stays as-is. */
  const h = Math.floor(off / 60)
  if (h < 24 && m.kickoffAt) {
    /* Sub-24h but might already be tomorrow's calendar date in the
     * user's TZ (e.g. 11pm now, 1am match → "Tomorrow" reads truer than
     * "2h"). Honor the calendar gap when we have it. */
    const tz = settingsStore.get().timezone
    const days = calendarDaysUntilInZoneFor(new Date(m.kickoffAt), tz)
    if (days === 1) return t('glasses_kickoff_tomorrow')
    return t('glasses_kickoff_hours_short', { n: h })
  }
  if (h < 24) return t('glasses_kickoff_hours_short', { n: h })
  /* >=24h: prefer TZ-aware calendar gap when we have kickoffAt, so the
   * list and the L1 header (which uses nextKickoffLabel) always agree. */
  if (m.kickoffAt) {
    const tz = settingsStore.get().timezone
    const days = calendarDaysUntilInZoneFor(new Date(m.kickoffAt), tz)
    if (days === 1) return t('glasses_kickoff_tomorrow')
    if (days <= 6) return t('glasses_kickoff_in_n_days', { n: days })
    return t('glasses_kickoff_days_short', { n: days })
  }
  const days = Math.round(h / 24)
  if (days === 1) return t('glasses_kickoff_tomorrow')
  if (days <= 2) return t('glasses_kickoff_in_2_days')
  return t('glasses_kickoff_days_short', { n: days })
}

/* Same as the file-private calendarDaysUntilInZone; duplicated as a
 * named export-shape so kickoffLabel can call it without forward-ref. */
function calendarDaysUntilInZoneFor(d: Date, tz: string): number {
  const now = new Date()
  for (let i = 0; i <= 30; i++) {
    if (isSameDayInZone(addDays(now, i), d, tz)) return i
  }
  return 31
}

export function upcomingRow(m: Match): string {
  /* "BRA  v  POR                                Today 6:00pm" — but we render via L+R container split, not spaces */
  const home = m.home ?? t('glasses_team_tbd')
  const away = m.away ?? t('glasses_team_tbd')
  const right = kickoffLabel(m)
  return t('glasses_upcoming_row', { home, away, right, stage: m.stage })
}

export function pastRow(m: Match): string {
  const home = m.home ?? t('glasses_team_dashes')
  const away = m.away ?? t('glasses_team_dashes')
  return t('glasses_past_row', { home, hs: m.homeScore ?? '', as: m.awayScore ?? '', away, stage: m.stage })
}

/* Two-list Layer 1: left = matchup (team codes), right = status (live/score/upcoming). */
export function listLeft(m: Match): string {
  const home = m.home ?? t('glasses_team_tbd')
  const away = m.away ?? t('glasses_team_tbd')
  return t('glasses_list_left_vs', { home, away })
}

export function listRight(m: Match): string {
  if (m.state === 'live') {
    return t('glasses_list_right_live', {
      min: liveMinute(m) ?? '',
      home: m.homeScore ?? '',
      away: m.awayScore ?? '',
    })
  }
  if (m.state === 'ft') {
    if (hasShootout(m)) {
      return t('glasses_list_right_ft_shootout', {
        home: m.homeScore ?? '',
        away: m.awayScore ?? '',
        hpen: m.homePenalty as number,
        apen: m.awayPenalty as number,
      })
    }
    return t('glasses_list_right_ft', { home: m.homeScore ?? '', away: m.awayScore ?? '' })
  }
  return kickoffLabel(m)
}
