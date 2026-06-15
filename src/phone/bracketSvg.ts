import type { Match, Stage } from '../types'
import { TEAMS } from '../mock/teams'
import { settingsStore } from '../state/settingsStore'
import { t } from '../i18n'

function kickoffBadgeText(m: Match): string {
  if (!m.kickoffAt) return t('bracket_kickoff_scheduled')
  const tz = settingsStore.get().timezone
  try {
    const d = new Date(m.kickoffAt)
    const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(d).toUpperCase()
    const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: true }).format(d).replace(/\s+/g, '').toUpperCase()
    return `${date} ${time}`
  } catch { return t('bracket_kickoff_scheduled') }
}

/* When a bracket slot has no team yet, the card shows the kickoff date
 * instead of "TBD". Short M/D format keeps it tight inside the team slot
 * (e.g., "7/19"). Falls back to "TBD" only when kickoffAt isn't seeded. */
function tbdSlotLabel(m: Match): string {
  if (!m.kickoffAt) return t('status_tbd')
  const tz = settingsStore.get().timezone
  try {
    const d = new Date(m.kickoffAt)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric', day: 'numeric' }).formatToParts(d)
    const mo = parts.find(p => p.type === 'month')?.value ?? ''
    const day = parts.find(p => p.type === 'day')?.value ?? ''
    return mo && day ? `${mo}/${day}` : t('status_tbd')
  } catch { return t('status_tbd') }
}

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

function stageLabel(): Record<Stage, string> {
  return {
    QF:  t('stage_qf'),
    SF:  t('stage_sf'),
    '3rd': t('stage_third'),
    F:   t('stage_final'),
    /* Added when the iSports adapter landed — the bracket UI still focuses on
     * the late knockouts but these labels keep the Record<Stage,_> exhaustive
     * so the type stays sound. */
    GS:  t('stage_gs'),
    R16: t('stage_r16'),
  }
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
    return `<span class="br-live"><span class="br-live-dot"></span>${t('bracket_live_badge', { minute: m.minute ?? '' })}</span>`
  }
  if (m.state === 'ft') {
    return hasShootout(m)
      ? `<span class="br-meta">${t('status_ft_pen')}</span>`
      : `<span class="br-meta">${t('status_ft')}</span>`
  }
  /* Scheduled / TBD-opponent → show real kickoff date+time when available
   * (fix #4 seed adds kickoffAt to every match). Falls back to 'SCHEDULED'
   * for feeds that haven't backfilled the field. */
  return `<span class="br-meta">${kickoffBadgeText(m)}</span>`
}

function bracketCard(m: Match): string {
  const liveCls = m.state === 'live' ? ' br-card-live' : ''
  const doneCls = m.state === 'ft' ? ' br-card-done' : ''
  const tbd = !m.home || !m.away
  const tbdCls = tbd && m.state !== 'ft' ? ' br-card-tbd' : ''
  const tbdLabel = tbdSlotLabel(m)
  const home = m.home ?? tbdLabel
  const away = m.away ?? tbdLabel
  const showScores = m.state === 'ft' || m.state === 'live'
  const baseScore = showScores ? `${m.homeScore}-${m.awayScore}` : t('status_vs')
  /* For penalty shootouts, append "(H-A pen)" so the winning side is
   * still legible at a glance even when regulation tied. */
  const score = hasShootout(m) && m.state === 'ft'
    ? `${baseScore} <span class="br-pen">${t('bracket_pen_suffix', { home: m.homePenalty!, away: m.awayPenalty! })}</span>`
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

  /* Two-row layout: matchup row 1 ([flag] HOME score AWAY [flag]), badge
   * centered on row 2. Earlier single-row placed FT · PEN on the right
   * rail, which read as cramped + asymmetric next to the (3-4 pen) suffix.
   * Bottom-center keeps the result info under the score where the eye
   * already lands. */
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
      </div>
      <div class="br-badge-row">${stageBadge(m)}</div>
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
          <text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle">${t('status_tbd')}</text>
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
    const dateLabel = tbdSlotLabel(m)
    const homeLabel = m.home ?? dateLabel
    const awayLabel = m.away ?? dateLabel
    const display = winner
      ? `<text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle" class="mt-winner">${winner}</text>`
      : tbd && !m.home && !m.away
        ? `<text x="${x + cellW/2}" y="${y + cellH/2 + 3}" text-anchor="middle">${dateLabel}</text>`
        : `<text x="${x + 5}" y="${y + cellH/2 + 3}">${homeLabel}</text>
           <text x="${x + cellW - 5}" y="${y + cellH/2 + 3}" text-anchor="end">${awayLabel}</text>`
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
    <text x="${colX.qf + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">${t('bracket_col_qf')}</text>
    <text x="${colX.sf + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">${t('bracket_col_sf')}</text>
    <text x="${colX.f  + cellW/2}" y="8" class="mt-col-label" text-anchor="middle">${t('bracket_col_f')}</text>
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
  const gs    = matches.filter(m => m.stage === 'GS')
  const r16   = matches.filter(m => m.stage === 'R16')
  const qfs   = matches.filter(m => m.stage === 'QF')
  const sfs   = matches.filter(m => m.stage === 'SF')
  const fin   = matches.find(m => m.stage === 'F') ?? null
  const third = matches.find(m => m.stage === '3rd')

  /* Mini-tree is conditional: skip if EVERY QF/SF/F slot is fully TBD
   * (both opponents null) AND has no scheduled kickoffAt. Avoids rendering
   * an empty grid when the bracket has nothing to show yet. When matches
   * exist but no QF is scheduled, we swap the tree slot for a small
   * placeholder card so the page still says "bracket coming" — the
   * upcoming GS/R16 section lists below continue to render normally. */
  const treeMatches = [...qfs, ...sfs, ...(fin ? [fin] : [])]
  const hasAnyInfo = treeMatches.some(m =>
    (m.home != null && m.away != null) || !!m.kickoffAt || m.state === 'live' || m.state === 'ft'
  )
  const treeSlot = hasAnyInfo
    ? `<div class="br-mini-wrap">${miniTree(qfs, sfs, fin)}</div>`
    : (matches.length > 0
        ? `<div class="bracket-empty">
             <div class="be-title">${t('bracket_empty_title')}</div>
             <div class="be-sub">${t('bracket_empty_sub')}</div>
           </div>`
        : '')

  /* Tournament-flow order: GS → R16 → QF → SF → F → 3rd. The mini-tree
   * at top still shows only the 4-QF→2-SF→F core; GS + R16 are sectioned
   * card lists below, reusing the same bracketCard component as the
   * later rounds so the visual style stays consistent. */
  const labels = stageLabel()
  return `
    <div class="bracket-page">
      ${treeSlot}
      ${sectionList(labels.GS, gs)}
      ${sectionList(labels.R16, r16)}
      ${sectionList(labels.QF, qfs)}
      ${sectionList(labels.SF, sfs)}
      ${fin ? sectionList(labels.F, [fin]) : ''}
      ${third ? sectionList(labels['3rd'], [third]) : ''}
    </div>
  `
}
