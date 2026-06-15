import type { Locale } from './types'

/* iSports venue name (as it appears in the API) -> per-locale display
 * name. Keys are the exact iSports strings (case-sensitive). Falls back
 * to the raw iSports string if not in the dict.
 *
 * iSports mostly sends generic city-based names ("Mexico City Stadium",
 * "New York/New Jersey Stadium") rather than canonical real stadia. A
 * few rows do come through with proper names ("BC Place Vancouver",
 * "Arrowhead Stadium", "Mercedes-Benz Arena", "Bobby Maduro Miami
 * Stadium", "Robertson Stadium"). We translate each string as iSports
 * sends it — if iSports is generic, the translation is generic too. */
export const VENUES_I18N: Record<string, Record<Locale, string>> = {
  // Generic city-based names (most common iSports pattern)
  'Mexico City Stadium': {
    en: 'Mexico City Stadium',
    zh: '墨西哥城体育场',
    ja: 'メキシコシティ・スタジアム',
    es: 'Estadio de Ciudad de México',
  },
  'Guadalajara Stadium': {
    en: 'Guadalajara Stadium',
    zh: '瓜达拉哈拉体育场',
    ja: 'グアダラハラ・スタジアム',
    es: 'Estadio de Guadalajara',
  },
  'Monterrey Stadium': {
    en: 'Monterrey Stadium',
    zh: '蒙特雷体育场',
    ja: 'モンテレイ・スタジアム',
    es: 'Estadio de Monterrey',
  },
  'Toronto Stadium': {
    en: 'Toronto Stadium',
    zh: '多伦多体育场',
    ja: 'トロント・スタジアム',
    es: 'Estadio de Toronto',
  },
  'Los Angeles Stadium': {
    en: 'Los Angeles Stadium',
    zh: '洛杉矶体育场',
    ja: 'ロサンゼルス・スタジアム',
    es: 'Estadio de Los Ángeles',
  },
  'San Francisco Bay Area Stadium': {
    en: 'San Francisco Bay Area Stadium',
    zh: '旧金山湾区体育场',
    ja: 'サンフランシスコ・ベイエリア・スタジアム',
    es: 'Estadio del Área de la Bahía de San Francisco',
  },
  'New York/New Jersey Stadium': {
    en: 'New York/New Jersey Stadium',
    zh: '纽约/新泽西体育场',
    ja: 'ニューヨーク/ニュージャージー・スタジアム',
    es: 'Estadio de Nueva York/Nueva Jersey',
  },
  'Boston Stadium': {
    en: 'Boston Stadium',
    zh: '波士顿体育场',
    ja: 'ボストン・スタジアム',
    es: 'Estadio de Boston',
  },
  'Houston Stadium': {
    en: 'Houston Stadium',
    zh: '休斯顿体育场',
    ja: 'ヒューストン・スタジアム',
    es: 'Estadio de Houston',
  },
  'Dallas Stadium': {
    en: 'Dallas Stadium',
    zh: '达拉斯体育场',
    ja: 'ダラス・スタジアム',
    es: 'Estadio de Dallas',
  },
  'Philadelphia Stadium': {
    en: 'Philadelphia Stadium',
    zh: '费城体育场',
    ja: 'フィラデルフィア・スタジアム',
    es: 'Estadio de Filadelfia',
  },
  'Atlanta Stadium': {
    en: 'Atlanta Stadium',
    zh: '亚特兰大体育场',
    ja: 'アトランタ・スタジアム',
    es: 'Estadio de Atlanta',
  },
  'Seattle Stadium': {
    en: 'Seattle Stadium',
    zh: '西雅图体育场',
    ja: 'シアトル・スタジアム',
    es: 'Estadio de Seattle',
  },
  'Miami Stadium': {
    en: 'Miami Stadium',
    zh: '迈阿密体育场',
    ja: 'マイアミ・スタジアム',
    es: 'Estadio de Miami',
  },

  // Proper-name venues iSports does send through
  'BC Place Vancouver': {
    en: 'BC Place Vancouver',
    zh: '温哥华 BC 体育场',
    ja: 'BCプレイス・バンクーバー',
    es: 'BC Place Vancouver',
  },
  'Arrowhead Stadium': {
    en: 'Arrowhead Stadium',
    zh: '箭头体育场',
    ja: 'アローヘッド・スタジアム',
    es: 'Estadio Arrowhead',
  },
  'Mercedes-Benz Arena': {
    en: 'Mercedes-Benz Arena',
    zh: '梅赛德斯-奔驰体育场',
    ja: 'メルセデス・ベンツ・アリーナ',
    es: 'Mercedes-Benz Arena',
  },
  'Bobby Maduro Miami Stadium': {
    en: 'Bobby Maduro Miami Stadium',
    zh: '迈阿密博比·马杜罗体育场',
    ja: 'ボビー・マドゥロ・マイアミ・スタジアム',
    es: 'Estadio Bobby Maduro de Miami',
  },
  'Robertson Stadium': {
    en: 'Robertson Stadium',
    zh: '罗伯逊体育场',
    ja: 'ロバートソン・スタジアム',
    es: 'Estadio Robertson',
  },
}

export function venueNameFor(raw: string | null | undefined, locale: Locale): string {
  if (!raw) return ''
  const entry = VENUES_I18N[raw]
  if (!entry) return raw
  return entry[locale] ?? entry.en ?? raw
}
