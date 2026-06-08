/* Maps from iSports team identifiers → our internal FIFA-3 TeamCode union.
 *
 * Two lookup tables:
 *   TEAM_NAME_TO_CODE — iSports `homeName`/`awayName` strings → TeamCode.
 *                       Includes the canonical iSports label PLUS the
 *                       common variants (FIFA short form, alternate
 *                       English spellings) so we degrade gracefully if
 *                       iSports rewords a row.
 *   TEAM_ID_TO_CODE  — iSports numeric team id (`homeId`/`awayId`) →
 *                       TeamCode. Harvested directly from
 *                       server/fixtures/schedule-wc2026.json. The id is
 *                       a much stronger key than the name string, so
 *                       `transformMatch` checks ids first and falls back
 *                       to the name map when an id is unknown.
 *
 * Coverage:
 *   - The TeamCode union enumerates 58 FIFA-3 codes the app ships against.
 *     This covers (a) the 48 nations we authored the mock for, AND (b)
 *     the 10 additional nations iSports' projected WC 2026 bracket adds
 *     (BIH, CPV, CUW, COD, JOR, SCO, RSA, SWE, TUR, UZB — expanded per
 *     David's #1A decision so the iSports adapter doesn't drop them).
 *   - Some codes (e.g. CRC, JAM, ITA, DEN, POL, SRB, CMR, NGA, IRN, KSA,
 *     UAE, BOL) aren't in iSports' current projection but stay mapped
 *     here so the app reads them immediately if the real bracket draws
 *     them in.
 *
 * Lookup is case-insensitive: do `TEAM_NAME_TO_CODE[normalise(name)]`. */

import type { TeamCode } from '../types.ts'

/* Normalise an iSports team name for lookup: trim, collapse internal
 * whitespace, lowercase. Diacritics aren't currently stripped because no
 * iSports row in the captured fixture uses them — add NFD-strip here if
 * that changes. */
export function normaliseTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/* Build the name map from a (TeamCode → variants[]) seed so the source
 * stays readable. Every variant is normalised on insert. */
const NAME_VARIANTS: Record<TeamCode, string[]> = {
  /* CONCACAF (6) */
  USA: ['USA', 'United States', 'United States of America', 'U.S.A.'],
  CAN: ['Canada'],
  MEX: ['Mexico'],
  CRC: ['Costa Rica'],
  PAN: ['Panama'],
  JAM: ['Jamaica'],

  /* CONMEBOL (6) */
  ARG: ['Argentina'],
  BRA: ['Brazil'],
  URU: ['Uruguay'],
  COL: ['Colombia'],
  ECU: ['Ecuador'],
  PAR: ['Paraguay'],

  /* UEFA (16) */
  ESP: ['Spain'],
  FRA: ['France'],
  ENG: ['England'],
  GER: ['Germany'],
  ITA: ['Italy'],
  NED: ['Netherlands', 'Holland'],
  POR: ['Portugal'],
  BEL: ['Belgium'],
  CRO: ['Croatia'],
  SWI: ['Switzerland'],
  DEN: ['Denmark'],
  POL: ['Poland'],
  AUT: ['Austria'],
  CZE: ['Czech Republic', 'Czechia'],
  SRB: ['Serbia'],
  NOR: ['Norway'],

  /* CAF (9) */
  MAR: ['Morocco'],
  SEN: ['Senegal'],
  EGY: ['Egypt'],
  GHA: ['Ghana'],
  CMR: ['Cameroon'],
  NGA: ['Nigeria'],
  ALG: ['Algeria'],
  TUN: ['Tunisia'],
  CIV: ['Ivory Coast', "Cote d'Ivoire", 'Côte d’Ivoire'],

  /* AFC (8) */
  JPN: ['Japan'],
  KOR: ['South Korea', 'Korea Republic', 'Republic of Korea', 'Korea'],
  AUS: ['Australia'],
  IRN: ['Iran', 'IR Iran', 'Islamic Republic of Iran'],
  KSA: ['Saudi Arabia'],
  QAT: ['Qatar'],
  UAE: ['United Arab Emirates', 'UAE'],
  IRQ: ['Iraq'],

  /* OFC + intercontinental playoffs (3) */
  NZL: ['New Zealand'],
  BOL: ['Bolivia'],
  HAI: ['Haiti'],

  /* Added per #1A — iSports WC 2026 projection nations beyond the
   * original 48-team mock set. Variants cover iSports' exact spelling
   * (column 1) plus common alternates. */
  BIH: ['Bosnia and Herzegovina', 'Bosnia', 'Bosnia-Herzegovina'],
  CPV: ['Cape Verde', 'Cabo Verde'],
  CUW: ['Curacao', 'Curaçao'],
  COD: ['Democratic Rep Congo', 'DR Congo', 'Democratic Republic of the Congo', 'Congo DR'],
  JOR: ['Jordan'],
  SCO: ['Scotland'],
  RSA: ['South Africa', 'RSA'],
  SWE: ['Sweden'],
  TUR: ['Turkey', 'Türkiye', 'Turkiye'],
  UZB: ['Uzbekistan'],
}

export const TEAM_NAME_TO_CODE: Readonly<Record<string, TeamCode>> = (() => {
  const out: Record<string, TeamCode> = {}
  for (const [codeStr, variants] of Object.entries(NAME_VARIANTS)) {
    const code = codeStr as TeamCode
    for (const v of variants) {
      out[normaliseTeamName(v)] = code
    }
  }
  return out
})()

/* iSports numeric team ids → TeamCode. Harvested from
 * server/fixtures/schedule-wc2026.json on 2026-06-08 by reading every
 * (homeName, homeId) and (awayName, awayId) pair where the name resolved
 * to a known TeamCode. Ids are stable across iSports calls; names are
 * less so. */
export const TEAM_ID_TO_CODE: Readonly<Record<string, TeamCode>> = {
  /* CONCACAF qualifying nations in the WC 2026 projection */
  '819':   'MEX',  // Mexico
  '795':   'CAN',  // Canada
  '797':   'USA',  // USA
  '798':   'PAN',  // Panama
  '909':   'HAI',  // Haiti

  /* CONMEBOL */
  '766':   'ARG',  // Argentina
  '778':   'BRA',  // Brazil
  '767':   'URU',  // Uruguay
  '775':   'COL',  // Colombia
  '779':   'ECU',  // Ecuador
  '776':   'PAR',  // Paraguay

  /* UEFA */
  '772':   'ESP',  // Spain
  '649':   'FRA',  // France
  '744':   'ENG',  // England
  '650':   'GER',  // Germany
  '646':   'NED',  // Netherlands
  '765':   'POR',  // Portugal
  '645':   'BEL',  // Belgium
  '768':   'CRO',  // Croatia
  '648':   'SWI',  // Switzerland
  '647':   'AUT',  // Austria
  '747':   'CZE',  // Czech Republic
  '640':   'NOR',  // Norway

  /* CAF */
  '813':   'MAR',  // Morocco
  '815':   'SEN',  // Senegal
  '735':   'EGY',  // Egypt
  '810':   'GHA',  // Ghana
  '18406': 'ALG',  // Algeria
  '823':   'TUN',  // Tunisia
  '809':   'CIV',  // Ivory Coast

  /* AFC */
  '903':   'JPN',  // Japan
  '898':   'KOR',  // South Korea
  '913':   'AUS',  // Australia
  '783':   'IRN',  // Iran
  '891':   'KSA',  // Saudi Arabia
  '904':   'QAT',  // Qatar
  '874':   'IRQ',  // Iraq

  /* OFC */
  '2363':  'NZL',  // New Zealand

  /* iSports WC 2026 projection additions (harvested from schedule fixture 2026-06-08) */
  '782':   'BIH',  // Bosnia and Herzegovina
  '790':   'CPV',  // Cape Verde
  '17976': 'CUW',  // Curacao
  '811':   'COD',  // Democratic Rep Congo
  '881':   'JOR',  // Jordan
  '641':   'SCO',  // Scotland
  '803':   'RSA',  // South Africa
  '644':   'SWE',  // Sweden
  '762':   'TUR',  // Turkey
  '875':   'UZB',  // Uzbekistan
}
