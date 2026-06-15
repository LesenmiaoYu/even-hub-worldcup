import type { Strings } from './types'

/* Partial<Strings> on purpose: glasses_* keys aren't translated yet,
 * t() falls back to EN on any missing entry. Phone-surface keys stay
 * fully populated. */
const dict: Partial<Strings> = {
  // Top nav
  tab_matches: 'Partidos',
  tab_bracket: 'Llaves',

  // Matches list sections
  section_live: 'En vivo',
  section_upcoming: 'Próximos',
  section_results: 'Resultados',
  ui_no_matches: 'Sin partidos',

  // Match row / detail status
  status_vs: 'vs',
  status_ft: 'Final',
  status_ft_pen: 'Final · PEN',
  status_tbd: 'Por definir',

  // Kickoff offset formatting
  ui_offset_minutes: 'en {min}m',
  ui_offset_hours: 'en {h}h',
  ui_offset_days: 'en {d}d',

  // Stage labels
  stage_qf: 'Cuartos de final',
  stage_sf: 'Semifinales',
  stage_third: 'Tercer puesto',
  stage_final: 'Final',
  stage_gs: 'Fase de grupos',
  stage_r16: 'Octavos de final',

  // Stage header
  ui_app_title: 'Mundial',
  ui_awaiting_data: 'Sin datos',
  ui_one_match_live: '{home} vs {away} en vivo',
  ui_many_matches_live: '{count} partidos en vivo',
  ui_next_kickoff: 'Próximo partido {offset}',
  ui_tournament_complete: 'Torneo finalizado',

  // Detail view
  detail_pen_prefix: 'PEN',
  detail_back: 'Atrás',
  detail_events_heading: 'Eventos',
  detail_no_events: 'Sin eventos',

  // Event row type labels
  event_goal: 'Gol',
  event_yellow: 'Amarilla',
  event_red: 'Roja',
  event_ht: 'Descanso',
  event_sub: 'Cambio',
  event_ft: 'Final',

  // Goal toast
  toast_goal_title: 'Gol — {team}',
  toast_goal_body: "{player} {minute}'",

  // Bracket
  bracket_kickoff_scheduled: 'PROGRAMADO',
  bracket_pen_suffix: '({home}-{away} pen)',
  bracket_live_badge: "EN VIVO {minute}'",
  bracket_empty_title: 'Llaves no disponibles',
  bracket_empty_sub: 'Las llaves aparecerán aquí cuando se programen los Cuartos de final.',
  bracket_col_qf: 'CF',
  bracket_col_sf: 'SF',
  bracket_col_f: 'F',

  // Settings strip
  settings_timezone: 'Zona horaria',
  settings_language: 'Idioma',

  // Glasses (G2) — verbose Layer 2 header status strings
  glasses_status_full_time: 'FINAL',
  glasses_status_half_time: 'DESCANSO',
  glasses_status_first_half: '1T  {min} MIN',
  glasses_status_second_half: '2T  {min} MIN',
  glasses_status_extra_time: 'TIEMPO EXTRA  {min} MIN',
  glasses_status_extra_time_2: 'TIEMPO EXTRA 2  {min} MIN',
  glasses_status_penalties: 'PENALES',
  glasses_status_kickoff_min: 'INICIA EN {n} MIN',
  glasses_status_kickoff_hour: 'INICIA EN {n}H',
  glasses_status_kickoff_days: 'INICIA EN {n} DIAS',

  // Glasses (G2) — short Layer 1 chip status strings
  glasses_status_ft: 'F',
  glasses_status_ht: 'D',
  glasses_status_1h: '1T  {min}',
  glasses_status_2h: '2T  {min}',
  glasses_status_et: 'TE  {min}',
  glasses_status_et2: 'TE2  {min}',
  glasses_status_pen: 'PEN',

  // Glasses (G2) — kickoff offset short forms
  glasses_kickoff_in_minutes: 'en {n}m',
  glasses_kickoff_in_hours: 'en {n}h',
  glasses_kickoff_in_days: 'en {n}d',
  glasses_kickoff_hours_short: '{n}h',
  glasses_kickoff_days_short: '{n}d',

  // Glasses (G2) — event-log kickoff with calendar context
  glasses_kickoff_today_in_minutes: 'Hoy, en {n}m',
  glasses_kickoff_today_in_hours: 'Hoy, en {n}h',
  glasses_kickoff_today_at: 'Hoy, {clock}',
  glasses_kickoff_tomorrow_at: 'Manana, {clock}',
  glasses_kickoff_tomorrow: 'Manana',
  glasses_kickoff_in_n_days: 'En {n} dias',
  glasses_kickoff_in_2_days: 'En 2 dias',

  // Glasses (G2) — Layer 1 header next-kickoff hint
  glasses_next_tomorrow: 'Prox. Manana',
  glasses_next_in_days: 'Prox. en {n}d',
  glasses_next_on_date: 'Prox. {date}',

  // Glasses (G2) — stage labels (verbose Layer 2 + list Layer 1)
  glasses_stage_group_stage: 'FASE DE GRUPOS',
  glasses_stage_round_of_16: 'OCTAVOS',
  glasses_stage_quarterfinal: 'CUARTOS',
  glasses_stage_quarterfinals: 'CUARTOS',
  glasses_stage_semifinal: 'SEMIFINAL',
  glasses_stage_semifinals: 'SEMIFINALES',
  glasses_stage_3rd_place: 'TERCER PUESTO',
  glasses_stage_final: 'FINAL',

  // Glasses (G2) — event chips
  glasses_event_goal: 'GOL',
  glasses_event_yellow_card: 'AMA',
  glasses_event_red_card: 'ROJ',
  glasses_event_substitution: 'CAM',

  // Glasses (G2) — penalty shootout strings
  glasses_penalty_text: 'PEN {home}-{away}',
  glasses_pen_indicator: 'PEN\n{score}',
  glasses_pen_empty: '--',

  // Glasses (G2) — team placeholders + score fallback
  glasses_team_tbd: 'PD',
  glasses_team_dashes: '---',
  glasses_score_vs: 'v',

  // Glasses (G2) — Layer 1 list row formats
  glasses_list_left_vs: '{home} vs {away}',
  glasses_list_right_live: 'VIVO {min}  {home}-{away}',
  glasses_list_right_ft_shootout: 'F {home}-{away} ({hpen}-{apen}p)',
  glasses_list_right_ft: 'F  {home}-{away}',

  // Glasses (G2) — legacy single-line row formats (still exported)
  glasses_upcoming_row: '{home}  v  {away}     {right}     {stage}',
  glasses_past_row: '{home} {hs}-{as} {away}  F  {stage}',

  // Glasses (G2) — Layer 2 event log composition
  glasses_event_log_kicks_off: 'Inicia {when}',
  glasses_event_log_match_underway: 'Partido en curso',
  glasses_event_log_sub_arrow: '{out} > {in}{sideSuffix}',
  glasses_event_log_with_side: '{player} ({side})',
  glasses_event_log_side_suffix: ' ({side})',
  glasses_event_log_row: "{min}'  {chip}  {who}",

  // Glasses (G2) — Layer 1 header strings
  glasses_header_world_cup_awaiting: 'MUNDIAL    Sin datos',
  glasses_header_title_sub: '{title}    {sub}',
  glasses_header_no_matches: 'Sin partidos',
  glasses_header_today_live: '{n} hoy, {live} en vivo',
  glasses_header_today_count: '{n} hoy',
  glasses_list_no_matches_today: 'Sin partidos hoy',
}

export default dict
