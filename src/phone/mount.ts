import { store } from '../state/store'
import { TEAMS } from '../mock/teams'
import type { Match, Stage, TeamCode } from '../types'
import { toast } from './toast'
import { renderBracketSvg } from './bracketSvg'
import { castVote, getTallySync, getUserVote, type Side, type VoteTally } from './support'
import { renderLocationStrip, mountLocationStrip, initSettings } from './settings'

type View = 'matches' | 'bracket' | 'detail'

let mounted = false
let view: View = 'matches'
let detailMatchId: string | null = null
let prevLiveEventCount = 0

/* Phone → glasses navigation bridge. main.ts registers a listener;
 * phone fires intents on user-driven nav changes. */
export type PhoneNavEvent =
  | { type: 'enter-detail'; matchId: string }
  | { type: 'exit-detail' }
let phoneNavListener: ((e: PhoneNavEvent) => void | Promise<void>) | null = null
export function setPhoneNavListener(cb: typeof phoneNavListener) { phoneNavListener = cb }
function emitNav(e: PhoneNavEvent) { phoneNavListener?.(e) }

export function mountPhone() {
  if (mounted) return
  mounted = true
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) return
  root.innerHTML = `
    <div class="wrap">
      <header class="topbar">
        <div>
          <div class="brand" id="stage-title">&mdash;</div>
          <div class="brand-tag" id="stage-sub">&mdash;</div>
        </div>
        <nav class="tabs" id="tabs">
          <button data-view="matches" class="active">Matches</button>
          <button data-view="bracket">Bracket</button>
        </nav>
      </header>
      <div id="location-strip"></div>
      <main id="content"></main>
    </div>
  `
  root.addEventListener('click', onClick)

  /* Deep-link: #match=<id> opens straight into Detail view for that
   * match. main.ts has a mirror check that routes the glasses-side L2. */
  const hash = (typeof window !== 'undefined' && window.location?.hash) || ''
  const m = hash.match(/match=([a-z0-9_-]+)/i)
  if (m && store.get(m[1])) {
    view = 'detail'
    detailMatchId = m[1]
  }

  store.subscribe(() => detectGoals())
  void initSettings().then(() => { renderLocation(); renderPhone() })
  renderLocation()
  renderPhone()
}

function renderLocation() {
  const host = document.querySelector<HTMLElement>('#location-strip')
  if (!host) return
  host.innerHTML = renderLocationStrip()
  mountLocationStrip(host)
}

function detectGoals() {
  const live = store.getLive()[0]
  if (!live) { prevLiveEventCount = 0; return }
  const goals = live.events.filter(e => e.type === 'goal')
  if (goals.length > prevLiveEventCount && prevLiveEventCount !== 0) {
    const g = goals[goals.length - 1]
    const teamCode = g.side === 'home' ? live.home : live.away
    const team = teamCode ? TEAMS[teamCode]?.name ?? teamCode : '—'
    toast(`Goal — ${team}`, `${g.player ?? ''} ${g.minute}'`, { variant: 'goal' })
  }
  prevLiveEventCount = goals.length
}

async function onClick(e: Event) {
  const target = e.target as HTMLElement
  if (!target) return

  const voteEl = target.closest<HTMLElement>('[data-vote]')
  if (voteEl) {
    const side = voteEl.dataset.vote as Side
    const matchId = voteEl.dataset.matchId
    if (matchId && (side === 'home' || side === 'away')) {
      await onVote(matchId, side, voteEl)
    }
    return
  }

  if (target.closest('.vote-bar')) {
    /* Already voted — single-vote-per-match-per-session. Silent. */
    return
  }

  const tabBtn = target.closest<HTMLElement>('#tabs button')
  if (tabBtn?.dataset.view) {
    const v = tabBtn.dataset.view as View
    if (v === 'matches' || v === 'bracket') {
      /* Disabled tab — bracket is empty when store has no matches. */
      if ((tabBtn as HTMLButtonElement).disabled) return
      const wasDetail = view === 'detail'
      view = v
      detailMatchId = null
      syncTabs()
      renderPhone()
      if (wasDetail) emitNav({ type: 'exit-detail' })
    }
    return
  }

  const matchEl = target.closest<HTMLElement>('[data-match-id]')
  if (matchEl?.dataset.matchId) {
    detailMatchId = matchEl.dataset.matchId
    view = 'detail'
    renderPhone()
    emitNav({ type: 'enter-detail', matchId: detailMatchId })
    return
  }

  if (target.closest('[data-back="1"]')) {
    view = view === 'detail' && wasInBracket() ? 'bracket' : 'matches'
    detailMatchId = null
    syncTabs()
    renderPhone()
    emitNav({ type: 'exit-detail' })
    return
  }

}

async function onVote(matchId: string, side: Side, chipEl: HTMLElement) {
  const m = store.get(matchId)
  if (!m || (m.state !== 'live' && m.state !== 'scheduled')) return
  if (getUserVote(matchId)) return
  const wrap = chipEl.closest<HTMLElement>('.vote-wrap')
  if (wrap) wrap.classList.add('voting')
  const tally = await castVote(matchId, side)
  /* Find every render of this match's vote-wrap and swap to bar. */
  const targets = document.querySelectorAll<HTMLElement>(`.vote-wrap[data-vote-match="${matchId}"]`)
  targets.forEach((el) => {
    el.outerHTML = voteBarMarkup(m, tally, side)
  })
  const code = side === 'home' ? m.home : m.away
  toast('Vote counted', code ? `You voted ${code}.` : 'Vote recorded.')
}

function wasInBracket(): boolean {
  if (!detailMatchId) return false
  const m = store.get(detailMatchId)
  return m?.state === 'ft'
}

function syncTabs() {
  const tabs = document.querySelectorAll('#tabs button')
  const bracketEmpty = store.getAll().length === 0
  tabs.forEach((b) => {
    const el = b as HTMLButtonElement
    el.classList.toggle('active', el.dataset.view === (view === 'detail' ? 'matches' : view))
    if (el.dataset.view === 'bracket') {
      el.disabled = bracketEmpty
      el.classList.toggle('disabled', bracketEmpty)
    }
  })
}

export function rerender() { renderPhone() }

function flagImg(code: TeamCode | null | undefined, cls = 'flag'): string {
  if (!code) return `<div class="${cls} placeholder" aria-hidden="true"></div>`
  const t = TEAMS[code]
  if (!t) return `<div class="${cls} placeholder" aria-hidden="true"></div>`
  return `<img class="${cls}" src="${t.flag}" alt="${t.name}" />`
}

function formatOffset(min: number): string {
  if (min < 0) return ''
  if (min < 60) return `in ${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `in ${h}h`
  return `in ${Math.round(h / 24)}d`
}

function voteChipsMarkup(m: Match): string {
  const home = m.home ?? '?'
  const away = m.away ?? '?'
  const tbd = !m.home || !m.away
  return `
    <div class="vote-wrap chips" data-vote-match="${m.id}">
      <button class="vote-chip" data-vote="home" data-match-id="${m.id}" ${tbd ? 'disabled' : ''}>VOTE ${home}</button>
      <button class="vote-chip" data-vote="away" data-match-id="${m.id}" ${tbd ? 'disabled' : ''}>VOTE ${away}</button>
    </div>
  `
}

function voteBarMarkup(m: Match, tally: VoteTally, userSide: Side | null): string {
  const homeCode = m.home ?? '?'
  const awayCode = m.away ?? '?'
  const frozenCls = m.state === 'ft' ? ' frozen' : ''
  const pickedHome = userSide === 'home' ? ' picked' : ''
  const pickedAway = userSide === 'away' ? ' picked' : ''
  const aria = userSide ? `You voted ${userSide === 'home' ? homeCode : awayCode}` : 'Final community sentiment'
  return `
    <div class="vote-wrap bar${frozenCls}" data-vote-match="${m.id}" title="${aria}" aria-label="${aria}">
      <div class="vote-bar">
        <div class="vote-bar-side home${pickedHome}" style="width:${tally.homePct}%">
          <span class="vote-bar-label">
            ${userSide === 'home' ? '<span class="vote-dot"></span>' : ''}
            <span class="vote-pct">${tally.homePct}%</span>
            <span class="vote-code">${homeCode}</span>
          </span>
        </div>
        <div class="vote-divider"></div>
        <div class="vote-bar-side away${pickedAway}" style="width:${tally.awayPct}%">
          <span class="vote-bar-label">
            <span class="vote-code">${awayCode}</span>
            <span class="vote-pct">${tally.awayPct}%</span>
            ${userSide === 'away' ? '<span class="vote-dot"></span>' : ''}
          </span>
        </div>
      </div>
    </div>
  `
}

function voteSurface(m: Match): string {
  /* Past matches → always frozen bar (no chips). */
  if (m.state === 'ft') {
    const tally = getTallySync(m.id)
    return voteBarMarkup(m, tally, getUserVote(m.id))
  }
  /* Live / scheduled → if already voted, show bar; else show chips. */
  const userVote = getUserVote(m.id)
  if (userVote) {
    return voteBarMarkup(m, getTallySync(m.id), userVote)
  }
  return voteChipsMarkup(m)
}

function matchRow(m: Match): string {
  const home = m.home ?? '---'
  const away = m.away ?? '---'
  const homeCls = m.home ? '' : ' muted'
  const awayCls = m.away ? '' : ' muted'
  const pen = m.homePenalty != null && m.awayPenalty != null
  let center = ''
  let cls = 'row'
  if (m.state === 'live') {
    cls += ' live'
    center = `
      <span class="score">${m.homeScore}-${m.awayScore}</span>
      <span class="live-badge"><span class="live-dot"></span>${m.minute}'</span>
      <span class="stage">${m.stage}</span>
    `
  } else if (m.state === 'ft') {
    /* FT row layout: score on row 1, 'FT · PEN · STAGE' centered on row 2.
     * Stage collapses into the meta line per spec — keeps the result info
     * on a single centered row instead of stacking across three. */
    const ftMeta = `${pen ? 'FT · PEN' : 'FT'} · ${m.stage}`
    center = `
      <span class="score">${m.homeScore}-${m.awayScore}${pen ? ` <span class="row-pen">(${m.homePenalty}-${m.awayPenalty} pen)</span>` : ''}</span>
      <span class="meta">${ftMeta}</span>
    `
  } else {
    center = `
      <span class="score vs">vs</span>
      <span class="meta">${formatOffset(m.kickoffOffsetMin)}</span>
      <span class="stage">${m.stage}</span>
    `
  }
  return `
    <article class="match-card${m.state === 'live' ? ' match-card-live' : ''}">
      <div class="${cls}" data-match-id="${m.id}">
        <div class="side"><span class="code${homeCls}">${home}</span>${flagImg(m.home)}</div>
        <div class="center">${center}</div>
        <div class="side right">${flagImg(m.away)}<span class="code${awayCls}">${away}</span></div>
      </div>
    </article>
  `
}

function renderMatches(): string {
  const live = store.getLive()
  const up = store.getUpcoming()
  const past = store.getPast()  /* most-recent-first per store contract */
  const section = (title: string, list: Match[], count: number) => `
    <section class="section">
      <div class="section-head">
        <span class="section-title">${title}</span>
        <span class="section-count">${count}</span>
      </div>
      ${list.length === 0 ? '<div class="card"><div class="empty">No matches</div></div>' : list.map(matchRow).join('')}
    </section>
  `
  return section('Live', live, live.length)
       + section('Upcoming', up, up.length)
       + (past.length > 0 ? section('Results', past, past.length) : '')
}

function renderBracket(): string {
  return renderBracketSvg(store.getAll())
}

function renderDetail(): string {
  if (!detailMatchId) return renderMatches()
  const m = store.get(detailMatchId)
  if (!m) return renderMatches()
  const home = m.home ?? 'TBD'
  const away = m.away ?? 'TBD'
  const homeName = m.home ? TEAMS[m.home]?.name ?? '' : ''
  const awayName = m.away ? TEAMS[m.away]?.name ?? '' : ''
  const score = m.homeScore !== null && m.awayScore !== null ? `${m.homeScore} - ${m.awayScore}` : 'vs'
  const pen = m.homePenalty != null && m.awayPenalty != null
  /* Always show the PEN row; '--' placeholder until a shootout starts. */
  const penLine = `<div class="detail-pen">PEN ${pen ? `${m.homePenalty}-${m.awayPenalty}` : '--'}</div>`
  const status =
    m.state === 'live' ? `<span class="live-dot"></span>${m.minute}' &middot; ${m.stage}` :
    m.state === 'ft' ? `${pen ? 'FT · PEN' : 'FT'} &middot; ${m.stage}` :
    `${formatOffset(m.kickoffOffsetMin)} &middot; ${m.stage}`

  const events = m.events.length === 0
    ? '<div class="empty">No events yet</div>'
    : [...m.events].reverse().map(e => {
        const teamCode = e.side === 'home' ? m.home : e.side === 'away' ? m.away : null
        const sideLabel = teamCode ? teamCode : ''
        const typeLabel =
          e.type === 'goal'   ? 'Goal'   :
          e.type === 'yellow' ? 'Yellow' :
          e.type === 'red'    ? 'Red'    :
          e.type === 'ht'     ? 'HT'     :
          e.type === 'sub'    ? 'Sub'    : 'FT'
        const whoMarkup = e.type === 'sub' && e.playerIn
          ? `${e.player ?? ''} <span class="ev-arrow">&rarr;</span> ${e.playerIn}`
          : (e.player ?? '')
        return `
          <div class="event">
            <span class="ev-min">${e.minute}'</span>
            <span class="ev-type ${e.type}">${typeLabel}</span>
            <span class="ev-who">${sideLabel ? `<span class="ev-side">${sideLabel}</span>` : ''}${whoMarkup}</span>
          </div>
        `
      }).join('')

  return `
    <button class="back" data-back="1">&larr; Back</button>
    <div class="detail-card">
      <div class="detail-head">
        <div class="side big">
          <div class="team-line">${flagImg(m.home)}<span class="code big">${home}</span></div>
          ${homeName ? `<div class="team-name">${homeName}</div>` : ''}
        </div>
        <div class="center">
          <div class="score big">${score}</div>
          ${penLine}
          <div class="status-line">${status}</div>
        </div>
        <div class="side big right">
          <div class="team-line"><span class="code big">${away}</span>${flagImg(m.away)}</div>
          ${awayName ? `<div class="team-name">${awayName}</div>` : ''}
        </div>
      </div>
      ${m.venue ? `<div class="venue">${m.venue}</div>` : ''}
      <div class="detail-vote">${voteSurface(m)}</div>
      <h4>Events</h4>
      ${events}
    </div>
  `
}

/* Header: stage-as-hero. Title = earliest non-FT stage in bracket order
 * (Quarterfinals → Semifinals → 3rd-Place Playoff → Final); falls back to
 * the last stage if everything is FT. Sub-line is live-state aware. */
const STAGE_NAMES: Record<Stage, string> = {
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  '3rd': '3rd-Place Playoff',
  F: 'Final',
  /* GS / R16 added with the iSports adapter — see types.ts. The order[]
   * below intentionally still drives the late-knockout focus rotation; we
   * just need these keys present for the Record<Stage,_> to be exhaustive. */
  GS: 'Group Stage',
  R16: 'Round of 16',
}

function stageInfo(): { title: string; sub: string } {
  const all = store.getAll()
  /* Empty store (cold boot before SSE snapshot lands, or iSports
   * outage) → neutral fallback so we don't claim we're at the Final. */
  if (all.length === 0) return { title: 'World Cup', sub: 'Awaiting data' }
  /* Walk WC progression order. First stage that has matches AND isn't
   * fully FT wins the focus. */
  const order: Stage[] = ['GS', 'R16', 'QF', 'SF', '3rd', 'F']
  let focus: Stage = 'GS'
  for (const s of order) {
    const inStage = all.filter(m => m.stage === s)
    if (inStage.length === 0) continue
    focus = s
    if (!inStage.every(m => m.state === 'ft')) break
  }
  const title = STAGE_NAMES[focus]

  const live = store.getLive()
  const upcoming = store.getUpcoming()
  let sub: string
  if (live.length === 1) {
    const m = live[0]
    const h = m.home ?? 'TBD'
    const a = m.away ?? 'TBD'
    sub = `${h} vs ${a} live`
  } else if (live.length > 1) {
    sub = `${live.length} matches live`
  } else if (upcoming.length > 0) {
    sub = `Next kickoff ${formatOffset(upcoming[0].kickoffOffsetMin)}`
  } else {
    sub = 'Tournament complete'
  }
  return { title, sub }
}

function renderStageHeader() {
  const titleEl = document.querySelector<HTMLElement>('#stage-title')
  const subEl   = document.querySelector<HTMLElement>('#stage-sub')
  if (!titleEl || !subEl) return
  const info = stageInfo()
  titleEl.textContent = info.title
  subEl.textContent   = info.sub
}

export function renderPhone() {
  renderStageHeader()
  syncTabs()
  const content = document.querySelector<HTMLElement>('#content')
  if (!content) return
  if (view === 'detail') content.innerHTML = renderDetail()
  else if (view === 'bracket') content.innerHTML = renderBracket()
  else content.innerHTML = renderMatches()
}
