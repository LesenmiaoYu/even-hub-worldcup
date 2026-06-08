import type { Match, Stage } from '../types'
import { TEAMS } from '../mock/teams'

/* Bracket view — mobile portrait (≤480px column).
 *
 * Hybrid layout:
 *   1. Compact "mini-tree" SVG at the top showing tournament flow (glance overview).
 *   2. Section-grouped match cards below (QF · SF · FINAL · 3rd-PLACE), tap-friendly.
 *
 * The 3-column horizontal bracket from v1 cramps cells too tightly on a 375px
 * viewport — readable scores need real card width. Hybrid keeps the tree mental
 * model AND lets each cell breathe.
 *
 * All cards are tappable: data-match-id on the wrapping div, handled in mount.ts.
 */

const STAGE_LABEL: Record<Stage, string> = {
  QF:  'Quarterfinals',
  SF:  'Semifinals',
  '3rd': '3rd-Place Playoff',
  F:   'Final',
  /* Added when the iSports adapter landed — the bracket UI still focuses on
   * the late knockouts but these labels keep the Record<Stage,_> exhaustive
   * so the type stays sound. */
  GS:  'Group Stage',
  R16: 'Round of 16',
}

function hasShootout(m: Match): boolean {
  return m.homePenalty != null && m.awayPenalty != null
}

function isWinner(m: Match, side: 'home' | 'away'): boolean {
  if (m.state !== 'ft' || m.homeScore === null || m.awayScore === null) return false
  if (m.homeScore !== m.awayScore) {
    return side === 'home' ? m.homeScore > m.awayScore : m.awayScore > m.homeScore
  }
  /* Tied — decide by penalty shootout. */
  if (hasShootout(m)) {
    return side === 'home' ? m.homePenalty! > m.awayPenalty! : m.awayPenalty! > m.homePenalty!
  }
  return false
}

function stageBadge(m: Match): string {
  if (m.state === 'live') {
    return `<span class="br-live"><span class="br-live-dot"></span>LIVE ${m.minute ?? ''}'</span>`
  }
  if (m.state === 'ft') {
    return hasShootout(m)
      ? `<span class="br-meta">FT · PEN</span>`
      : `<span class="br-meta">FT</span>`
  }
  return `<span class="br-meta">SCHEDULED</span>`
}

function bracketCard(m: Match): string {
  const liveCls = m.state === 'live' ? ' br-card-live' : ''
  const doneCls = m.state === 'ft' ? ' br-card-done' : ''
  const tbd = !m.home || !m.away
  const tbdCls = tbd && m.state !== 'ft' ? ' br-card-tbd' : ''
  const home = m.home ?? 'TBD'
  const away = m.away ?? 'TBD'
  const showScores = m.state === 'ft' || m.state === 'live'
  const baseScore = showScores ? `${m.homeScore}-${m.awayScore}` : 'vs'
  /* For penalty shootouts, append "(H-A pen)" so the winning side is
   * still legible at a glance even when regulation tied. */
  const score = hasShootout(m) && m.state === 'ft'
    ? `${baseScore} <span class="br-pen">(${m.homePenalty}-${m.awayPenalty} pen)</span>`
    : baseScore
  const hWin  = isWinner(m, 'home')
  const aWin  = isWinner(m, 'away')
  const homeCls = `br-side${hWin ? ' br-win' : ''}${!m.home ? ' br-tbd' : ''}`
  const awayCls = `br-side${aWin ? ' br-win' : ''}${!m.away ? ' br-tbd' : ''}`
  const homeFlag = m.home
    ? `<img class="br-flag" src="${TEAMS[m.home]?.flag}" alt="" />`
    : `<span class="br-flag br-flag-placeholder"></span>`
  const awayFlag = m.away
    ? `<img class="br-flag" src="${TEAMS[m.away]?.flag}" alt="" />`
    : `<span class="br-flag br-flag-placeholder"></span>`

  /* Single-row layout: [flag] HOME  score  AWAY [flag]  |  badge.
   * TBD slots render as "TBD vs TBD" inline — no lineage hint above. */
  return `
    <div class="br-card${liveCls}${doneCls}${tbdCls}" data-match-id="${m.id}" role="button" tabindex="0">
      <div class="br-line">
        <div class="${homeCls}">
          ${homeFlag}
          <span class="br-code">${home}</span>
        </div>
        <span class="br-score">${score}</span>
        <div class="${awayCls} right">
          <span class="br-code">${away}</span>
          ${awayFlag}
        </div>
        <span class="br-badge">${stageBadge(m)}</span>
      </div>
    </div>
  `
}

/* Mini-tree SVG — compact overview of QF/SF/F flow.
 * Non-interactive (cards below are the tap surface). 3rd-place omitted from
 * mini-tree since it has no tournament-tree relationship with the main path.
 */
function miniTree(qfs: Match[], sfs: Match[], fin: Match | null): string {
  const VBW = 200
  const VBH = 130
  const cellW = 36
  const cellH = 16
  const colX = { qf: 4, sf: 82, f: 160 }

  const qfYs = [14, 42, 70, 98]
  const sfYs = [(qfYs[0] + qfYs[1]) / 2, (qfYs[2] + qfYs[3]) / 2]
  const fY = (sfYs[0] + sfYs[1]) / 2

  function miniCell(m: Match | null, x: number, y: number): string {
    if (!m) {
      return `
        <g class="mt-cell mt-tbd">
          <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="2"/>
          <text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle">TBD</text>
        </g>
      `
    }
    const liveCls = m.state === 'live' ? ' mt-live' : ''
    const doneCls = m.state === 'ft' ? ' mt-done' : ''
    const tbd = !m.home || !m.away
    const tbdCls = tbd && m.state !== 'ft' ? ' mt-tbd' : ''
    const hWin = isWinner(m, 'home')
    const aWin = isWinner(m, 'away')
    const winner = hWin ? m.home : aWin ? m.away : null
    const display = winner
      ? `<text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle" class="mt-winner">${winner}</text>`
      : tbd
        ? `<text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle">TBD</text>`
        : `<text x="${x + 5}" y="${y + cellH/2 + 3}">${m.home}</text>
           <text x="${x + cellW - 5}" y="${y + cellH/2 + 3}" text-anchor="end">${m.away}</text>`
    return `
      <g class="mt-cell${liveCls}${doneCls}${tbdCls}">
        <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="2"/>
        ${display}
      </g>
    `
  }

  function connector(x1: number, y1: number, x2: number, y2: number): string {
    const midX = (x1 + x2) / 2
    return `<polyline class="mt-conn" points="${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}" fill="none"/>`
  }

  const conns: string[] = []
  for (let i = 0; i < 4; i++) {
    const sfIdx = i < 2 ? 0 : 1
    conns.push(connector(
      colX.qf + cellW,
      qfYs[i] + cellH / 2,
      colX.sf,
      sfYs[sfIdx] + cellH / 2,
    ))
  }
  for (let i = 0; i < 2; i++) {
    conns.push(connector(
      colX.sf + cellW,
      sfYs[i] + cellH / 2,
      colX.f,
      fY + cellH / 2,
    ))
  }

  const labels = `
    <text x="${colX.qf + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">QF</text>
    <text x="${colX.sf + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">SF</text>
    <text x="${colX.f  + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">F</text>
  `

  return `
    <svg class="mini-tree" viewBox="0 0 ${VBW} ${VBH}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${labels}
      ${conns.join('')}
      ${qfYs.map((y, i) => miniCell(qfs[i] ?? null, colX.qf, y)).join('')}
      ${sfYs.map((y, i) => miniCell(sfs[i] ?? null, colX.sf, y)).join('')}
      ${miniCell(fin, colX.f, fY)}
    </svg>
  `
}

function sectionList(title: string, matches: Match[]): string {
  if (matches.length === 0) return ''
  return `
    <section class="br-section">
      <div class="br-section-head">
        <span class="br-section-title">${title}</span>
        <span class="br-section-count">${matches.length}</span>
      </div>
      <div class="br-cards">
        ${matches.map(bracketCard).join('')}
      </div>
    </section>
  `
}

export function renderBracketSvg(matches: Match[]): string {
  const qfs = matches.filter(m => m.stage === 'QF')
  const sfs = matches.filter(m => m.stage === 'SF')
  const fin = matches.find(m => m.stage === 'F') ?? null
  const third = matches.find(m => m.stage === '3rd')

  return `
    <div class="bracket-page">
      <div class="br-mini-wrap">
        ${miniTree(qfs, sfs, fin)}
      </div>
      ${sectionList(STAGE_LABEL.QF, qfs)}
      ${sectionList(STAGE_LABEL.SF, sfs)}
      ${fin ? sectionList(STAGE_LABEL.F, [fin]) : ''}
      ${third ? sectionList(STAGE_LABEL['3rd'], [third]) : ''}
    </div>
  `
}
