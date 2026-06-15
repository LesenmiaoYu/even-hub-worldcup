import type { Strings } from './types'

const dict: Strings = {
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
}

export default dict
