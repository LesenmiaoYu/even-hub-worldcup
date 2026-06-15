/* Offline fixture mode — read captured iSports `/schedule` JSON from
 * disk instead of hitting the live API. Lets contributors run the full
 * stack (server + phone WebView + glasses sim) without an iSports key.
 *
 * Enable with `USE_FIXTURES=true` in `.env`. The server skips the
 * pollers and serves the static snapshot — no live updates, but the
 * bracket renders and every UI surface gets a populated store. */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { MatchStore } from '../state.ts'
import type { Match } from '../types.ts'
import { transformMatch, type ISportsMatch } from '../isports/transform.ts'

const LEAGUE_ID = '1572' // FIFA World Cup 2026
const LOG = '[fixtures]'

const HERE = dirname(fileURLToPath(import.meta.url))

interface FixtureFile {
  code: number
  message: string
  data: ISportsMatch[]
}

export async function hydrateFromFixtures(store: MatchStore): Promise<void> {
  const startedAt = Date.now()
  const path = join(HERE, 'schedule-wc2026.json')
  console.log(`${LOG} hydrate: reading ${path}`)
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as FixtureFile

  const rows = parsed.data ?? []
  const matches: Match[] = []
  let dropped = 0
  for (const row of rows) {
    const m = transformMatch(row, { leagueId: LEAGUE_ID })
    if (m) matches.push(m)
    else dropped++
  }

  store.replaceAll(matches)
  const elapsed = Date.now() - startedAt
  console.log(
    `${LOG} hydrate: ${matches.length} matches in store ` +
      `(dropped ${dropped} unrepresentable rows, ${elapsed}ms)`,
  )
}
