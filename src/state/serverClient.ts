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

interface CommandResponse {
  ok: boolean
  error?: string
}

/* Vite proxies /events + /command to http://localhost:3001 in dev; in
 * production the host serving the bundle is expected to expose the same
 * paths. Relative URLs keep us host-agnostic. */
const EVENTS_PATH = '/events'
const COMMAND_PATH = '/command'

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

/** POST a command to the server. Resolves with the server's JSON response
 * (or a synthesized error envelope on network failure). */
export async function postCommand(
  command: string,
  payload?: Record<string, unknown>,
): Promise<CommandResponse> {
  try {
    const res = await fetch(COMMAND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...(payload ?? {}) }),
    })
    const body = (await res.json()) as CommandResponse
    return body
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[serverClient] postCommand(${command}) failed:`, msg)
    return { ok: false, error: msg }
  }
}
