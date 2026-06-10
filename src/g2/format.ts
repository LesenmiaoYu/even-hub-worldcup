import type { Match, MatchEvent } from '../types'
import { settingsStore } from '../state/settingsStore'

/* Format a scheduled kickoff for the glasses event log.
 * Uses Match.kickoffAt + user timezone (settingsStore) to produce:
 *   - 'Today, in 2h'    (same calendar day in user TZ, < 24h)
 *   - 'Today, in 45m'   (same calendar day in user TZ, < 60m)
 *   - 'Tomorrow, 3PM'   (next calendar day in user TZ)
 *   - '7/15 3PM'        (later, MM/DD)
 * Falls back to the legacy relative 'Xm/Xh/Xd' if kickoffAt is missing.
 * Output is ASCII-only — printable \x20-\x7E, safe for asciiName(). */
export function kickoffGlassesLabel(m: Match): string {
  const offMin = m.kickoffOffsetMin
  if (!m.kickoffAt) {
    if (offMin < 60) return `${offMin}m`
    if (offMin < 24 * 60) return `${Math.floor(offMin / 60)}h`
    return `${Math.round(offMin / 60 / 24)}d`
  }
  const tz = settingsStore.get().timezone
  const now = new Date()
  const kick = new Date(m.kickoffAt)
  const sameDay = isSameDayInZone(now, kick, tz)
  const nextDay = isSameDayInZone(addDays(now, 1), kick, tz)
  const clock = formatClock(kick, tz)
  if (sameDay) {
    if (offMin < 60) return `Today, in ${Math.max(0, offMin)}m`
    if (offMin < 24 * 60) return `Today, in ${Math.floor(offMin / 60)}h`
    return `Today, ${clock}`
  }
  if (nextDay) return `Tomorrow, ${clock}`
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
  if (days === 1) return 'Next Tomorrow'
  if (days <= 6) return `Next in ${days}d`
  return `Next ${formatMD(kick, tz)}`
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
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value ?? ''
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const day = parts.find(p => p.type === 'day')?.value ?? ''
    return `${y}-${m}-${day}`
  } catch { return d.toISOString().slice(0, 10) }
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
}
function formatClock(d: Date, tz: string): string {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: true }).format(d)
    return s.replace(/\s+/g, '').toUpperCase()
  } catch { return '' }
}
function formatMD(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric', day: 'numeric' }).formatToParts(d)
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const day = parts.find(p => p.type === 'day')?.value ?? ''
    return `${m}/${day}`
  } catch { return '' }
}

export function stageLabel(m: Match): string {
  if (m.stage === 'QF') return 'QUARTERFINAL'
  if (m.stage === 'SF') return 'SEMIFINAL'
  if (m.stage === '3rd') return '3RD PLACE'
  return 'FINAL'
}

/* short status (chip-style): "1H 42", "HT", "FT", "in 2h" — used inside the event log header */
export function statusLabel(m: Match): string {
  if (m.state === 'ft') return 'FT'
  if (m.state === 'scheduled') {
    const off = m.kickoffOffsetMin
    if (off < 60) return `in ${off}m`
    const h = Math.floor(off / 60)
    if (h < 24) return `in ${h}h`
    const d = Math.round(h / 24)
    return `in ${d}d`
  }
  const min = m.minute ?? 0
  if (min < 45) return `1H  ${min}`
  if (min === 45 || min === 46) return `HT`
  if (min < 90) return `2H  ${min}`
  if (min < 105) return `ET  ${min}`
  if (min < 120) return `ET2  ${min}`
  return `PEN`
}

/** Did this match go to a penalty shootout? Mirrors how iSports + most
 * football feeds expose it: regular score + an extra penalty pair. */
export function hasShootout(m: Match): boolean {
  return m.homePenalty != null && m.awayPenalty != null
}

/** "PEN 4-2" — empty string when no shootout. */
export function penaltyText(m: Match): string {
  if (!hasShootout(m)) return ''
  return `PEN ${m.homePenalty}-${m.awayPenalty}`
}

/* verbose status for the top strip: "SECOND HALF  35 MIN", "HALF TIME", "FULL TIME", "KICKOFF IN 2H".
 * Penalty shootout is NOT mixed in here — Layer 2 has a dedicated top-right PEN indicator
 * (see pageView.ts) so the header status row stays clean. */
export function statusVerbose(m: Match): string {
  if (m.state === 'ft') return 'FULL TIME'
  if (m.state === 'scheduled') {
    const off = m.kickoffOffsetMin
    if (off < 60) return `KICKOFF IN ${off} MIN`
    const h = Math.floor(off / 60)
    if (h < 24) return `KICKOFF IN ${h}H`
    return `KICKOFF IN ${Math.round(h / 24)} DAYS`
  }
  const min = m.minute ?? 0
  if (min < 45) return `FIRST HALF  ${min} MIN`
  if (min === 45 || min === 46) return `HALF TIME`
  if (min < 90) return `SECOND HALF  ${min} MIN`
  if (min < 105) return `EXTRA TIME  ${min} MIN`
  if (min < 120) return `EXTRA TIME 2  ${min} MIN`
  return `PENALTIES`
}

export function scoreText(m: Match): string {
  /* "1 : 1" — EvenTimeBigPixel covers digits + colon + space natively.
   * Spaces around colon for breathing room. */
  if (m.state === 'live' || m.state === 'ft') return `${m.homeScore} : ${m.awayScore}`
  return 'v'  /* VS fallback handled outside via renderVsPng */
}

export function eventChip(e: MatchEvent): string {
  if (e.type === 'goal') return 'GOAL'
  if (e.type === 'yellow') return 'YEL'
  if (e.type === 'red') return 'RED'
  if (e.type === 'ht') return 'HT'
  if (e.type === 'ft') return 'FT'
  if (e.type === 'sub') return 'SUB'
  return ''
}

export function lastEventByScorer(m: Match, side: 'home' | 'away'): string {
  /* most recent goal/card by that side. ASCII only. */
  const onSide = m.events.filter(e => e.side === side && (e.type === 'goal' || e.type === 'red'))
  if (onSide.length === 0) return ''
  return onSide.map(e => `${asciiName(e.player ?? '')} ${e.minute}`).join('  ')
}

/* strip accented chars LVGL firmware font drops to fallback rectangles.
 * Preserves \n so callers can sanitize multi-line strings in one pass
 * (we used to strip newlines too, which forced every caller to split,
 * sanitize, then re-join — see pageView.ts for the workaround that
 * predated this fix). */
function asciiName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
}
export { asciiName }

export function kickoffLabel(m: Match): string {
  const off = m.kickoffOffsetMin
  if (off < 0) return ''
  if (off < 60) return `in ${off}m`
  /* Hour bucket is timezone-agnostic (same in PT/Beijing/etc.) so the
   * sub-day rung stays as-is. */
  const h = Math.floor(off / 60)
  if (h < 24 && m.kickoffAt) {
    /* Sub-24h but might already be tomorrow's calendar date in the
     * user's TZ (e.g. 11pm now, 1am match → "Tomorrow" reads truer than
     * "2h"). Honor the calendar gap when we have it. */
    const tz = settingsStore.get().timezone
    const days = calendarDaysUntilInZoneFor(new Date(m.kickoffAt), tz)
    if (days === 1) return 'Tomorrow'
    return `${h}h`
  }
  if (h < 24) return `${h}h`
  /* >=24h: prefer TZ-aware calendar gap when we have kickoffAt, so the
   * list and the L1 header (which uses nextKickoffLabel) always agree. */
  if (m.kickoffAt) {
    const tz = settingsStore.get().timezone
    const days = calendarDaysUntilInZoneFor(new Date(m.kickoffAt), tz)
    if (days === 1) return 'Tomorrow'
    if (days <= 6) return `In ${days} days`
    return `${days}d`
  }
  const days = Math.round(h / 24)
  if (days === 1) return 'Tomorrow'
  if (days <= 2) return 'In 2 days'
  return `${days}d`
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
  const home = m.home ?? 'TBD'
  const away = m.away ?? 'TBD'
  const right = kickoffLabel(m)
  return `${home}  v  ${away}     ${right}     ${m.stage}`
}

export function pastRow(m: Match): string {
  const home = m.home ?? '---'
  const away = m.away ?? '---'
  return `${home} ${m.homeScore}-${m.awayScore} ${away}  FT  ${m.stage}`
}

/* Two-list Layer 1: left = matchup (team codes), right = status (live/score/upcoming). */
export function listLeft(m: Match): string {
  const home = m.home ?? 'TBD'
  const away = m.away ?? 'TBD'
  return `${home} vs ${away}`
}

export function listRight(m: Match): string {
  if (m.state === 'live') return `LIVE ${m.minute ?? ''}  ${m.homeScore}-${m.awayScore}`
  if (m.state === 'ft') {
    if (hasShootout(m)) return `FT ${m.homeScore}-${m.awayScore} (${m.homePenalty}-${m.awayPenalty}p)`
    return `FT  ${m.homeScore}-${m.awayScore}`
  }
  return kickoffLabel(m)
}
