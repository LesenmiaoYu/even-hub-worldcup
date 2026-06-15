import { settingsStore } from '../state/settingsStore'
import { REGIONS, REGION_BY_IANA, DEFAULT_IANA } from '../state/regions'

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

/* Small top-strip control. Persists across views — sets the timezone used
 * by glasses kickoff labels + bracket badges. */
export function renderLocationStrip(): string {
  const s = settingsStore.get()
  const groups = groupedRegions()
  const opts = groups.map(([group, items]) => {
    const inner = items.map(r =>
      `<option value="${r.iana}"${r.iana === s.timezone ? ' selected' : ''}>${r.label}</option>`,
    ).join('')
    return `<optgroup label="${group}">${inner}</optgroup>`
  }).join('')
  return `
    <div class="loc-strip">
      <span class="loc-label">Timezone</span>
      <select class="loc-select" data-setting="timezone" aria-label="Timezone">${opts}</select>
    </div>
  `
}

export function mountLocationStrip(root: HTMLElement): void {
  const sel = root.querySelector<HTMLSelectElement>('select[data-setting="timezone"]')
  sel?.addEventListener('change', () => {
    settingsStore.set({ timezone: sel.value })
    import('./mount').then(m => m.rerender())
  })
}
