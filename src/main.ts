import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import { store } from './state/store'
import { openServerConnection } from './state/serverClient'
import { DEMO_MODE } from './state/demoMode'
import {
  buildDetailPage, buildListPage,
  makeEventLogUpgrade, makeHeaderTextUpgrade, makeScoreUpdate,
  makePenIndicatorUpgrade,
  renderCodeImage,
  pickFocusMatch, getMatchById, listMatchAtIndex,
  DETAIL_IDS,
} from './g2/pageView'
import { preloadAlphabet } from './g2/pixelAlphabet'
import { renderPhone, mountPhone, setPhoneNavListener } from './phone/mount'

mountPhone()
renderPhone()

/* warm the SVG glyph cache so first detail render isn't blocked on the
 * alphabet fetch. Fire-and-forget — glyph loader is idempotent. */
void preloadAlphabet()

const bridge = await waitForEvenAppBridge()

type View = 'list' | 'detail'
let view: View = 'list'
let currentMatchId: string | null = null

/* ── Single-slot throttle ─────────────────────────────────────────────────
 * Coalesces bursty updates (debug spam, multiple events in one tick) so
 * we never have more than one bridge operation in flight + one queued.
 * Latest pending wins; intermediate requests are dropped on the floor.
 * Per `enqueueRender(kind, fn)`:
 *   - 'list'   → only most-recent list rebuild survives
 *   - 'detail' → only most-recent detail update survives
 * Errors are caught + logged so a failed bridge call doesn't poison the queue. */
type QueueKind = 'list' | 'detail'
const inFlight: Record<QueueKind, Promise<void> | null> = { list: null, detail: null }
const pending: Record<QueueKind, (() => Promise<void>) | null> = { list: null, detail: null }

function enqueueRender(kind: QueueKind, fn: () => Promise<void>): void {
  if (inFlight[kind]) {
    pending[kind] = fn
    return
  }
  const run = async () => {
    try { await fn() } catch (e) { console.error(`[worldcup] ${kind} render failed:`, e) }
    inFlight[kind] = null
    if (pending[kind]) {
      const next = pending[kind]!
      pending[kind] = null
      enqueueRender(kind, next)
    }
  }
  inFlight[kind] = run()
}

/* ── Layer-2 render-state cache ───────────────────────────────────────────
 * Tracks what we last painted so the incremental path knows what changed.
 * Anything in here is the source of truth for "what's currently on the
 * glasses". When a field here drifts from the new match data, we repaint
 * only that container. */
const last = {
  matchId: null as string | null,
  homeCode: '',
  awayCode: '',
  scoreSig: '',
  penSig: '',
}

function scoreSig(m: { homeScore: number | null; awayScore: number | null; state: string } | null): string {
  if (!m) return ''
  return `${m.state}:${m.homeScore}-${m.awayScore}`
}
function penSig(m: { homePenalty: number | null; awayPenalty: number | null } | null): string {
  if (!m) return ''
  return `${m.homePenalty}-${m.awayPenalty}`
}

async function bootList() {
  const { payload } = buildListPage('create')
  await bridge.createStartUpPageContainer(payload as any)
}

async function renderList() {
  const { payload } = buildListPage('rebuild')
  await bridge.rebuildPageContainer(payload as any)
}

/* Full Layer 2 rebuild. Reserved for STRUCTURAL changes only:
 *   - first time we enter detail view
 *   - the focused match changes (phone nav, OS click)
 *   - shootout presence toggles (PEN container appears/disappears) */
async function fullRenderDetail() {
  const { payload, match, scoreData, homeCodeData, awayCodeData } = await buildDetailPage(currentMatchId, 'rebuild')
  currentMatchId = match?.id ?? null
  await bridge.rebuildPageContainer(payload as any)
  await bridge.updateImageRawData({ containerID: DETAIL_IDS.HOME_CODE.id, containerName: DETAIL_IDS.HOME_CODE.name, imageData: homeCodeData } as any)
  await bridge.updateImageRawData({ containerID: DETAIL_IDS.SCORE.id, containerName: DETAIL_IDS.SCORE.name, imageData: scoreData } as any)
  await bridge.updateImageRawData({ containerID: DETAIL_IDS.AWAY_CODE.id, containerName: DETAIL_IDS.AWAY_CODE.name, imageData: awayCodeData } as any)
  if (match) {
    last.matchId = match.id
    last.homeCode = match.home ?? 'TBD'
    last.awayCode = match.away ?? 'TBD'
    last.scoreSig = scoreSig(match)
    last.penSig = penSig(match)
  }
}

/* Incremental Layer 2 update. Only touches containers whose underlying
 * data actually changed since the last paint. Critical for not flashing
 * the home/away code images every time a goal fires — those PNGs don't
 * change unless the team itself swaps. */
async function incrementalRenderDetail() {
  const m = getMatchById(currentMatchId)
  if (!m) return

  /* Structural deltas → bail out and do a full rebuild. PEN now renders
   * unconditionally so its presence isn't a structural change anymore;
   * only a match swap requires a full rebuild. */
  if (m.id !== last.matchId) {
    await fullRenderDetail()
    return
  }

  /* Header (stage + verbose status) — cheap textContainerUpgrade, flicker-free. */
  await bridge.textContainerUpgrade(makeHeaderTextUpgrade(currentMatchId) as any)

  /* Event log — same. */
  await bridge.textContainerUpgrade(makeEventLogUpgrade(currentMatchId) as any)

  /* Score image — only when the sig actually changed. */
  const newScoreSig = scoreSig(m)
  if (newScoreSig !== last.scoreSig) {
    const u = await makeScoreUpdate(currentMatchId)
    await bridge.updateImageRawData(u as any)
    last.scoreSig = newScoreSig
  }

  /* Home code image — only when the team code changed (bracket swap). */
  const newHomeCode = m.home ?? 'TBD'
  if (newHomeCode !== last.homeCode) {
    const data = await renderCodeImage('home', newHomeCode)
    await bridge.updateImageRawData({ containerID: DETAIL_IDS.HOME_CODE.id, containerName: DETAIL_IDS.HOME_CODE.name, imageData: data } as any)
    last.homeCode = newHomeCode
  }

  /* Away code image — same. */
  const newAwayCode = m.away ?? 'TBD'
  if (newAwayCode !== last.awayCode) {
    const data = await renderCodeImage('away', newAwayCode)
    await bridge.updateImageRawData({ containerID: DETAIL_IDS.AWAY_CODE.id, containerName: DETAIL_IDS.AWAY_CODE.name, imageData: data } as any)
    last.awayCode = newAwayCode
  }

  /* PEN block — text container update when penalty score signature
   * changes. PEN is always rendered (empty state = "PEN --"), so the
   * upgrade fires for null→score transitions too. */
  const newPenSig = penSig(m)
  if (newPenSig !== last.penSig) {
    const upgrade = makePenIndicatorUpgrade(currentMatchId)
    if (upgrade) await bridge.textContainerUpgrade(upgrade as any)
    last.penSig = newPenSig
  }
}

/* Phone-driven nav: tapping a match on the phone jumps glasses to Layer 2 for
 * that match; exiting back to phone matches list returns glasses to Layer 1. */
setPhoneNavListener(async (event) => {
  if (event.type === 'enter-detail') {
    view = 'detail'
    currentMatchId = event.matchId
    enqueueRender('detail', fullRenderDetail)
  } else if (event.type === 'exit-detail') {
    view = 'list'
    currentMatchId = null
    last.matchId = null
    enqueueRender('list', renderList)
  }
})

await bootList()
/* Demo build (VITE_DEMO_MODE=true) ships without a backend — store is
 * already seeded from getInitialMatches() and debug handlers mutate it
 * directly, so the SSE connection is skipped. */
if (!DEMO_MODE) openServerConnection()

store.subscribe(() => {
  renderPhone()
  if (view === 'list') {
    enqueueRender('list', renderList)
  } else {
    enqueueRender('detail', incrementalRenderDetail)
  }
})

bridge.onEvenHubEvent(async (event) => {
  /* List container with isEventCapture=1 emits event.listEvent (List_ItemEvent)
   * carrying currentSelectItemIndex + its own eventType (CLICK/DOUBLE_CLICK). */
  const le = event.listEvent
  if (le && view === 'list') {
    const lt = le.eventType ?? 0
    if (lt === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      /* Don't await — the OS exit-confirm dialog can leave this promise
       * unresolved on cancel, blocking everything that comes after. Fire
       * and recover via FOREGROUND_ENTER below if the user backs out. */
      bridge.shutDownPageContainer(1).catch(e => console.warn('[worldcup] shutDown rejected:', e))
      return
    }
    if (lt === OsEventTypeList.CLICK_EVENT) {
      const idx = le.currentSelectItemIndex ?? 0
      const m = listMatchAtIndex(idx) ?? pickFocusMatch()
      if (!m) return
      view = 'detail'
      currentMatchId = m.id
      enqueueRender('detail', fullRenderDetail)
      return
    }
    return
  }
  if (!event.sysEvent) return
  const t = event.sysEvent.eventType ?? 0
  if (t === OsEventTypeList.CLICK_EVENT) {
    if (view === 'list') {
      const focus = pickFocusMatch()
      if (!focus) return
      view = 'detail'
      currentMatchId = focus.id
      enqueueRender('detail', fullRenderDetail)
    }
    return
  }
  if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (view === 'list') {
      bridge.shutDownPageContainer(1).catch(e => console.warn('[worldcup] shutDown rejected:', e))
    } else {
      view = 'list'
      currentMatchId = null
      last.matchId = null
      enqueueRender('list', renderList)
    }
    return
  }
  if (t === OsEventTypeList.SYSTEM_EXIT_EVENT || t === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    /* Server owns the live clock now — nothing to tear down locally. */
    return
  }
  if (t === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    /* If the user cancelled an exit dialog, the page may have been half
     * torn down by the OS — re-render so updates start flowing again.
     * SSE keeps streaming in the background, so the store cache is
     * already current. */
    last.matchId = null  /* force fullRenderDetail's structural-change path */
    if (view === 'list') enqueueRender('list', renderList)
    else                  enqueueRender('detail', fullRenderDetail)
    return
  }
  if (t === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    return
  }
})

console.log('[worldcup] booted on view', view)
