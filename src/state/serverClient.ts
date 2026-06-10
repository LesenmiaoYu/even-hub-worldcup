import type { Match, MatchEvent, TeamCode } from '../types'
import { store } from './store'

/* SSE delta protocol — mirror of server/state.ts `Delta`. Kept in sync by
 * hand since the server tsconfig already imports client types but the
 * client tsconfig excludes server/. */
export type Delta =
  | {
      type: 'event-applied'
      matchId: string
      event: MatchEvent
      scoreDelta?: { home?: number; away?: number }
      match: Match
    }
  | {
      type: 'minute'
      matchId: string
      minute: number
    }
  | {
      type: 'bracket-resolved'
      matchId: string
      home: TeamCode | null
      away: TeamCode | null
    }
  | {
      type: 'reset'
      matchId: string
      match: Match
    }

interface SnapshotMessage {
  matches: Match[]
}

/* Server URL resolution.
 *
 * Dev: VITE_SERVER_URL unset → relative '/events' → vite proxy forwards
 *      to http://localhost:3001 (see vite.config.ts).
 *
 * Prod (.ehpk): VITE_SERVER_URL is baked at build time as the absolute
 *      public URL of the Node server (e.g. https://wc.yulesenmiao.com).
 *      The .ehpk runs inside the Even App WebView so its origin is the
 *      sandbox, not the server — relative paths would not resolve. */
const SERVER_URL = (import.meta as unknown as { env: Record<string, string | undefined> })
  .env.VITE_SERVER_URL?.replace(/\/$/, '') ?? ''
const EVENTS_PATH = `${SERVER_URL}/events`

let connection: EventSource | null = null

/** Open the SSE connection that drives the client store. Idempotent —
 * subsequent calls return the existing EventSource. EventSource handles
 * auto-reconnect natively, so onerror just logs. */
export function openServerConnection(): EventSource {
  if (connection) return connection

  const es = new EventSource(EVENTS_PATH)
  connection = es

  es.addEventListener('snapshot', (ev: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(ev.data) as SnapshotMessage
      store.replaceAll(msg.matches)
    } catch (err) {
      console.error('[serverClient] failed to parse snapshot:', err)
    }
  })

  es.addEventListener('delta', (ev: MessageEvent<string>) => {
    try {
      const delta = JSON.parse(ev.data) as Delta
      store.applyDelta(delta)
    } catch (err) {
      console.error('[serverClient] failed to parse delta:', err)
    }
  })

  es.onerror = (err) => {
    /* EventSource auto-reconnects on transient drops; nothing to do here
     * but make the failure visible during development. */
    console.warn('[serverClient] SSE error (auto-reconnect):', err)
  }

  return es
}
