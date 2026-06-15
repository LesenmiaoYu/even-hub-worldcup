import type { Locale } from './types'
import type { TeamCode } from '../types'

/* Per-team display name in each supported locale. Source: official
 * football vocabulary as used in broadcast/CCTV5/DAZN/ESPN-Deportes.
 * Falls back to EN if a locale entry is missing.
 *
 * Covers all 58 codes in the TeamCode union (the 48-team WC 2026 field
 * plus the 10 extra nations iSports' projected bracket may surface). */
export const TEAMS_I18N: Record<TeamCode, Record<Locale, string>> = {
  /* CONCACAF — 6 */
  USA: { en: 'United States',       zh: '美国',       ja: 'アメリカ',         es: 'Estados Unidos' },
  CAN: { en: 'Canada',              zh: '加拿大',     ja: 'カナダ',           es: 'Canadá' },
  MEX: { en: 'Mexico',              zh: '墨西哥',     ja: 'メキシコ',         es: 'México' },
  CRC: { en: 'Costa Rica',          zh: '哥斯达黎加', ja: 'コスタリカ',       es: 'Costa Rica' },
  PAN: { en: 'Panama',              zh: '巴拿马',     ja: 'パナマ',           es: 'Panamá' },
  JAM: { en: 'Jamaica',             zh: '牙买加',     ja: 'ジャマイカ',       es: 'Jamaica' },

  /* CONMEBOL — 6 */
  ARG: { en: 'Argentina',           zh: '阿根廷',     ja: 'アルゼンチン',     es: 'Argentina' },
  BRA: { en: 'Brazil',              zh: '巴西',       ja: 'ブラジル',         es: 'Brasil' },
  URU: { en: 'Uruguay',             zh: '乌拉圭',     ja: 'ウルグアイ',       es: 'Uruguay' },
  COL: { en: 'Colombia',            zh: '哥伦比亚',   ja: 'コロンビア',       es: 'Colombia' },
  ECU: { en: 'Ecuador',             zh: '厄瓜多尔',   ja: 'エクアドル',       es: 'Ecuador' },
  PAR: { en: 'Paraguay',            zh: '巴拉圭',     ja: 'パラグアイ',       es: 'Paraguay' },

  /* UEFA — 21 (16 core + BIH/SCO/SWE/TUR/NIR) */
  ESP: { en: 'Spain',               zh: '西班牙',     ja: 'スペイン',         es: 'España' },
  FRA: { en: 'France',              zh: '法国',       ja: 'フランス',         es: 'Francia' },
  ENG: { en: 'England',             zh: '英格兰',     ja: 'イングランド',     es: 'Inglaterra' },
  GER: { en: 'Germany',             zh: '德国',       ja: 'ドイツ',           es: 'Alemania' },
  ITA: { en: 'Italy',               zh: '意大利',     ja: 'イタリア',         es: 'Italia' },
  NED: { en: 'Netherlands',         zh: '荷兰',       ja: 'オランダ',         es: 'Países Bajos' },
  POR: { en: 'Portugal',            zh: '葡萄牙',     ja: 'ポルトガル',       es: 'Portugal' },
  BEL: { en: 'Belgium',             zh: '比利时',     ja: 'ベルギー',         es: 'Bélgica' },
  CRO: { en: 'Croatia',             zh: '克罗地亚',   ja: 'クロアチア',       es: 'Croacia' },
  SWI: { en: 'Switzerland',         zh: '瑞士',       ja: 'スイス',           es: 'Suiza' },
  DEN: { en: 'Denmark',             zh: '丹麦',       ja: 'デンマーク',       es: 'Dinamarca' },
  POL: { en: 'Poland',              zh: '波兰',       ja: 'ポーランド',       es: 'Polonia' },
  AUT: { en: 'Austria',             zh: '奥地利',     ja: 'オーストリア',     es: 'Austria' },
  CZE: { en: 'Czechia',             zh: '捷克',       ja: 'チェコ',           es: 'Chequia' },
  SRB: { en: 'Serbia',              zh: '塞尔维亚',   ja: 'セルビア',         es: 'Serbia' },
  NOR: { en: 'Norway',              zh: '挪威',       ja: 'ノルウェー',       es: 'Noruega' },
  BIH: { en: 'Bosnia and Herzegovina', zh: '波黑',    ja: 'ボスニア・ヘルツェゴビナ', es: 'Bosnia y Herzegovina' },
  SCO: { en: 'Scotland',            zh: '苏格兰',     ja: 'スコットランド',   es: 'Escocia' },
  SWE: { en: 'Sweden',              zh: '瑞典',       ja: 'スウェーデン',     es: 'Suecia' },
  TUR: { en: 'Türkiye',             zh: '土耳其',     ja: 'トルコ',           es: 'Turquía' },
  NIR: { en: 'Northern Ireland',    zh: '北爱尔兰',   ja: '北アイルランド',   es: 'Irlanda del Norte' },

  /* CAF — 12 (9 core + CPV/COD/RSA) */
  MAR: { en: 'Morocco',             zh: '摩洛哥',     ja: 'モロッコ',         es: 'Marruecos' },
  SEN: { en: 'Senegal',             zh: '塞内加尔',   ja: 'セネガル',         es: 'Senegal' },
  EGY: { en: 'Egypt',               zh: '埃及',       ja: 'エジプト',         es: 'Egipto' },
  GHA: { en: 'Ghana',               zh: '加纳',       ja: 'ガーナ',           es: 'Ghana' },
  CMR: { en: 'Cameroon',            zh: '喀麦隆',     ja: 'カメルーン',       es: 'Camerún' },
  NGA: { en: 'Nigeria',             zh: '尼日利亚',   ja: 'ナイジェリア',     es: 'Nigeria' },
  ALG: { en: 'Algeria',             zh: '阿尔及利亚', ja: 'アルジェリア',     es: 'Argelia' },
  TUN: { en: 'Tunisia',             zh: '突尼斯',     ja: 'チュニジア',       es: 'Túnez' },
  CIV: { en: "Côte d'Ivoire",       zh: '科特迪瓦',   ja: 'コートジボワール', es: 'Costa de Marfil' },
  CPV: { en: 'Cape Verde',          zh: '佛得角',     ja: 'カーボベルデ',     es: 'Cabo Verde' },
  COD: { en: 'DR Congo',            zh: '刚果(金)',  ja: 'コンゴ民主共和国', es: 'RD del Congo' },
  RSA: { en: 'South Africa',        zh: '南非',       ja: '南アフリカ',       es: 'Sudáfrica' },

  /* AFC — 10 (8 core + JOR/UZB) */
  JPN: { en: 'Japan',               zh: '日本',       ja: '日本',             es: 'Japón' },
  KOR: { en: 'South Korea',         zh: '韩国',       ja: '韓国',             es: 'Corea del Sur' },
  AUS: { en: 'Australia',           zh: '澳大利亚',   ja: 'オーストラリア',   es: 'Australia' },
  IRN: { en: 'Iran',                zh: '伊朗',       ja: 'イラン',           es: 'Irán' },
  KSA: { en: 'Saudi Arabia',        zh: '沙特阿拉伯', ja: 'サウジアラビア',   es: 'Arabia Saudita' },
  QAT: { en: 'Qatar',               zh: '卡塔尔',     ja: 'カタール',         es: 'Catar' },
  UAE: { en: 'United Arab Emirates', zh: '阿联酋',    ja: 'アラブ首長国連邦', es: 'Emiratos Árabes Unidos' },
  IRQ: { en: 'Iraq',                zh: '伊拉克',     ja: 'イラク',           es: 'Irak' },
  JOR: { en: 'Jordan',              zh: '约旦',       ja: 'ヨルダン',         es: 'Jordania' },
  UZB: { en: 'Uzbekistan',          zh: '乌兹别克斯坦', ja: 'ウズベキスタン', es: 'Uzbekistán' },

  /* OFC + intercontinental playoffs — 4 (3 core + CUW) */
  NZL: { en: 'New Zealand',         zh: '新西兰',     ja: 'ニュージーランド', es: 'Nueva Zelanda' },
  BOL: { en: 'Bolivia',             zh: '玻利维亚',   ja: 'ボリビア',         es: 'Bolivia' },
  HAI: { en: 'Haiti',               zh: '海地',       ja: 'ハイチ',           es: 'Haití' },
  CUW: { en: 'Curaçao',             zh: '库拉索',     ja: 'キュラソー',       es: 'Curazao' },
}

/** Look up display name for a team code in a given locale. Falls back
 * to EN, then to the raw code. Pure read — no settings store access. */
export function teamNameFor(code: TeamCode | null | undefined, locale: Locale): string {
  if (!code) return ''
  const entry = TEAMS_I18N[code]
  if (!entry) return code
  return entry[locale] ?? entry.en ?? code
}
