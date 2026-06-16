import { store } from '../state/store'
import { TEAMS } from '../mock/teams'
import type { Match, Stage, TeamCode } from '../types'
import { toast } from './toast'
import { renderBracketSvg } from './bracketSvg'
import { renderLocationStrip, mountLocationStrip, initSettings } from './settings'
import { liveMinute } from '../g2/format'
import { minutesUntilKickoff } from '../state/timeUntil'
import { t } from '../i18n'
import { teamNameFor } from '../i18n/teams'
import { venueNameFor } from '../i18n/venues'
import { settingsStore } from '../state/settingsStore'

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
        <div class="topbar-actions">
          <nav class="tabs" id="tabs">
            <button data-view="matches" class="active">${t('tab_matches')}</button>
            <button data-view="bracket">${t('tab_bracket')}</button>
          </nav>
          <button class="settings-btn" id="settings-btn" type="button" aria-label="Settings" aria-expanded="false">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <rect width="18" height="2" rx="1" fill="currentColor"/>
              <rect y="6" width="18" height="2" rx="1" fill="currentColor"/>
              <rect y="12" width="18" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>
      <div id="settings-panel" class="settings-panel" hidden></div>
      <main id="content"></main>
    </div>
  `
  root.addEventListener('click', onClick)
  document.addEventListener('click', onDocClick)

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
  const host = document.querySelector<HTMLElement>('#settings-panel')
  if (!host) return
  host.innerHTML = renderLocationStrip()
  mountLocationStrip(host)
}

function setSettingsOpen(open: boolean) {
  const panel = document.querySelector<HTMLElement>('#settings-panel')
  const btn = document.querySelector<HTMLButtonElement>('#settings-btn')
  if (!panel || !btn) return
  panel.hidden = !open
  btn.setAttribute('aria-expanded', open ? 'true' : 'false')
  btn.classList.toggle('active', open)
}

function onDocClick(e: Event) {
  const target = e.target as HTMLElement | null
  if (!target) return
  const panel = document.querySelector<HTMLElement>('#settings-panel')
  if (!panel || panel.hidden) return
  if (target.closest('#settings-panel') || target.closest('#settings-btn')) return
  setSettingsOpen(false)
}

function detectGoals() {
  const live = store.getLive()[0]
  if (!live) { prevLiveEventCount = 0; return }
  const goals = live.events.filter(e => e.type === 'goal')
  if (goals.length > prevLiveEventCount && prevLiveEventCount !== 0) {
    const g = goals[goals.length - 1]
    const teamCode = g.side === 'home' ? live.home : live.away
    const team = teamCode ? teamNameFor(teamCode, settingsStore.get().language) : '—'
    toast(
      t('toast_goal_title', { team }),
      t('toast_goal_body', { player: g.player ?? '', minute: g.minute }),
      { variant: 'goal' },
    )
  }
  prevLiveEventCount = goals.length
}

async function onClick(e: Event) {
  const target = e.target as HTMLElement
  if (!target) return

  const settingsBtn = target.closest<HTMLElement>('#settings-btn')
  if (settingsBtn) {
    e.stopPropagation()
    const panel = document.querySelector<HTMLElement>('#settings-panel')
    setSettingsOpen(panel?.hidden ?? true)
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
  const team = TEAMS[code]
  if (!team) return `<div class="${cls} placeholder" aria-hidden="true"></div>`
  const alt = teamNameFor(code, settingsStore.get().language) || team.name
  return `<img class="${cls}" src="${team.flag}" alt="${alt}" />`
}

/* Renders a relative "in N min / N h / N d" countdown for a match.
 * Reads kickoffAt every call — never trusts a stored offset. Returns ''
 * for past-kickoff and unknown-kickoff cases so the caller's template
 * collapses cleanly to nothing instead of "in -3 hours" or "in NaN min". */
function formatKickoffCountdown(m: Match): string {
  const min = minutesUntilKickoff(m)
  if (min == null || min < 0) return ''
  if (min < 60) return t('ui_offset_minutes', { min })
  const h = Math.round(min / 60)
  if (h < 24) return t('ui_offset_hours', { h })
  return t('ui_offset_days', { d: Math.round(h / 24) })
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
      <span class="live-badge"><span class="live-dot"></span>${liveMinute(m) ?? '-'}'</span>
      <span class="stage">${m.stage}</span>
    `
  } else if (m.state === 'ft') {
    /* FT row layout: score on row 1, 'FT · PEN · STAGE' centered on row 2.
     * Stage collapses into the meta line per spec — keeps the result info
     * on a single centered row instead of stacking across three. */
    const ftMeta = `${pen ? t('status_ft_pen') : t('status_ft')} · ${m.stage}`
    center = `
      <span class="score">${m.homeScore}-${m.awayScore}${pen ? ` <span class="row-pen">(${m.homePenalty}-${m.awayPenalty} pen)</span>` : ''}</span>
      <span class="meta">${ftMeta}</span>
    `
  } else {
    center = `
      <span class="score vs">${t('status_vs')}</span>
      <span class="meta">${formatKickoffCountdown(m)}</span>
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
      ${list.length === 0 ? `<div class="card"><div class="empty">${t('ui_no_matches')}</div></div>` : list.map(matchRow).join('')}
    </section>
  `
  return section(t('section_live'), live, live.length)
       + section(t('section_upcoming'), up, up.length)
       + (past.length > 0 ? section(t('section_results'), past, past.length) : '')
}

function renderBracket(): string {
  return renderBracketSvg(store.getAll())
}

function renderDetail(): string {
  if (!detailMatchId) return renderMatches()
  const m = store.get(detailMatchId)
  if (!m) return renderMatches()
  const home = m.home ?? t('status_tbd')
  const away = m.away ?? t('status_tbd')
  const lang = settingsStore.get().language
  const homeName = m.home ? teamNameFor(m.home, lang) : ''
  const awayName = m.away ? teamNameFor(m.away, lang) : ''
  const score = m.homeScore !== null && m.awayScore !== null ? `${m.homeScore} - ${m.awayScore}` : t('status_vs')
  const pen = m.homePenalty != null && m.awayPenalty != null
  /* Always show the PEN row; '--' placeholder until a shootout starts. */
  const penLine = `<div class="detail-pen">${t('detail_pen_prefix')} ${pen ? `${m.homePenalty}-${m.awayPenalty}` : '--'}</div>`
  const status =
    m.state === 'live' ? `<span class="live-dot"></span>${liveMinute(m) ?? '-'}' &middot; ${m.stage}` :
    m.state === 'ft' ? `${pen ? t('status_ft_pen') : t('status_ft')} &middot; ${m.stage}` :
    `${formatKickoffCountdown(m)} &middot; ${m.stage}`

  const events = m.events.length === 0
    ? `<div class="empty">${t('detail_no_events')}</div>`
    : [...m.events].reverse().map(e => {
        const teamCode = e.side === 'home' ? m.home : e.side === 'away' ? m.away : null
        const sideLabel = teamCode ? teamCode : ''
        const typeLabel =
          e.type === 'goal'   ? t('event_goal')   :
          e.type === 'yellow' ? t('event_yellow') :
          e.type === 'red'    ? t('event_red')    :
          e.type === 'ht'     ? t('event_ht')     :
          e.type === 'sub'    ? t('event_sub')    : t('event_ft')
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
    <button class="back" data-back="1">&larr; ${t('detail_back')}</button>
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
      ${m.venue ? `<div class="venue">${venueNameFor(m.venue, lang)}</div>` : ''}
      <h4>${t('detail_events_heading')}</h4>
      ${events}
    </div>
  `
}

/* Header: stage-as-hero. Title = earliest non-FT stage in bracket order
 * (Quarterfinals → Semifinals → 3rd-Place Playoff → Final); falls back to
 * the last stage if everything is FT. Sub-line is live-state aware. */
function stageNames(): Record<Stage, string> {
  return {
    QF: t('stage_qf'),
    SF: t('stage_sf'),
    '3rd': t('stage_third'),
    F: t('stage_final'),
    /* GS / R16 added with the iSports adapter — see types.ts. The order[]
     * below intentionally still drives the late-knockout focus rotation; we
     * just need these keys present for the Record<Stage,_> to be exhaustive. */
    GS: t('stage_gs'),
    R16: t('stage_r16'),
  }
}

function stageInfo(): { title: string; sub: string } {
  const all = store.getAll()
  /* Empty store (cold boot before SSE snapshot lands, or iSports
   * outage) → neutral fallback so we don't claim we're at the Final. */
  if (all.length === 0) return { title: t('ui_app_title'), sub: t('ui_awaiting_data') }
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
  const title = stageNames()[focus]

  const live = store.getLive()
  const upcoming = store.getUpcoming()
  let sub: string
  if (live.length === 1) {
    const m = live[0]
    const home = m.home ?? t('status_tbd')
    const away = m.away ?? t('status_tbd')
    sub = t('ui_one_match_live', { home, away })
  } else if (live.length > 1) {
    sub = t('ui_many_matches_live', { count: live.length })
  } else if (upcoming.length > 0) {
    sub = t('ui_next_kickoff', { offset: formatKickoffCountdown(upcoming[0]) })
  } else {
    sub = t('ui_tournament_complete')
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
