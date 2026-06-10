import { postCommand } from '../state/serverClient'
import {
  DEMO_MODE,
  demoStartLive,
  demoMbappeGoal,
  demoSubstitution,
} from '../state/demoMode'

/* Debug handlers wired to the bottom debug bar.
 *
 * Two paths share the same exports:
 *  - DEMO_MODE (build with VITE_DEMO_MODE=true): mutate the local store
 *    directly so the .ehpk is self-contained. No backend required.
 *  - Default (npm run dev): forward to the server's /command endpoint,
 *    which owns the tick + bracket mutations and broadcasts over SSE. */

async function fire(command: string): Promise<void> {
  const res = await postCommand(command)
  if (!res.ok) {
    console.warn(`[worldcup] debug command ${command} failed:`, res.error)
  }
}

export function debugStartLiveGame(): Promise<void> {
  if (DEMO_MODE) { demoStartLive(); return Promise.resolve() }
  return fire('start_live')
}

export function debugMbappeGoal(): Promise<void> {
  if (DEMO_MODE) { demoMbappeGoal(); return Promise.resolve() }
  return fire('mbappe_goal')
}

export function debugSubstitution(): Promise<void> {
  if (DEMO_MODE) { demoSubstitution(); return Promise.resolve() }
  return fire('sub')
}
