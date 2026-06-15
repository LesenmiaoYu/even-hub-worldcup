import type { Strings } from './types'

/* Partial<Strings> kept for forward compatibility with future additions;
 * t() falls back to EN on any missing entry. Phone + glasses keys are
 * fully populated. */
const dict: Partial<Strings> = {
  // Top nav
  tab_matches: '赛程',
  tab_bracket: '对阵',

  // Matches list sections
  section_live: '进行中',
  section_upcoming: '即将开赛',
  section_results: '战报',
  ui_no_matches: '暂无比赛',

  // Match row / detail status
  status_vs: 'vs',
  status_ft: '完场',
  status_ft_pen: '完场 · 点球',
  status_tbd: '待定',

  // Kickoff offset formatting
  ui_offset_minutes: '{min} 分钟后',
  ui_offset_hours: '{h} 小时后',
  ui_offset_days: '{d} 天后',

  // Stage labels
  stage_qf: '八强赛',
  stage_sf: '半决赛',
  stage_third: '三四名决赛',
  stage_final: '决赛',
  stage_gs: '小组赛',
  stage_r16: '十六强',

  // Stage header
  ui_app_title: '世界杯',
  ui_awaiting_data: '等待数据',
  ui_one_match_live: '{home} vs {away} 正在进行',
  ui_many_matches_live: '{count} 场比赛进行中',
  ui_next_kickoff: '下场开球 {offset}',
  ui_tournament_complete: '赛事已结束',

  // Detail view
  detail_pen_prefix: '点球',
  detail_back: '返回',
  detail_events_heading: '战况',
  detail_no_events: '暂无事件',

  // Event row type labels
  event_goal: '进球',
  event_yellow: '黄牌',
  event_red: '红牌',
  event_ht: '中场',
  event_sub: '换人',
  event_ft: '完场',

  // Goal toast
  toast_goal_title: '进球 — {team}',
  toast_goal_body: "{player} {minute}'",

  // Bracket
  bracket_kickoff_scheduled: '待开赛',
  bracket_pen_suffix: '(点球 {home}-{away})',
  bracket_live_badge: "进行中 {minute}'",
  bracket_empty_title: '对阵未生成',
  bracket_empty_sub: '八强赛产生后，对阵图将在此显示。',
  bracket_col_qf: '8强',
  bracket_col_sf: '4强',
  bracket_col_f: '决赛',

  // Settings strip
  settings_timezone: '时区',
  settings_language: '语言',

  // Glasses (G2) — verbose Layer 2 header status strings
  glasses_status_full_time: '全场结束',
  glasses_status_half_time: '中场休息',
  glasses_status_first_half: '上半场  {min} 分',
  glasses_status_second_half: '下半场  {min} 分',
  glasses_status_extra_time: '加时赛  {min} 分',
  glasses_status_extra_time_2: '加时下  {min} 分',
  glasses_status_penalties: '点球大战',
  glasses_status_kickoff_min: '{n} 分钟后开球',
  glasses_status_kickoff_hour: '{n} 小时后开球',
  glasses_status_kickoff_days: '{n} 天后开球',

  // Glasses (G2) — short Layer 1 chip status strings
  glasses_status_ft: '完场',
  glasses_status_ht: '中休',
  glasses_status_1h: '上半 {min}',
  glasses_status_2h: '下半 {min}',
  glasses_status_et: '加时 {min}',
  glasses_status_et2: '加2 {min}',
  glasses_status_pen: '点球',

  // Glasses (G2) — kickoff offset short forms
  glasses_kickoff_in_minutes: '{n}分后',
  glasses_kickoff_in_hours: '{n}时后',
  glasses_kickoff_in_days: '{n}天后',
  glasses_kickoff_hours_short: '{n}时',
  glasses_kickoff_days_short: '{n}天',

  // Glasses (G2) — event-log kickoff with calendar context
  glasses_kickoff_today_in_minutes: '今天，{n}分后',
  glasses_kickoff_today_in_hours: '今天，{n}时后',
  glasses_kickoff_today_at: '今天 {clock}',
  glasses_kickoff_tomorrow_at: '明天 {clock}',
  glasses_kickoff_tomorrow: '明天',
  glasses_kickoff_in_n_days: '{n} 天后',
  glasses_kickoff_in_2_days: '后天',

  // Glasses (G2) — Layer 1 header next-kickoff hint
  glasses_next_tomorrow: '下场 明天',
  glasses_next_in_days: '下场 {n}天后',
  glasses_next_on_date: '下场 {date}',

  // Glasses (G2) — stage labels (verbose Layer 2 + list Layer 1)
  glasses_stage_group_stage: '小组赛',
  glasses_stage_round_of_16: '十六强',
  glasses_stage_quarterfinal: '八强赛',
  glasses_stage_quarterfinals: '八强赛',
  glasses_stage_semifinal: '半决赛',
  glasses_stage_semifinals: '半决赛',
  glasses_stage_3rd_place: '三四名',
  glasses_stage_final: '决赛',

  // Glasses (G2) — event chips
  glasses_event_goal: '进球',
  glasses_event_yellow_card: '黄牌',
  glasses_event_red_card: '红牌',
  glasses_event_substitution: '换人',

  // Glasses (G2) — penalty shootout strings
  glasses_penalty_text: '点球 {home}-{away}',
  glasses_pen_indicator: '点球\n{score}',
  glasses_pen_empty: '--',

  // Glasses (G2) — team placeholders + score fallback
  glasses_team_tbd: '待定',
  glasses_team_dashes: '---',
  glasses_score_vs: 'v',

  // Glasses (G2) — Layer 1 list row formats
  glasses_list_left_vs: '{home} vs {away}',
  glasses_list_right_live: '进行 {min}  {home}-{away}',
  glasses_list_right_ft_shootout: '完场 {home}-{away} ({hpen}-{apen}点)',
  glasses_list_right_ft: '完场  {home}-{away}',

  // Glasses (G2) — legacy single-line row formats (still exported)
  glasses_upcoming_row: '{home}  v  {away}     {right}     {stage}',
  glasses_past_row: '{home} {hs}-{as} {away}  完场  {stage}',

  // Glasses (G2) — Layer 2 event log composition
  glasses_event_log_kicks_off: '开球 {when}',
  glasses_event_log_match_underway: '比赛进行中',
  glasses_event_log_sub_arrow: '{out} > {in}{sideSuffix}',
  glasses_event_log_with_side: '{player}（{side}）',
  glasses_event_log_side_suffix: '（{side}）',
  glasses_event_log_row: "{min}'  {chip}  {who}",

  // Glasses (G2) — Layer 1 header strings
  glasses_header_world_cup_awaiting: '世界杯    等待数据',
  glasses_header_title_sub: '{title}    {sub}',
  glasses_header_no_matches: '暂无比赛',
  glasses_header_today_live: '今日 {n} 场，{live} 场进行',
  glasses_header_today_count: '今日 {n} 场',
  glasses_list_no_matches_today: '今日无赛事',
}

export default dict
