import type { Match, LiveTickConfig } from '../types'

export function getInitialMatches(): Match[] {
  return [
    {
      id: 'qf1',
      stage: 'QF',
      home: 'ARG', away: 'NED',
      homeScore: 2, awayScore: 1, homePenalty: null, awayPenalty: null,
      minute: 90, state: 'ft',
      kickoffOffsetMin: -60 * 48,
      venue: 'Estadio Azteca',
      events: [
        { minute: 23, type: 'goal', side: 'home', player: 'Messi' },
        { minute: 67, type: 'goal', side: 'home', player: 'Di Maria' },
        { minute: 81, type: 'goal', side: 'away', player: 'Depay' },
        { minute: 90, type: 'ft', side: null },
      ],
    },
    {
      id: 'qf2',
      stage: 'QF',
      home: 'FRA', away: 'ENG',
      homeScore: 1, awayScore: 0, homePenalty: null, awayPenalty: null,
      minute: 90, state: 'ft',
      kickoffOffsetMin: -60 * 45,
      venue: 'MetLife Stadium',
      events: [
        { minute: 56, type: 'goal', side: 'home', player: 'Mbappé' },
        { minute: 90, type: 'ft', side: null },
      ],
    },
    {
      id: 'qf3',
      stage: 'QF',
      home: 'BRA', away: 'GER',
      homeScore: 3, awayScore: 2, homePenalty: null, awayPenalty: null,
      minute: 90, state: 'ft',
      kickoffOffsetMin: -60 * 24,
      venue: 'SoFi Stadium',
      events: [
        { minute: 12, type: 'goal', side: 'home', player: 'Vinicius' },
        { minute: 33, type: 'goal', side: 'away', player: 'Musiala' },
        { minute: 44, type: 'goal', side: 'home', player: 'Rodrygo' },
        { minute: 78, type: 'goal', side: 'home', player: 'Endrick' },
        { minute: 89, type: 'goal', side: 'away', player: 'Wirtz' },
        { minute: 90, type: 'ft', side: null },
      ],
    },
    {
      id: 'qf4',
      stage: 'QF',
      home: 'ESP', away: 'POR',
      /* Seed QF that went to a penalty shootout — so the penalty UI
       * (PEN indicator on G2 Layer 2, `(4-3 pen)` suffix on phone
       * matches/bracket/detail) demos on initial load without needing
       * a debug button to trigger it. */
      homeScore: 2, awayScore: 2, homePenalty: 3, awayPenalty: 4,
      minute: 120, state: 'ft',
      kickoffOffsetMin: -60 * 21,
      venue: 'Estadio Akron',
      events: [
        { minute: 19,  type: 'goal', side: 'home', player: 'Yamal' },
        { minute: 38,  type: 'goal', side: 'away', player: 'Ronaldo' },
        { minute: 71,  type: 'goal', side: 'away', player: 'B. Fernandes' },
        { minute: 105, type: 'goal', side: 'home', player: 'Morata' },
        { minute: 120, type: 'ft',   side: null },
      ],
    },
    {
      id: 'sf1',
      stage: 'SF',
      home: 'ARG', away: 'FRA',
      /* Seeded as the Lusail 3-3 / ARG-wins-4-2-on-pens result so the
       * PEN counter is visible by default on Layer 2 (which defaults to
       * the most-recent-FT match via pickFocusMatch) without anyone
       * needing to navigate to QF4. The "Start live game" debug button
       * resets SF1 back to minute 1 / 0-0 for the live-game demo. */
      homeScore: 3, awayScore: 3, homePenalty: 4, awayPenalty: 2,
      minute: 120, state: 'ft',
      kickoffOffsetMin: -120,
      venue: 'MetLife Stadium',
      events: [
        { minute: 23,  type: 'goal', side: 'home', player: 'Messi' },
        { minute: 41,  type: 'goal', side: 'away', player: 'Mbappé' },
        { minute: 67,  type: 'goal', side: 'home', player: 'Álvarez' },
        { minute: 78,  type: 'goal', side: 'away', player: 'Griezmann' },
        { minute: 88,  type: 'goal', side: 'home', player: 'Di María' },
        { minute: 95,  type: 'goal', side: 'away', player: 'Coman' },
        { minute: 120, type: 'ft',   side: null },
      ],
    },
    {
      id: 'sf2',
      stage: 'SF',
      home: 'BRA', away: 'POR',
      homeScore: null, awayScore: null, homePenalty: null, awayPenalty: null,
      minute: null, state: 'scheduled',
      kickoffOffsetMin: 60 * 2,
      venue: 'Estadio Azteca',
      events: [],
    },
    {
      id: 'third',
      stage: '3rd',
      home: 'NED', away: 'GER',
      homeScore: null, awayScore: null, homePenalty: null, awayPenalty: null,
      minute: null, state: 'scheduled',
      kickoffOffsetMin: 60 * 25,
      venue: 'SoFi Stadium',
      events: [],
    },
    {
      id: 'final',
      stage: 'F',
      /* SF1 is seeded as FT so Final.home is resolved here directly
       * (resolveBracket only runs when an FT event is APPLIED at runtime,
       * not when state='ft' is set in the seed). SF2 still resolves
       * normally once SF2 finishes. */
      home: 'ARG', away: null,
      homeScore: null, awayScore: null, homePenalty: null, awayPenalty: null,
      minute: null, state: 'scheduled',
      kickoffOffsetMin: 60 * 49,
      venue: 'MetLife Stadium',
      events: [],
      resolvesFrom: { home: 'sf1', away: 'sf2' },
    },
  ]
}

export const LIVE_TICK: LiveTickConfig = {
  matchId: 'sf1',
  /* 1 game-minute = 1s real time. Was 4000 — David: "in the mock,
   * one minute in there can be a sec in real life". Faster cycle lets
   * us see the full 94-minute scripted demo in ~90s. */
  msPerMinute: 1000,
  script: [
    { minute: 45, event: { minute: 45, type: 'yellow', side: 'away', player: 'Tchouaméni' } },
    { minute: 47, event: { minute: 45, type: 'ht', side: null } },
    { minute: 58, event: { minute: 58, type: 'yellow', side: 'away', player: 'Camavinga' } },
    { minute: 65, event: { minute: 65, type: 'sub', side: 'away', player: 'Giroud', playerIn: 'Kolo Muani' } },
    { minute: 67, event: { minute: 67, type: 'goal', side: 'home', player: 'Álvarez' }, scoreDelta: { home: 1 } },
    { minute: 72, event: { minute: 72, type: 'sub', side: 'home', player: 'Di María', playerIn: 'Lautaro Martínez' } },
    { minute: 79, event: { minute: 79, type: 'yellow', side: 'home', player: 'Otamendi' } },
    { minute: 85, event: { minute: 85, type: 'sub', side: 'away', player: 'Dembélé', playerIn: 'Coman' } },
    { minute: 94, event: { minute: 94, type: 'ft', side: null } },
  ],
}
