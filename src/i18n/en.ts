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

  // Glasses (G2) — verbose Layer 2 header status strings
  glasses_status_full_time: 'FULL TIME',
  glasses_status_half_time: 'HALF TIME',
  glasses_status_first_half: 'FIRST HALF  {min} MIN',
  glasses_status_second_half: 'SECOND HALF  {min} MIN',
  glasses_status_extra_time: 'EXTRA TIME  {min} MIN',
  glasses_status_extra_time_2: 'EXTRA TIME 2  {min} MIN',
  glasses_status_penalties: 'PENALTIES',
  glasses_status_kickoff_min: 'KICKOFF IN {n} MIN',
  glasses_status_kickoff_hour: 'KICKOFF IN {n}H',
  glasses_status_kickoff_days: 'KICKOFF IN {n} DAYS',

  // Glasses (G2) — short Layer 1 chip status strings
  glasses_status_ft: 'FT',
  glasses_status_ht: 'HT',
  glasses_status_1h: '1H  {min}',
  glasses_status_2h: '2H  {min}',
  glasses_status_et: 'ET  {min}',
  glasses_status_et2: 'ET2  {min}',
  glasses_status_pen: 'PEN',

  // Glasses (G2) — kickoff offset short forms
  glasses_kickoff_in_minutes: 'in {n}m',
  glasses_kickoff_in_hours: 'in {n}h',
  glasses_kickoff_in_days: 'in {n}d',
  glasses_kickoff_hours_short: '{n}h',
  glasses_kickoff_days_short: '{n}d',

  // Glasses (G2) — event-log kickoff with calendar context
  glasses_kickoff_today_in_minutes: 'Today, in {n}m',
  glasses_kickoff_today_in_hours: 'Today, in {n}h',
  glasses_kickoff_today_at: 'Today, {clock}',
  glasses_kickoff_tomorrow_at: 'Tomorrow, {clock}',
  glasses_kickoff_tomorrow: 'Tomorrow',
  glasses_kickoff_in_n_days: 'In {n} days',
  glasses_kickoff_in_2_days: 'In 2 days',

  // Glasses (G2) — Layer 1 header next-kickoff hint
  glasses_next_tomorrow: 'Next Tomorrow',
  glasses_next_in_days: 'Next in {n}d',
  glasses_next_on_date: 'Next {date}',

  // Glasses (G2) — stage labels (verbose Layer 2 + list Layer 1)
  glasses_stage_group_stage: 'GROUP STAGE',
  glasses_stage_round_of_16: 'ROUND OF 16',
  glasses_stage_quarterfinal: 'QUARTERFINAL',
  glasses_stage_quarterfinals: 'QUARTERFINALS',
  glasses_stage_semifinal: 'SEMIFINAL',
  glasses_stage_semifinals: 'SEMIFINALS',
  glasses_stage_3rd_place: '3RD PLACE',
  glasses_stage_final: 'FINAL',

  // Glasses (G2) — event chips
  glasses_event_goal: 'GOAL',
  glasses_event_yellow_card: 'YEL',
  glasses_event_red_card: 'RED',
  glasses_event_substitution: 'SUB',

  // Glasses (G2) — penalty shootout strings
  glasses_penalty_text: 'PEN {home}-{away}',
  glasses_pen_indicator: 'PEN\n{score}',
  glasses_pen_empty: '--',

  // Glasses (G2) — team placeholders + score fallback
  glasses_team_tbd: 'TBD',
  glasses_team_dashes: '---',
  glasses_score_vs: 'v',

  // Glasses (G2) — Layer 1 list row formats
  glasses_list_left_vs: '{home} vs {away}',
  glasses_list_right_live: 'LIVE {min}  {home}-{away}',
  glasses_list_right_ft_shootout: 'FT {home}-{away} ({hpen}-{apen}p)',
  glasses_list_right_ft: 'FT  {home}-{away}',

  // Glasses (G2) — legacy single-line row formats (still exported)
  glasses_upcoming_row: '{home}  v  {away}     {right}     {stage}',
  glasses_past_row: '{home} {hs}-{as} {away}  FT  {stage}',

  // Glasses (G2) — Layer 2 event log composition
  glasses_event_log_kicks_off: 'Kicks off {when}',
  glasses_event_log_match_underway: 'Match underway',
  glasses_event_log_sub_arrow: '{out} > {in}{sideSuffix}',
  glasses_event_log_with_side: '{player} ({side})',
  glasses_event_log_side_suffix: ' ({side})',
  glasses_event_log_row: "{min}'  {chip}  {who}",

  // Glasses (G2) — Layer 1 header strings
  glasses_header_world_cup_awaiting: 'WORLD CUP    Awaiting data',
  glasses_header_title_sub: '{title}    {sub}',
  glasses_header_no_matches: 'No matches',
  glasses_header_today_live: '{n} today, {live} live',
  glasses_header_today_count: '{n} today',
  glasses_list_no_matches_today: 'No matches today',
}

export default en
