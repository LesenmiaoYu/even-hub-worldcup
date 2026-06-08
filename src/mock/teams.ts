import type { Team, TeamCode } from '../types'

/* WC 2026 — 58-team registry.
 * The original 48-team set the mock was authored against PLUS 10 nations
 * iSports' projected bracket includes (BIH, CPV, CUW, COD, JOR, SCO, RSA,
 * SWE, TUR, UZB) so the iSports adapter doesn't drop their matches.
 *
 * Flag SVGs in public/flags/{fifa-lowercase}.svg sourced from flag-icons
 * (Apache-2.0). Copied via scripts/copy-flags.sh — see that file to refresh.
 */

function t(code: TeamCode, name: string): [TeamCode, Team] {
  return [code, { code, name, flag: `/flags/${code.toLowerCase()}.svg` }]
}

export const TEAMS: Record<string, Team> = Object.fromEntries([
  /* CONCACAF — 3 hosts + 3 qualifiers */
  t('USA', 'United States'),
  t('CAN', 'Canada'),
  t('MEX', 'Mexico'),
  t('CRC', 'Costa Rica'),
  t('PAN', 'Panama'),
  t('JAM', 'Jamaica'),

  /* CONMEBOL — 6 */
  t('ARG', 'Argentina'),
  t('BRA', 'Brazil'),
  t('URU', 'Uruguay'),
  t('COL', 'Colombia'),
  t('ECU', 'Ecuador'),
  t('PAR', 'Paraguay'),

  /* UEFA — 16 */
  t('ESP', 'Spain'),
  t('FRA', 'France'),
  t('ENG', 'England'),
  t('GER', 'Germany'),
  t('ITA', 'Italy'),
  t('NED', 'Netherlands'),
  t('POR', 'Portugal'),
  t('BEL', 'Belgium'),
  t('CRO', 'Croatia'),
  t('SWI', 'Switzerland'),
  t('DEN', 'Denmark'),
  t('POL', 'Poland'),
  t('AUT', 'Austria'),
  t('CZE', 'Czechia'),
  t('SRB', 'Serbia'),
  t('NOR', 'Norway'),

  /* CAF — 9 */
  t('MAR', 'Morocco'),
  t('SEN', 'Senegal'),
  t('EGY', 'Egypt'),
  t('GHA', 'Ghana'),
  t('CMR', 'Cameroon'),
  t('NGA', 'Nigeria'),
  t('ALG', 'Algeria'),
  t('TUN', 'Tunisia'),
  t('CIV', 'Cote dIvoire'),

  /* AFC — 8 */
  t('JPN', 'Japan'),
  t('KOR', 'South Korea'),
  t('AUS', 'Australia'),
  t('IRN', 'Iran'),
  t('KSA', 'Saudi Arabia'),
  t('QAT', 'Qatar'),
  t('UAE', 'United Arab Emirates'),
  t('IRQ', 'Iraq'),

  /* OFC + intercontinental playoffs — 3 */
  t('NZL', 'New Zealand'),
  t('BOL', 'Bolivia'),
  t('HAI', 'Haiti'),

  /* Added per #1A — iSports WC 2026 projection nations */
  t('BIH', 'Bosnia and Herzegovina'),
  t('CPV', 'Cape Verde'),
  t('CUW', 'Curacao'),
  t('COD', 'DR Congo'),
  t('JOR', 'Jordan'),
  t('SCO', 'Scotland'),
  t('RSA', 'South Africa'),
  t('SWE', 'Sweden'),
  t('TUR', 'Turkey'),
  t('UZB', 'Uzbekistan'),
])
