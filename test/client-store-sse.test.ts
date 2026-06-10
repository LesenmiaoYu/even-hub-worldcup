import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* Hand-rolled EventSource shim — small enough that pulling in the
 * `eventsource` polyfill would be pure overhead. Tracks every instance
 * created so tests can poke them directly (dispatchEvent, simulate
 * error, etc.). */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  readyState = 0 /* CONNECTING */
  onerror: ((ev: unknown) => void) | null = null
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: unknown) => void) | null = null
  private listeners = new Map<string, Set<(ev: { data: string }) => void>>()
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: (ev: { data: string }) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: (ev: { data: string }) => void): void {
    this.listeners.get(type)?.delete(fn)
  }

  dispatch(type: string, data: unknown): void {
    const evt = { data: typeof data === 'string' ? data : JSON.stringify(data) }
    const fns = this.listeners.get(type)
    if (fns) for (const fn of fns) fn(evt)
  }

  triggerError(): void {
    if (this.onerror) this.onerror({})
  }

  close(): void {
    this.closed = true
  }
}

/* Importing serverClient binds it to whatever EventSource the global
 * has AT IMPORT TIME, and it also memoizes the connection in a module
 * local. We use vi.resetModules + dynamic import per test so each one
 * gets a fresh module + fresh global stub. */
async function loadFresh(): Promise<typeof import('../src/state/serverClient')> {
  vi.resetModules()
  return await import('../src/state/serverClient')
}

beforeEach(() => {
  FakeEventSource.instances = []
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource
})

afterEach(() => {
  delete (globalThis as { EventSource?: unknown }).EventSource
  vi.restoreAllMocks()
})

describe('openServerConnection', () => {
  it('opens EventSource against /events and is idempotent', async () => {
    const mod = await loadFresh()
    const a = mod.openServerConnection()
    const b = mod.openServerConnection()
    expect(a).toBe(b)
    expect(FakeEventSource.instances.length).toBe(1)
    expect(FakeEventSource.instances[0]!.url).toBe('/events')
  })

  it('snapshot event triggers store.replaceAll', async () => {
    const mod = await loadFresh()
    /* Also reload the store module so we get the same instance that
     * serverClient bound to (resetModules cleared both). */
    const storeMod = await import('../src/state/store')
    const spy = vi.spyOn(storeMod.store, 'replaceAll')
    mod.openServerConnection()
    const es = FakeEventSource.instances[0]!
    const matches = [{ id: 'tiny', stage: 'F' }] as unknown as Parameters<typeof storeMod.store.replaceAll>[0]
    es.dispatch('snapshot', { matches })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toEqual(matches)
  })

  it('delta event triggers store.applyDelta', async () => {
    const mod = await loadFresh()
    const storeMod = await import('../src/state/store')
    const spy = vi.spyOn(storeMod.store, 'applyDelta')
    mod.openServerConnection()
    const es = FakeEventSource.instances[0]!
    const delta = { type: 'minute', matchId: 'm1', minute: 42 }
    es.dispatch('delta', delta)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toEqual(delta)
  })

  it('malformed JSON is logged and swallowed (no throw out of dispatch)', async () => {
    const mod = await loadFresh()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mod.openServerConnection()
    const es = FakeEventSource.instances[0]!
    expect(() => es.dispatch('snapshot', '{not json')).not.toThrow()
    expect(() => es.dispatch('delta', '{not json')).not.toThrow()
    expect(err).toHaveBeenCalled()
  })

  it('onerror handler is wired (auto-reconnect handled by EventSource itself)', async () => {
    const mod = await loadFresh()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mod.openServerConnection()
    const es = FakeEventSource.instances[0]!
    es.triggerError()
    expect(warn).toHaveBeenCalled()
  })
})

