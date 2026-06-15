export type Locale = 'en' | 'zh' | 'ja' | 'es'

/** All translatable strings live here. en.ts is canonical; zh/ja/es
 * mirror this shape exactly. Glasses (G2) surface is intentionally
 * EN-only — the LVGL firmware font can't render CJK. */
export interface Strings {
  // Top nav
  tab_matches: string
  tab_bracket: string

  // Matches list sections
  section_live: string
  section_upcoming: string
  section_results: string
  ui_no_matches: string

  // Match row / detail status
  status_vs: string
  status_ft: string
  status_ft_pen: string
  status_tbd: string

  // Kickoff offset formatting
  ui_offset_minutes: string
  ui_offset_hours: string
  ui_offset_days: string

  // Stage labels (shared between mount.ts STAGE_NAMES + bracketSvg.ts STAGE_LABEL)
  stage_qf: string
  stage_sf: string
  stage_third: string
  stage_final: string
  stage_gs: string
  stage_r16: string

  // Stage header (top of page)
  ui_app_title: string
  ui_awaiting_data: string
  ui_one_match_live: string
  ui_many_matches_live: string
  ui_next_kickoff: string
  ui_tournament_complete: string

  // Detail view
  detail_pen_prefix: string
  detail_back: string
  detail_events_heading: string
  detail_no_events: string

  // Event row type labels
  event_goal: string
  event_yellow: string
  event_red: string
  event_ht: string
  event_sub: string
  event_ft: string

  // Goal toast
  toast_goal_title: string
  toast_goal_body: string

  // Bracket
  bracket_kickoff_scheduled: string
  bracket_pen_suffix: string
  bracket_live_badge: string
  bracket_empty_title: string
  bracket_empty_sub: string
  bracket_col_qf: string
  bracket_col_sf: string
  bracket_col_f: string

  // Settings strip
  settings_timezone: string
  settings_language: string

  // Glasses (G2) surface — short strings rendered on the LVGL firmware
  // font. CJK is OK as of v1.4 (David confirmed firmware support); Latin
  // diacritics still get stripped via asciiName() in format.ts.
  glasses_status_full_time: string
  glasses_status_half_time: string
  glasses_status_first_half: string
  glasses_status_second_half: string
  glasses_status_extra_time: string
  glasses_status_extra_time_2: string
  glasses_status_penalties: string
  glasses_status_kickoff_min: string
  glasses_status_kickoff_hour: string
  glasses_status_kickoff_days: string
  glasses_status_ft: string
  glasses_status_ht: string
  glasses_status_1h: string
  glasses_status_2h: string
  glasses_status_et: string
  glasses_status_et2: string
  glasses_status_pen: string
  glasses_kickoff_in_minutes: string
  glasses_kickoff_in_hours: string
  glasses_kickoff_in_days: string
  glasses_kickoff_hours_short: string
  glasses_kickoff_days_short: string
  glasses_kickoff_today_in_minutes: string
  glasses_kickoff_today_in_hours: string
  glasses_kickoff_today_at: string
  glasses_kickoff_tomorrow_at: string
  glasses_kickoff_tomorrow: string
  glasses_kickoff_in_n_days: string
  glasses_kickoff_in_2_days: string
  glasses_next_tomorrow: string
  glasses_next_in_days: string
  glasses_next_on_date: string
  glasses_stage_group_stage: string
  glasses_stage_round_of_16: string
  glasses_stage_quarterfinal: string
  glasses_stage_quarterfinals: string
  glasses_stage_semifinal: string
  glasses_stage_semifinals: string
  glasses_stage_3rd_place: string
  glasses_stage_final: string
  glasses_event_goal: string
  glasses_event_yellow_card: string
  glasses_event_red_card: string
  glasses_event_substitution: string
  glasses_penalty_text: string
  glasses_pen_indicator: string
  glasses_pen_empty: string
  glasses_team_tbd: string
  glasses_team_dashes: string
  glasses_score_vs: string
  glasses_list_left_vs: string
  glasses_list_right_live: string
  glasses_list_right_ft_shootout: string
  glasses_list_right_ft: string
  glasses_upcoming_row: string
  glasses_past_row: string
  glasses_event_log_kicks_off: string
  glasses_event_log_match_underway: string
  glasses_event_log_sub_arrow: string
  glasses_event_log_with_side: string
  glasses_event_log_side_suffix: string
  glasses_event_log_row: string
  glasses_header_world_cup_awaiting: string
  glasses_header_title_sub: string
  glasses_header_no_matches: string
  glasses_header_today_live: string
  glasses_header_today_count: string
  glasses_list_no_matches_today: string
}

export const LOCALES: Locale[] = ['en', 'zh', 'ja', 'es']

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  es: 'Español',
}
