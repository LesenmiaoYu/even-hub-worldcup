import type { Strings } from './types'

const dict: Strings = {
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
}

export default dict
