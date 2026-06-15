import type { Strings } from './types'

const dict: Strings = {
  // Top nav
  tab_matches: '試合',
  tab_bracket: 'トーナメント表',

  // Matches list sections
  section_live: 'ライブ',
  section_upcoming: '予定',
  section_results: '結果',
  ui_no_matches: '試合なし',

  // Match row / detail status
  status_vs: 'vs',
  status_ft: '試合終了',
  status_ft_pen: '試合終了 · PK',
  status_tbd: '未定',

  // Kickoff offset formatting
  ui_offset_minutes: 'あと{min}分',
  ui_offset_hours: 'あと{h}時間',
  ui_offset_days: 'あと{d}日',

  // Stage labels
  stage_qf: '準々決勝',
  stage_sf: '準決勝',
  stage_third: '3位決定戦',
  stage_final: '決勝',
  stage_gs: 'グループステージ',
  stage_r16: 'ラウンド16',

  // Stage header
  ui_app_title: 'ワールドカップ',
  ui_awaiting_data: 'データ待機中',
  ui_one_match_live: '{home} vs {away} ライブ',
  ui_many_matches_live: '{count}試合ライブ中',
  ui_next_kickoff: '次のキックオフ {offset}',
  ui_tournament_complete: '大会終了',

  // Detail view
  detail_pen_prefix: 'PK',
  detail_back: '戻る',
  detail_events_heading: 'イベント',
  detail_no_events: 'イベントなし',

  // Event row type labels
  event_goal: 'ゴール',
  event_yellow: '警告',
  event_red: '退場',
  event_ht: 'ハーフタイム',
  event_sub: '交代',
  event_ft: '試合終了',

  // Goal toast
  toast_goal_title: 'ゴール — {team}',
  toast_goal_body: "{player} {minute}'",

  // Bracket
  bracket_kickoff_scheduled: '予定',
  bracket_pen_suffix: '(PK {home}-{away})',
  bracket_live_badge: "ライブ {minute}'",
  bracket_empty_title: 'トーナメント表はまだ準備中',
  bracket_empty_sub: '準々決勝が決まり次第、ここに表示されます。',
  bracket_col_qf: 'QF',
  bracket_col_sf: 'SF',
  bracket_col_f: 'F',

  // Settings strip
  settings_timezone: 'タイムゾーン',
  settings_language: '言語',
}

export default dict
