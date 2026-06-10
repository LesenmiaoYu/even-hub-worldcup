import type { Match, MatchEvent } from '../types'
import type { Delta } from './serverClient'

type Listener = (matches: Match[]) => void

export class Store {
  /* Starts empty in prod. The first SSE `snapshot` frame from the server
   * (which hydrates from iSports on boot) seeds the store via replaceAll. */
  private matches: Match[] = []
  private listeners = new Set<Listener>()

  getAll(): Match[] {
    return this.matches
  }

  get(id: string): Match | undefined {
    return this.matches.find(m => m.id === id)
  }

  /** Wholesale replace the cache from a server snapshot. Notifies
   * subscribers once so the UI repaints from the new ground truth. */
  replaceAll(matches: Match[]): void {
    this.matches = matches
    this.notify()
  }

  /** Apply a server delta to the cache. The server is authoritative —
   * `event-applied` and `reset` carry the full post-mutation match
   * snapshot so we splice it in by id rather than re-running the
   * applyEvent logic. */
  applyDelta(delta: Delta): void {
    switch (delta.type) {
      case 'event-applied': {
        this.spliceMatch(delta.match)
        break
      }
      case 'reset': {
        this.spliceMatch(delta.match)
        break
      }
      case 'minute': {
        const m = this.get(delta.matchId)
        if (!m) return
        m.minute = delta.minute
        break
      }
      case 'bracket-resolved': {
        const m = this.get(delta.matchId)
        if (!m) return
        m.home = delta.home
        m.away = delta.away
        break
      }
    }
    this.notify()
  }

  private spliceMatch(next: Match): void {
    const idx = this.matches.findIndex(m => m.id === next.id)
    if (idx === -1) {
      this.matches.push(next)
      return
    }
    this.matches[idx] = next
  }

  getLive(): Match[] {
    return this.matches.filter(m => m.state === 'live')
  }

  getUpcoming(): Match[] {
    return this.matches.filter(m => m.state === 'scheduled')
  }

  getPast(): Match[] {
    return this.matches.filter(m => m.state === 'ft')
  }

  applyEvent(matchId: string, event: MatchEvent, scoreDelta?: { home?: number; away?: number }) {
    const m = this.get(matchId)
    if (!m) return
    m.events.push(event)
    if (scoreDelta?.home && m.homeScore !== null) m.homeScore += scoreDelta.home
    if (scoreDelta?.away && m.awayScore !== null) m.awayScore += scoreDelta.away
    if (event.type === 'ft') {
      m.state = 'ft'
      this.resolveBracket(matchId)
    }
    this.notify()
  }

  setMinute(matchId: string, minute: number) {
    const m = this.get(matchId)
    if (!m) return
    m.minute = minute
  }

  private resolveBracket(finishedMatchId: string) {
    for (const m of this.matches) {
      if (!m.resolvesFrom) continue
      if (m.resolvesFrom.home === finishedMatchId) m.home = this.winnerOf(finishedMatchId)
      if (m.resolvesFrom.away === finishedMatchId) m.away = this.winnerOf(finishedMatchId)
    }
  }

  private winnerOf(matchId: string): Match['home'] {
    const m = this.get(matchId)
    if (!m || m.homeScore === null || m.awayScore === null) return null
    if (m.homeScore > m.awayScore) return m.home
    if (m.homeScore < m.awayScore) return m.away
    /* Tied after regulation + ET — knockout matches go to penalties. */
    if (m.homePenalty != null && m.awayPenalty != null) {
      return m.homePenalty >= m.awayPenalty ? m.home : m.away
    }
    return m.home
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Public re-emit for debug paths that mutate match fields directly
   * (e.g. resetting a match back to scheduled/live state). Production code
   * should go through applyEvent / setMinute which notify internally. */
  touch() {
    this.notify()
  }

  private notify() {
    for (const l of this.listeners) l(this.matches)
  }
}

export const store = new Store()
