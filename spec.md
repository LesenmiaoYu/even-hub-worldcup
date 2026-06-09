# World Cup — Even Hub App Engineering Spec

- **App ID**: `com.even.worldcup`
- **Display name**: World Cup
- **Version**: `0.1.0` (manifest `app.json`)
- **Min SDK**: `0.0.10` (`@evenrealities/even_hub_sdk`)
- **Repo**: `https://github.com/LesenmiaoYu/even-hub-worldcup`
- **Project root**: `/Users/even/CLAUDE_OUTPUT/apps/even-hub-worldcup`
- **Feishu canonical**: `[Ops] WorldCup Spec.md` (doc id `EsiLducSSoIJsRx6kN8ccyIlnse`)
- **Status**: working alpha demo, push-relay backend running on Mac Mini via Tailscale

---

## 1. Overview

World Cup is a two-surface EvenHub plugin: a phone webview (Even app shell, Flutter-hosted) and a G2 glasses display. It renders the World Cup 2026 bracket — Group Stage → Round of 16 → Quarterfinals → Semifinals → Final + 3rd-place — and one live match (SF1 ARG–FRA today) as a 1s-per-minute scripted tick driven by the backend.

The runtime split is server-authoritative: a Node `http` server (`server/index.ts`, port `3001`) owns the `Match[]` store, fans out deltas over SSE, and accepts a small POST `/command` debug plane. Both the phone webview and the G2 SDK client subscribe to the same `/events` stream — there is no separate "client store" mutation path in production flow (`src/state/store.ts:applyDelta`).

Data provider is iSports REST (no native WebSocket). The adapter (`server/isports/`) is wired and tested but currently disabled by default (`ENABLE_ISPORTS=false` in `.env.example`); the in-process mock seed at `server/seed.ts:6-119` ships the demo. Switching is a one-env-var flip.

Deploy: launchd on the Mac Mini (`com.even.wc-server`) keeps the server alive at `:3001`, reachable over Tailscale. Phone+glasses bundle ships as a single `.ehpk` (`worldcup-v0.1.0.ehpk`, 400 KB) built from the same Vite project that drives the phone webview.

---

## 2. Architecture

### Component split

```
+---------------------+      +-----------------------+      +---------------------+
|  G2 glasses (LVGL)  |      |  Phone webview        |      |  iSports REST       |
|  via SDK bridge     |      |  (Even app Flutter)   |      |  api.isportsapi.com |
+----------+----------+      +-----------+-----------+      +----------+----------+
           |  SDK calls                 |  fetch + EventSource         | HTTPS poll
           |  (RebuildPageContainer,    |  (/events SSE, /command POST)| 12h/5s/60s
           |   updateImageRawData, …)   |                              |
           v                            v                              v
+--------------------------------------------------+   +---------------------------+
|  Vite-built bundle (dist/) — index.html + JS     |   |  server/isports/ adapter  |
|  src/main.ts boots both surfaces from one entry  |   |  client.ts / decode.ts /  |
|  - mountPhone()    -> phone DOM                  |   |  transform.ts / teamMap   |
|  - createStartUp() -> G2 page container          |   |  / poller.ts (3 loops)    |
|  - openServerConnection() -> SSE consumer        |   +-------------+-------------+
+----------------------+---------------------------+                 |
                       |  SSE: snapshot + delta                       v
                       v                                  +-------------------------+
              +------------------+                        |   server/state.ts       |
              |  Node http server|<--- store.applyEvent --|   MatchStore (singleton)|
              |  server/app.ts   |     store.upsertEvent  |   in-memory only        |
              |  PORT=3001       |     store.patchLivescore                         |
              +--------+---------+                        +-------------------------+
                       |   POST /command (debug)
                       v
              start_live / mbappe_goal / sub / ping
```

### SSE topology

- One stream `/events` (text/event-stream), all clients subscribe.
- On connect: server pushes `event: snapshot` with full `{ matches: Match[] }`.
- Every state mutation emits `event: delta` carrying a discriminated `Delta` payload (`server/state.ts:6-30`).
- 15s `: ping\n\n` heartbeat per client, plus `retry: 2000` so EventSource auto-reconnects on drop (`server/sse.ts:7-18`).
- No `id:` lines — clients cold-reconnect and re-hydrate from the next `snapshot`. Each `event-applied` and `reset` delta also carries the full post-change `Match` snapshot, so divergence resolves naturally.
- CORS: `Access-Control-Allow-Origin: *` (explicitly deferred to "Phase 3" lockdown, `server/app.ts:8-15`).

### Client render queue

`src/main.ts:37-56` keeps a single-slot pending entry per view kind (`'list' | 'detail'`). Store change → enqueue → coalesce to latest → flush. Layer 2 (detail) flushes through `incrementalRenderDetail` which compares against a `last` cache (`main.ts:62-79`) and only re-paints the score / home-code / away-code images when their signatures changed; full rebuild is forced on matchId change or shootout-toggle.

### iSports adapter layer

The adapter sits behind the same store interface as the mock seed. It does NOT push deltas itself — it calls `store.upsertEvent` / `store.patchLivescore`, the store fans out. Three independent setInterval pollers (`server/isports/poller.ts`):

| Loop | Endpoint | Cadence | Writes via |
|---|---|---|---|
| schedule | `GET /schedule?leagueId=1572` | 12h | `store.replaceAll(matches)` |
| livescores | `GET /livescores/changes` | 5s | `store.patchLivescore(matchId, patch)` |
| events | `GET /events` | 60s | `store.upsertEvent(matchId, ev)` |

---

## 3. Data Model

All types live in `src/types.ts` (client) and `server/types.ts` (server mirror). The two files are kept in lockstep manually.

### Team and stage

```ts
// src/types.ts
export type TeamCode =
  // CONCACAF (6)
  | 'USA' | 'MEX' | 'CAN' | 'JAM' | 'CRC' | 'PAN'
  // CONMEBOL (6)
  | 'ARG' | 'BRA' | 'URU' | 'COL' | 'ECU' | 'PAR'
  // UEFA (20)
  | 'ESP' | 'FRA' | 'ENG' | 'GER' | 'ITA' | 'NED' | 'POR' | 'BEL'
  | 'CRO' | 'SWI' | 'DEN' | 'POL' | 'AUT' | 'CZE' | 'SRB' | 'NOR'
  | 'BIH' | 'SCO' | 'SWE' | 'TUR'
  // CAF (12)
  | 'MAR' | 'SEN' | 'EGY' | 'NGA' | 'ALG' | 'TUN' | 'CMR' | 'GHA'
  | 'CIV' | 'CPV' | 'COD' | 'RSA'
  // AFC (10)
  | 'JPN' | 'KOR' | 'IRN' | 'KSA' | 'AUS' | 'QAT' | 'UAE' | 'IRQ' | 'JOR' | 'UZB'
  // OFC + playoffs (4)
  | 'NZL' | 'BOL' | 'HAI' | 'CUW';

export type Stage = 'QF' | 'SF' | '3rd' | 'F' | 'GS' | 'R16';

export type MatchState = 'scheduled' | 'live' | 'ft';

export interface Team {
  code: TeamCode;
  name: string;
  flag: string;
}
```

### Events

```ts
export type EventType = 'goal' | 'yellow' | 'red' | 'ht' | 'ft' | 'sub';
export type Side = 'home' | 'away';

export interface MatchEvent {
  eventId?: string;       // iSports dedupe key, undefined for mock-generated
  minute: number;
  type: EventType;
  side: Side | null;      // null for HT/FT meta events
  player?: string;        // OFF player on subs
  playerIn?: string;      // ON player on subs only
}
```

`playerIn` is only set when `type === 'sub'`. The shape mirrors iSports' single-event substitution model — no second event for the player coming on.

### iSports status (raw enum)

```ts
export type IsportsStatus =
  | 0 | 1 | 2 | 3 | 4 | 5    // scheduled / 1H / HT / 2H / ET / pens
  | -1                       // finished
  | -10 | -11 | -12 | -13 | -14;  // cancelled / TBD / terminated / interrupted / postponed
```

### Match

```ts
export interface Match {
  id: string;
  stage: Stage;
  home: TeamCode | null;
  away: TeamCode | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenalty: number | null;   // ONLY non-null on shootout
  awayPenalty: number | null;   // ONLY non-null on shootout
  minute: number | null;
  state: MatchState;
  kickoffOffsetMin: number;     // minutes from "now" for scheduled rows
  events: MatchEvent[];
  venue?: string;
  resolvesFrom?: { home?: string; away?: string };  // upstream match IDs
}
```

### Scripted tick (mock only)

```ts
export interface ScriptedTick {
  minute: number;
  event: MatchEvent;
  scoreDelta?: { home?: number; away?: number };
}

export interface LiveTickConfig {
  matchId: string;
  msPerMinute: number;
  script: ScriptedTick[];
}
```

`server/seed.ts:122-185` holds the SF1 ARG–FRA tick script: 1000 ms per simulated minute, scoring + cards + HT + FT.

### SSE delta

```ts
// src/state/serverClient.ts:7-30 (mirrors server/state.ts)
export type Delta =
  | { type: 'event-applied'; matchId: string; event: MatchEvent;
      scoreDelta?: { home?: number; away?: number }; match: Match }
  | { type: 'minute'; matchId: string; minute: number }
  | { type: 'bracket-resolved'; matchId: string;
      home: TeamCode | null; away: TeamCode | null }
  | { type: 'reset'; matchId: string; match: Match };

export interface SnapshotMessage { matches: Match[]; }
```

---

## 4. Glasses UI

G2 canvas: 576 × 288. Mono ER OS Green `#3CFA44` only. ASCII-sanitized via `asciiName()` (`src/g2/format.ts:92`) to avoid LVGL font fallback boxes. Two screens, switched by R1 click / phone-driven nav.

Reference mockups (PIL-rendered, deterministic):

- `docs/images/g2-layer-1.png` — Layer 1 schedule list
- `docs/images/g2-layer-2-vs.png` — Layer 2 pre-kickoff (VS placeholder)
- `docs/images/g2-layer-2-live.png` — Layer 2 live (score + minute)
- `docs/images/g2-layer-2-ft.png` — Layer 2 FT with shootout PEN block

### 4.1 Layer 1 — today's schedule (`buildListPage`, `src/g2/pageView.ts:346`)

Three containers:

| ID | Name | Type | Geometry | Notes |
|---|---|---|---|---|
| 10 | `lhead` | text | 8,8,560×28 | `listHeaderText()` — title from earliest non-FT stage in `[QF,SF,3rd,F]`; subtitle = `"{count} today, {liveCount} live"` |
| 11 | `lleft` | list | 8,48,280×232 | `listLeft(m) = "HOME vs AWAY"`; `isEventCapture=1`, selection border on |
| 12 | `lright` | list | 296,48,272×232 | `listRight(m)` — see below; `isEventCapture=0`, no selection border |

`listRight(m)` (`src/g2/format.ts:132-139`):

- live → `"LIVE {min}  H-A"`
- ft + shootout → `"FT H-A (Hp-Ap)"`
- ft → `"FT  H-A"`
- scheduled → kickoff offset label (`Kicks off in {…}`)

`listMatches()` (`pageView.ts:316-320`) = `live + upcoming` filtered to `kickoffOffsetMin < 24*60`, sliced to 6 (WC group-stage day cap). Empty state: left = `"No matches today"`, right = `""`.

### 4.2 Layer 2 — match detail (`buildDetailPage`, `src/g2/pageView.ts:205`)

| ID | Name | Type | Geometry | Notes |
|---|---|---|---|---|
| 1 | `header` | text | 8,8,420×56 | two-row: stage on row 1, verbose status on row 2; `\n` preserved by `asciiName` |
| 2 | `pen` | text | 436,8,132×44 | `"PEN\nH-A"`; included only when `hasShootout(m)` |
| 3 | `hcode` | image | 4,98,132×52 | `renderCodePng(asciiName(home), …, 'home')` (right-aligned) |
| 4 | `score` | image | 144,68,288×82 | `renderScorePng` for live/ft, `renderVsPng` otherwise |
| 5 | `acode` | image | 440,98,132×52 | `renderCodePng(…, 'away')` (left-aligned) |
| 7 | `elog` | text | 8,180,560×100 | `LOG_ROWS=3`, border w=1 color=6 radius=4 padding=8, `isEventCapture=1` |

`eventLogLines` (`pageView.ts:73-103`):

- scheduled → `Kicks off in {m|h|d}` padded to 3 rows
- live/ft → reversed `events.slice(0,3)`, each `${min}'  {chip}  {who}`; subs render `OUT > IN (side)`

### 4.3 Penalty handling

The top-right `PEN\nH-A` text container is the canonical UI signal for a shootout. `hasShootout(m)` is true when both `homePenalty` and `awayPenalty` are non-null. The block:

- builder: `penIndicatorContainer` (`pageView.ts:156-164`)
- upgrade path: `makePenIndicatorUpgrade` (`pageView.ts:294-302`)
- structural rebuild trigger: `shootoutNow !== last.shootoutPresent` → `fullRenderDetail` (`main.ts:122-126`)

PEN is NOT mixed into the header line. Header stays clean (`format.ts:44-61` comment).

`scoreText` for the score image is `"H : A"` with spaces around the colon to match EvenTimeBigPixel's pixel-grid kerning (`format.ts:63-68`).

### 4.4 Update strategy

| Trigger | API call |
|---|---|
| First mount / view switch / matchId change / shootout toggle | `bridge.createStartUpPageContainer` (boot) or `RebuildPageContainer` (re-mount) + 3× `updateImageRawData` |
| Header text drift only | `textContainerUpgrade(makeHeaderTextUpgrade)` |
| Event log delta | `textContainerUpgrade(makeEventLogUpgrade)` |
| Score image sig change | `updateImageRawData('score', …)` |
| Home/away code sig change | `updateImageRawData('hcode'/'acode', …)` |
| PEN block text change | `textContainerUpgrade(makePenIndicatorUpgrade)` |

### 4.5 Font / image pipelines

Three pipelines, all output 4-bit indexed PNG via UPNG (16 grey shades, `idx * 17` quantization → `canvasTo16IndexedPng`, `src/g2/pngImage.ts:34-51`):

**1. Score digits / colon — EvenTimeBigPixel + threshold** (`renderPixelTextPng`, `pngImage.ts:119-168`)
- FontFace loaded once (`PIXEL_FONT_LOADED`, lines 16-21).
- Sizes tried `[80, 64, 50, 40, 32]`; largest that fits `w-8`.
- `imageSmoothingEnabled=false`, baseline `alphabetic` at `y=h` (bottom-aligned, exploits typoDescender=0).
- Luminance threshold at 180 after render — restores dot-matrix gaps that browser AA filled in.

**2. VS placeholder + team codes — pixel-alphabet SVG stamping** (`renderPixelAlphabetPng`, `src/g2/pixelAlphabet.ts:134-201`)
- Parses `/fonts/even-pixel-alphabet.svg` once (`loadGlyphs`, 30-69) into `Map<char, Glyph>` of `[col,row]` cells, A–Z only.
- Auto-picks stride from `[[4,1],[3,1],[2,1],[1,1],[1,0]]` (first that fits with 4px pad).
- Per glyph: `ctx.fillRect(offX + (cursorCol+c)*stride, offY + r*stride, dot, dot)` — no font rendering, no AA stroke loss.
- `align: 'right'` for home (lean toward central score), `'left'` for away → mirror symmetry across SCORE.
- VS pinned to `{ dot: 2, gap: 1 }` so V+S match digit height (21 rows × stride 3 − 1 = 62 ≈ EvenTimeBigPixel cap height at 80px).

**3. Flags — SVG → 2× supersample → downsample → inverted greyscale** (`renderFlagPng`, `pngImage.ts:208-239`)
- Load via `<img>` (`crossOrigin='anonymous'`), draw at 2× target, downsample to target, invert (dark flag elements → bright G2 green).
- 16-shade grey preserved so adjacent stripe colors don't flatten.
- **Not used on G2 today.** Module-scope `flagCache` and `preloadFlags` exposed but never called from `main.ts` or `pageView.ts`. Flag assets are phone-only.

### 4.6 R1 input contract (`src/main.ts:194-258`)

| SDK event | View | Behaviour |
|---|---|---|
| `listEvent.CLICK_EVENT` | list | enter detail at `listMatchAtIndex(idx) ?? pickFocusMatch()` |
| `listEvent.DOUBLE_CLICK_EVENT` | list | `shutDownPageContainer(1)` (non-awaited — OS dialog can hang) |
| `sysEvent.CLICK_EVENT` (no list event) | list | enter detail at `pickFocusMatch()` |
| `sysEvent.DOUBLE_CLICK_EVENT` | list | shutdown |
| `sysEvent.DOUBLE_CLICK_EVENT` | detail | back to list |
| `FOREGROUND_ENTER_EVENT` | any | invalidate `last.matchId`, force structural rebuild |
| `SYSTEM_EXIT_EVENT` / `ABNORMAL_EXIT_EVENT` | any | noop — server owns clock |

`pickFocusMatch()` priority: live → most-recent FT with shootout → next upcoming ≤24h → first past → null.

---

## 5. Phone UI

Stack: vanilla TS, no framework. Mounted into `#app` (`src/phone/mount.ts:mountPhone`). Lives inside the Even app Flutter webview chrome.

### 5.1 Top tabs (`mount.ts:30-49`)

Two declared tabs in `#tabs`, plus an internal `'detail'` view value:

| `data-view` | Label | Default? |
|---|---|---|
| `matches` | Matches | yes |
| `bracket` | Bracket | no |
| `detail` (internal) | — | entered via row tap (`data-match-id`), exited via back button |

Detail return target: if source match was FT → `'bracket'` (`wasInBracket()`, 146-150); else `'matches'`.

Header (`#stage-title` + `#stage-sub`) populated by `renderStageHeader` / `stageInfo` (364-401). Stage names map at `mount.ts:352-362`:

```ts
const STAGE_NAMES: Record<Stage, string> = {
  QF: 'Quarterfinals', SF: 'Semifinals', '3rd': 'Third-Place Playoff',
  F: 'Final', GS: 'Group Stage', R16: 'Round of 16',
};
```

### 5.2 Debug panel (`mount.ts:44-48`, `src/phone/debug.ts`)

Three buttons in `.debug-bar`, all POST `/command`. Failure logs to console only (no toast).

| Button | `data-debug` | Command | Effect |
|---|---|---|---|
| Start live game | `start-live` | `start_live` | reset SF1 to fresh kickoff, start 1s/min tick |
| Mbappé scores | `mbappe-goal` | `mbappe_goal` | applyEvent away goal Mbappé at current minute |
| Sub (FRA) | `sub` | `sub` | applyEvent sub Mbappé → Coman (away) |

### 5.3 Matches tab (`renderMatches`, `mount.ts:270-286`)

Three sections via `section(title, list, count)`:

- **Live** — always shown, empty card if none
- **Upcoming** — always shown
- **Results** — only if `past.length > 0`

Row layout (`matchRow(m)`, 231-268): `flag · code · center · code · flag` (right code mirrored). Live rows get `.match-card-live`.

| State | Center contents |
|---|---|
| live | `H-A` score · LIVE badge with dot + minute · stage |
| ft | `H-A` score (with `(Hp-Ap pen)` if shootout) · `FT` or `FT · PEN` meta · stage |
| scheduled | `vs` placeholder · kickoff offset · stage |

### 5.4 Bracket tab (`src/phone/bracketSvg.ts:renderBracketSvg`, line 203)

Top: **mini-tree SVG** (`miniTree`, 106-186). Non-interactive, viewBox 200×130, fixed `4-QF → 2-SF → 1-F` skeleton. Each cell shows winner when resolved, both codes side-by-side otherwise, "TBD" otherwise. Polyline connectors. **3rd-place omitted** from mini-tree (no tree relationship). **R16 + GS omitted from mini-tree** (would explode the layout); they live in stage cards below.

Section card lists (`sectionList`, 188-201), ordered top-down:

```
GS · R16 · QF · SF · F · 3rd
```

`'3rd'` only renders if a `third` match exists. All sections use the same `bracketCard(m)` component (57-100):

- Single-row `[flag] HOME score AWAY [flag] | badge`
- Winner side gets `.br-win` class (driven by `isWinner` with shootout fallback, 33-43)
- Penalty matches: score reads `"H-A (Hp-Ap pen)"` via `.br-pen` span (line 69)
- Live badge `LIVE {min}'`; FT badge `FT` or `FT · PEN`; scheduled `SCHEDULED`
- Card is `role="button" tabindex="0"` with `data-match-id` → tap routes to detail

### 5.5 Detail view (`renderDetail`, `mount.ts:292-347`)

Renders when `view === 'detail' && detailMatchId`. Back button on top. Big detail-head: home flag+code, center score (`H - A` or `vs`), optional `<div class="detail-pen">PEN H-A</div>`, status line (live dot + minute + stage, or `FT · PEN` + stage, or kickoff + stage), optional venue line. Vote surface below; events feed reverse-chronological with minute, typed chip (Goal/Yellow/Red/HT/Sub/FT), and player name (or `OUT → IN` for subs).

### 5.6 Per-match support vote (`src/phone/support.ts`)

Detail-only. localStorage persistence:

- `vote.{matchId}` → `'home' | 'away'`
- `tally.{matchId}` → `"H:A"`

`seedBaseline(matchId)` (30-45): FNV-1a hash → xorshift PRNG → deterministic 100–500 baseline per side per match (no network call).

Surface (`voteSurface`, 217-229): chips if not yet voted on live/scheduled; frozen split-bar if FT or already voted.

### 5.7 Goal toast (`mount.ts:56-67`, `src/phone/toast.ts`)

Store subscription watches live-goal count delta after first non-zero baseline. Fires `toast('Goal — {team}', '{player} {min}'')` with `variant: 'goal'`. Single `.toast-host` div, `.show` animation, 2500 ms default.

### 5.8 Phone → glasses nav bridge

`setPhoneNavListener` / `emitNav` (`mount.ts:18-23`):

- `{type:'enter-detail', matchId}` (line 107, on `data-match-id` click)
- `{type:'exit-detail'}` (line 97 tab swap from detail, line 116 back button)

`main.ts:169-180` consumes: enter → `enqueueRender('detail', fullRenderDetail)`; exit → `enqueueRender('list', renderList)`.

---

## 6. Server

Pure Node `http.createServer` — no Express/Fastify. `server/index.ts` boots; `server/app.ts` defines routes; `server/state.ts` is the singleton store; `server/sse.ts` writes SSE frames; `server/seed.ts` ships the 8-match mock.

### 6.1 HTTP routes

| Method | Path | Purpose | Source |
|---|---|---|---|
| `OPTIONS *` | any | CORS preflight, 204 | `server/app.ts:144-149` |
| `GET` | `/health` | `{ ok: true, uptimeSec }` | `server/app.ts:154-156` |
| `GET` | `/events` | SSE: `snapshot` then `delta` + 15s `: ping` | `server/app.ts:158-160`, handler 52-72 |
| `POST` | `/command` | debug control plane (JSON body `{"command": "<name>"}`) | `server/app.ts:162-169`, handler 76-136 |
| any | (other) | `notFound()` → 404 `{ ok: false, error: "not_found" }` | `server/app.ts:23-25, 172` |

Boot log advertises only `/events`, `/command`, `/health` (`server/index.ts:31-33`).

### 6.2 SSE topology

Headers (`server/sse.ts:7-18`):

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
Access-Control-Allow-Origin: *
retry: 2000
```

Client lifecycle (`server/app.ts:52-72`):

1. On connect → write headers, push `event: snapshot` with `{ matches: store.getAll() }`.
2. Subscribe to store; every delta → `event: delta` payload.
3. Per-client `setInterval` 15 s heartbeat writes `: ping\n\n` (`server/app.ts:6, 60-63`).
4. On `req.close` / `req.error`: `clearInterval(heartbeat)`, remove from `heartbeats` Set, `unsub()`.

Delta variants broadcast (`server/state.ts:6-30`):

- `event-applied` — full post-change match snapshot included
- `minute` — minute-only patch
- `bracket-resolved` — `home`/`away` flip on downstream slot
- `reset` — full match snapshot (used by `replaceAll` and `startLive`)

No `id:` lines — cold reconnect re-hydrates from next snapshot. No backpressure handling: `res.write` is fire-and-forget, no `drain` waits, no per-client buffer cap.

### 6.3 Command list (POST `/command`)

All target `LIVE_TICK.matchId = "sf1"` (`server/seed.ts:122`). Body always `{"command": "<name>"}`.

| Command | Effect | Success | Failure |
|---|---|---|---|
| `ping` | no-op | 200 `{ ok: true, pong: true }` | — |
| `start_live` | `store.startLive("sf1")` — reset sf1 to fresh kickoff (state=live, minute=1, scores=0, events=[]), clear sf1 from downstream `resolvesFrom`, emit `reset`, start 1s/min tick | 200 `{ ok: true }` | 404 `match_not_found:sf1` if missing |
| `mbappe_goal` | `applyEvent` away goal Mbappé at current minute with `scoreDelta { away: 1 }` | 200 `{ ok: true }` | 409 `match_not_live` |
| `sub` | `applyEvent` sub `Mbappé → Coman` (away) at current minute | 200 `{ ok: true }` | 409 `match_not_live` |
| (other) | — | — | 400 `unknown_command:<name>` |

Malformed JSON → 400 `invalid_json`. Handler throws → 500 `internal_error` (`app.ts:165-168`).

### 6.4 State model (`server/state.ts`)

In-memory only; single `MatchStore` exported at `server/state.ts:306`. Nothing persisted to disk — restart re-runs `getInitialMatches()` (mock) or `hydrateFromIsports()` (live).

Internal fields (`server/state.ts:34-37`):

```ts
private matches: Match[];              // initialised from getInitialMatches()
private listeners: Set<DeltaListener>; // SSE subscribers
private firedTickMinutes: Set<number>; // dedup for scripted ticks
private tickHandle: setInterval | null;// at most one live tick at a time
```

Mutators and their emitted deltas:

| Method | Emits | Notes |
|---|---|---|
| `applyEvent(matchId, ev, scoreDelta?)` | `event-applied` + optional `bracket-resolved` | on `ft` calls `stopTick()` **before** `resolveBracket()` (explicit, `:62-64`) |
| `setMinute(matchId, n)` | `minute` | |
| `replaceAll(matches)` | one `reset` per match | blow-away reseed (used by iSports schedule poll) |
| `upsertEvent(matchId, ev)` | `event-applied` | dedups by `event.eventId` (iSports events feed owns timeline) |
| `patchLivescore(matchId, patch)` | `minute` or `reset` (+ optional `bracket-resolved`) | minute-only changes → `minute`; everything else → `reset` |
| `startLive(matchId)` | `reset` | also clears downstream `resolvesFrom`, starts scripted tick |
| `resolveBracket(finishedMatchId)` | `bracket-resolved` | walks all matches, fills `home`/`away` of any whose `resolvesFrom` points at finished id |
| `winnerOf(matchId)` | — | by score; tied → penalty comparison; falls back to `home` |
| `startTick(matchId)` / `stopTick()` | (drives `applyEvent` / `setMinute`) | 1000 ms per simulated minute (`server/seed.ts:123`), only `LIVE_TICK.matchId` |

`emit()` (`:294-303`) try/catches each listener so one bad SSE client cannot poison the broadcast.

### 6.5 Seeding (mock, `server/seed.ts:6-119`)

8 matches, hardcoded port from `src/mock/tournament.ts`:

| ID | Stage | Teams | State |
|---|---|---|---|
| `qf1` | QF | ARG–NED | ft |
| `qf2` | QF | FRA–ENG | ft |
| `qf3` | QF | BRA–GER | ft |
| `qf4` | QF | ESP–POR (PK 3-4) | ft, shootout |
| `sf1` | SF | ARG–FRA | ft (target of `start_live`) |
| `sf2` | SF | BRA–POR | scheduled |
| `third` | 3rd | NED–GER | scheduled |
| `final` | F | ARG–?? | scheduled, `resolvesFrom: { home: 'sf1', away: 'sf2' }` |

Bracket projection comes from hardcoded `resolvesFrom` on `final` (the only bracket-edge seed). `resolveBracket()` only fills downstream when an upstream hits FT.

### 6.6 Port + bind + CORS

- **Port**: `PORT` env, default `3001` (`server/index.ts:5`).
- **Bind**: `handle.server.listen(PORT, ...)` no host arg → Node defaults to all interfaces (`::` / `0.0.0.0`). README phrasing "binds to `:3001`" is display only; socket is LAN-reachable. Mac Mini exposure is via Tailscale to `claw`.
- **CORS**: `Access-Control-Allow-Origin: *`, `Methods: GET, POST, OPTIONS`, `Headers: Content-Type` (`server/app.ts:8-15`). Applied via `applyCors` in `sendJson` + on OPTIONS preflight. SSE response stamps `Access-Control-Allow-Origin: *` directly in its header block (`server/sse.ts:13`). Lockdown explicitly deferred to "Phase 3".

### 6.7 Concurrency posture (informal 500-client target)

What enables it:

- Pure Node `http.createServer` + non-blocking writes — no per-request thread.
- Single in-memory `MatchStore`; `emit()` is a tight `for…of` over `Set<DeltaListener>`.
- `structuredClone` only on broadcast payload, then same object goes to every SSE client.
- Per-listener try/catch — one slow client cannot poison fan-out.
- Heartbeat 15 s per client → ~33 timer fires/sec at 500 clients.
- Cleanup on `req.close` + `req.error` — dead clients do not accumulate.

What still threatens it:

- `res.write` fire-and-forget; no `drain` waits, no per-client buffer cap.
- No `maxHeadersCount` / `keepAliveTimeout` tuning.
- `firedTickMinutes` / `tickHandle` are process-singletons — only one match can tick at a time. Fine for sf1-only demo, would need rework for parallel live matches.
- All clients share one `*` CORS policy and one auth-free `/command` plane — no rate limiting.
- Mac Mini default `ulimit -n` is 256; would need raising externally to sustain 500 SSE sockets.

---

## 7. iSports Adapter

Lives at `server/isports/`. Disabled by default (`ENABLE_ISPORTS=false`). When enabled, `server/index.ts:19-25` runs `hydrateFromIsports(store)` before `listen()` then `startIsportsPollers(store)`.

### 7.1 Layout

| File | Lines | Purpose |
|---|---|---|
| `client.ts` | 127 | typed HTTP wrappers |
| `decode.ts` | 155 | pure enum → string-union decoders |
| `transform.ts` | 267 | raw row → internal `Match` / `MatchEvent` |
| `teamMap.ts` | 196 | name + id → FIFA-3 `TeamCode` |
| `poller.ts` | 191 | hydrate + 3 setInterval loops |
| `index.ts` | 48 | barrel re-exports |

### 7.2 API client (`client.ts`)

- Base URL `http://api.isportsapi.com/sport/football` — plain HTTP, not HTTPS.
- Auth: query param `api_key=<key>`, read from `process.env.ISPORTS_API_KEY` on every call (so post-import dotenv works); throws synchronously if unset.

| Method | Endpoint |
|---|---|
| `getLivescores()` | `GET /livescores` |
| `getLivescoresChanges()` | `GET /livescores/changes` |
| `getEvents()` | `GET /events` |
| `getSchedule({leagueId?, date?})` | `GET /schedule?…` |
| `getTeam(teamId)` | `GET /team?teamId=…` |
| `getLeague()` | `GET /league` |

Not in tier (returns `code=2 "haven't purchased"`, `client.ts:12-13`): `/livescore` singular, `/lineup`, `/competition`, `/odds`.

Retry / timeout: **none**. No `AbortController`, no backoff, no jitter. Network failure → throws `iSports fetch failed for <path>: <msg>`. Non-2xx → throws `iSports HTTP <status>`. `code !== 0` (application error) → does NOT throw; returns envelope so caller decides.

### 7.3 Status decode (`decode.ts:32-53`)

```ts
function decodeStatus(status: number): 'scheduled' | 'live' | 'ft' | 'cancelled'
```

| iSports code | Meaning | Internal |
|---|---|---|
| `0` | not started | `scheduled` |
| `-11` | TBD | `scheduled` |
| `1` | first half | `live` |
| `2` | half time | `live` |
| `3` | second half | `live` |
| `4` | extra time | `live` |
| `5` | penalty shootout | `live` |
| `-1` | finished (incl. after-ET / after-shootout) | `ft` |
| `-10` | cancelled | `cancelled` (sentinel) |
| `-12` | terminated | `cancelled` |
| `-13` | interrupted | `cancelled` |
| `-14` | postponed | `cancelled` |
| (other) | unknown | `cancelled` (safe default) |

`'cancelled'` is a sentinel string, NOT a `MatchState`. `transformMatch` returns `null` for cancelled (`transform.ts:222-223`).

Note: status=5 (shootout in progress) collapses to `'live'` in the 3-state model — UI cannot distinguish from regular play (`transform.ts:204-207`).

### 7.4 Event decode (`decode.ts:85-96`)

```ts
function decodeEventType(type: number): EventType | null
```

| iSports type | Meaning | Internal |
|---|---|---|
| `1` | goal | `goal` |
| `2` | red card | `red` |
| `3` | yellow card | `yellow` |
| `4` | (unused; earlier guess of "sub" was wrong) | `null` |
| `7` | penalty scored | `goal` |
| `8` | own goal | `goal` |
| `9` | second yellow → red | `red` |
| `11` | substitution | `sub` |
| `13` | penalty missed | `null` (dropped) |
| `14` | VAR review | `null` (dropped) |
| `0` / other | unknown | `null` (dropped) |

Authority: iSports docs page id=15, cached at `server/isports-docs.txt` (`decode.ts:58-60`). Tests pin all of these including the `decodeEventType(4) === null` guard (`test/isports-decode.test.ts:40-57`).

`ht` / `ft` are NOT iSports event types — derived from match-record status flips (`decode.ts:82-84`).

### 7.5 Stage decode (`decode.ts:120-154`)

| `round` (case-insensitive) | Stage |
|---|---|
| `group stage` | `GS` |
| `1/8 final`, `round of 16` | `R16` |
| `quarterfinals`, `quarter-finals`, `quarter finals` | `QF` |
| `semifinal`, `semifinals`, `semi-finals` | `SF` |
| `finals`, `final` | `F` |
| `third runner`, `3rd place play-off`, `3rd-place playoff`, `third place playoff` | `3rd` |
| `1/16final`, `1/16 final`, `round of 32` | `null` (dropped — no slot in `Stage` union) |
| (other) | `null` |

Fixture distribution (`server/fixtures/schedule-wc2026.json`, 104 rows): 72× Group stage, 16× 1/16Final (R32, dropped), 8× 1/8 Final, 4× Quarterfinals, 2× Semifinal, 1× Third runner, 1× Finals.

### 7.6 Sub parser (`transform.ts:115-168`)

**Arrow form** (canonical, per docs id=15):

```
/^\s*(.+?)\s*↑\s*(.+?)\s*↓\s*$/
```

- Group 1 = up-arrow side = `playerIn` (coming ON)
- Group 2 = down-arrow side = `player` (coming OFF)
- Arrows are U+2191 / U+2193

**Paren fallback** (defensive, anomalous data):

```
/^\s*(.+?)\s*\(Assists?:\s*(.+?)\s*\)\s*$/i
```

- Group 1 → `player` (off), Group 2 → `playerIn` (on)

If neither matches: raw `playerName` → `player` as-is, `assistPlayerName` (if any) → `playerIn` (`transform.ts:165-167`). Only runs when `safeType === 'sub'` (iSports type=11).

### 7.7 Goal-with-assist parser (`transform.ts:170-173`)

No dedicated split. iSports format is `"Scorer(Assist:Assister)"` — the adapter **keeps the full string intact** in `out.player`. UI side strips if needed (`transform.ts:101-103`). `assistPlayerName` is rarely populated and is not consulted on goal events.

### 7.8 Match transform extras

| Field | Rule | Source |
|---|---|---|
| `minute` (event) | overtime takes precedence if non-zero (a 95+ goal stays "95"); else baseMinute; else 0 | `transform.ts:136-140` |
| `side` (event) | `homeEvent===true` → `'home'`; `===false` → `'away'`; null → `null` | `transform.ts:129-133` |
| `homeScore`/`awayScore` | scheduled → both `null`; live/ft → `?? 0` | `transform.ts:234-245` |
| `homePenalty`/`awayPenalty` | non-null only if `extraExplain.penHomeScore \|\| penAwayScore` truthy | `transform.ts:234-245` |
| `minute` (Match) | scheduled `null`; live `extraExplain.minute` (or null if 0); ft `null` | `transform.ts` |
| `kickoffOffsetMin` | hardcoded `0` (iSports doesn't supply this) | `transform.ts:259-261` |
| `venue` | from `raw.location` if present | `transform.ts:264` |

### 7.9 Team mapping (`teamMap.ts`)

Two tables, lookup order id-first then name fallback (`transform.ts:79-86`):

- `TEAM_ID_TO_CODE` (`teamMap.ts:133-195`) — 48 numeric iSports team IDs → FIFA-3 code, harvested from `schedule-wc2026.json` on 2026-06-08.
- `TEAM_NAME_TO_CODE` (`teamMap.ts:41-126`) — 58 codes × multiple variants, normalised by `normaliseTeamName` (trim, collapse whitespace, lowercase; no diacritic strip — known gap).

Full 58-code coverage by confederation:

| Confederation | Count | Codes |
|---|---|---|
| CONCACAF | 6 | USA, MEX, CAN, JAM, CRC, PAN |
| CONMEBOL | 6 | ARG, BRA, URU, COL, ECU, PAR |
| UEFA | 20 | ESP, FRA, ENG, GER, ITA, NED, POR, BEL, CRO, SWI, DEN, POL, AUT, CZE, SRB, NOR, BIH, SCO, SWE, TUR |
| CAF | 12 | MAR, SEN, EGY, NGA, ALG, TUN, CMR, GHA, CIV, CPV, COD, RSA |
| AFC | 10 | JPN, KOR, IRN, KSA, AUS, QAT, UAE, IRQ, JOR, UZB |
| OFC + playoffs | 4 | NZL, BOL, HAI, CUW |

10 codes added on top of the original 48 mock nations for the iSports projection: **BIH, CPV, CUW, COD, JOR, SCO, RSA, SWE, TUR, UZB** (`teamMap.ts:18-25`). Codes like ITA/DEN/POL/SRB/CMR/NGA/IRN/KSA/UAE/BOL/CRC/JAM stay mapped for future draws even though iSports' current projection does not include them.

### 7.10 Poller (`poller.ts`)

Three independent setInterval loops, all wrapped in `safePoll` that never throws past the interval boundary (`poller.ts:74-86`).

| Loop | Endpoint | Interval | Purpose | Const |
|---|---|---|---|---|
| schedule | `GET /schedule?leagueId=1572` | 12 h (43,200,000 ms) | re-hydrate full bracket; picks up draw resolutions | `SCHEDULE_POLL_MS` (`poller.ts:35`) |
| livescores | `GET /livescores/changes` | 5 s (5,000 ms) | patch score/state/minute on existing matches; ignores unknown matchIds | `LIVESCORES_POLL_MS` (`poller.ts:36`) |
| events | `GET /events` | 60 s (60,000 ms) | append new events to known matches | `EVENTS_POLL_MS` (`poller.ts:37`) |

- Events dedupe key: `eventId` via `store.upsertEvent(matchId, ev)` (`poller.ts:147-149`).
- SSE delta trigger is in the store, not the poller. The poller calls `store.patchLivescore` / `store.upsertEvent`; the store fans out.
- `transformMatch` invoked with `{ leagueId: '1572' }` on hydrate and livescores → non-WC rows from the global `/livescores/changes` feed are pre-dropped (`poller.ts:111`).
- `pollEvents` only feeds events into matches already in the store (`poller.ts:145`).
- `code !== 0` on hydrate → throws (`poller.ts:48-52`); on poll loops → warns + returns (`poller.ts:101-107, 136-139`).
- No backoff after failures — every interval retries on its fixed cadence.

### 7.11 leagueId filter

- `LEAGUE_ID = '1572'` (`poller.ts:34`) — FIFA World Cup 2026.
- Used in: hydrate (`poller.ts:47, 58`), livescores poll (`poller.ts:111`), implicitly skipped for events (events feed is global, filtered indirectly by "match must already be in store").
- Filter: `transformMatch(raw, { leagueId: '1572' })` → `if (opts.leagueId && raw.leagueId !== opts.leagueId) return null` (`transform.ts:220`). Strict string equality.

### 7.12 ENV vars

| Var | Default | Behaviour |
|---|---|---|
| `ISPORTS_API_KEY` | (none) | Read on every call (`client.ts:36-45`). Throws if unset. Lazy read so dotenv loaders that run after module import still work. `.env.example:5` ships `your_key_here`. |
| `ENABLE_ISPORTS` | `false` | Truthy: `'true'`, `'1'`, `'yes'` (case-insensitive, trimmed). Falsy → mock seed. Truthy → `await hydrateFromIsports(store)` + `startIsportsPollers(store)`. (`server/index.ts:11-25`) |
| `PORT` | `3001` | `Number(process.env.PORT ?? 3001)` (`server/index.ts:5`). |

Nothing in this code loads dotenv directly — the `tsx --env-file-if-exists=.env` flag in the npm script and launchd plist handles it.

### 7.13 Match coverage today

Filter cascade applied to `server/fixtures/schedule-wc2026.json` (104 rows):

| Filter | Surviving | Dropped |
|---|---|---|
| Total schedule rows | 104 | — |
| `leagueId === '1572'` | 104 | 0 |
| Status not cancelled (all `0` in schedule fixture) | 104 | 0 |
| Stage decoded (drops 16× `1/16Final` = R32) | 88 | 16 |
| Both teams resolve to `TeamCode` | **72** | 16 |

**Real coverage: 72 of 104 (69%) hydrate cleanly. All 72 are group-stage; zero knockouts.**

The 32 drops:

- **16 at stage filter** — all `1/16Final` (R32) matches. `decodeStage` returns `null` because there is no `R32` slot in the `Stage` union.
- **16 at team-mapping filter** — every knockout match from `1/8 Final` onward. iSports stores bracket placeholders (`"73 WIN"`, `"101 loser"`, …, team IDs in 73–102 range) until the draw resolves. None exist in `TEAM_ID_TO_CODE` or `NAME_VARIANTS`, so `resolveTeam` returns `null`.

Unmapped placeholders observed: `73 WIN`, `74 WIN`, …, `100 WIN`, `101 WIN`, `102 WIN`, `101 loser`, `102 loser` (32 distinct strings across 16 KO matches).

KO will hydrate automatically once iSports replaces placeholders with real team IDs/names (schedule poll picks them up, no code change needed). R32 stays dropped until either `Stage` gains `R32` or `decodeStage` is extended.

---

## 8. Build & Test & Deploy

### 8.1 Runtime dependencies (`package.json:28-31`)

| Package | Version | Purpose |
|---|---|---|
| `@evenrealities/even_hub_sdk` | ^0.0.10 | G2 SDK bridge |
| `upng-js` | ^2.1.0 | PNG encode for glasses images |

No HTTP framework dep — server uses Node built-in `http`.

### 8.2 Dev dependencies (selected, `package.json:15-26`)

| Package | Version |
|---|---|
| `vite` | ^8.0.12 |
| `vitest` | ^4.1.8 |
| `tsx` | ^4.19.2 |
| `typescript` | ^5.9.3 |
| `@evenrealities/evenhub-cli` | ^0.1.13 |
| `@evenrealities/evenhub-simulator` | ^0.7.3 |
| `concurrently` | ^9.1.2 |
| `happy-dom` | ^20.10.2 |
| `playwright` | ^1.60.0 |
| `flag-icons` | ^7.5.0 |
| `@types/node` | ^22.10.5 |

### 8.3 npm scripts (`package.json:6-14`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | frontend dev server (proxies SSE+command to :3001) |
| `build` | `tsc && vite build` | typecheck then production bundle |
| `preview` | `vite preview` | serve built dist locally |
| `server` | `tsx watch --env-file-if-exists=.env server/index.ts` | push-relay backend on :3001 with hot reload |
| `dev:all` | `concurrently -n vite,server 'npm:dev' 'npm:server'` | both in one terminal |
| `test` | `vitest run` | one-shot test suite |
| `test:watch` | `vitest` | watch mode |

### 8.4 Vite proxy (`vite.config.ts:8-19`)

Dev-only proxy forwards two paths to `http://localhost:3001`:

- `/events` — SSE stream (changeOrigin: true, native SSE passthrough — no buffering)
- `/command` — POST command channel (changeOrigin: true)

Production assumes both paths are exposed on the same origin as the static bundle.

### 8.5 Test suite (`vitest run`)

**9 files passed, 129 tests passed, 0 failures, 0 skips. Duration ~628 ms.**

`vitest.config.ts:14` matches `test/client-*.test.ts` to happy-dom; everything else runs in Node. `fileParallelism: false` to avoid HTTP-listener / fake-timer cross-contamination.

| File | Lines | Scope |
|---|---|---|
| `test/client-store-sse.test.ts` | 151 | happy-dom env, mock EventSource — client store ↔ SSE round-trip |
| `test/format.test.ts` | 216 | `src/g2/format.ts` formatters |
| `test/isports-client.test.ts` | 133 | HTTP client error model, code-handling |
| `test/isports-decode.test.ts` | 101 | status / event / stage decoders |
| `test/isports-transform.test.ts` | 247 | raw row → `Match` / `MatchEvent` |
| `test/scenarios.test.ts` | 82 | end-to-end behaviours |
| `test/server-http.test.ts` | 236 | HTTP routes + SSE handshake |
| `test/server-state.test.ts` | 177 | `MatchStore` mutators + delta emission |
| `test/store.test.ts` | 202 | client `Store` apply + subscribe |
| **Total** | **1545** | |

### 8.6 Build output

Exit 0. `vite v8.0.14`, 37 modules transformed, ~124 ms.

| Asset | Size | Gzip |
|---|---|---|
| `dist/index.html` | 0.80 kB | 0.41 kB |
| `dist/assets/index-*.css` | 17.65 kB | 4.01 kB |
| `dist/assets/pngImage-BWBG0aRh.js` | 0.07 kB | 0.08 kB |
| `dist/assets/pngImage-Da--KlP3.js` | 67.74 kB | 22.98 kB |
| `dist/assets/index-Chp31rho.js` | 97.28 kB | 36.84 kB |

Main bundle ~98 kB raw / ~37 kB gzip. No warnings.

### 8.7 Mac Mini launchd plist (`/tmp/com.even.wc-server.plist`)

| Key | Value |
|---|---|
| `Label` | `com.even.wc-server` |
| `ProgramArguments` | `/bin/bash -lc 'cd /Users/davidbot/CLAUDE_OUTPUT/apps/even-hub-worldcup && exec node --env-file-if-exists=.env node_modules/.bin/tsx server/index.ts'` |
| `WorkingDirectory` | `/Users/davidbot/CLAUDE_OUTPUT/apps/even-hub-worldcup` |
| `RunAtLoad` | `true` |
| `KeepAlive` | `SuccessfulExit=false`, `Crashed=true` (relaunch on crash, not on clean exit) |
| `ThrottleInterval` | `10` (seconds between restarts) |
| `StandardOutPath` | `/Users/davidbot/Library/Logs/wc-server.log` |
| `StandardErrorPath` | `/Users/davidbot/Library/Logs/wc-server.err.log` |
| `SoftResourceLimits.NumberOfFiles` | `4096` (SSE fan-out headroom) |

Bash login shell wrapper inherits PATH/Node; `exec` so launchd tracks the node PID directly.

Current state: PID 58227, last exit 0, running. `/health` returns `{"ok":true,"uptimeSec":60395}` (~16.8 h uptime). Logs show iSports polling healthy (101–1699 ms per poll) — adapter has been left on for soak.

### 8.8 .ehpk packaging

No npm script wraps packaging. `@evenrealities/evenhub-cli ^0.1.13` is a devDep but not wired into any `npm run`. Workflow: manual `npx evenhub pack` (per `everything-evenhub:cli-reference`).

One prebuilt artifact at root: **`worldcup-v0.1.0.ehpk` (400 KB, dated 2026-06-08 19:30)**.

`app.json` manifest: `package_id=com.even.worldcup`, `version=0.1.0`, `min_sdk_version=0.0.10`, `entrypoint=index.html`, no permissions declared, EN-only.

### 8.9 Git/GitHub

- Remote: `origin https://github.com/LesenmiaoYu/even-hub-worldcup.git` (fetch + push)
- Last commit: `2dea824 Initial commit: World Cup Even Hub demo app`
- Working tree: 1 modified file uncommitted — `src/phone/bracketSvg.ts` (today's GS + R16 section additions)

### 8.10 Asset pipeline scripts

- `scripts/copy-flags.sh` — copies 58 FIFA→ISO flag pairs out of `node_modules/flag-icons/flags/4x3/` into `public/flags/`. Confederation breakdown: CONCACAF 6, CONMEBOL 6, UEFA 20, CAF 12, AFC 10, OFC + playoffs 4.
- `scripts/render-g2-mockups.py` — 321 lines, PIL-based, renders 3 deterministic PNG mockups (Layer 1 schedule + 2 Layer 2 variants) into `docs/images/` using bundled pixel fonts.

---

## 9. File Map

```
even-hub-worldcup/
├── app.json                                 # EvenHub manifest (com.even.worldcup, v0.1.0)
├── index.html                               # Vite entrypoint
├── package.json                             # npm scripts, deps
├── vite.config.ts                           # /events + /command proxy to :3001
├── vitest.config.ts                         # happy-dom for client tests, node otherwise
├── tsconfig.json
├── worldcup-v0.1.0.ehpk                     # prebuilt package (400 KB)
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── flags/                               # 58 FIFA-3 SVGs (alg.svg … uzb.svg)
│   └── fonts/
│       ├── even-pixel-alphabet.svg         # A–Z atlas (3460×3340 viewBox, 20×20 rects on 30px stride)
│       ├── EvenTimeBigPixel.ttf            # 14 KB — score digits + colon
│       ├── FKGroteskNeue.ttf               # 195 KB — phone styling (loaded via CSS)
│       ├── EvenRosterGrotesk.otf           # 131 KB — present but not currently loaded by JS
│       └── EvenSignature.otf               # 15 KB — present but not currently loaded by JS
│
├── src/
│   ├── main.ts                              # entry: mountPhone + SDK bridge + render queue + SSE bootstrap
│   ├── style.css                            # phone + (some) shared styles
│   ├── types.ts                             # client-side type contracts (mirrors server/types.ts)
│   ├── env.d.ts
│   │
│   ├── g2/
│   │   ├── pageView.ts                      # buildListPage + buildDetailPage; container builders
│   │   ├── format.ts                        # asciiName, scoreText, listLeft/listRight, status strings
│   │   ├── pngImage.ts                      # renderPixelTextPng + renderScorePng + renderVsPng + renderFlagPng + canvasTo16IndexedPng
│   │   └── pixelAlphabet.ts                 # SVG glyph atlas parser + renderPixelAlphabetPng
│   │
│   ├── mock/
│   │   └── tournament.ts                    # 8-match bracket seed (mirrored to server/seed.ts)
│   │
│   ├── phone/
│   │   ├── mount.ts                         # mountPhone, tabs, renderMatches, renderDetail, nav bridge
│   │   ├── bracketSvg.ts                    # renderBracketSvg, miniTree, sectionList (GS+R16+QF+SF+F+3rd)
│   │   ├── support.ts                       # localStorage vote/tally, seedBaseline (FNV-1a + xorshift)
│   │   ├── toast.ts                         # single .toast-host, goal variant
│   │   ├── dialog.ts                        # confirm/alert helpers (exported but unused; vestigial)
│   │   └── debug.ts                         # debug-bar handlers → postCommand
│   │
│   └── state/
│       ├── store.ts                         # client Store: applyDelta switch + subscribe/notify
│       └── serverClient.ts                  # openServerConnection (EventSource on /events) + postCommand
│
├── server/
│   ├── index.ts                             # boot: ENABLE_ISPORTS gate → hydrateFromIsports + pollers
│   ├── app.ts                               # http.createServer, routes (/events /command /health), CORS
│   ├── sse.ts                               # SSE frame writer, headers, retry: 2000
│   ├── state.ts                             # MatchStore singleton, mutators, emit() fan-out
│   ├── seed.ts                              # 8-match bracket + LIVE_TICK scripted ticks
│   ├── types.ts                             # server-side mirror of src/types.ts
│   ├── README.md                            # server-side notes
│   ├── isports-docs.txt                     # cached iSports docs page id=15
│   ├── isports-docs.json                    # parsed iSports docs
│   │
│   ├── isports/
│   │   ├── client.ts                        # typed HTTP wrappers (api.isportsapi.com/sport/football)
│   │   ├── decode.ts                        # decodeStatus / decodeEventType / decodeStage
│   │   ├── transform.ts                     # raw row → Match / MatchEvent; sub parser; goal-assist passthrough
│   │   ├── teamMap.ts                       # TEAM_ID_TO_CODE (48) + TEAM_NAME_TO_CODE (58)
│   │   ├── poller.ts                        # hydrateFromIsports + 3 setInterval loops
│   │   └── index.ts                         # barrel re-exports
│   │
│   └── fixtures/
│       ├── schedule-wc2026.json             # 104 rows
│       ├── livescores.json
│       ├── livescores-changes.json
│       ├── events.json
│       └── leagues.json
│
├── test/
│   ├── client-store-sse.test.ts             # happy-dom: mock EventSource ↔ Store
│   ├── format.test.ts                       # G2 formatters
│   ├── isports-client.test.ts               # HTTP error model
│   ├── isports-decode.test.ts               # decoder enums
│   ├── isports-transform.test.ts            # row → Match
│   ├── scenarios.test.ts                    # behavioural
│   ├── server-http.test.ts                  # routes + SSE handshake
│   ├── server-state.test.ts                 # MatchStore mutators
│   └── store.test.ts                        # client Store apply/subscribe
│
├── scripts/
│   ├── copy-flags.sh                        # 58 FIFA→ISO flag copies from flag-icons
│   └── render-g2-mockups.py                 # PIL deterministic mockups → docs/images/g2-*.png
│
└── docs/
    └── images/
        ├── g2-layer-1.png                   # Layer 1 schedule (mockup)
        ├── g2-layer-2-vs.png                # Layer 2 pre-kickoff
        ├── g2-layer-2-live.png              # Layer 2 live with score
        └── g2-layer-2-ft.png                # Layer 2 FT with PEN block
```

---

## 10. Roadmap / Known Gaps

### 10.1 iSports coverage

- **R32 entirely invisible** (16 matches). `Stage` union has no `R32` slot, so `decodeStage` returns `null` for `1/16Final` rows. Needs a product decision: extend `Stage` vs collapse R32 into R16 vs continue to hide.
- **KO team placeholders not handled.** 16 KO matches (1/8 Final onward) hydrate with `null` teams because iSports stores `"73 WIN"` / `"101 loser"` until the draw resolves. Once iSports replaces placeholders with real team IDs/names, the schedule poll picks them up automatically — no code change needed. Until then, UI sees only the 72 group-stage matches.
- **Shootout in progress collapses to `live`.** status=5 (penalty shootout) → `'live'` in the 3-state model. UI cannot distinguish from regular play (flagged at `transform.ts:204-207`).
- **No diacritic stripping** in `normaliseTeamName`. Variants list includes `Türkiye`, `Côte d'Ivoire`, `Cote d'Ivoire`, but it is brittle — first fixture row introducing a new accented form will miss.

### 10.2 Backend robustness

- **No HTTP retry / backoff / timeout** on `client.ts`. A flaky network silently drops one tick per loop; a stuck `fetch` could in principle hold a tick indefinitely (no `AbortController`).
- **iSports app-error `code !== 0` only `console.warn`s** on poll loops. No metric, no alerting hook.
- **SSE `res.write` is fire-and-forget.** No `drain` waits, no per-client buffer cap. Slow clients accumulate in the kernel send buffer.
- **No rate limiting on `/command`** and CORS still `*`. Lockdown deferred to "Phase 3".
- **Single-process state.** No clustering, no Redis. Restart loses tick state (relies on schedule poll to re-hydrate when iSports is enabled).

### 10.3 Client gaps

- **Vite proxy targets `http://localhost:3001`** (`vite.config.ts:14`). When the production bundle ships, both `/events` and `/command` must be served from the same origin as the static bundle, or the proxy target rewritten to the Tailscale Mac Mini address.
- **Dead code in client**: `dialog.ts` (`confirm`/`alert`) unused; `renderPixelText` in `pngImage.ts:69` marked `@ts-expect-error unused`; `preloadFlags` / `getCachedFlag` exported but never called (G2 flag path is dead).
- **Legacy local-mutation paths in client `store.ts`** (`applyEvent`, `resolveBracket`, `setMinute`, `touch`) superseded by server-authoritative `applyDelta`. Only `applyEvent` is used by the test suite; runtime never calls them. Candidate for removal.
- **`pageView.ts` `stageLabel` shadow** — local `stageLabel` in `pageView.ts:56` duplicates exported `stageLabel` in `format.ts:3` (identical bodies). Duplication risk.

### 10.4 Bracket UI

- Mini-tree only shows QF→SF→F core. R16 and GS live in stage cards below — no tree drawing for them (would explode the 200×130 viewBox).
- Bracket connector animations on goal resolutions not implemented (cosmetic).
- 3rd-place omitted from mini-tree (no tree relationship to upstream).

### 10.5 Asset / packaging

- No `npm run pack` script wraps `evenhub pack` — manual workflow.
- No README.md at repo root.
- `EvenRosterGrotesk.otf` and `EvenSignature.otf` shipped in `public/fonts/` but not loaded by any JS (`pngImage.ts:16-21` only registers EvenTimeBigPixel). Either wire via CSS or drop to slim bundle.

### 10.6 Tests

- No Playwright E2E hooked up (Playwright is a devDep but no `playwright.config.ts`, no test files).
- No fuzz / soak test against `/events`.

---

## 11. References

### Feishu

- Architecture doc: `https://luckwhale.feishu.cn/docx/EsiLducSSoIJsRx6kN8ccyIlnse`
- Spec doc (this file's canonical home): `[Ops] WorldCup Spec.md` — same `docx/EsiLducSSoIJsRx6kN8ccyIlnse` id

### iSports

- API docs (login required): `https://www.isportsapi.com/docs/`
- Events docs page id=15 (cached locally at `server/isports-docs.txt`)
- Tier limits: `/livescore` singular, `/lineup`, `/competition`, `/odds` return `code=2 "haven't purchased"` (`server/isports/client.ts:12-13`)
- League id used: `1572` (FIFA World Cup 2026)
- Product id (informational): 219

### Repo

- GitHub: `https://github.com/LesenmiaoYu/even-hub-worldcup`
- Mac Mini deploy host: `claw` (Tailscale alias for `davidbot@100.92.207.10`)
- launchd label: `com.even.wc-server`
- Server logs: `/Users/davidbot/Library/Logs/wc-server.{log,err.log}`

### Internal memory pointers

- `project_worldcup_evenhub.md` — running project memo
- `reference_g2_display_geometry.md` — 576×288 canvas + bi-display rules
- `reference_lark_mcp.md` — Feishu MCP credentials for the publisher agent
- `feedback_doc_style_no_emojis_link_dont_paste.md` — zero-emoji hard rule (this doc honours it)
- `feedback_feishu_verify_doc_before_write.md` — verify doc title via API before any append/patch
