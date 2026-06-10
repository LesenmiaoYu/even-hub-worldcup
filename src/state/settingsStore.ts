import { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { REGION_BY_IANA, ianaForCountry, DEFAULT_IANA } from './regions'

export interface UserSettings {
  /** IANA timezone, e.g. 'America/Los_Angeles'. */
  timezone: string
  /** ISO country (alpha-2) from bridge.getUserInfo. Drives default tz when
   * the user hasn't picked one. Kept for display too. */
  country: string
}

type Listener = (s: UserSettings) => void

const LS_KEY = 'wc:settings'

function systemTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}

/* Read SDK-persistent storage. Returns null when the bridge is unavailable
 * (dev / sim — no Even App WebView wrapper), the key isn't set, or the
 * bridge throws.
 *
 * Critically: browser localStorage is NOT persistent across Even App
 * WebView relaunches (especially iOS WKWebView). The SDK's
 * setLocalStorage/getLocalStorage IS. We use the SDK as source of truth
 * and mirror to browser localStorage as an in-session cache + dev fallback. */
async function bridgeGet(key: string): Promise<string | null> {
  try {
    const bridge = EvenAppBridge.getInstance()
    const val = await bridge.getLocalStorage(key)
    return val && val.length > 0 ? val : null
  } catch { return null }
}

async function bridgeSet(key: string, value: string): Promise<void> {
  try {
    const bridge = EvenAppBridge.getInstance()
    await bridge.setLocalStorage(key, value)
  } catch { /* dev/sim — falls through to localStorage mirror only */ }
}

class SettingsStore {
  private state: UserSettings = { timezone: systemTimezone(), country: '' }
  private listeners = new Set<Listener>()
  private initialized = false

  get(): UserSettings { return this.state }

  /* Resolution order (highest priority wins):
   *   1. User's explicit saved pick — SDK storage (or browser localStorage
   *      fallback in dev). Survives WebView relaunch.
   *   2. EvenAppBridge.getUserInfo().country → first matching REGION.iana.
   *      Maps to the capital/primary zone for that country.
   *   3. Browser Intl-resolved timezone, IF in our supported region list.
   *   4. DEFAULT_IANA (America/New_York).
   * Country is fetched independently and kept in state for display, and
   * drives the fallback chain step 2. */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    const saved = await this.load()
    if (saved) this.state = { ...this.state, ...saved }

    /* Always re-ask the bridge for country if we don't have one. Handles
     * first launch and accommodates a user travelling to a new country
     * (their Even App profile updates, ours follows). */
    if (!this.state.country) {
      try {
        const bridge = EvenAppBridge.getInstance()
        const info = await bridge.getUserInfo()
        if (info?.country) this.state = { ...this.state, country: info.country }
      } catch { /* bridge unavailable — leave country blank */ }
    }

    /* If user hasn't explicitly saved a timezone, derive it. User pick >
     * country default > browser TZ > DEFAULT_IANA. */
    if (!saved?.timezone) {
      const fromCountry = ianaForCountry(this.state.country)
      const sysTz = systemTimezone()
      const fromBrowser = REGION_BY_IANA[sysTz] ? sysTz : null
      this.state = {
        ...this.state,
        timezone: fromCountry ?? fromBrowser ?? DEFAULT_IANA,
      }
    }

    void this.save()
    this.notify()
  }

  set(patch: Partial<UserSettings>): void {
    this.state = { ...this.state, ...patch }
    /* Fire-and-forget — UI re-renders synchronously, persistence catches up. */
    void this.save()
    this.notify()
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  private async load(): Promise<UserSettings | null> {
    /* SDK first (persistent across relaunches), browser localStorage
     * second (in-session cache + dev/sim fallback). */
    const fromBridge = await bridgeGet(LS_KEY)
    if (fromBridge) {
      try { return JSON.parse(fromBridge) as UserSettings } catch { /* fall through */ }
    }
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return JSON.parse(raw) as UserSettings
    } catch {}
    return null
  }

  private async save(): Promise<void> {
    const json = JSON.stringify(this.state)
    /* Write to both stores. SDK is canonical (persistent); browser
     * localStorage is an in-session cache so the next sync read can hit
     * fast paths before the async SDK read resolves. */
    void bridgeSet(LS_KEY, json)
    try { localStorage.setItem(LS_KEY, json) } catch {}
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state)
  }
}

export const settingsStore = new SettingsStore()
