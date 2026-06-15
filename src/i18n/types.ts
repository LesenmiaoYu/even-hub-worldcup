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
}

export const LOCALES: Locale[] = ['en', 'zh', 'ja', 'es']

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  es: 'Español',
}
