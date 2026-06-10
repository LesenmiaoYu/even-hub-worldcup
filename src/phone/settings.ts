import { settingsStore } from '../state/settingsStore'

export async function initSettings(): Promise<void> {
  await settingsStore.init()
}

function listTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone')
  } catch {}
  return [
    'UTC',
    'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Moscow',
    'Africa/Cairo', 'Africa/Johannesburg',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Sydney', 'Pacific/Auckland',
  ]
}

/* Small top-strip control. Persists across views — sets the timezone used
 * by glasses kickoff labels + bracket badges. The matching country (if any
 * was resolved via bridge.getUserInfo) is tucked into the label as a
 * subtle prefix so the user sees where the default came from. */
export function renderLocationStrip(): string {
  const s = settingsStore.get()
  const zones = listTimezones()
  const options = zones.map(z => `<option value="${z}"${z === s.timezone ? ' selected' : ''}>${z}</option>`).join('')
  const countryNote = s.country ? `<span class="loc-country">${s.country}</span>` : ''
  return `
    <div class="loc-strip">
      <span class="loc-label">Timezone</span>
      <select class="loc-select" data-setting="timezone" aria-label="Timezone">${options}</select>
      ${countryNote}
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
