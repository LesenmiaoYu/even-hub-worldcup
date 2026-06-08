import { postCommand } from '../state/serverClient'

/* Debug handlers wired to the bottom debug bar. Each one forwards to the
 * server's /command endpoint; server owns the live tick + bracket
 * mutations and broadcasts the result over SSE, so we don't touch the
 * store directly. Demo-only — strip the bar + this file when the real
 * backend ships. */

async function fire(command: string): Promise<void> {
  const res = await postCommand(command)
  if (!res.ok) {
    console.warn(`[worldcup] debug command ${command} failed:`, res.error)
  }
}

/** Reset SF1 to a fresh kickoff and start the scripted tick on the
 * server. Idempotent — server clears bracket slots that resolved off this
 * match before re-starting. */
export function debugStartLiveGame(): Promise<void> {
  return fire('start_live')
}

/** Fire a Mbappé goal for FRA (away side of SF1). Server enforces the
 * "must be live" precondition; rejection is logged but not surfaced. */
export function debugMbappeGoal(): Promise<void> {
  return fire('mbappe_goal')
}

/** Substitution — Coman on for Mbappé. Same path as the goal command. */
export function debugSubstitution(): Promise<void> {
  return fire('sub')
}
