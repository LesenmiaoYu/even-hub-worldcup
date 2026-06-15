import { settingsStore } from '../state/settingsStore'
import type { Locale, Strings } from './types'
import en from './en'
import zh from './zh'
import ja from './ja'
import es from './es'

/* en is the canonical Strings; zh/ja/es are Partial<Strings> while
 * translators are still filling them in. t() falls back to en on miss. */
const DICTS: Record<Locale, Partial<Strings>> = { en, zh, ja, es }

/** Translate by key. Falls back to EN if the current locale doesn't
 * have an entry (forgiving during translation rollout). */
export function t<K extends keyof Strings>(key: K, vars?: Record<string, string | number>): string {
  const loc = (settingsStore.get().language as Locale) || 'en'
  const dict = DICTS[loc] || DICTS.en
  let s: string = dict[key] ?? en[key] ?? String(key)
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v))
    }
  }
  return s
}

/** Map country (alpha-2) -> default locale. Falls back to EN. */
export function localeForCountry(country: string | null | undefined): Locale {
  if (!country) return 'en'
  const c = country.toUpperCase()
  if (c === 'CN' || c === 'TW' || c === 'HK' || c === 'MO' || c === 'SG') return 'zh'
  if (c === 'JP') return 'ja'
  const ES = new Set(['ES','MX','AR','CO','CL','PE','VE','EC','GT','CU','BO','DO','HN','PY','SV','NI','CR','PA','UY'])
  if (ES.has(c)) return 'es'
  return 'en'
}

export type { Locale, Strings } from './types'
export { LOCALES, LOCALE_LABEL } from './types'
