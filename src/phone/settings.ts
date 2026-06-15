import { settingsStore } from '../state/settingsStore'
import { REGIONS, REGION_BY_IANA, DEFAULT_IANA } from '../state/regions'
import { LOCALES, LOCALE_LABEL, t, type Locale } from '../i18n'

export async function initSettings(): Promise<void> {
  await settingsStore.init()
  /* Snap any persisted timezone that isn't in our supported region list
   * back to the closest supported one. Prevents the picker from showing
   * a stale value that doesn't appear in any <option>. */
  const current = settingsStore.get().timezone
  if (!REGION_BY_IANA[current]) {
    settingsStore.set({ timezone: pickInitialIana() })
  }
}

/* Resolution order:
 *   1. User's saved timezone if it's in our supported list (handled by initSettings).
 *   2. Browser's resolved system timezone if it's in our supported list.
 *   3. DEFAULT_IANA from regions.ts (currently America/New_York). */
function pickInitialIana(): string {
  try {
    const sys = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (sys && REGION_BY_IANA[sys]) return sys
  } catch {}
  return DEFAULT_IANA
}

/* Group regions for the <optgroup> structure. Stable group order keeps
 * Europe first, then the Americas, then Asia — matches the wiki's order
 * and gives users in those buckets less scrolling. */
const GROUP_ORDER = ['Europe', 'North America', 'South America', 'Asia', 'Oceania']

function groupedRegions(): Array<[string, typeof REGIONS]> {
  const byGroup = new Map<string, typeof REGIONS>()
  for (const r of REGIONS) {
    const g = r.group || 'Other'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(r)
  }
  const ordered: Array<[string, typeof REGIONS]> = []
  for (const g of GROUP_ORDER) {
    const list = byGroup.get(g)
    if (list) { ordered.push([g, list]); byGroup.delete(g) }
  }
  for (const [g, list] of byGroup) ordered.push([g, list])
  return ordered
}

/* Settings panel — anchored to the gear button in the topbar. Stacked rows
 * (label + full-width select) so nothing ever overflows the narrow WebView. */
export function renderLocationStrip(): string {
  const s = settingsStore.get()
  const groups = groupedRegions()
  const tzOpts = groups.map(([group, items]) => {
    const inner = items.map(r =>
      `<option value="${r.iana}"${r.iana === s.timezone ? ' selected' : ''}>${r.label}</option>`,
    ).join('')
    return `<optgroup label="${group}">${inner}</optgroup>`
  }).join('')
  const langOpts = LOCALES.map(l =>
    `<option value="${l}"${l === s.language ? ' selected' : ''}>${LOCALE_LABEL[l]}</option>`,
  ).join('')
  const tzLabel = t('settings_timezone')
  const langLabel = t('settings_language')
  return `
    <div class="settings-card">
      <div class="settings-row">
        <span class="settings-label">${tzLabel}</span>
        <select class="settings-select" data-setting="timezone" aria-label="${tzLabel}">${tzOpts}</select>
      </div>
      <div class="settings-row">
        <span class="settings-label">${langLabel}</span>
        <select class="settings-select" data-setting="language" aria-label="${langLabel}">${langOpts}</select>
      </div>
    </div>
  `
}

export function mountLocationStrip(root: HTMLElement): void {
  const tzSel = root.querySelector<HTMLSelectElement>('select[data-setting="timezone"]')
  tzSel?.addEventListener('change', () => {
    settingsStore.set({ timezone: tzSel.value })
    import('./mount').then(m => m.rerender())
  })
  const langSel = root.querySelector<HTMLSelectElement>('select[data-setting="language"]')
  langSel?.addEventListener('change', () => {
    settingsStore.set({ language: langSel.value as Locale })
    import('./mount').then(m => m.rerender())
  })
}
