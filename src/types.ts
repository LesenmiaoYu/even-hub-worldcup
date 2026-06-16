/* FIFA 3-letter codes for the WC 2026 teams the app can render.
 *
 * Original 48-team set was authored against the public projected bracket
 * we used in the mock. iSports' actual projected bracket contains 10
 * additional nations (Bosnia, Cape Verde, Curaçao, DR Congo, Jordan,
 * Scotland, South Africa, Sweden, Turkey, Uzbekistan) — those are added
 * below so the iSports adapter doesn't drop them. Total: 58 codes. */
export type TeamCode =
  /* CONCACAF (6) */
  | 'USA' | 'CAN' | 'MEX' | 'CRC' | 'PAN' | 'JAM'
  /* CONMEBOL (6) */
  | 'ARG' | 'BRA' | 'URU' | 'COL' | 'ECU' | 'PAR'
  /* UEFA (20) — includes Scotland, Sweden, Turkey from iSports projection
   * and Northern Ireland (demo). */
  | 'ESP' | 'FRA' | 'ENG' | 'GER' | 'ITA' | 'NED' | 'POR' | 'BEL'
  | 'CRO' | 'SWI' | 'DEN' | 'POL' | 'AUT' | 'CZE' | 'SRB' | 'NOR'
  | 'BIH' | 'SCO' | 'SWE' | 'TUR' | 'NIR'
  /* CAF (12) — includes Cape Verde, DR Congo, South Africa from iSports projection */
  | 'MAR' | 'SEN' | 'EGY' | 'GHA' | 'CMR' | 'NGA' | 'ALG' | 'TUN' | 'CIV'
  | 'CPV' | 'COD' | 'RSA'
  /* AFC (10) — includes Jordan, Uzbekistan from iSports projection */
  | 'JPN' | 'KOR' | 'AUS' | 'IRN' | 'KSA' | 'QAT' | 'UAE' | 'IRQ'
  | 'JOR' | 'UZB'
  /* OFC + intercontinental playoffs (4) — includes Curaçao from iSports projection */
  | 'NZL' | 'BOL' | 'HAI' | 'CUW'

/* Stage codes used across the app.
 *
 * The original mock bracket only modelled the late knockout rounds
 * (QF·SF·3rd·F). When we wired in the live iSports feed for WC 2026 the
 * tournament also includes earlier rounds, so two more codes were added:
 *   - 'GS'  → Group stage             (iSports `round` = "Group stage")
 *   - 'R16' → Round of 16             (iSports `round` = "1/8 Final")
 *
 * iSports' "1/16Final" (= round of 32, 16 matches) has no slot in this
 * union — it's not represented in the existing bracket UI. The decoder
 * maps it to `null` and `transformMatch` then drops those matches. If we
 * ever need an R32 view we extend this union and update the Record-typed
 * stage maps in `src/phone/*`. */
export type Stage = 'QF' | 'SF' | '3rd' | 'F' | 'GS' | 'R16'
export type MatchState = 'scheduled' | 'live' | 'ft'

export interface Team {
  code: TeamCode
  name: string
  flag: string
}

export type EventType = 'goal' | 'yellow' | 'red' | 'ht' | 'ft' | 'sub'
export type Side = 'home' | 'away'

export interface MatchEvent {
  eventId?: string
  minute: number
  type: EventType
  side: Side | null
  /** For non-sub events: the involved player. For 'sub' events: the player
   * coming OFF the pitch. */
  player?: string
  /** Only meaningful for 'sub' events: the player coming ON to replace
   * `player`. iSports models substitutions as a single event with both
   * names — we mirror that shape. */
  playerIn?: string
}

export type IsportsStatus =
  | 0   // not started
  | 1   // first half
  | 2   // half time
  | 3   // second half
  | 4   // extra time
  | 5   // penalty shootout
  | -1  // finished
  | -10 // cancelled
  | -11 // TBD
  | -12 // terminated
  | -13 // interrupted
  | -14 // postponed

export interface Match {
  id: string
  stage: Stage
  home: TeamCode | null
  away: TeamCode | null
  homeScore: number | null
  awayScore: number | null
  /** Penalty shootout score, set ONLY when the match went to a shootout
   * after regulation + ET ended tied. Null = no shootout occurred.
   * Knockout tournaments (which is what we mock) decide ties this way. */
  homePenalty: number | null
  awayPenalty: number | null
  minute: number | null
  state: MatchState
  /** Absolute kickoff time (ISO 8601, UTC). The single source of truth
   * for "when does this match start." Every countdown / "in N hours" /
   * sort-by-kickoff is derived from this at read time. Never store a
   * pre-computed relative offset — it rots. Optional only because some
   * raw iSports rows omit matchTime; consumers must handle null. */
  kickoffAt?: string
  events: MatchEvent[]
  venue?: string
  resolvesFrom?: { home?: string; away?: string }
}

export interface ScriptedTick {
  minute: number
  event: MatchEvent
  scoreDelta?: { home?: number; away?: number }
}

export interface LiveTickConfig {
  matchId: string
  msPerMinute: number
  script: ScriptedTick[]
}
