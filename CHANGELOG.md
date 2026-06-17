# Changelog

## 2.1.5 — 2026-06-17
**Tighten the live→ft reconcile window from 5 min to 90 sec.**
- `/schedule` poll cadence 5 min → 90 sec (the iSports rate-limit floor for this endpoint). Stuck-live matches now reconcile to ft within at most 90 seconds of iSports flipping their status. Server-only change; no `.ehpk` needed.

## 2.1.4 — 2026-06-17
**Group Stage no longer shows "Extra Time"; minute display no longer overshoots iSports.**
- **Bug (reported on glasses, Austria GS match):** displayed "EXTRA TIME 98 MIN" while actual play was at minute 88. Two distinct issues:
  1. **v2.1.3 regression in `liveMinute()`:** the `max(stored, derived)` change introduced yesterday overrode iSports' authoritative minute with a wall-clock-derived guess when derived ran ahead (it usually does — it doesn't know about in-match pauses, halftime length, etc.). Reverted: iSports' stored minute is now always preferred when present. Derived is the fallback only when `m.minute` is null (the boot-time window before iSports sends the clock).
  2. **Pre-existing GS labeling bug:** `statusVerbose` and `statusLabel` switched to "EXTRA TIME" / "ET" buckets when minute > 90, ignoring stage. Group Stage has NO extra time — anything past 90 is stoppage time still inside the 2nd half. Both functions are now stage-aware: GS stays on the "SECOND HALF" / "2H" label and clamps the displayed minute at 98 (90 + max plausible stoppage). Knockouts unchanged.
- **Test class added:** stage-aware status invariants. Tests pin that GS never produces an EXTRA TIME label regardless of input minute; knockouts still do.
- **Tradeoff on `liveMinute` revert:** when iSports stops emitting (the ARG-ALG case from yesterday), the minute briefly freezes at the last reported value until the 5-min `/schedule` reconcile flips state to ft. Frozen-but-correct beats ticking-but-wrong.

## 2.1.3 — 2026-06-17
**Live → FT transitions no longer get stuck. Stored derived state audit complete.**
- **Bug:** Matches stayed marked `live` for hours after the final whistle. Reported by users (ARG 3-0 ALG stuck at 126 min "live"). Root cause: iSports drops finished matches from `/livescores/changes` and we relied on it as the only state-transition source. The 12-hour `/schedule` re-hydrate was too slow to catch the divergence.
- **Fix (poll the source of truth, don't guess):** `/schedule` re-poll cadence 12h → 5 min. New `MatchStore.reconcileFromSchedule()` merges authoritative state (state, scores, kickoffAt) from each poll WITHOUT wiping in-flight events/minute. Live→ft transitions now reconcile within 5 min worst case. The original sweep stays scheduled→live only; we explicitly do NOT fabricate ft from an elapsed-time threshold (that was a candidate fix, rejected on review).
- **Client-side: `liveMinute()` no longer freezes when iSports goes silent.** Previously returned the stored `m.minute` blindly — if iSports stopped emitting at minute 82, the UI showed "82" forever. Now returns `max(stored, derived)` so the clock keeps ticking monotonically. iSports still wins when it knows about stoppage time the derived clock can't predict.
- **Full audit of every stored-derived field in `Match` done — no remaining rot risks.** Documented in `feedback_no_stored_derived_state.md`.

## 2.1.2 — 2026-06-16
**Kickoff countdown no longer freezes between server polls.**
- **Bug:** the Upcoming list (and a few other surfaces) read kickoff-time-remaining from a server-side snapshot field that was only recomputed every 12 hours when `/schedule` re-hydrated. Result: "ESP vs CPV in 10 hours" badges that hadn't moved since the morning poll.
- **Fix:** deleted the stored `kickoffOffsetMin` field. Every countdown / sort / "next match" derivation now reads `kickoffAt` (absolute ISO timestamp) and computes the offset at render time via a shared `minutesUntilKickoff()` util. 9 read sites updated (phone matches list, phone match detail, glasses header, glasses upcoming list, glasses status verbose, glasses status chip, glasses focus picker).
- **Test class added.** `test/time-invariants.test.ts` asserts the system invariant we were missing — render the same Match at time t and t+1h, the displayed countdown must drop by ~60min. The prior 362-test coverage missed the bug because every test pinned a snapshot value at one instant; nothing exercised "did the display update as time advanced." Suite is now 490 tests.

## 2.1.1 — 2026-06-15
**8 follow-up fixes from the test-coverage audit.**
- **Bracket renders TBD slots in early tournament.** `transformMatch` no longer drops knockout matches with unresolved team slots — only Group Stage drops on null teams (where null is a real data bug). R16/QF/SF/F/3rd pass through with null home/away, and the bracket UI renders them as TBD until the prior round finishes. Fixture mode now shows the full bracket structure (88 matches vs. the prior 72).
- **Bracket no longer invents winners on bad data.** `winnerOf` now returns null when regulation is tied with no penalty data, and when the penalty shootout score itself is tied (an impossible-data anomaly). Bracket slots stay TBD instead of being filled with the home team by silent default.
- **Score corrections honoured.** `applyEvent` now accepts negative or zero `scoreDelta` values — the old truthy check silently dropped them.
- **Client store consistency.** `applyDelta` for `minute` and `bracket-resolved` deltas now always fires `notify()`, even when the matchId is unknown. Matches the behaviour of `event-applied` and `reset`.
- **Server: `main()` exported.** Test code can now import `server/index.ts` without spawning the HTTP listener — the auto-boot is gated on `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **Cleanup.** Removed dead `kickOff?: number` field from `ISportsExtraExplain` (never read). Aligned `test/server-store.test.ts` `seedMatch` to the canonical `Match` shape.
- Suite expanded 476 → 480 with regression coverage for each fix.

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
