/* Re-export the canonical types from the client so server + client share
 * one source of truth. The server tsconfig adds `../src` to its rootDirs
 * so this relative import resolves cleanly under tsx. */
export type {
  TeamCode,
  Stage,
  MatchState,
  Team,
  EventType,
  Side,
  MatchEvent,
  IsportsStatus,
  Match,
  ScriptedTick,
  LiveTickConfig,
} from '../src/types.ts'
