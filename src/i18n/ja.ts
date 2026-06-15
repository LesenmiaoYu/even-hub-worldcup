import type { Strings } from './types'

/* Partial<Strings> on purpose: glasses_* keys aren't translated yet,
 * t() falls back to EN on any missing entry. Phone-surface keys stay
 * fully populated. */
const dict: Partial<Strings> = {
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

  // Glasses (G2) — verbose Layer 2 header status strings
  glasses_status_full_time: '試合終了',
  glasses_status_half_time: 'ハーフタイム',
  glasses_status_first_half: '前半  {min}分',
  glasses_status_second_half: '後半  {min}分',
  glasses_status_extra_time: '延長前半  {min}分',
  glasses_status_extra_time_2: '延長後半  {min}分',
  glasses_status_penalties: 'PK戦',
  glasses_status_kickoff_min: 'キックオフまで{n}分',
  glasses_status_kickoff_hour: 'キックオフまで{n}時間',
  glasses_status_kickoff_days: 'キックオフまで{n}日',

  // Glasses (G2) — short Layer 1 chip status strings
  glasses_status_ft: '終了',
  glasses_status_ht: 'HT',
  glasses_status_1h: '前半  {min}',
  glasses_status_2h: '後半  {min}',
  glasses_status_et: '延長  {min}',
  glasses_status_et2: '延長2  {min}',
  glasses_status_pen: 'PK',

  // Glasses (G2) — kickoff offset short forms
  glasses_kickoff_in_minutes: 'あと{n}分',
  glasses_kickoff_in_hours: 'あと{n}時間',
  glasses_kickoff_in_days: 'あと{n}日',
  glasses_kickoff_hours_short: '{n}時間',
  glasses_kickoff_days_short: '{n}日',

  // Glasses (G2) — event-log kickoff with calendar context
  glasses_kickoff_today_in_minutes: '本日 あと{n}分',
  glasses_kickoff_today_in_hours: '本日 あと{n}時間',
  glasses_kickoff_today_at: '本日 {clock}',
  glasses_kickoff_tomorrow_at: '明日 {clock}',
  glasses_kickoff_tomorrow: '明日',
  glasses_kickoff_in_n_days: '{n}日後',
  glasses_kickoff_in_2_days: '明後日',

  // Glasses (G2) — Layer 1 header next-kickoff hint
  glasses_next_tomorrow: '次戦 明日',
  glasses_next_in_days: '次戦 {n}日後',
  glasses_next_on_date: '次戦 {date}',

  // Glasses (G2) — stage labels (verbose Layer 2 + list Layer 1)
  glasses_stage_group_stage: 'グループ',
  glasses_stage_round_of_16: 'ラウンド16',
  glasses_stage_quarterfinal: '準々決勝',
  glasses_stage_quarterfinals: '準々決勝',
  glasses_stage_semifinal: '準決勝',
  glasses_stage_semifinals: '準決勝',
  glasses_stage_3rd_place: '3位決定戦',
  glasses_stage_final: '決勝',

  // Glasses (G2) — event chips
  glasses_event_goal: 'ゴール',
  glasses_event_yellow_card: '警告',
  glasses_event_red_card: '退場',
  glasses_event_substitution: '交代',

  // Glasses (G2) — penalty shootout strings
  glasses_penalty_text: 'PK {home}-{away}',
  glasses_pen_indicator: 'PK\n{score}',
  glasses_pen_empty: '--',

  // Glasses (G2) — team placeholders + score fallback
  glasses_team_tbd: '未定',
  glasses_team_dashes: '---',
  glasses_score_vs: 'v',

  // Glasses (G2) — Layer 1 list row formats
  glasses_list_left_vs: '{home} vs {away}',
  glasses_list_right_live: 'ライブ {min}  {home}-{away}',
  glasses_list_right_ft_shootout: '終了 {home}-{away} ({hpen}-{apen}PK)',
  glasses_list_right_ft: '終了  {home}-{away}',

  // Glasses (G2) — legacy single-line row formats (still exported)
  glasses_upcoming_row: '{home}  v  {away}     {right}     {stage}',
  glasses_past_row: '{home} {hs}-{as} {away}  終了  {stage}',

  // Glasses (G2) — Layer 2 event log composition
  glasses_event_log_kicks_off: 'キックオフ {when}',
  glasses_event_log_match_underway: '試合進行中',
  glasses_event_log_sub_arrow: '{out} > {in}{sideSuffix}',
  glasses_event_log_with_side: '{player} ({side})',
  glasses_event_log_side_suffix: ' ({side})',
  glasses_event_log_row: "{min}'  {chip}  {who}",

  // Glasses (G2) — Layer 1 header strings
  glasses_header_world_cup_awaiting: 'ワールドカップ    データ待機中',
  glasses_header_title_sub: '{title}    {sub}',
  glasses_header_no_matches: '試合なし',
  glasses_header_today_live: '本日{n}試合 / ライブ{live}',
  glasses_header_today_count: '本日{n}試合',
  glasses_list_no_matches_today: '本日の試合なし',
}

export default dict
