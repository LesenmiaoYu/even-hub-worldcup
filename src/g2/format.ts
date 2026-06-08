import type { Match, MatchEvent } from '../types'

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
  const h = Math.floor(off / 60)
  if (h < 24) return `${h}h`
  const days = Math.round(h / 24)
  if (days === 1) return 'Tomorrow'
  if (days <= 2) return 'In 2 days'
  return `${days}d`
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
