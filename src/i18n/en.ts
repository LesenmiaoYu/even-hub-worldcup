import type { Strings } from './types'

const en: Strings = {
  // Top nav
  tab_matches: 'Matches',
  tab_bracket: 'Bracket',

  // Matches list sections
  section_live: 'Live',
  section_upcoming: 'Upcoming',
  section_results: 'Results',
  ui_no_matches: 'No matches',

  // Match row / detail status
  status_vs: 'vs',
  status_ft: 'FT',
  status_ft_pen: 'FT · PEN',
  status_tbd: 'TBD',

  // Kickoff offset formatting
  ui_offset_minutes: 'in {min}m',
  ui_offset_hours: 'in {h}h',
  ui_offset_days: 'in {d}d',

  // Stage labels
  stage_qf: 'Quarterfinals',
  stage_sf: 'Semifinals',
  stage_third: '3rd-Place Playoff',
  stage_final: 'Final',
  stage_gs: 'Group Stage',
  stage_r16: 'Round of 16',

  // Stage header
  ui_app_title: 'World Cup',
  ui_awaiting_data: 'Awaiting data',
  ui_one_match_live: '{home} vs {away} live',
  ui_many_matches_live: '{count} matches live',
  ui_next_kickoff: 'Next kickoff {offset}',
  ui_tournament_complete: 'Tournament complete',

  // Detail view
  detail_pen_prefix: 'PEN',
  detail_back: 'Back',
  detail_events_heading: 'Events',
  detail_no_events: 'No events yet',

  // Event row type labels
  event_goal: 'Goal',
  event_yellow: 'Yellow',
  event_red: 'Red',
  event_ht: 'HT',
  event_sub: 'Sub',
  event_ft: 'FT',

  // Goal toast
  toast_goal_title: 'Goal — {team}',
  toast_goal_body: "{player} {minute}'",

  // Bracket
  bracket_kickoff_scheduled: 'SCHEDULED',
  bracket_pen_suffix: '({home}-{away} pen)',
  bracket_live_badge: "LIVE {minute}'",
  bracket_empty_title: 'No bracket yet',
  bracket_empty_sub: 'The bracket will appear here once the Quarterfinals are scheduled.',
  bracket_col_qf: 'QF',
  bracket_col_sf: 'SF',
  bracket_col_f: 'F',

  // Settings strip
  settings_timezone: 'Timezone',
  settings_language: 'Language',
}

export default en
