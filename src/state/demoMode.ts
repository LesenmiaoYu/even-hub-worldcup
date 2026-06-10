import { store } from './store'
import { LIVE_TICK } from '../mock/tournament'

/* Demo-build flag. Set at build time via VITE_DEMO_MODE=true. When true,
 * the bundle is fully self-contained: no SSE connection, no /command POSTs.
 * The store self-seeds from getInitialMatches() on boot; debug handlers
 * mutate the store directly so friends can install the .ehpk and play with
 * the UI without needing the backend server. */
export const DEMO_MODE: boolean =
  (import.meta as unknown as { env: Record<string, string | undefined> })
    .env.VITE_DEMO_MODE === 'true'

let tickHandle: ReturnType<typeof setInterval> | null = null
const firedTickMinutes = new Set<number>()

function stopTick(): void {
  if (tickHandle !== null) {
    clearInterval(tickHandle)
    tickHandle = null
  }
}

/* Mirrors server's startLive: reset sf1 to fresh kickoff, clear downstream
 * bracket slots, run the scripted tick locally. */
export function demoStartLive(): void {
  const matchId = LIVE_TICK.matchId
  const m = store.get(matchId)
  if (!m) return

  m.state = 'live'
  m.minute = 1
  m.homeScore = 0
  m.awayScore = 0
  m.homePenalty = null
  m.awayPenalty = null
  m.events = []
  m.kickoffOffsetMin = 0

  for (const dep of store.getAll()) {
    if (dep.resolvesFrom?.home === matchId) dep.home = null
    if (dep.resolvesFrom?.away === matchId) dep.away = null
  }

  firedTickMinutes.clear()
  stopTick()
  store.touch()

  tickHandle = setInterval(() => {
    const cur = store.get(matchId)
    if (!cur || cur.state !== 'live' || cur.minute === null) {
      stopTick()
      return
    }
    const next = cur.minute + 1
    cur.minute = next
    store.touch()

    for (const tick of LIVE_TICK.script) {
      if (tick.minute <= next && !firedTickMinutes.has(tick.minute)) {
        firedTickMinutes.add(tick.minute)
        store.applyEvent(matchId, tick.event, tick.scoreDelta)
        if (tick.event.type === 'ft') {
          stopTick()
          break
        }
      }
    }
  }, LIVE_TICK.msPerMinute)
}

export function demoMbappeGoal(): void {
  const matchId = LIVE_TICK.matchId
  const m = store.get(matchId)
  if (!m || m.state !== 'live' || m.minute === null) return
  store.applyEvent(
    matchId,
    { minute: m.minute, type: 'goal', side: 'away', player: 'Mbappé' },
    { away: 1 },
  )
}

export function demoSubstitution(): void {
  const matchId = LIVE_TICK.matchId
  const m = store.get(matchId)
  if (!m || m.state !== 'live' || m.minute === null) return
  store.applyEvent(matchId, {
    minute: m.minute,
    type: 'sub',
    side: 'away',
    player: 'Mbappé',
    playerIn: 'Coman',
  })
}
