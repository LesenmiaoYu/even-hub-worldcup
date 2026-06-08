/* Barrel re-exports for the iSports adapter.
 *
 * Import path for everything else in the server:
 *   import { getLivescores, transformMatch, … } from './isports/index.ts'
 *
 * Keep this file thin — anything that needs to be public is named
 * explicitly so deletions in the underlying modules surface as type
 * errors at the call sites. */

export {
  getLivescores,
  getLivescoresChanges,
  getEvents,
  getSchedule,
  getTeam,
  getLeague,
  type ISportsResponse,
  type ScheduleOptions,
} from './client.ts'

export {
  decodeStatus,
  decodeEventType,
  decodeStage,
} from './decode.ts'

export {
  TEAM_NAME_TO_CODE,
  TEAM_ID_TO_CODE,
  normaliseTeamName,
} from './teamMap.ts'

export {
  transformMatch,
  transformEvent,
  transformEvents,
  type ISportsMatch,
  type ISportsEvent,
  type ISportsExtraExplain,
  type TransformMatchOptions,
} from './transform.ts'

export {
  hydrateFromIsports,
  startIsportsPollers,
  type PollerHandle,
} from './poller.ts'
