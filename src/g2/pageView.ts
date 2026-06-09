import {
  TextContainerProperty,
  ImageContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk'
import type { Match } from '../types'
import { store } from '../state/store'
import {
  statusVerbose, scoreText, eventChip, listLeft, listRight, asciiName, hasShootout,
} from './format'
import { renderScorePng, renderVsPng, renderCodePng } from './pngImage'

/* ── geometry ─────────────────────────────────────────────────────────────── */

/* Layer 2 (detail) — 2-row header strip (taller now so neither row clips),
 * then score + codes that share a bottom baseline at y=150. The text box
 * starts at y=180 — 30 px BELOW that baseline so codes/score "lift off"
 * the log instead of being glued to it. */
const HEADER_X = 8,   HEADER_Y = 8,   HEADER_W = 404, HEADER_H = 56
const PEN_X    = 420, PEN_Y    = 8,   PEN_W    = 148, PEN_H    = 44
const SCORE_X = 144,  SCORE_Y = 68,   SCORE_W = 288, SCORE_H = 82
const CODE_W = 132,   CODE_H = 52,    CODE_Y = 98
const HOME_CODE_X = 4
const AWAY_CODE_X = 440
const LOG_X = 8,      LOG_Y = 180,    LOG_W = 560,   LOG_H = 108
const LOG_ROWS = 6

/* Layer 1 — header row (stage-as-hero) + two leveled lists.
 * Left list = matchup (interactive). Right list = status/score (display-only). */
const L1_HEAD_X = 8, L1_HEAD_Y = 8,  L1_HEAD_W = 560, L1_HEAD_H = 28
const LIST_Y = 48,   LIST_H = 232
const LEFT_X  = 8,   LEFT_W  = 280
const RIGHT_X = 296, RIGHT_W = 272

const ID = {
  HEADER: 1, PEN: 2,
  HOME_CODE: 3, SCORE: 4, AWAY_CODE: 5,
  EVENT_LOG: 7,
  LIST_HEADER: 10, LIST_LEFT: 11, LIST_RIGHT: 12,
} as const

const NAME = {
  HEADER: 'header', PEN: 'pen',
  HOME_CODE: 'hcode', SCORE: 'score', AWAY_CODE: 'acode',
  EVENT_LOG: 'elog',
  LIST_HEADER: 'lhead', LIST_LEFT: 'lleft', LIST_RIGHT: 'lright',
} as const

/* ── helpers ──────────────────────────────────────────────────────────────── */

function stageLabel(m: Match): string {
  if (m.stage === 'QF') return 'QUARTERFINAL'
  if (m.stage === 'SF') return 'SEMIFINAL'
  if (m.stage === '3rd') return '3RD PLACE'
  return 'FINAL'
}

function headerText(m: Match): string {
  /* Two-row header: stage on row 1, live/scheduled status on row 2.
   * Sanitize stage + status SEPARATELY before joining with `\n`. Joining
   * first and then asciiName-ing strips the newline (\x0A is outside the
   * \x20-\x7E printable-ASCII range the helper allows), collapsing the
   * two rows back to one. Same gotcha as the event log avoided by
   * mapping asciiName over each line before .join('\n'). */
  return `${asciiName(stageLabel(m))}\n${asciiName(statusVerbose(m))}`
}

function eventLogLines(m: Match): string[] {
  if (m.state === 'scheduled') {
    const off = m.kickoffOffsetMin
    let when = ''
    if (off < 60) when = `${off}m`
    else if (off < 24 * 60) when = `${Math.floor(off / 60)}h`
    else when = `${Math.round(off / 60 / 24)}d`
    const lines = [asciiName(`Kicks off in ${when}`)]
    while (lines.length < LOG_ROWS) lines.push('')
    return lines
  }
  /* Show the whole match log, newest first. SDK clips at LOG_H so older
   * events fall off the bottom naturally. LOG_ROWS is now just the
   * empty-state padding floor (kickoff / "match underway"). */
  const events = [...m.events].reverse()
  const lines = events.map(e => {
    const min = String(e.minute).padStart(2, ' ')
    const chip = (eventChip(e) || '   ').padEnd(4, ' ')
    const side = e.side === 'home' ? m.home : e.side === 'away' ? m.away : ''
    let who: string
    if (e.type === 'sub' && e.playerIn) {
      const out = e.player ? asciiName(e.player) : ''
      const inn = asciiName(e.playerIn)
      who = `${out} > ${inn}${side ? ` (${side})` : ''}`
    } else {
      const player = e.player ? asciiName(e.player) : ''
      who = side && player ? `${player} (${side})` : player
    }
    return asciiName(`${min}'  ${chip}  ${who}`.trim())
  })
  if (lines.length === 0) lines.push(asciiName('Match underway'))
  while (lines.length < LOG_ROWS) lines.push('')
  return lines
}

/* "current focus match" — Layer 1 -> Layer 2 picker.
 * Order:
 *   1. live (in-progress drama)
 *   2. recent shootout (PEN counter on by default — the result is dramatic
 *      enough to be the hero when nothing is live)
 *   3. next upcoming (within 24h)
 *   4. first past
 */
export function pickFocusMatch(): Match | null {
  const live = store.getLive()[0]
  if (live) return live
  const past = store.getPast()
  const recentShootout = [...past].reverse().find(m => m.homePenalty != null && m.awayPenalty != null)
  if (recentShootout) return recentShootout
  const up = store.getUpcoming()[0]
  if (up && up.kickoffOffsetMin <= 24 * 60) return up
  return past[0] ?? null
}

export function getMatchById(id: string | null): Match | null {
  if (!id) return null
  return store.get(id) ?? null
}

function makeBlankMatch(): Match {
  return {
    id: '', stage: 'F',
    home: null, away: null,
    homeScore: null, awayScore: null,
    homePenalty: null, awayPenalty: null,
    minute: null, state: 'scheduled',
    kickoffOffsetMin: 0,
    events: [],
  }
}

/* ── Layer 2 (detail) builders ────────────────────────────────────────────── */

function headerTextContainer(m: Match): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: HEADER_X, yPosition: HEADER_Y, width: HEADER_W, height: HEADER_H,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 0,
    containerID: ID.HEADER, containerName: NAME.HEADER,
    isEventCapture: 0,
    content: headerText(m),
  })
}

/* Top-right penalty-shootout indicator. Only included in the page payload
 * when hasShootout(m). Renders "PEN" on row 1 and the shootout score on
 * row 2 — two-line format so the score reads as a tally, not running text. */
function penIndicatorContainer(m: Match): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: PEN_X, yPosition: PEN_Y, width: PEN_W, height: PEN_H,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 0,
    containerID: ID.PEN, containerName: NAME.PEN,
    isEventCapture: 0,
    content: asciiName(`PEN\n${m.homePenalty}-${m.awayPenalty}`),
  })
}

function scoreImage(): ImageContainerProperty {
  return new ImageContainerProperty({
    xPosition: SCORE_X, yPosition: SCORE_Y, width: SCORE_W, height: SCORE_H,
    containerID: ID.SCORE, containerName: NAME.SCORE,
  })
}

function codeImage(slot: 'home' | 'away'): ImageContainerProperty {
  /* Image container fed by the pixel-alphabet renderer. We stamp filled
   * rects from the A–Z SVG atlas instead of running the font through
   * canvas + threshold — that path lost the thin letter strokes. */
  return new ImageContainerProperty({
    xPosition: slot === 'home' ? HOME_CODE_X : AWAY_CODE_X,
    yPosition: CODE_Y,
    width: CODE_W,
    height: CODE_H,
    containerID: slot === 'home' ? ID.HOME_CODE : ID.AWAY_CODE,
    containerName: slot === 'home' ? NAME.HOME_CODE : NAME.AWAY_CODE,
  })
}

function eventLogText(m: Match): TextContainerProperty {
  const content = eventLogLines(m).join('\n')
  return new TextContainerProperty({
    xPosition: LOG_X, yPosition: LOG_Y, width: LOG_W, height: LOG_H,
    borderWidth: 1, borderColor: 6, borderRadius: 4, paddingLength: 8,
    containerID: ID.EVENT_LOG, containerName: NAME.EVENT_LOG, isEventCapture: 1,
    content,
  })
}

export interface DetailPageRender {
  payload: CreateStartUpPageContainer | RebuildPageContainer
  match: Match | null
  scoreData: number[]
  homeCodeData: number[]
  awayCodeData: number[]
}

export async function buildDetailPage(matchId: string | null, kind: 'create' | 'rebuild'): Promise<DetailPageRender> {
  const m = getMatchById(matchId) ?? pickFocusMatch()
  const safe = m ?? makeBlankMatch()
  const home = m?.home ?? 'TBD'
  const away = m?.away ?? 'TBD'
  const liveOrFt = m && (m.state === 'live' || m.state === 'ft')

  const [scoreData, homeCodeData, awayCodeData] = await Promise.all([
    liveOrFt
      ? renderScorePng(scoreText(m), SCORE_W, SCORE_H)
      : renderVsPng(SCORE_W, SCORE_H),
    renderCodePng(asciiName(home), CODE_W, CODE_H, 'home'),
    renderCodePng(asciiName(away), CODE_W, CODE_H, 'away'),
  ])

  const textContainers: TextContainerProperty[] = [
    headerTextContainer(safe),
    eventLogText(safe),
  ]
  if (m && hasShootout(m)) {
    textContainers.push(penIndicatorContainer(m))
  }
  const imageContainers: ImageContainerProperty[] = [
    codeImage('home'),
    scoreImage(),
    codeImage('away'),
  ]
  const total = textContainers.length + imageContainers.length

  const Klass = kind === 'create' ? CreateStartUpPageContainer : RebuildPageContainer
  const payload = new Klass({
    containerTotalNum: total,
    textObject: textContainers,
    imageObject: imageContainers,
  })
  return { payload, match: m, scoreData, homeCodeData, awayCodeData }
}

/* ── Layer 2 live updates ─────────────────────────────────────────────────── */

export function makeHeaderTextUpgrade(matchId: string | null): TextContainerUpgrade {
  const m = getMatchById(matchId) ?? makeBlankMatch()
  return new TextContainerUpgrade({
    containerID: ID.HEADER, containerName: NAME.HEADER,
    contentOffset: 0, contentLength: 0,
    content: headerText(m),
  })
}

export function makeEventLogUpgrade(matchId: string | null): TextContainerUpgrade {
  const m = getMatchById(matchId) ?? makeBlankMatch()
  return new TextContainerUpgrade({
    containerID: ID.EVENT_LOG, containerName: NAME.EVENT_LOG,
    contentOffset: 0, contentLength: 0,
    content: eventLogLines(m).join('\n'),
  })
}

export async function makeScoreUpdate(matchId: string | null): Promise<ImageRawDataUpdate> {
  const m = getMatchById(matchId)
  const liveOrFt = m && (m.state === 'live' || m.state === 'ft')
  const data = liveOrFt
    ? await renderScorePng(scoreText(m), SCORE_W, SCORE_H)
    : await renderVsPng(SCORE_W, SCORE_H)
  return new ImageRawDataUpdate({
    containerID: ID.SCORE, containerName: NAME.SCORE, imageData: data,
  })
}

export const DETAIL_IDS = {
  HEADER: { id: ID.HEADER, name: NAME.HEADER },
  SCORE: { id: ID.SCORE, name: NAME.SCORE },
  HOME_CODE: { id: ID.HOME_CODE, name: NAME.HOME_CODE },
  AWAY_CODE: { id: ID.AWAY_CODE, name: NAME.AWAY_CODE },
  PEN: { id: ID.PEN, name: NAME.PEN },
} as const

export const DETAIL_DIMS = {
  CODE_W, CODE_H,
} as const

/** Render a single code image on demand — used by the incremental
 * update path in main.ts so we don't rebuild the whole Layer 2 page
 * when only one of {score, home, away} actually changed. */
export async function renderCodeImage(slot: 'home' | 'away', code: string): Promise<number[]> {
  const { renderCodePng } = await import('./pngImage')
  return renderCodePng(asciiName(code), CODE_W, CODE_H, slot)
}

export function makePenIndicatorUpgrade(matchId: string | null): { containerID: number; containerName: string; contentOffset: number; contentLength: number; content: string } | null {
  const m = getMatchById(matchId)
  if (!m || !hasShootout(m)) return null
  return {
    containerID: ID.PEN, containerName: NAME.PEN,
    contentOffset: 0, contentLength: 0,
    content: asciiName(`PEN\n${m.homePenalty}-${m.awayPenalty}`),
  }
}

export { hasShootout }

/* ── Layer 1 (list) builder ───────────────────────────────────────────────── */

export interface ListPageRender {
  payload: CreateStartUpPageContainer | RebuildPageContainer
}

/* Layer 1 = today's schedule. WC max is 6 matches/day (group stage); knockout
 * days carry 1–4. "Today" = live + upcoming within next 24h. Past matches live
 * on the phone's Bracket tab — glasses stay glanceable. */
const DAY_MS = 24 * 60
function listMatches(): Match[] {
  const live = store.getLive()
  const upcomingToday = store.getUpcoming().filter(m => m.kickoffOffsetMin < DAY_MS)
  return [...live, ...upcomingToday].slice(0, 6)
}

/* Header row mirrors phone stage-as-hero: title = current bracket stage,
 * sub = live/upcoming summary for today. */
function listHeaderText(): string {
  const all = store.getAll()
  const order: Array<'QF'|'SF'|'3rd'|'F'> = ['QF', 'SF', '3rd', 'F']
  let focus: 'QF'|'SF'|'3rd'|'F' = 'F'
  for (const s of order) {
    const inStage = all.filter(m => m.stage === s)
    if (inStage.length === 0) continue
    focus = s
    if (!inStage.every(m => m.state === 'ft')) break
  }
  const title = focus === 'QF' ? 'QUARTERFINALS'
              : focus === 'SF' ? 'SEMIFINALS'
              : focus === '3rd' ? '3RD PLACE'
              : 'FINAL'
  const today = listMatches()
  const live = today.filter(m => m.state === 'live').length
  const sub = today.length === 0 ? 'No matches today'
            : live > 0 ? `${today.length} today, ${live} live`
            : `${today.length} today`
  return asciiName(`${title}    ${sub}`)
}

export function buildListPage(kind: 'create' | 'rebuild'): ListPageRender {
  /* Header text + two leveled lists: left = matchup (interactive),
   * right = status (display). Left list owns listItemEvent. */
  const items = listMatches()
  const leftNames = items.length === 0
    ? [asciiName('No matches today')]
    : items.map(m => asciiName(listLeft(m)))
  const rightNames = items.length === 0
    ? ['']
    : items.map(m => asciiName(listRight(m)))

  const header = new TextContainerProperty({
    xPosition: L1_HEAD_X, yPosition: L1_HEAD_Y, width: L1_HEAD_W, height: L1_HEAD_H,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 0,
    containerID: ID.LIST_HEADER, containerName: NAME.LIST_HEADER, isEventCapture: 0,
    content: listHeaderText(),
  })

  const leftList = new ListContainerProperty({
    xPosition: LEFT_X, yPosition: LIST_Y, width: LEFT_W, height: LIST_H,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 4,
    containerID: ID.LIST_LEFT, containerName: NAME.LIST_LEFT, isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: leftNames.length,
      itemWidth: LEFT_W - 8,
      isItemSelectBorderEn: 1,
      itemName: leftNames,
    }),
  })

  const rightList = new ListContainerProperty({
    xPosition: RIGHT_X, yPosition: LIST_Y, width: RIGHT_W, height: LIST_H,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 4,
    containerID: ID.LIST_RIGHT, containerName: NAME.LIST_RIGHT, isEventCapture: 0,
    itemContainer: new ListItemContainerProperty({
      itemCount: rightNames.length,
      itemWidth: RIGHT_W - 8,
      isItemSelectBorderEn: 0,
      itemName: rightNames,
    }),
  })

  const Klass = kind === 'create' ? CreateStartUpPageContainer : RebuildPageContainer
  const payload = new Klass({
    containerTotalNum: 3,
    textObject: [header],
    listObject: [leftList, rightList],
  })
  return { payload }
}

/* Map a list item index back to its match. Mirrors listMatches() ordering. */
export function listMatchAtIndex(idx: number): Match | null {
  const items = listMatches()
  if (idx < 0 || idx >= items.length) return null
  return items[idx]
}
