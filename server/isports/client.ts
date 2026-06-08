/* Thin typed HTTP client for the iSports football REST API.
 *
 * Tier we have (purchased) — confirmed by live probes 2026-06-08:
 *   GET /livescores              — every live match across every league
 *   GET /livescores/changes      — incremental delta (~last 20s)
 *   GET /events                  — recent match-event additions
 *   GET /schedule?leagueId=X     — future schedule for a league
 *   GET /schedule?date=YYYY-MM-DD
 *   GET /team?teamId=X           — team profile
 *   GET /league                  — full league list
 *
 * Endpoints NOT in tier (return code=2 "haven't purchased"): /livescore
 * (singular), /lineup, /competition, /odds.
 *
 * Auth: query param `api_key=<key>`. The key is read from
 * `process.env.ISPORTS_API_KEY` on every call so dotenv loaders that
 * mutate env after import still work.
 *
 * Errors:
 *   - Network failure (fetch rejection, non-2xx HTTP) → throws.
 *   - iSports application errors (`code !== 0`) are NOT thrown — they're
 *     returned as `{code, message, data}` so the caller decides whether
 *     to retry, ignore, or surface. iSports uses code=2 for billing and
 *     non-zero codes for "no live matches right now" cases too, so
 *     throwing on every non-zero would be noisy.
 */

const BASE_URL = 'http://api.isportsapi.com/sport/football'

export interface ISportsResponse<T> {
  code: number
  message: string
  data: T[]
}

function getApiKey(): string {
  const key = process.env.ISPORTS_API_KEY
  if (!key) {
    throw new Error(
      'ISPORTS_API_KEY is not set. Add it to .env or export it before ' +
        'starting the server.',
    )
  }
  return key
}

function buildUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('api_key', getApiKey())
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v)
  }
  return url.toString()
}

async function request<T>(path: string, params: Record<string, string | undefined> = {}): Promise<ISportsResponse<T>> {
  const url = buildUrl(path, params)
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    /* fetch() rejections (DNS, connection refused, abort) bubble up as
     * network errors — preserve the cause for log forensics. */
    throw new Error(`iSports fetch failed for ${path}: ${(err as Error).message}`, { cause: err })
  }
  if (!res.ok) {
    throw new Error(`iSports HTTP ${res.status} for ${path}`)
  }
  /* The API claims to be JSON across the board; if it isn't, json() will
   * throw and we surface that as a network-shaped error. */
  const body = (await res.json()) as ISportsResponse<T>
  return body
}

/* ────────────────────────────────────────────────────────────────────────
 * Typed endpoint wrappers
 *
 * Each wrapper returns the raw iSports envelope. Transforming the rows
 * into our internal shapes is the caller's job — keeps the client free of
 * decode logic so failures localise.
 * ──────────────────────────────────────────────────────────────────────── */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>

/* /livescores — full snapshot of every currently-running match. */
export function getLivescores(): Promise<ISportsResponse<AnyRow>> {
  return request('/livescores')
}

/* /livescores/changes — incremental delta. Poll this on the fast loop
 * (every few seconds) and reconcile against the full snapshot. */
export function getLivescoresChanges(): Promise<ISportsResponse<AnyRow>> {
  return request('/livescores/changes')
}

/* /events — recent event additions (goal/card/sub/…). Each row contains
 * a matchId and an events[] array. */
export function getEvents(): Promise<ISportsResponse<AnyRow>> {
  return request('/events')
}

export interface ScheduleOptions {
  leagueId?: string
  /* Format `YYYY-MM-DD`. iSports treats it as the league's local date. */
  date?: string
}

/* /schedule — future fixtures. Pass either `leagueId` (best for a single
 * tournament like WC 2026 leagueId=1572) or `date`. */
export function getSchedule(opts: ScheduleOptions = {}): Promise<ISportsResponse<AnyRow>> {
  return request('/schedule', {
    leagueId: opts.leagueId,
    date: opts.date,
  })
}

/* /team — team profile (logo, founded, country). */
export function getTeam(teamId: string): Promise<ISportsResponse<AnyRow>> {
  return request('/team', { teamId })
}

/* /league — full league directory. ~800KB of JSON, cache aggressively. */
export function getLeague(): Promise<ISportsResponse<AnyRow>> {
  return request('/league')
}
