import type { Match, MatchEvent, TeamCode } from './types.ts'

/* Delta shapes broadcast on the SSE stream. Kept in this file so the
 * server protocol lives in one place. Client mirrors this in Phase 1. */
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

export type DeltaListener = (delta: Delta) => void

export class MatchStore {
  /* Starts empty. server/index.ts hydrates via iSports on boot, then
   * pollers feed deltas in. Clients connecting before hydrate finishes
   * just get an empty snapshot — the first poll fills them in via SSE. */
  private matches: Match[] = []
  private listeners = new Set<DeltaListener>()

  /* ---------- read ---------- */

  getAll(): Match[] {
    return this.matches
  }

  get(id: string): Match | undefined {
    return this.matches.find(m => m.id === id)
  }

  /* ---------- mutate ---------- */

  applyEvent(
    matchId: string,
    event: MatchEvent,
    scoreDelta?: { home?: number; away?: number },
  ): void {
    const m = this.get(matchId)
    if (!m) return
    m.events.push(event)
    if (scoreDelta?.home && m.homeScore !== null) m.homeScore += scoreDelta.home
    if (scoreDelta?.away && m.awayScore !== null) m.awayScore += scoreDelta.away

    /* FT terminates the match and may cascade into the bracket. */
    if (event.type === 'ft') m.state = 'ft'

    this.emit({
      type: 'event-applied',
      matchId,
      event,
      scoreDelta,
      match: structuredClone(m),
    })

    if (event.type === 'ft') this.resolveBracket(matchId)
  }

  setMinute(matchId: string, minute: number): void {
    const m = this.get(matchId)
    if (!m) return
    m.minute = minute
    this.emit({ type: 'minute', matchId, minute })
  }

  /* Replace the entire match list (used by the iSports hydrate path on
   * boot). Emits a `reset` delta for each new/changed match so any
   * already-connected SSE client converges without reconnecting. New
   * connections naturally pick up the new list via the snapshot frame.
   *
   * No-op cheap path: if the previous and next lists are reference-equal
   * we skip the loop. We do NOT diff field-by-field — replaceAll is the
   * "blow away and reseed" tool. */
  replaceAll(matches: Match[]): void {
    this.matches = matches
    for (const m of matches) {
      this.emit({ type: 'reset', matchId: m.id, match: structuredClone(m) })
    }
  }

  /* Append an event to a match IFF its eventId hasn't been seen before.
   * Returns true if the event was appended (and a delta broadcast),
   * false if it was a duplicate or the match doesn't exist.
   *
   * This is the iSports /events poll's entry point. The events feed is
   * the source of truth for the event TIMELINE.
   *
   * Score reconciliation: /livescores/changes is incremental and
   * frequently lags or stops emitting for a match (same root cause as
   * the scheduled→live stall the sweep handles). The events feed is
   * independent and almost always ahead — when a goal arrives here but
   * /livescores hasn't bumped the score yet, the UI ends up showing the
   * stale scoreline alongside a fresh GOAL chip ("0-1 with two goal
   * rows" is the user-visible symptom). So we treat the per-side goal
   * count as a FLOOR on the score: take max(currentScore, goalCount).
   * If iSports later sends a higher number via /livescores, that wins
   * (patchLivescore is unconditional). */
  upsertEvent(matchId: string, event: MatchEvent): boolean {
    const m = this.get(matchId)
    if (!m) return false
    if (event.eventId) {
      const dup = m.events.some(e => e.eventId === event.eventId)
      if (dup) return false
    }
    m.events.push(event)

    if (event.type === 'goal' && event.side) {
      const count = m.events.filter(
        e => e.type === 'goal' && e.side === event.side,
      ).length
      if (event.side === 'home') {
        if (m.homeScore === null || count > m.homeScore) m.homeScore = count
      } else {
        if (m.awayScore === null || count > m.awayScore) m.awayScore = count
      }
    }

    this.emit({
      type: 'event-applied',
      matchId,
      event,
      match: structuredClone(m),
    })
    return true
  }

  /* Apply a livescore-shaped patch (score / state / minute / penalty /
   * home / away) to a match. Only broadcasts if at least one field
   * actually changed. Emits `minute` for a sole minute change, otherwise
   * a `reset` carrying the full post-patch match (the score and state
   * deltas don't map cleanly onto the existing `event-applied` shape, and
   * the client treats `reset` as "replace this match snapshot"). When
   * `home` / `away` flip we also emit a `bracket-resolved` so downstream
   * UI that listens for that specific delta type stays correct. */
  patchLivescore(matchId: string, patch: Partial<Match>): void {
    const m = this.get(matchId)
    if (!m) return

    let changed = false
    let onlyMinute = true
    let bracketChanged = false

    const fields: (keyof Match)[] = [
      'home', 'away', 'homeScore', 'awayScore',
      'homePenalty', 'awayPenalty', 'minute', 'state', 'stage',
    ]
    for (const k of fields) {
      if (!(k in patch)) continue
      const next = patch[k]
      if (m[k] === next) continue
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      ;(m as any)[k] = next
      changed = true
      if (k !== 'minute') onlyMinute = false
      if (k === 'home' || k === 'away') bracketChanged = true
    }

    if (!changed) return

    if (onlyMinute && typeof m.minute === 'number') {
      this.emit({ type: 'minute', matchId, minute: m.minute })
      return
    }

    this.emit({ type: 'reset', matchId, match: structuredClone(m) })
    if (bracketChanged) {
      this.emit({
        type: 'bracket-resolved',
        matchId,
        home: m.home,
        away: m.away,
      })
    }
  }

  /* Promote any state:'scheduled' match whose kickoff is past to
   * state:'live'. iSports occasionally fails to emit the scheduled→live
   * transition (especially when /livescores/changes drops the match
   * before its state flips), leaving the server holding state:'scheduled'
   * for hours while users see "kicks off in -3h" on the L2 status
   * line and "in Xh" on the matches list.
   *
   * This is a server-side authoritative fix: every connected client
   * (regardless of bundle version) gets the corrected state via a SSE
   * reset delta. No client update required.
   *
   * 5-minute grace window before promoting — iSports' eventual emission
   * latency is usually under a minute, so 5 min is comfortable.
   *
   * We do NOT auto-promote live→ft. Final score might be unset; risk
   * of "FT 0-0" lies is real. The 12h /schedule re-hydrate catches the
   * straggling live→ft transitions naturally. */
  sweepStaleStates(): number {
    const now = Date.now()
    let promoted = 0
    for (const m of this.matches) {
      if (m.state !== 'scheduled') continue
      if (!m.kickoffAt) continue
      const elapsedMin = (now - new Date(m.kickoffAt).getTime()) / 60_000
      if (elapsedMin < 5) continue
      m.state = 'live'
      this.emit({ type: 'reset', matchId: m.id, match: structuredClone(m) })
      promoted++
    }
    return promoted
  }

  /* ---------- bracket ---------- */

  private resolveBracket(finishedMatchId: string): void {
    for (const m of this.matches) {
      if (!m.resolvesFrom) continue
      let changed = false
      if (m.resolvesFrom.home === finishedMatchId) {
        m.home = this.winnerOf(finishedMatchId)
        changed = true
      }
      if (m.resolvesFrom.away === finishedMatchId) {
        m.away = this.winnerOf(finishedMatchId)
        changed = true
      }
      if (changed) {
        this.emit({
          type: 'bracket-resolved',
          matchId: m.id,
          home: m.home,
          away: m.away,
        })
      }
    }
  }

  private winnerOf(matchId: string): TeamCode | null {
    const m = this.get(matchId)
    if (!m || m.homeScore === null || m.awayScore === null) return null
    if (m.homeScore > m.awayScore) return m.home
    if (m.homeScore < m.awayScore) return m.away
    if (m.homePenalty != null && m.awayPenalty != null) {
      return m.homePenalty >= m.awayPenalty ? m.home : m.away
    }
    return m.home
  }

  /* ---------- pub/sub ---------- */

  subscribe(fn: DeltaListener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit(delta: Delta): void {
    for (const l of this.listeners) {
      try {
        l(delta)
      } catch (err) {
        /* One bad subscriber must not take the broadcast loop down. */
        console.error('[state] delta listener threw:', err)
      }
    }
  }
}

export const store = new MatchStore()
