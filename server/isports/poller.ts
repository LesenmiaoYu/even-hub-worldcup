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
const MAX_BACKOFF_MS = 5 * 60 * 1000          // 5 min ceiling

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

async function pollSchedule(store: MatchStore): Promise<void> {
  await hydrateFromIsports(store)
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
      `schedule=${SCHEDULE_POLL_MS}ms, livescores=${LIVESCORES_POLL_MS}ms, events=${EVENTS_POLL_MS}ms ` +
      `(backoff cap ${MAX_BACKOFF_MS}ms)`,
  )

  const loops = [
    new BackoffLoop('schedule', SCHEDULE_POLL_MS, () => pollSchedule(store)),
    new BackoffLoop('livescores', LIVESCORES_POLL_MS, () => pollLivescores(store)),
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
