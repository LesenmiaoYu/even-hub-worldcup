/* Pure transforms from raw iSports response rows → our internal
 * `Match` / `MatchEvent` shapes.
 *
 * No I/O. No state. No logging side effects (caller decides whether to
 * warn on null returns).
 */
import type { Match, MatchEvent, Side, TeamCode } from '../types.ts'
import { decodeStatus, decodeEventType, decodeStage } from './decode.ts'
import {
  TEAM_NAME_TO_CODE,
  TEAM_ID_TO_CODE,
  normaliseTeamName,
} from './teamMap.ts'

/* ────────────────────────────────────────────────────────────────────────
 * Raw shapes
 *
 * These describe only the fields we actually consume — iSports' real
 * response carries many more keys (leagueColor, hasLineup, weather…).
 * Anything not listed below is intentionally ignored.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ISportsExtraExplain {
  minute?: number
  homeScore?: number
  awayScore?: number
  extraTimeStatus?: number
  extraHomeScore?: number
  extraAwayScore?: number
  penHomeScore?: number
  penAwayScore?: number
  winner?: number
}

/* A single record from /livescores or /schedule. */
export interface ISportsMatch {
  matchId: string
  leagueId?: string
  leagueName?: string
  matchTime?: number
  status: number
  homeId?: string
  homeName?: string
  awayId?: string
  awayName?: string
  homeScore?: number
  awayScore?: number
  round?: string
  group?: string
  location?: string
  extraExplain?: ISportsExtraExplain
}

/* A single record from /events.data[].events[]. */
export interface ISportsEvent {
  eventId?: string
  /* iSports sends `minute` as a string in the events feed and as a
   * number inside extraExplain. We accept either to keep the call sites
   * tolerant of whichever shape arrives. */
  minute?: string | number
  type: number
  playerId?: string
  playerName?: string
  assistPlayerId?: string
  assistPlayerName?: string
  overtime?: string | number
  homeEvent?: boolean
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/* Resolve an iSports (id, name) pair to one of our TeamCodes. The id
 * map wins because ids are stable; the name map is a fallback for teams
 * not yet harvested into TEAM_ID_TO_CODE. Returns null when neither
 * resolves — caller drops the match. */
function resolveTeam(id: string | undefined, name: string | undefined): TeamCode | null {
  if (id && TEAM_ID_TO_CODE[id]) return TEAM_ID_TO_CODE[id]
  if (name) {
    const code = TEAM_NAME_TO_CODE[normaliseTeamName(name)]
    if (code) return code
  }
  return null
}

function parseMinute(raw: string | number | undefined): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

/* ────────────────────────────────────────────────────────────────────────
 * Event
 *
 * iSports uses TWO different `playerName` conventions (authoritative per
 * docs id=15, cached at server/isports-docs.txt):
 *
 *   - Goal with assist: "Scorer(Assist:Assister)" — keep full string in
 *     `player`. UI renders single-line.
 *   - Substitution: "PlayerOn↑PlayerOff↓" — arrows are U+2191 / U+2193
 *     delimiters. Split into:
 *       player   = PlayerOff (down arrow side)
 *       playerIn = PlayerOn (up arrow side)
 *
 * Earlier adapter pass assumed subs reused the "Off(Assists:On)" goal
 * pattern; per docs that's wrong (subs use arrows). Both patterns are
 * handled below — arrow form preferred for subs, paren form as fallback.
 *
 * `assistPlayerName` is rarely populated by iSports; when it IS we use it.
 * ──────────────────────────────────────────────────────────────────────── */

const ASSIST_RE = /^\s*(.+?)\s*\(Assists?:\s*(.+?)\s*\)\s*$/i
const SUB_RE = /^\s*(.+?)\s*↑\s*(.+?)\s*↓\s*$/

export function transformEvent(raw: ISportsEvent): MatchEvent {
  const type = decodeEventType(raw.type)
  /* If the decoder returns null we still produce a MatchEvent so the
   * caller (a transform that filters) can keep things untyped. But the
   * spec asks transformEvent to return a MatchEvent — we resolve the
   * ambiguity by falling back to 'goal' for unknown ints AND surfacing
   * the original via `player` so it's never silently lost. In practice
   * the array-level transformer below drops unmapped events; this
   * default path is only hit if callers feed in raw events directly. */
  const safeType = type ?? 'goal'

  const homeFlag = raw.homeEvent
  const side: Side | null =
    homeFlag === true ? 'home' :
    homeFlag === false ? 'away' :
    null

  const rawName = (raw.playerName ?? '').trim()
  const overtime = parseMinute(raw.overtime)
  const baseMinute = parseMinute(raw.minute)
  /* Extra-time minutes are reported separately. Use whichever is non-zero
   * so a 96' goal stays "96" rather than collapsing to 0. */
  const minute = overtime > 0 ? overtime : baseMinute

  const out: MatchEvent = {
    eventId: raw.eventId,
    minute,
    type: safeType,
    side,
  }

  /* Substitution: prefer "On↑Off↓" arrow form (iSports canonical), fall
   * back to "Off(Assists:On)" pattern only if the arrow form doesn't
   * match (defensive — older fixture / data anomaly). */
  if (safeType === 'sub' && rawName) {
    const sub = SUB_RE.exec(rawName)
    if (sub) {
      out.player = sub[2]      /* down arrow side = coming OFF */
      out.playerIn = sub[1]    /* up arrow side = coming ON */
      return out
    }
    const asst = ASSIST_RE.exec(rawName)
    if (asst) {
      out.player = asst[1]
      out.playerIn = asst[2]
      return out
    }
    out.player = rawName
    if (raw.assistPlayerName) out.playerIn = raw.assistPlayerName
    return out
  }

  /* Everything else: keep the full original string so goal+assist
   * survives intact. */
  if (rawName) out.player = rawName
  return out
}

/* Transform a list of raw event rows, dropping any with an unmapped
 * event type. Use this when feeding the store. */
export function transformEvents(rows: readonly ISportsEvent[]): MatchEvent[] {
  const out: MatchEvent[] = []
  for (const r of rows) {
    if (decodeEventType(r.type) == null) continue
    out.push(transformEvent(r))
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────
 * Match
 *
 * Returns null when the match isn't representable in our model — typical
 * reasons:
 *   - team(s) not in TeamCode (e.g. iSports projected Bosnia in a WC slot)
 *   - round not in our Stage union (e.g. "1/16Final" = R32)
 *   - status is cancelled/postponed/etc.
 *
 * Score handling:
 *   - For matches that went to a shootout, iSports stores 90-minute
 *     regulation score in `homeScore`/`awayScore` and the shootout score
 *     in `extraExplain.penHomeScore` / `penAwayScore`. We pass both
 *     through onto the Match shape so the UI can render "1-1 (5-3 p)".
 *   - `minute` for scheduled matches is null; for live, prefer
 *     `extraExplain.minute`; for FT, null (UI shows "FT" not a clock).
 *
 * Open question (flagged to humans): iSports has a status `5 = penalty
 * shootout in progress`. We map that to 'live' which is correct for our
 * 3-state model, but the UI might want to distinguish it. Out of scope
 * for this layer — handle in the rendering side.
 * ──────────────────────────────────────────────────────────────────────── */

export interface TransformMatchOptions {
  /* When set, drop matches not in this league. Useful when the caller is
   * polling /livescores (all leagues) and only wants WC 2026. */
  leagueId?: string
}

export function transformMatch(
  raw: ISportsMatch,
  opts: TransformMatchOptions = {},
): Match | null {
  if (opts.leagueId && raw.leagueId !== opts.leagueId) return null

  const state = decodeStatus(raw.status)
  if (state === 'cancelled') return null

  const home = resolveTeam(raw.homeId, raw.homeName)
  const away = resolveTeam(raw.awayId, raw.awayName)

  const stage = decodeStage(raw.round ?? '', raw.group ?? '')
  if (!stage) return null

  /* Group-stage matches always have both teams set in the source feed —
   * a null team there is a real data-quality problem, drop the row. For
   * knockout stages (R16/QF/SF/F/3rd) the slots resolve as prior rounds
   * finish, so null teams are normal and the bracket renders them as
   * TBD via the `resolvesFrom` chain. */
  if (stage === 'GS' && (!home || !away)) return null

  const ex = raw.extraExplain ?? {}

  const homeScore = state === 'scheduled' ? null : (raw.homeScore ?? 0)
  const awayScore = state === 'scheduled' ? null : (raw.awayScore ?? 0)

  const homePenalty =
    ex.penHomeScore || ex.penAwayScore ? (ex.penHomeScore ?? 0) : null
  const awayPenalty =
    ex.penHomeScore || ex.penAwayScore ? (ex.penAwayScore ?? 0) : null

  let minute: number | null = null
  if (state === 'live') {
    const m = ex.minute ?? 0
    minute = m > 0 ? m : null
  }

  /* iSports matchTime is Unix seconds. Convert to ISO for kickoffAt
   * (consumed by bracket badges + glasses kickoff label) and to a
   * relative offset in minutes for the legacy kickoffOffsetMin field
   * (consumed by the glasses upcoming-list sort + countdown text). */
  let kickoffAt: string | undefined
  let kickoffOffsetMin = 0
  if (raw.matchTime && raw.matchTime > 0) {
    const ms = raw.matchTime * 1000
    kickoffAt = new Date(ms).toISOString()
    kickoffOffsetMin = Math.round((ms - Date.now()) / 60000)
  }

  const out: Match = {
    id: raw.matchId,
    stage,
    home,
    away,
    homeScore,
    awayScore,
    homePenalty,
    awayPenalty,
    minute,
    state,
    kickoffOffsetMin,
    events: [],
  }
  if (kickoffAt) out.kickoffAt = kickoffAt
  if (raw.location) out.venue = raw.location
  return out
}
