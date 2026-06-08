/* iSports → MatchStore wiring.
 *
 * Two entry points:
 *   - `hydrateFromIsports(store)` — one-shot fetch of the WC 2026
 *     schedule. Used on boot before the server starts listening so the
 *     first SSE snapshot is real data, not the mock seed.
 *   - `startIsportsPollers(store)` — kicks off three setInterval loops:
 *       schedule  → every 12h   (static enough; refresh covers projection updates)
 *       livescores/changes → every 5s  (the fast loop; owns score + state + minute)
 *       events    → every 60s  (the timeline loop; dedup by eventId)
 *
 * All loops are exception-safe: a network failure logs at warn level
 * and the next interval retries. We never throw past the interval
 * callback boundary because that would crash the Node process.
 *
 * The API key is never logged — only the high-level call shape and
 * timings are printed.
 */

import type { MatchStore } from '../state.ts'
import type { Match } from '../types.ts'
import {
  getSchedule,
  getLivescoresChanges,
  getEvents,
} from './client.ts'
import {
  transformMatch,
  transformEvents,
  type ISportsMatch,
  type ISportsEvent,
} from './transform.ts'

const LEAGUE_ID = '1572' // FIFA World Cup 2026
const SCHEDULE_POLL_MS = 12 * 60 * 60 * 1000 // 12h
const LIVESCORES_POLL_MS = 5 * 1000           // 5s
const EVENTS_POLL_MS = 60 * 1000              // 60s

const LOG = '[isports]'

/* Pull the full WC 2026 schedule, transform each row, and atomically
 * replace the store contents. Throws on network failure so the boot
 * sequence can decide whether to fall back. */
export async function hydrateFromIsports(store: MatchStore): Promise<void> {
  const startedAt = Date.now()
  console.log(`${LOG} hydrate: GET /schedule?leagueId=${LEAGUE_ID}`)
  const res = await getSchedule({ leagueId: LEAGUE_ID })
  if (res.code !== 0) {
    /* iSports app-level error (e.g. "haven't purchased"). Treat as a
     * hard failure during hydrate so the operator sees it. */
    throw new Error(`iSports /schedule returned code=${res.code} message="${res.message}"`)
  }

  const rows = (res.data ?? []) as unknown as ISportsMatch[]
  const matches: Match[] = []
  let dropped = 0
  for (const row of rows) {
    const m = transformMatch(row, { leagueId: LEAGUE_ID })
    if (m) matches.push(m)
    else dropped++
  }

  store.replaceAll(matches)
  const elapsed = Date.now() - startedAt
  console.log(
    `${LOG} hydrate: ${matches.length} matches in store ` +
      `(dropped ${dropped} unrepresentable rows, ${elapsed}ms)`,
  )
}

/* Reusable "fetch + handle errors + log timing" wrapper for the poll
 * loops. Never throws — errors are logged and swallowed so the loop
 * keeps ticking. */
async function safePoll(name: string, fn: () => Promise<void>): Promise<void> {
  const startedAt = Date.now()
  try {
    await fn()
    const elapsed = Date.now() - startedAt
    console.log(`${LOG} poll ${name} ok (${elapsed}ms)`)
  } catch (err) {
    const elapsed = Date.now() - startedAt
    console.warn(
      `${LOG} poll ${name} failed (${elapsed}ms): ${(err as Error).message}`,
    )
  }
}

/* One schedule poll: re-fetch /schedule and overwrite the store. Used
 * on boot AND on the slow loop. iSports' schedule is the only place
 * the bracket projection lives, so periodic refresh is how we pick up
 * draw resolutions. */
async function pollSchedule(store: MatchStore): Promise<void> {
  await hydrateFromIsports(store)
}

/* One livescores/changes poll: apply score/state/minute patches to
 * every match we already have. Drops rows that aren't WC 2026 or that
 * don't transform cleanly. */
async function pollLivescores(store: MatchStore): Promise<void> {
  const res = await getLivescoresChanges()
  if (res.code !== 0) {
    /* code=2 = "haven't purchased" — permanent, but not fatal because
     * the schedule loop is still keeping the store warm. Log at warn
     * so the operator notices on first encounter. */
    console.warn(`${LOG} /livescores/changes code=${res.code} message="${res.message}"`)
    return
  }
  const rows = (res.data ?? []) as unknown as ISportsMatch[]
  let touched = 0
  for (const row of rows) {
    const next = transformMatch(row, { leagueId: LEAGUE_ID })
    if (!next) continue
    if (!store.get(next.id)) continue /* unknown match — wait for next schedule poll */
    store.patchLivescore(next.id, {
      home: next.home,
      away: next.away,
      homeScore: next.homeScore,
      awayScore: next.awayScore,
      homePenalty: next.homePenalty,
      awayPenalty: next.awayPenalty,
      minute: next.minute,
      state: next.state,
      stage: next.stage,
    })
    touched++
  }
  if (touched > 0) console.log(`${LOG} livescores: patched ${touched} matches`)
}

/* One events poll: walk every match's events[] and upsert any new
 * eventId. iSports' /events feed is global (all leagues, all matches),
 * so we index by matchId and only feed events to matches already in
 * the store. */
async function pollEvents(store: MatchStore): Promise<void> {
  const res = await getEvents()
  if (res.code !== 0) {
    console.warn(`${LOG} /events code=${res.code} message="${res.message}"`)
    return
  }
  type EventsRow = { matchId: string; events?: ISportsEvent[] }
  const rows = (res.data ?? []) as unknown as EventsRow[]
  let added = 0
  for (const row of rows) {
    if (!row.matchId) continue
    if (!store.get(row.matchId)) continue
    const events = transformEvents(row.events ?? [])
    for (const ev of events) {
      if (store.upsertEvent(row.matchId, ev)) added++
    }
  }
  if (added > 0) console.log(`${LOG} events: appended ${added} new events`)
}

export interface PollerHandle {
  stop: () => void
}

/* Start the three interval loops. Returns a handle whose `stop()`
 * clears every timer — call it on SIGTERM. Does NOT block. */
export function startIsportsPollers(store: MatchStore): PollerHandle {
  console.log(
    `${LOG} starting pollers: ` +
      `schedule=${SCHEDULE_POLL_MS}ms, livescores=${LIVESCORES_POLL_MS}ms, events=${EVENTS_POLL_MS}ms`,
  )

  const handles: ReturnType<typeof setInterval>[] = []

  handles.push(
    setInterval(() => {
      void safePoll('schedule', () => pollSchedule(store))
    }, SCHEDULE_POLL_MS),
  )
  handles.push(
    setInterval(() => {
      void safePoll('livescores', () => pollLivescores(store))
    }, LIVESCORES_POLL_MS),
  )
  handles.push(
    setInterval(() => {
      void safePoll('events', () => pollEvents(store))
    }, EVENTS_POLL_MS),
  )

  return {
    stop() {
      for (const h of handles) clearInterval(h)
      console.log(`${LOG} pollers stopped`)
    },
  }
}
