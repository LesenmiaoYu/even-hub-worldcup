import type { Match, MatchEvent, TeamCode } from './types.ts'
import { getInitialMatches, LIVE_TICK } from './seed.ts'

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
  private matches: Match[] = getInitialMatches()
  private listeners = new Set<DeltaListener>()
  private firedTickMinutes = new Set<number>()
  private tickHandle: ReturnType<typeof setInterval> | null = null

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

    /* FT terminates the match and may cascade into the bracket. We stop
     * the tick BEFORE resolving so a subsequent setInterval callback
     * doesn't sneak a minute=95 onto a finished match. */
    if (event.type === 'ft') {
      m.state = 'ft'
      this.stopTick()
    }

    this.emit({
      type: 'event-applied',
      matchId,
      event,
      scoreDelta,
      match: structuredClone(m),
    })

    if (event.type === 'ft') {
      this.resolveBracket(matchId)
    }
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
    this.firedTickMinutes.clear()
    this.stopTick()
    for (const m of matches) {
      this.emit({ type: 'reset', matchId: m.id, match: structuredClone(m) })
    }
  }

  /* Append an event to a match IFF its eventId hasn't been seen before.
   * Returns true if the event was appended (and a delta broadcast),
   * false if it was a duplicate or the match doesn't exist.
   *
   * This is the iSports /events poll's entry point. The events feed is
   * the source of truth for the event TIMELINE only — score is owned by
   * the /livescores poll (see `patchLivescore`), so we deliberately do
   * NOT pass scoreDelta here. Mock-path callers should keep using
   * `applyEvent`. */
  upsertEvent(matchId: string, event: MatchEvent): boolean {
    const m = this.get(matchId)
    if (!m) return false
    if (event.eventId) {
      const dup = m.events.some(e => e.eventId === event.eventId)
      if (dup) return false
    }
    m.events.push(event)
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

  /* Reset SF1 back to a fresh kickoff. Ported from
   * src/phone/debug.ts → debugStartLiveGame, but here it also kicks the
   * server-owned tick. */
  startLive(matchId: string): boolean {
    const m = this.get(matchId)
    if (!m) return false

    m.state = 'live'
    m.minute = 1
    m.homeScore = 0
    m.awayScore = 0
    m.homePenalty = null
    m.awayPenalty = null
    m.events = []
    m.kickoffOffsetMin = 0

    /* Clear any downstream slots that were resolved off this match. */
    for (const dep of this.matches) {
      if (dep.resolvesFrom?.home === matchId) dep.home = null
      if (dep.resolvesFrom?.away === matchId) dep.away = null
    }

    this.firedTickMinutes.clear()
    this.stopTick()

    this.emit({ type: 'reset', matchId, match: structuredClone(m) })
    this.startTick(matchId)
    return true
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

  /* ---------- tick ---------- */

  private startTick(matchId: string): void {
    /* Only sf1 has a script today. Guard so future callers don't get a
     * silent no-op tick on other ids. */
    if (matchId !== LIVE_TICK.matchId) return

    const cfg = LIVE_TICK
    this.tickHandle = setInterval(() => {
      const m = this.get(cfg.matchId)
      if (!m || m.state !== 'live' || m.minute === null) {
        this.stopTick()
        return
      }

      const next = m.minute + 1
      this.setMinute(cfg.matchId, next)

      /* Fire any scripted events whose minute we've now reached. The
       * applyEvent path will stop the tick on FT — break out of the loop
       * the moment FT lands so trailing entries at the same minute can't
       * mutate a finished match. */
      for (const tick of cfg.script) {
        if (tick.minute <= next && !this.firedTickMinutes.has(tick.minute)) {
          this.firedTickMinutes.add(tick.minute)
          this.applyEvent(cfg.matchId, tick.event, tick.scoreDelta)
          if (tick.event.type === 'ft') break
        }
      }
    }, cfg.msPerMinute)
  }

  private stopTick(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle)
      this.tickHandle = null
    }
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
