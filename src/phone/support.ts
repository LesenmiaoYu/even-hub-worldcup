/* Per-match Support Vote — phone-only social feature.
 * Match-based (not team-based): each match is its own poll.
 *
 * Mock persistence:
 *   localStorage[`vote.{matchId}`]  = 'home' | 'away'   (user's pick)
 *   localStorage[`tally.{matchId}`] = `${home}:${away}` (raw counts incl. baseline)
 *
 * Baseline tallies are seeded deterministically from matchId so percentages
 * are stable across renders on first load.
 *
 * Real backend swap (one place): castVote / getTally call
 *   POST /api/matches/{id}/vote  →  { home, away, total }
 *   GET  /api/matches/{id}/votes →  { home, away, total }
 */

export type Side = 'home' | 'away'

export interface VoteTally {
  home: number
  away: number
  total: number
  homePct: number
  awayPct: number
}

const VOTE_PREFIX  = 'vote.'
const TALLY_PREFIX = 'tally.'

/* Deterministic baseline tally per matchId: 100..500 per side. */
function seedBaseline(matchId: string): { home: number; away: number } {
  let h = 2166136261 >>> 0
  for (let i = 0; i < matchId.length; i++) {
    h ^= matchId.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const rand = () => {
    h ^= h << 13; h >>>= 0
    h ^= h >>> 17; h >>>= 0
    h ^= h << 5;  h >>>= 0
    return (h >>> 0) / 4294967296
  }
  const home = 100 + Math.floor(rand() * 401)
  const away = 100 + Math.floor(rand() * 401)
  return { home, away }
}

function readTallyRaw(matchId: string): { home: number; away: number } {
  try {
    const raw = localStorage.getItem(TALLY_PREFIX + matchId)
    if (raw) {
      const [h, a] = raw.split(':').map(Number)
      if (Number.isFinite(h) && Number.isFinite(a)) return { home: h, away: a }
    }
  } catch { /* localStorage may be unavailable */ }
  const seeded = seedBaseline(matchId)
  try { localStorage.setItem(TALLY_PREFIX + matchId, `${seeded.home}:${seeded.away}`) } catch { /* ignore */ }
  return seeded
}

function writeTallyRaw(matchId: string, t: { home: number; away: number }) {
  try { localStorage.setItem(TALLY_PREFIX + matchId, `${t.home}:${t.away}`) } catch { /* ignore */ }
}

function toTally(raw: { home: number; away: number }): VoteTally {
  const total = raw.home + raw.away
  const homePct = total === 0 ? 50 : Math.round((raw.home / total) * 100)
  const awayPct = 100 - homePct
  return { home: raw.home, away: raw.away, total, homePct, awayPct }
}

export function getUserVote(matchId: string): Side | null {
  try {
    const v = localStorage.getItem(VOTE_PREFIX + matchId)
    return v === 'home' || v === 'away' ? v : null
  } catch { return null }
}

export async function getTally(matchId: string): Promise<VoteTally> {
  /* swap: return fetch(`/api/matches/${matchId}/votes`).then(r => r.json()) */
  return toTally(readTallyRaw(matchId))
}

export async function castVote(matchId: string, side: Side): Promise<VoteTally> {
  /* swap: POST /api/matches/{id}/vote {side} → server returns new tally */
  if (getUserVote(matchId)) return toTally(readTallyRaw(matchId))
  const raw = readTallyRaw(matchId)
  raw[side] += 1
  writeTallyRaw(matchId, raw)
  try { localStorage.setItem(VOTE_PREFIX + matchId, side) } catch { /* ignore */ }
  return toTally(raw)
}

export function getTallySync(matchId: string): VoteTally {
  return toTally(readTallyRaw(matchId))
}
