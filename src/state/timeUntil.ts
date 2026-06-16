import type { Match } from '../types'

/* Single source of truth for "how long until this match kicks off."
 *
 * Computed at call time from Match.kickoffAt (ISO 8601, absolute UTC).
 * NEVER stored on the Match — a stored offset freezes at hydrate time and
 * drifts up to the /schedule poll interval (12h), producing
 * "in 14 hours" badges that haven't moved since this morning.
 *
 * Returns null when kickoffAt is missing (raw iSports row had no
 * matchTime — typically TBD knockout slot). Callers must handle null.
 * Negative values are allowed when kickoff is in the past (caller's
 * choice whether to clamp or hide). */
export function minutesUntilKickoff(m: Pick<Match, 'kickoffAt'>): number | null {
  if (!m.kickoffAt) return null
  return Math.round((new Date(m.kickoffAt).getTime() - Date.now()) / 60000)
}
