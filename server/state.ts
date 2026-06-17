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
    if (scoreDelta?.home != null && m.homeScore !== null) m.homeScore += scoreDelta.home
    if (scoreDelta?.away != null && m.awayScore !== null) m.awayScore += scoreDelta.away

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

  /* Promote past-kickoff scheduled matches to 'live' when iSports lags
   * on the transition. ONLY direction we handle here — live→ft is NOT
   * fabricated from elapsed-time guesses. For live→ft we re-poll
   * /schedule (the authoritative source) every 5 min via
   * reconcileFromSchedule below.
   *
   * 5-minute grace before promoting; iSports' eventual emission latency
   * is usually under a minute. Emits a reset SSE delta per change so
   * every client (any bundle version) gets the corrected state. */
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

  /* Reconcile authoritative state from a fresh /schedule fetch WITHOUT
   * wiping in-flight data. Updates only state-class fields (state,
   * homeScore, awayScore, homePenalty, awayPenalty, kickoffAt) on
   * matches we already have. Leaves events[] and minute alone — those
   * come from the /livescores and /events polls and would be lost if
   * we replaceAll'd every 5 min.
   *
   * On a live→ft transition, fires resolveBracket so knockout slots
   * propagate. Emits a reset SSE delta per changed match.
   *
   * Adds any matches we don't yet have (e.g. newly-resolved knockout
   * slots iSports just published). Does NOT delete matches — that's
   * /schedule's job, but only on boot via hydrateFromIsports. */
  reconcileFromSchedule(fresh: Match[]): number {
    let changed = 0
    const existingById = new Map(this.matches.map(m => [m.id, m]))
    for (const f of fresh) {
      const existing = existingById.get(f.id)
      if (!existing) {
        this.matches.push(f)
        this.emit({ type: 'reset', matchId: f.id, match: structuredClone(f) })
        changed++
        continue
      }
      const stateChanged = existing.state !== f.state
      const scoreChanged =
        existing.homeScore !== f.homeScore ||
        existing.awayScore !== f.awayScore ||
        existing.homePenalty !== f.homePenalty ||
        existing.awayPenalty !== f.awayPenalty
      const kickoffChanged = existing.kickoffAt !== f.kickoffAt
      if (!stateChanged && !scoreChanged && !kickoffChanged) continue

      const wasLive = existing.state === 'live'
      const willBeFt = f.state === 'ft'
      existing.state = f.state
      existing.homeScore = f.homeScore
      existing.awayScore = f.awayScore
      existing.homePenalty = f.homePenalty
      existing.awayPenalty = f.awayPenalty
      if (f.kickoffAt) existing.kickoffAt = f.kickoffAt
      if (wasLive && willBeFt) this.resolveBracket(existing.id)
      this.emit({ type: 'reset', matchId: existing.id, match: structuredClone(existing) })
      changed++
    }
    return changed
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
      if (m.homePenalty > m.awayPenalty) return m.home
      if (m.homePenalty < m.awayPenalty) return m.away
      /* Shootouts cannot tie in real football — they continue until
       * someone misses. A tied penalty pair means iSports gave us bad
       * data; refuse to invent a winner rather than silently picking one. */
      return null
    }
    /* Regulation tied with no penalty data — the match is unresolvable
     * from the data we have. Surface as null so the bracket UI shows an
     * empty slot instead of forging a winner. */
    return null
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
