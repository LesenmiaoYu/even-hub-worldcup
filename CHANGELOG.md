# Changelog

## 2.1.0 — 2026-06-15
**Settings hamburger + open-source.**
- Language picker no longer overflows the WebView. New hamburger button next to Matches / Bracket opens a settings panel with stacked Timezone + Language rows (full-width selects, no horizontal scrolling on narrow viewports).
- Repo is now open-source under MIT. See `README.md`, `CONTRIBUTING.md`, `LICENSE`.
- New `USE_FIXTURES=true` server mode boots from a captured iSports snapshot at `server/fixtures/schedule-wc2026.json` — contributors can run the full stack without an API key.
- **Server fix (benefits all installed clients, no repack needed)**: the score now stays in sync with the goal events. iSports' `/livescores/changes` feed sometimes lags or stops emitting for a match while `/events` keeps streaming goals — the symptom was "scoreline stuck at 1-0 even though the events log shows 3 goals." We now treat the per-side goal count from the events feed as a floor on the score. `/livescores/changes` updates still win when they go higher.

## 2.0.0 — 2026-06-15
**Public release.** Same surface as 1.4.0; major bump signals "ready for the world."

## 1.4.0 — 2026-06-15
**Glasses surface fully localized + team and venue names translated.**
- 58 team names translated across EN / ZH / JA / ES (e.g. `United States` → `美国` / `アメリカ` / `Estados Unidos`)
- 19 venue names translated (e.g. `Mexico City Stadium` → `墨西哥城体育场`)
- Glasses status / kickoff / event-log strings fully localized — `FULL TIME` → `全场结束` / `試合終了` / `Final del partido`
- Glasses event chips translated — `GOAL/YEL/RED/SUB` → native equivalents
- `asciiName()` unlocked for CJK on glasses (G2 firmware renders Chinese / Japanese natively; Latin accents still stripped — `Mbappé → Mbappe`)
- Date / time formats now locale-aware (`en-US` / `zh-CN` / `ja-JP` / `es-ES`)

## 1.3.0 — 2026-06-15
**4-language i18n for phone surface + language picker.**
- New language picker in the settings strip — pick from English / 中文 / 日本語 / Español
- Default language derived from your Even Realities account country (CN/TW/HK/MO/SG → ZH, JP → JA, ES + Latin America → ES, else EN)
- All phone-side UI strings localized: tab labels, section headers, status chips, event types, detail page, toast, bracket placeholders
- Settings persist via SDK storage (survives WebView relaunch)

## 1.2.0 — 2026-06-15
**Server-side state fix + global timezone catalog.**
- **Server fix (benefits all existing installs without re-download)**: matches that iSports failed to flip from `scheduled` → `live` are now auto-promoted every 30 seconds. Closes the "kicks off in 14 hours" bug six users reported on Discord.
- Timezone catalog expanded 126 → 157 entries: new Oceania group (Sydney / Melbourne / Brisbane / Adelaide / Perth / Darwin / Hobart / Auckland / Chatham + Fiji / Papua New Guinea / Samoa / Tahiti / Guam), plus multi-zone Canada (Vancouver / Edmonton / Winnipeg / Halifax / St. John's), United States (LA / Chicago / Denver / Phoenix / Anchorage / Honolulu), Russia, Brazil, Mexico.

## 1.1.3 — 2026-06-13
**Real fix for missing live minute.**
- When iSports flips a match to live before sending the clock (USA-PAR case), the minute is now derived from kickoff elapsed time with halftime correction — no more `null` or `-` rendering. iSports' real minute overrides as soon as it arrives.

## 1.1.2 — 2026-06-13
**Cosmetic null guard.**
- `null'` no longer renders in the live badge or detail status line when iSports hasn't emitted a minute.

## 1.1.1 — 2026-06-13
**Past-kickoff matches stuck under "Upcoming".**
- Phone Matches tab and glasses L1 list now filter out matches whose kickoff is already in the past, regardless of what the server's stale `scheduled` state says.

## 1.1.0 — 2026-06-11
**Brand polish.**
- Card corner radius unified to 6px across the app
- Card-to-card spacing tightened to 5px
- Section subtitles converted to title case with brand kerning (FK Grotesk Neue, 13px, -0.39 tracking)
- Tab pill background switched to `#E4E4E4` to match the brightness slider on the Even Realities home

## 1.0.x — 2026-06-10/11
**Initial public release.**
- Live World Cup 2026 scores via Server-Sent Events, sub-second latency
- All 64 matches: Group Stage → Round of 16 → Quarterfinals → Semifinals → 3rd-Place Playoff → Final
- Glasses two-list view (matchup ↔ score / kickoff), detail page with score, status, event log
- Phone companion: matches list (Live / Upcoming / Results), bracket page, match detail with full event log
- Timezone selector with country-driven default
- Goal toast notifications
- 1.0.1: country-driven default timezone, SDK-persistent settings, page background = `#EEEEEE`
- 1.0.2: brand polish (corner radius, kerning, tab background)
