/* iSports → MatchStore wiring.
 *
 * Two entry points:
 *   - `hydrateFromIsports(store)` — one-shot fetch of the WC 2026
 *     schedule. Used on boot to seed the SSE snapshot.
 *   - `startIsportsPollers(store)` — kicks off three self-scheduling
 *     loops, each with exponential backoff on failure:
 *       schedule          → every 12h
 *       livescores/changes → every 5s (the fast loop; score/state/minute)
 *       events            → every 60s (dedup by eventId)
 *
 * Failure semantics: any non-zero iSports response code (rate-limited,
 * "haven't purchased", transient outage) throws from the poll function.
 * The BackoffLoop wrapper catches the throw, doubles the next-fire
 * delay (cap 5 min), and resets to base cadence on the next success.
 * This means a sustained outage gracefully degrades to one call per 5
 * minutes per loop instead of hammering the rate limit endlessly.
 *
 * The API key is never logged — only call shape and timings.
 */

import type { MatchStore } from '../state.ts'
import type { Match } from '../types.ts'
import {
  getSchedule,
  getLivescores,
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
/* iSports rate-limit hard floors per their docs, plus a 20% safety
 * margin so timing jitter never trips the rate limiter and rains 429s
 * onto our backoff. The dropout detector triggers an expedited
 * /schedule fetch that still respects the same floor via the
 * expediteSchedule gate. Net live→ft staleness ≈ LIVESCORES_FULL_POLL_MS. */
const SCHEDULE_POLL_MS = 108 * 1000           // 90s floor + 20% = 108s
const LIVESCORES_POLL_MS = 6 * 1000           // 5s in use + 20% = 6s (/livescores/changes)
const LIVESCORES_FULL_POLL_MS = 12 * 1000     // 10s desired + 20% = 12s (/livescores dropout)
const EVENTS_POLL_MS = 60 * 1000              // 60s — already iSports' recommended cadence
const MAX_BACKOFF_MS = 5 * 60 * 1000          // 5 min ceiling on failure backoff

const LOG = '[isports]'

/* Pull the full WC 2026 schedule, transform each row, and atomically
 * replace the store contents. Throws on network failure so the boot
 * sequence (server/index.ts) can decide whether to start empty + retry. */
export async function hydrateFromIsports(store: MatchStore): Promise<void> {
  const startedAt = Date.now()
  console.log(`${LOG} hydrate: GET /schedule?leagueId=${LEAGUE_ID}`)
  const res = await getSchedule({ leagueId: LEAGUE_ID })
  if (res.code !== 0) {
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

/* Coordination state for the /schedule path. Both the regular 90s loop
 * AND the dropout-triggered expedite path go through pollSchedule, and
 * we coalesce so concurrent triggers don't double-fetch or violate the
 * iSports 90s rate-limit floor. */
let lastScheduleAt = 0
let scheduleInFlight: Promise<void> | null = null

/* Subsequent /schedule polls (after boot's hydrateFromIsports) reconcile
 * authoritative state from iSports WITHOUT wiping in-flight events/minute.
 * This is the path that catches live→ft transitions iSports failed to
 * emit via /livescores/changes (their feed drops finished matches). */
async function pollSchedule(store: MatchStore): Promise<void> {
  if (scheduleInFlight) return scheduleInFlight
  scheduleInFlight = (async () => {
    try {
      lastScheduleAt = Date.now()
      const startedAt = lastScheduleAt
      const res = await getSchedule({ leagueId: LEAGUE_ID })
      if (res.code !== 0) {
        throw new Error(`iSports /schedule returned code=${res.code} message="${res.message}"`)
      }
      const rows = (res.data ?? []) as unknown as ISportsMatch[]
      const fresh: Match[] = []
      for (const row of rows) {
        const m = transformMatch(row, { leagueId: LEAGUE_ID })
        if (m) fresh.push(m)
      }
      const changed = store.reconcileFromSchedule(fresh)
      const elapsed = Date.now() - startedAt
      if (changed > 0) {
        console.log(`${LOG} schedule reconcile: ${changed} state change(s) (${elapsed}ms)`)
      }
    } finally {
      scheduleInFlight = null
    }
  })()
  return scheduleInFlight
}

/* Trigger an extra /schedule fetch outside the regular 90s loop, but
 * only if 90s have elapsed since the last fetch (iSports rate-limit
 * floor). Called by the /livescores dropout detector when a match
 * disappears from the live set — strong signal it transitioned to ft. */
async function expediteSchedule(store: MatchStore): Promise<void> {
  const elapsed = Date.now() - lastScheduleAt
  if (elapsed < SCHEDULE_POLL_MS) {
    /* Within the rate-limit floor. Next regular tick will catch it. */
    return
  }
  await pollSchedule(store)
}

/* Poll /livescores (full snapshot of every currently-live match across
 * every league) and detect dropouts: any match in our store with
 * state='live' but absent from the fresh response has transitioned out
 * of "live" — iSports drops finished matches from this endpoint at
 * exactly the moment they hit FT. This is the cleanest signal we get,
 * and it arrives faster than /livescores/changes can emit a state flip.
 *
 * The dropout itself is NOT used to fabricate state (no calling
 * store.set state='ft'). It's a wake-up signal that fires an expedited
 * /schedule fetch — /schedule remains the authoritative source. */
async function pollLivescoresDropouts(store: MatchStore): Promise<void> {
  const res = await getLivescores()
  if (res.code !== 0) {
    throw new Error(`/livescores code=${res.code} message="${res.message}"`)
  }
  type IdRow = { matchId?: string }
  const rows = (res.data ?? []) as unknown as IdRow[]
  const freshLiveIds = new Set<string>()
  for (const r of rows) {
    if (r.matchId) freshLiveIds.add(r.matchId)
  }
  const dropouts = store.getAll().filter(
    m => m.state === 'live' && !freshLiveIds.has(m.id),
  )
  if (dropouts.length > 0) {
    console.log(
      `${LOG} livescores dropout: ${dropouts.length} match(es) out of live set (${dropouts.map(d => d.id).join(',')}) — expediting /schedule`,
    )
    await expediteSchedule(store)
  }
}

async function pollLivescores(store: MatchStore): Promise<void> {
  const res = await getLivescoresChanges()
  if (res.code !== 0) {
    throw new Error(`/livescores/changes code=${res.code} message="${res.message}"`)
  }
  const rows = (res.data ?? []) as unknown as ISportsMatch[]
  let touched = 0
  for (const row of rows) {
    const next = transformMatch(row, { leagueId: LEAGUE_ID })
    if (!next) continue
    if (!store.get(next.id)) continue
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

async function pollEvents(store: MatchStore): Promise<void> {
  const res = await getEvents()
  if (res.code !== 0) {
    throw new Error(`/events code=${res.code} message="${res.message}"`)
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

/* Self-scheduling poll loop with exponential backoff. Successive
 * failures multiply the delay by 2 (capped at MAX_BACKOFF_MS). A single
 * success resets the cadence back to baseMs. Survives setInterval-style
 * uncaught throws because run() is wrapped in try/catch. */
class BackoffLoop {
  private failures = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(
    private readonly name: string,
    private readonly baseMs: number,
    private readonly run: () => Promise<void>,
  ) {}

  start(): void {
    this.schedule(this.baseMs)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      void this.tick()
    }, delayMs)
  }

  private async tick(): Promise<void> {
    const startedAt = Date.now()
    try {
      await this.run()
      const elapsed = Date.now() - startedAt
      if (this.failures > 0) {
        console.log(`${LOG} poll ${this.name} recovered after ${this.failures} failures (${elapsed}ms)`)
      } else {
        console.log(`${LOG} poll ${this.name} ok (${elapsed}ms)`)
      }
      this.failures = 0
      this.schedule(this.baseMs)
    } catch (err) {
      this.failures++
      const backoff = Math.min(this.baseMs * 2 ** this.failures, MAX_BACKOFF_MS)
      const elapsed = Date.now() - startedAt
      console.warn(
        `${LOG} poll ${this.name} failed (${elapsed}ms, failure #${this.failures}, next attempt in ${backoff}ms): ${(err as Error).message}`,
      )
      this.schedule(backoff)
    }
  }
}

export interface PollerHandle {
  stop: () => void
}

/* Start the three poll loops. Each runs independently with its own
 * backoff state. Returns a handle whose `stop()` cancels every pending
 * timer — call it on SIGTERM. Does NOT block. */
export function startIsportsPollers(store: MatchStore): PollerHandle {
  console.log(
    `${LOG} starting pollers: ` +
      `schedule=${SCHEDULE_POLL_MS}ms, livescores-changes=${LIVESCORES_POLL_MS}ms, ` +
      `livescores-full=${LIVESCORES_FULL_POLL_MS}ms, events=${EVENTS_POLL_MS}ms ` +
      `(backoff cap ${MAX_BACKOFF_MS}ms)`,
  )

  const loops = [
    new BackoffLoop('schedule', SCHEDULE_POLL_MS, () => pollSchedule(store)),
    new BackoffLoop('livescores', LIVESCORES_POLL_MS, () => pollLivescores(store)),
    new BackoffLoop('livescores-full', LIVESCORES_FULL_POLL_MS, () => pollLivescoresDropouts(store)),
    new BackoffLoop('events', EVENTS_POLL_MS, () => pollEvents(store)),
  ]
  for (const loop of loops) loop.start()

  return {
    stop() {
      for (const loop of loops) loop.stop()
      console.log(`${LOG} pollers stopped`)
    },
  }
}
