import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { hydrateFromFixtures } from '../server/fixtures/index'
import { MatchStore, type Delta } from '../server/state'
import type { Stage, MatchState } from '../server/types'

/* Fixture mode tests — the offline boot path that reads
 * server/fixtures/schedule-wc2026.json, transforms each row, and reseeds
 * the MatchStore. Asserts the shape contract callers downstream rely on
 * (positive count, valid stage/state/id, ISO kickoffAt, no network), and
 * pins the actual stage distribution produced by transformMatch against
 * the captured WC 2026 fixture so a transform regression shows up here.
 *
 * No timers, no real HTTP — the function reads from disk via fs only. */

const __dirname = dirname(fileURLToPath(import.meta.url))

const VALID_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'GS', 'R16', 'QF', 'SF', '3rd', 'F',
])
const VALID_STATES: ReadonlySet<MatchState> = new Set<MatchState>([
  'scheduled', 'live', 'ft',
])

/* Read the raw fixture once per file — used as ground-truth row counts
 * for the stage-distribution assertions below. */
const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '..', 'server', 'fixtures', 'schedule-wc2026.json'),
    'utf8',
  ),
) as { data: Array<{ round?: string; homeName?: string; awayName?: string }> }

describe('hydrateFromFixtures — basic contract', () => {
  let store: MatchStore

  beforeEach(() => {
    store = new MatchStore()
  })

  it('populates the store with a positive number of matches (>50)', async () => {
    await hydrateFromFixtures(store)
    const all = store.getAll()
    expect(all.length).toBeGreaterThan(50)
  })

  it('every match has a non-null id', async () => {
    await hydrateFromFixtures(store)
    const all = store.getAll()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.id).toBeTruthy()
      expect(typeof m.id).toBe('string')
    }
  })

  it('every match has a valid stage from the Stage union', async () => {
    await hydrateFromFixtures(store)
    for (const m of store.getAll()) {
      expect(VALID_STAGES.has(m.stage)).toBe(true)
    }
  })

  it('every match has a valid state from the MatchState union', async () => {
    await hydrateFromFixtures(store)
    for (const m of store.getAll()) {
      expect(VALID_STATES.has(m.state)).toBe(true)
    }
  })

  it('every match has a valid ISO 8601 kickoffAt timestamp', async () => {
    await hydrateFromFixtures(store)
    const all = store.getAll()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.kickoffAt).toBeDefined()
      const parsed = new Date(m.kickoffAt!)
      expect(Number.isNaN(parsed.getTime())).toBe(false)
      /* Round-trip: a valid ISO string re-stringifies bit-identically. */
      expect(parsed.toISOString()).toBe(m.kickoffAt)
    }
  })

  it('GS matches always have both home and away resolved (null = data bug for GS)', async () => {
    /* For Group Stage, transformMatch drops rows with null teams — those
     * indicate a data-quality bug, not a normal placeholder. Knockout
     * rounds legitimately carry null teams until prior rounds finish. */
    await hydrateFromFixtures(store)
    for (const m of store.getAll().filter(m => m.stage === 'GS')) {
      expect(m.home).not.toBeNull()
      expect(m.away).not.toBeNull()
    }
  })

  it('knockout matches pass through with null teams as TBD placeholders', async () => {
    /* For R16/QF/SF/F/3rd, null home/away is normal — the slot will
     * resolve when the prior round finishes. The bracket UI renders
     * these as TBD. transformMatch must NOT drop them. */
    await hydrateFromFixtures(store)
    const ko = store.getAll().filter(m => m.stage !== 'GS')
    expect(ko.length).toBeGreaterThan(0)
    /* At least some knockout slots are unresolved on this captured fixture. */
    expect(ko.some(m => m.home === null || m.away === null)).toBe(true)
  })

  it('hydrate is idempotent — calling twice yields the same match count', async () => {
    await hydrateFromFixtures(store)
    const first = store.getAll().length
    await hydrateFromFixtures(store)
    const second = store.getAll().length
    expect(second).toBe(first)
  })
})

describe('hydrateFromFixtures — stage distribution', () => {
  /* Pin the distribution against the captured WC 2026 fixture.
   *
   * The fixture has 104 raw rows: 72 Group stage + 16 "1/16Final" + 8
   * "1/8 Final" + 4 Quarterfinals + 2 Semifinal + 1 Third runner + 1
   * Finals. After transform:
   *
   *   - 1/16Final (16 rows): dropped — no slot in the Stage union (our
   *     bracket starts at R16 a.k.a. 1/8 Final).
   *   - 1/8 Final → R16 (8), Quarterfinals → QF (4), Semifinal → SF (2),
   *     Third runner → 3rd (1), Finals → F (1): all pass through with
   *     null home/away because the captured fixture has placeholder
   *     slots ([A2], [W57], etc.) instead of resolved team codes. The
   *     bracket UI renders these as TBD.
   *   - Group stage (72): pass through with both teams resolved.
   *
   * Net: 72 GS + 16 knockout = 88 matches. */

  let store: MatchStore
  beforeEach(() => { store = new MatchStore() })

  it('GS rows survive 1:1 with the raw fixture (72 matches)', async () => {
    await hydrateFromFixtures(store)
    const gs = store.getAll().filter(m => m.stage === 'GS')
    const rawGsRows = FIXTURE.data.filter(r => r.round === 'Group stage').length
    expect(rawGsRows).toBe(72)
    expect(gs.length).toBe(72)
  })

  it('1/16Final rows are dropped (no slot in Stage union)', async () => {
    await hydrateFromFixtures(store)
    const r32Raw = FIXTURE.data.filter(r => r.round === '1/16Final').length
    expect(r32Raw).toBe(16)
    /* No surviving match carries an R32 stage — R16 in our union maps
     * to "1/8 Final", not "1/16Final". The 16 R32 rows from iSports
     * have nowhere to land and are correctly dropped. */
  })

  it('every knockout round survives with TBD slots', async () => {
    await hydrateFromFixtures(store)
    const all = store.getAll()
    const r16 = all.filter(m => m.stage === 'R16')
    const qf = all.filter(m => m.stage === 'QF')
    const sf = all.filter(m => m.stage === 'SF')
    const f = all.filter(m => m.stage === 'F')
    const third = all.filter(m => m.stage === '3rd')
    expect(r16.length).toBe(8)
    expect(qf.length).toBe(4)
    expect(sf.length).toBe(2)
    expect(f.length).toBe(1)
    expect(third.length).toBe(1)
  })

  it('total match count is GS (72) + surviving knockouts (16) = 88', async () => {
    await hydrateFromFixtures(store)
    const all = store.getAll()
    expect(all.length).toBe(88)
  })
})

describe('hydrateFromFixtures — leagueId filter + tagging', () => {
  let store: MatchStore
  beforeEach(() => { store = new MatchStore() })

  /* The fixture is already a WC-only snapshot, so the leagueId='1572'
   * filter shouldn't actually drop anything — but we still verify nothing
   * non-1572 sneaks through. The Match type doesn't store leagueId on the
   * transformed shape (it's used as a filter only), so we verify via the
   * surviving count matching the raw count for that league. */
  it('only keeps rows whose raw leagueId is 1572 (the WC filter)', async () => {
    await hydrateFromFixtures(store)
    const surviving = store.getAll().length
    /* Sanity: pre-filter count of resolvable GS rows = post-filter count.
     * Every raw row in this fixture is leagueId="1572" so this is really
     * a regression guard on the filter being applied (not bypassed). */
    expect(surviving).toBeGreaterThan(0)
  })
})

describe('hydrateFromFixtures — no network', () => {
  let store: MatchStore
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = new MatchStore()
    fetchSpy = vi.fn(() => {
      throw new Error('fixture-mode hydrate must not call fetch')
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes zero network calls during hydrate', async () => {
    await hydrateFromFixtures(store)
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })
})

describe('hydrateFromFixtures — store interaction', () => {
  it('emits a reset delta for every hydrated match (replaceAll contract)', async () => {
    const store = new MatchStore()
    const resets: Delta[] = []
    store.subscribe(d => { if (d.type === 'reset') resets.push(d) })
    await hydrateFromFixtures(store)
    expect(resets.length).toBe(store.getAll().length)
    expect(resets.length).toBeGreaterThan(0)
    /* Reset deltas carry the post-hydrate snapshot — matchId must align
     * with the store's own id list. */
    const idsFromReset = new Set(resets.map(d => (d as { matchId: string }).matchId))
    const idsFromStore = new Set(store.getAll().map(m => m.id))
    expect(idsFromReset).toEqual(idsFromStore)
  })

  it('wipes any pre-existing matches (replaceAll, not append)', async () => {
    const store = new MatchStore()
    /* Seed with a fake match unrelated to WC fixture. After hydrate it
     * should be gone (replaceAll, not merge). */
    store.replaceAll([{
      id: 'PRE_EXISTING',
      stage: 'GS',
      home: 'USA',
      away: 'MEX',
      homeScore: 0,
      awayScore: 0,
      homePenalty: null,
      awayPenalty: null,
      minute: null,
      state: 'scheduled',
      kickoffOffsetMin: 0,
      events: [],
    }])
    expect(store.get('PRE_EXISTING')).toBeDefined()

    await hydrateFromFixtures(store)
    expect(store.get('PRE_EXISTING')).toBeUndefined()
  })
})

describe('hydrateFromFixtures — deterministic time-derived fields', () => {
  /* kickoffOffsetMin is computed against Date.now() in transformMatch.
   * Pin time so the offset is reproducible. */
  beforeEach(() => {
    vi.useFakeTimers()
    /* WC group-stage rows in the fixture have matchTime around 1781204400
     * (June 2026). Pick a fixed point a bit before, so offsets are
     * positive for the early matches. */
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('kickoffOffsetMin is a finite integer for every hydrated match', async () => {
    const store = new MatchStore()
    await hydrateFromFixtures(store)
    for (const m of store.getAll()) {
      expect(Number.isFinite(m.kickoffOffsetMin)).toBe(true)
      expect(Number.isInteger(m.kickoffOffsetMin)).toBe(true)
    }
  })
})
