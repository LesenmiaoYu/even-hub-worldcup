import { EvenAppBridge } from '@evenrealities/even_hub_sdk'

export interface UserSettings {
  /** IANA timezone, e.g. 'America/Los_Angeles'. */
  timezone: string
  /** ISO country label from bridge.getUserInfo, e.g. 'US'. Display-only. */
  country: string
}

type Listener = (s: UserSettings) => void

const LS_KEY = 'wc:settings'

function systemTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}

class SettingsStore {
  private state: UserSettings = { timezone: systemTimezone(), country: '' }
  private listeners = new Set<Listener>()
  private initialized = false

  get(): UserSettings { return this.state }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    const saved = this.load()
    if (saved) { this.state = { ...this.state, ...saved } }
    /* If no saved country, ask the bridge. Timezone always comes from
     * Intl unless the user overrode it (saved.timezone wins). */
    if (!saved?.country) {
      try {
        const bridge = EvenAppBridge.getInstance()
        const info = await bridge.getUserInfo()
        if (info?.country) {
          this.state = { ...this.state, country: info.country }
        }
      } catch { /* bridge unavailable — leave country blank */ }
    }
    this.notify()
  }

  set(patch: Partial<UserSettings>): void {
    this.state = { ...this.state, ...patch }
    this.save()
    this.notify()
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  private load(): UserSettings | null {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch { return null }
  }

  private save(): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)) } catch {}
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state)
  }
}

export const settingsStore = new SettingsStore()
