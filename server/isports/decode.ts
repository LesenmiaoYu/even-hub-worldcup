/* Pure decoders that translate iSports' integer enums and short labels
 * into the typed string unions the rest of the app speaks.
 *
 * Everything here is pure (no I/O, no mutation) so it stays trivially
 * unit-testable from a fixture.
 */
import type { EventType, MatchState, Stage } from '../types.ts'

/* ────────────────────────────────────────────────────────────────────────
 * Match status
 *
 * iSports documents the following codes (verified against spec.md §8.2):
 *   0   not started
 *   1   first half             ─┐
 *   2   half time               │
 *   3   second half             │  all "match in progress"
 *   4   extra time              │
 *   5   penalty shootout       ─┘
 *  -1   finished (FT, includes after-ET / after-shootout)
 * -10   cancelled
 * -11   to be determined
 * -12   terminated
 * -13   interrupted
 * -14   postponed
 *
 * Our app only models three live states: 'scheduled' | 'live' | 'ft'.
 * Cancelled-style statuses don't fit any of those, so they return the
 * sentinel string `'cancelled'` and callers decide whether to drop the
 * match. Unknown / unexpected ints fall through to 'cancelled' as well
 * because that's the safest "don't surface this" bucket.
 * ──────────────────────────────────────────────────────────────────────── */
export function decodeStatus(status: number): MatchState | 'cancelled' {
  switch (status) {
    case 0:
    case -11:                    // TBD = not yet scheduled enough to play
      return 'scheduled'
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:                      // shootout in progress is still "live"
      return 'live'
    case -1:
      return 'ft'
    case -10:                    // cancelled
    case -12:                    // terminated
    case -13:                    // interrupted
    case -14:                    // postponed
      return 'cancelled'
    default:
      return 'cancelled'
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Event type
 *
 * AUTHORITATIVE mapping from the iSports docs page id=15 (cached in
 * server/isports-docs.txt). The earlier adapter agent inferred from
 * the fixture distribution alone and got 2/3 swapped + sub=4 wrong —
 * those numbers happened to read plausibly (2 occurrences = "rare =
 * red?") but the docs settle it:
 *
 *   1  → goal
 *   2  → red card             (NOT yellow — fixture had only 2 of these,
 *                               which fits "red is rare, yellow is common")
 *   3  → yellow card          (41 in fixture; matches "yellow is common")
 *   7  → penalty scored       (counts as goal for score; recorded as goal
 *                               so the existing UI just shows GOAL chip)
 *   8  → own goal             (same — recorded as goal, attribution differs
 *                               but the event log just needs "GOAL")
 *   9  → second yellow → red  (recorded as red — matches the on-field reality)
 *  11  → substitution         (NOT 4)
 *  13  → penalty missed       (no UI slot in our app — dropped)
 *  14  → VAR review           (no UI slot in our app — dropped)
 *
 * Goal-with-assist: playerName carries "Scorer(Assist:Assister)" — we
 * keep the raw string for now; transform.ts strips the parenthetical if
 * you want just the scorer name. Substitution: playerName carries
 * "PlayerOn↑PlayerOff↓"; transform.ts parses it into player/playerIn.
 *
 * Halftime ('ht') and full-time ('ft') events aren't separate iSports
 * event types — they're derived from the status flip on the match record,
 * not from the events feed. They are NOT mapped here. */
export function decodeEventType(type: number): EventType | null {
  switch (type) {
    case 1: return 'goal'
    case 2: return 'red'
    case 3: return 'yellow'
    case 7: return 'goal'        // penalty scored → goal in our schema
    case 8: return 'goal'        // own goal → goal in our schema
    case 9: return 'red'         // second yellow = red on field
    case 11: return 'sub'
    default: return null         // 13 (pen missed), 14 (VAR), anything unknown
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Stage
 *
 * Round names observed in server/fixtures/schedule-wc2026.json:
 *   "Group stage"     (72 matches)
 *   "1/16Final"       (16 matches)   ← round of 32; NO slot in our Stage union
 *   "1/8 Final"       ( 8 matches)   ← round of 16
 *   "Quarterfinals"   ( 4 matches)
 *   "Semifinal"       ( 2 matches)
 *   "Third runner"    ( 1 match )    ← 3rd-place playoff
 *   "Finals"          ( 1 match )
 *
 * The user spec also called out "Round of 16" and "3rd place play-off"
 * as alternate labels — included below in case iSports relabels mid-tour.
 *
 * Anything we don't recognise returns null so `transformMatch` can drop
 * the match cleanly instead of jamming an undefined stage into the UI.
 *
 * `group` is currently unused — kept in the signature so callers can
 * pass it without thinking; tag it with a void to keep the unused-param
 * lint happy.
 * ──────────────────────────────────────────────────────────────────────── */
export function decodeStage(round: string, group: string): Stage | null {
  void group
  const r = round.trim().toLowerCase()
  switch (r) {
    case 'group stage':
      return 'GS'
    case '1/8 final':
    case 'round of 16':
      return 'R16'
    case 'quarterfinals':
    case 'quarter-finals':
    case 'quarter finals':
      return 'QF'
    case 'semifinal':
    case 'semifinals':
    case 'semi-finals':
      return 'SF'
    case 'finals':
    case 'final':
      return 'F'
    case 'third runner':
    case '3rd place play-off':
    case '3rd-place playoff':
    case 'third place playoff':
      return '3rd'
    /* 1/16Final = round of 32 — exists in WC 2026 (48-team format) but no
     * slot in the current Stage union. Drop silently. */
    case '1/16final':
    case '1/16 final':
    case 'round of 32':
      return null
    default:
      return null
  }
}
