# World Cup — Even Hub App Engineering Spec

- **App ID**: `com.even.worldcup`
- **Display name**: World Cup
- **Version**: `0.1.0` (manifest `app.json`)
- **Min App version**: `2.0.0`
- **Min SDK**: `0.0.10` (`@evenrealities/even_hub_sdk`)
- **Repo**: `https://github.com/LesenmiaoYu/even-hub-worldcup`
- **Project root**: `/Users/even/CLAUDE_OUTPUT/apps/even-hub-worldcup`
- **Feishu canonical**: `[Ops] WorldCup Spec.md` (doc id `EsiLducSSoIJsRx6kN8ccyIlnse`)
- **Status**: production-ready, awaiting iSports Live Data subscription ($49 WC 2026 promo plan); free tier exhausts the polling budget in minutes

---

## 1. Overview

World Cup is a two-surface EvenHub plugin: a phone webview (Even app shell, Flutter-hosted) and a G2 glasses display. It mirrors the FIFA World Cup 2026 bracket — Group Stage → Round of 16 → Quarterfinals → Semifinals → Final + 3rd-place — and any live match, fed entirely from iSports REST.

The runtime split is server-authoritative: a Node `http` server (`server/index.ts`, port `3001`) owns the `Match[]` store, hydrates it from iSports on boot, runs three independent backoff-aware pollers, and fans out deltas over a single SSE stream at `GET /events`. Both the phone webview and the G2 SDK client subscribe to that stream — the server is the only writer in the system (`src/state/store.ts:applyDelta`).

There is no mock data path, no scripted ticker, and no debug control plane. The HTTP surface is `GET /health`, `GET /events`, and CORS preflight. Server clock is iSports' `extraExplain.minute`; the client never invents minutes.

Deploy: the static phone+glasses bundle ships as a single `.ehpk` built from the same Vite project. At build time the bundle bakes in `VITE_SERVER_URL` so the WebView (which runs from the EvenHub sandbox origin, not the server origin) reaches the Node SSE host over an absolute URL. The Node server runs on the Mac Mini under launchd, reachable over Tailscale; full backend handoff lives in `DEPLOY.md`.

---

## 2. Architecture

### Component split

```
+---------------------+      +-----------------------+      +---------------------+
|  G2 glasses (LVGL)  |      |  Phone webview        |      |  iSports REST       |
|  via SDK bridge     |      |  (Even app Flutter)   |      |  api.isportsapi.com |
+----------+----------+      +-----------+-----------+      +----------+----------+
           |  SDK calls                 |  EventSource(/events)        | HTTPS poll
           |  (RebuildPageContainer,    |                              | 12h / 5s / 60s
           |   updateImageRawData, …)   |                              | (BackoffLoop)
           v                            v                              v
+--------------------------------------------------+   +---------------------------+
|  Vite-built bundle (dist/) — index.html + JS     |   |  server/isports/ adapter  |
|  src/main.ts boots both surfaces from one entry  |   |  client.ts / decode.ts /  |
|  - mountPhone()    -> phone DOM                  |   |  transform.ts / teamMap   |
|  - createStartUp() -> G2 page container          |   |  / poller.ts (3 loops)    |
|  - openServerConnection() -> SSE consumer        |   +-------------+-------------+
+----------------------+---------------------------+                 |
                       |  SSE: snapshot then delta*                  v
                       v                                  +-------------------------+
              +------------------+                        |   server/state.ts       |
              |  Node http server|<--- store.upsertEvent  |   MatchStore (singleton)|
              |  server/app.ts   |     store.patchLivescore|  in-memory only        |
              |  PORT=3001       |     store.replaceAll    |                        |
              +--------+---------+                        +-------------------------+
                       |
                       +-- GET /events  (SSE: snapshot + delta + 15s :ping)
                       +-- GET /health  (uptime check)
                       +-- OPTIONS *    (CORS preflight, 204)
```

### SSE topology

- One stream `/events` (text/event-stream), all clients subscribe.
- On connect: server pushes `event: snapshot` with `{ matches: Match[] }` (`server/app.ts:44-45`).
- Every state mutation emits `event: delta` carrying a discriminated `Delta` payload (`server/state.ts:5-28`).
- 15 s `:ping` heartbeat per client, plus `retry: 2000` so EventSource auto-reconnects on drop (`server/sse.ts`, `server/app.ts:5`).
- No `id:` lines — clients cold-reconnect and re-hydrate from the next `snapshot`. Each `event-applied` and `reset` delta also carries the full post-change `Match` snapshot, so divergence resolves naturally.
- CORS: `Access-Control-Allow-Origin: *` (lockdown deferred to a later phase, `server/app.ts:8-15`).

### Client render queue

`src/main.ts:36-55` keeps a single-slot pending entry per view kind (`'list' | 'detail'`). Store change → enqueue → coalesce to latest → flush. Layer 2 (detail) flushes through `incrementalRenderDetail` which compares against a `last` cache (`main.ts:62-77`) and only re-paints the score / home-code / away-code images when their signatures changed; full rebuild is forced on `matchId` change (`main.ts:113-164`). PEN is no longer a structural toggle (see §4.3).

### Server-authoritative invariant

Clients never mutate `Match` state from local inputs. The phone surfaces and goal toast are read-derived (the toast watches the store's live-goal count delta). All match facts originate in iSports and pass through `MatchStore.patchLivescore` / `upsertEvent` / `replaceAll`. The store fans out deltas; surfaces re-render from the deltas.

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

There is no `'FR'` stage member. `stageLabel` (`src/g2/format.ts:64-69`, `src/g2/pageView.ts:60-65`) handles QF / SF / 3rd / F only; no per-id special cases.

### Events

```ts
export type EventType = 'goal' | 'yellow' | 'red' | 'ht' | 'ft' | 'sub';
export type Side = 'home' | 'away';

export interface MatchEvent {
  eventId?: string;       // iSports dedupe key
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
  kickoffAt?: string;           // ISO8601 from iSports raw.matchTime (Unix s)
  events: MatchEvent[];
  venue?: string;
  resolvesFrom?: { home?: string; away?: string };  // upstream match IDs
}
```

`kickoffAt` is populated by the iSports transform from `raw.matchTime` (`server/isports/transform.ts:248-258`):

```ts
const ms = raw.matchTime * 1000;
out.kickoffAt = new Date(ms).toISOString();
out.kickoffOffsetMin = Math.round((ms - Date.now()) / 60000);
```

Both UI surfaces use `kickoffAt` for date display (TBD bracket slot label, glasses L1 sort).

### SSE delta

```ts
// src/state/serverClient.ts:7-30 (mirrors server/state.ts:5-28)
export type Delta =
  | { type: 'event-applied'; matchId: string; event: MatchEvent;
      scoreDelta?: { home?: number; away?: number }; match: Match }
  | { type: 'minute'; matchId: string; minute: number }
  | { type: 'bracket-resolved'; matchId: string;
      home: TeamCode | null; away: TeamCode | null }
  | { type: 'reset'; matchId: string; match: Match };

export interface SnapshotMessage { matches: Match[]; }
```

Vestigial `ScriptedTick` / `LiveTickConfig` interfaces still sit at `src/types.ts:104-115` but no code references them and they are slated for removal.

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
| 10 | `lhead` | text | 8,8,560×28 | `listHeaderText()` — empty store → `WORLD CUP    Awaiting data` (`pageView.ts:337-340`); otherwise title from earliest non-FT stage in `[QF,SF,3rd,F]`; subtitle = `"{count} today, {liveCount} live"` |
| 11 | `lleft` | list | 8,48,280×232 | `listLeft(m) = "HOME vs AWAY"`; `isEventCapture=1`, selection border on |
| 12 | `lright` | list | 296,48,272×232 | `listRight(m)` — see below; `isEventCapture=0`, no selection border |

`listMatches()` (`pageView.ts:322-331`) is upcoming-only, soonest-first, cap 5:

```ts
return store.getUpcoming()
  .filter(m => m.home != null && m.away != null && !!m.kickoffAt)
  .sort((a, b) => a.kickoffOffsetMin - b.kickoffOffsetMin)
  .slice(0, 5);
```

No live, no past. Both teams must be resolved (no `TBD` slots), and a real `kickoffAt` is required. Empty state: left = `"No matches today"`, right = `""`.

`listRight(m)` (`src/g2/format.ts:132-139`):

- ft + shootout → `"FT H-A (Hp-Ap)"`
- ft → `"FT  H-A"`
- live → `"LIVE {min}  H-A"`
- scheduled → kickoff offset label (`Kicks off in {…}`)

### 4.2 Layer 2 — match detail (`buildDetailPage`, `src/g2/pageView.ts:205`)

| ID | Name | Type | Geometry | Notes |
|---|---|---|---|---|
| 1 | `header` | text | 8,8,420×56 | two-row: stage on row 1, verbose status on row 2 |
| 2 | `pen` | text | 420,8,148×64 | `"PEN\nH-A"`; **always rendered**, empty-state `"PEN\n--"` |
| 3 | `hcode` | image | 4,98,132×52 | `renderCodePng(asciiName(home), …, 'home')` (right-aligned) |
| 4 | `score` | image | 144,68,288×82 | `renderScorePng` for live/ft, `renderVsPng` otherwise |
| 5 | `acode` | image | 440,98,132×52 | `renderCodePng(…, 'away')` (left-aligned) |
| 7 | `elog` | text | 8,200,560×82 | `LOG_ROWS=3`, border w=1 color=6 radius=4 padding=8, `isEventCapture=1` |

`eventLogLines` (`pageView.ts:77-105`):

- scheduled → `Kicks off in {m|h|d}` (single line)
- live/ft → reversed `events.slice(0,3)`, each `${min}'  {chip}  {who}`; subs render `OUT > IN (side)`
- empty list → `'Match underway'` fallback only — lines are NOT padded to 3, so the box doesn't read as empty bands when fewer than 3 events exist (`pageView.ts:30-35` comment)

Geometry constants (`pageView.ts:25, 30-35`):

```ts
const PEN_X=420, PEN_Y=8, PEN_W=148, PEN_H=64;
const LOG_X=8,   LOG_Y=200, LOG_W=560, LOG_H=82, LOG_ROWS=3;
```

### 4.3 Penalty handling

The top-right `PEN\nH-A` text container is the canonical UI signal for a shootout. `hasShootout(m)` is true when both `homePenalty` and `awayPenalty` are non-null. The block is **always rendered** now (`pageView.ts:158-170`): when shootout is absent the slot shows `PEN\n--`, and snaps to the real score when the shootout starts. This removes the previous structural-toggle path in `main.ts` — no more `shootoutPresent` rebuild trigger.

- builder: `penIndicatorContainer` (`pageView.ts:158-170`)
- upgrade path: `makePenIndicatorUpgrade`
- PEN is NOT mixed into the header line. Header stays clean (`format.ts:44-61` comment).

`scoreText` for the score image is `"H : A"` with spaces around the colon to match EvenTimeBigPixel's pixel-grid kerning (`format.ts:63-68`).

### 4.4 Update strategy

| Trigger | API call |
|---|---|
| First mount / view switch / matchId change | `bridge.createStartUpPageContainer` (boot) or `RebuildPageContainer` (re-mount) + 3× `updateImageRawData` |
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

**3. Flags — SVG → 2× supersample → downsample → inverted greyscale** (`renderFlagPng`, `pngImage.ts:208-239`)
- Load via `<img>` (`crossOrigin='anonymous'`), draw at 2× target, downsample to target, invert (dark flag elements → bright G2 green).
- **Not used on G2 today.** Module-scope `flagCache` and `preloadFlags` exposed but never called from `main.ts` or `pageView.ts`. Flag assets are phone-only.

### 4.6 R1 input contract (`src/main.ts`)

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

Stack: vanilla TS, no framework. Mounted into `#app` (`src/phone/mount.ts:mountPhone`). Lives inside the Even app Flutter webview chrome. DOM template (`mount.ts:30-45`) is `.topbar` + `#location-strip` + `#content` — no debug bar.

### 5.1 Top tabs (`mount.ts:30-49`)

Two declared tabs in `#tabs`, plus an internal `'detail'` view value:

| `data-view` | Label | Default? | Disabled when |
|---|---|---|---|
| `matches` | Matches | yes | — |
| `bracket` | Bracket | no | `store.getAll().length === 0` (`mount.ts:107`); the tab button gets `disabled` + `.disabled` class and the click handler short-circuits (`mount.ts:160-171`) |
| `detail` (internal) | — | entered via row tap (`data-match-id`), exited via back button | — |

Detail return target: if source match was FT → `'bracket'` (`wasInBracket()`); else `'matches'`.

Stage names map at `mount.ts:352-362`:

```ts
const STAGE_NAMES: Record<Stage, string> = {
  QF: 'Quarterfinals', SF: 'Semifinals', '3rd': 'Third-Place Playoff',
  F: 'Final', GS: 'Group Stage', R16: 'Round of 16',
};
```

Empty-store header (`mount.ts:386-388`):

```ts
if (all.length === 0) return { title: 'World Cup', sub: 'Awaiting data' };
```

### 5.2 Location strip — timezone picker (`src/phone/settings.ts`, `src/state/regions.ts`)

`renderLocationStrip()` builds a `<select>` with `<optgroup>`s in fixed order: Europe → North America → South America → Asia → other (`src/phone/settings.ts:30-46`). `mountLocationStrip()` wires `change` → `settingsStore.set({ timezone })` + re-render.

`src/state/regions.ts` ships a 126-entry IANA timezone catalog (Europe 46, North America 22, South America 12, Asia 46) grouped by continent, sourced from the Feishu wiki node `Rzo3wtKyFigkLkk35BNcBPU9nkA` (per file header comment). Exports `REGIONS`, `REGION_BY_IANA`, `DEFAULT_IANA = "America/New_York"`.

`src/state/settingsStore.ts` persists `{ timezone, country }` to `localStorage` under key `'wc:settings'` (`src/state/settingsStore.ts:12`). On `init()`, it loads the saved value, then asks `EvenAppBridge.getInstance().getUserInfo()` for `country` if not already saved. Subscribers are notified on `set()`. The selected timezone drives every user-facing date/time string (bracket kickoff dates, detail kickoff line, etc).

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

Top: **mini-tree SVG** (`miniTree`, 106-186). Non-interactive, viewBox 200×130, fixed `4-QF → 2-SF → 1-F` skeleton. Each cell shows winner when resolved, both codes side-by-side otherwise, `tbdSlotLabel(m)` (kickoff `M/D` or literal `TBD`) otherwise (`bracketSvg.ts:168`). Polyline connectors. R16, GS, and 3rd-place are omitted from the mini-tree (handled in stage cards below).

Section card lists (`sectionList`, 188-201), ordered top-down:

```
GS · R16 · QF · SF · F · 3rd
```

`'3rd'` only renders if a `third` match exists.

`bracketCard(m)` (`bracketSvg.ts:57-133`) is a **two-row** layout:

- **Row 1** — matchup: `[flag] HOME score AWAY [flag]`. Winner side gets `.br-win`. Penalty matches: score reads `"H-A (Hp-Ap pen)"` via `.br-pen` span.
- **Row 2** — `.br-badge-row`, centered: `FT · PEN` / `LIVE {min}'` / kickoff badge.

The previous single-row right-rail layout read as cramped (`bracketSvg.ts:118-133` comment).

TBD slot labels (`tbdSlotLabel(m)`, `bracketSvg.ts:19-29`): returns `M/D` in user TZ if `m.kickoffAt` is set, else literal `"TBD"`. Used in both `bracketCard` (lines 91-94) and `miniCell` (line 168).

Card is `role="button" tabindex="0"` with `data-match-id` → tap routes to detail.

### 5.5 Detail view (`renderDetail`, `mount.ts:292-347`)

Renders when `view === 'detail' && detailMatchId`. Back button on top. Big detail-head: home flag+code with full team name below, center score (`H - A` or `vs`), optional `<div class="detail-pen">PEN H-A</div>`, status line (live dot + minute + stage, or `FT · PEN` + stage, or kickoff in user TZ + stage), optional venue line. Events feed reverse-chronological with minute, typed chip (Goal/Yellow/Red/HT/Sub/FT), and player name (or `OUT → IN` for subs).

### 5.6 Goal toast (`mount.ts`, `src/phone/toast.ts`)

Store subscription watches live-goal count delta after first non-zero baseline. Fires `toast('Goal — {team}', '{player} {min}'')` with `variant: 'goal'`. Single `.toast-host` div, `.show` animation, 2500 ms default.

### 5.7 Phone → glasses nav bridge

`setPhoneNavListener` / `emitNav` (`mount.ts:18-23`):

- `{type:'enter-detail', matchId}` (on `data-match-id` click)
- `{type:'exit-detail'}` (tab swap from detail, back button)

`main.ts` consumes: enter → `enqueueRender('detail', fullRenderDetail)`; exit → `enqueueRender('list', renderList)`.

---

## 6. Server

Pure Node `http.createServer` — no Express/Fastify. `server/index.ts` boots; `server/app.ts` defines routes; `server/state.ts` is the singleton store; `server/sse.ts` writes SSE frames. No mock seed module exists.

### 6.1 HTTP routes

| Method | Path | Purpose | Source |
|---|---|---|---|
| `OPTIONS *` | any | CORS preflight, 204 | `server/app.ts:65-78` |
| `GET` | `/health` | `{ ok: true, uptimeSec }` | `server/app.ts:81-85` |
| `GET` | `/events` | SSE: `snapshot` then `delta` + 15 s `:ping` | `server/app.ts:87-88`, handler 40-58 |
| any | (other) | `notFound()` → 404 `{ ok: false, error: "not_found" }` | `server/app.ts:91` |

There is no `POST /command`, no `/debug`, no admin plane. The boot log advertises only `/events` and `/health`.

### 6.2 Boot (`server/index.ts`)

```ts
const PORT = Number(process.env.PORT ?? 3001);
const store = createMatchStore();

try {
  await hydrateFromIsports(store);
} catch (err) {
  console.error('[boot] hydrate failed; starting empty', err);
}

startIsportsPollers(store);
createApp(store).listen(PORT, …);
```

Boot must not fail just because iSports is unreachable or rate-limited (`server/index.ts:7-19`). A boot-time hydrate failure logs and starts the server with an empty store; the pollers retry on their backoff cadence and fill the store as soon as iSports answers. Any client connected during the gap gets an empty `snapshot` and then picks up real matches via `delta`.

### 6.3 SSE topology

Headers (`server/sse.ts`):

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
Access-Control-Allow-Origin: *
retry: 2000
```

Client lifecycle (`server/app.ts:40-58`):

1. On connect → write headers, push `event: snapshot` with `{ matches: store.getAll() }`.
2. Subscribe to store; every delta → `event: delta` payload.
3. Per-client `setInterval` 15 s heartbeat writes `:ping\n\n` (`DEFAULT_HEARTBEAT_MS = 15000`, `server/app.ts:5`).
4. On `req.close` / `req.error`: `clearInterval(heartbeat)`, remove from set, `unsub()`.

Delta variants broadcast (`server/state.ts:5-28`):

- `event-applied` — full post-change `match` snapshot included
- `minute` — minute-only patch (live clock advance)
- `bracket-resolved` — `home` / `away` flip on downstream slot (fired on FT cascade in `resolveBracket()` and as a side-effect when `patchLivescore` mutates `home`/`away`)
- `reset` — full match snapshot (used by `replaceAll` hydrate, and by `patchLivescore` for any non-minute-only change)

No `id:` lines — cold reconnect re-hydrates from next snapshot. No backpressure handling: `res.write` is fire-and-forget, no `drain` waits, no per-client buffer cap.

### 6.4 State model (`server/state.ts`)

In-memory only; single `MatchStore`. Nothing persisted to disk — restart re-runs `hydrateFromIsports()`.

Mutators and their emitted deltas:

| Method | Emits | Notes |
|---|---|---|
| `replaceAll(matches)` | one `reset` per match | blow-away reseed (used by hydrate + 12 h schedule poll) |
| `upsertEvent(matchId, ev)` | `event-applied` | dedups by `event.eventId`; ignores unknown matchIds |
| `patchLivescore(matchId, patch)` | `minute` or `reset` (+ optional `bracket-resolved`) | minute-only changes → `minute`; everything else → `reset` |
| `resolveBracket(finishedMatchId)` | `bracket-resolved` | walks all matches, fills `home`/`away` of any whose `resolvesFrom` points at finished id |
| `winnerOf(matchId)` | — | by score; tied → penalty comparison; falls back to `home` |

`emit()` try/catches each listener so one bad SSE client cannot poison the broadcast.

### 6.5 Port + bind + CORS

- **Port**: `PORT` env, default `3001` (`server/index.ts:5`).
- **Bind**: `listen(PORT, …)` no host arg → Node defaults to all interfaces (`::` / `0.0.0.0`). Socket is LAN-reachable. Mac Mini exposure is via Tailscale to `claw`.
- **CORS**: `Access-Control-Allow-Origin: *`, `Methods: GET, OPTIONS`, `Headers: Content-Type` (`server/app.ts:8-15`). SSE response stamps the header directly. Lockdown deferred.

### 6.6 Concurrency posture (informal 500-client target)

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
- All clients share one `*` CORS policy — no rate limiting on `/events`.
- Mac Mini default `ulimit -n` is 256; raised externally via the launchd `SoftResourceLimits.NumberOfFiles=4096` to sustain SSE sockets.

---

## 7. iSports Adapter

Lives at `server/isports/`. It is the only data source — there is no env gate, no mock fallback. `server/index.ts` calls `hydrateFromIsports(store)` unconditionally on boot and `startIsportsPollers(store)` immediately after.

### 7.1 Layout

| File | Purpose |
|---|---|
| `client.ts` | typed HTTP wrappers |
| `decode.ts` | pure enum → string-union decoders |
| `transform.ts` | raw row → internal `Match` / `MatchEvent` |
| `teamMap.ts` | name + id → FIFA-3 `TeamCode` |
| `poller.ts` | `hydrateFromIsports` + 3 `BackoffLoop` instances |
| `index.ts` | barrel re-exports |

### 7.2 API client (`client.ts`)

- Base URL `http://api.isportsapi.com/sport/football` — plain HTTP, not HTTPS.
- Auth: query param `api_key=<key>`, read from `process.env.ISPORTS_API_KEY` on every call (`client.ts:36-44`) so post-import dotenv mutations still work; throws synchronously if unset.

| Method | Endpoint |
|---|---|
| `getLivescores()` | `GET /livescores` |
| `getLivescoresChanges()` | `GET /livescores/changes` |
| `getEvents()` | `GET /events` |
| `getSchedule({leagueId?, date?})` | `GET /schedule?…` |
| `getTeam(teamId)` | `GET /team?teamId=…` |
| `getLeague()` | `GET /league` |

Not in tier (returns `code=2 "haven't purchased"`, `client.ts:12-13`): `/livescore` singular, `/lineup`, `/competition`, `/odds`.

Retry / timeout: **none** inside `client.ts`. Backoff lives in `poller.ts` (see §7.6). Network failure → throws `iSports fetch failed for <path>: <msg>`. Non-2xx → throws `iSports HTTP <status>`. `code !== 0` (application error) → does NOT throw; returns envelope so caller decides.

### 7.3 Status decode (`decode.ts:32-53`)

| iSports code | Meaning | Internal |
|---|---|---|
| `0` | not started | `scheduled` |
| `-11` | TBD | `scheduled` |
| `1` | first half | `live` |
| `2` | half time | `live` |
| `3` | second half | `live` |
| `4` | extra time | `live` |
| `5` | penalty shootout | `live` |
| `-1` | finished | `ft` |
| `-10` | cancelled | `cancelled` (sentinel) |
| `-12` | terminated | `cancelled` |
| `-13` | interrupted | `cancelled` |
| `-14` | postponed | `cancelled` |
| (other) | unknown | `cancelled` (safe default) |

`'cancelled'` is a sentinel string, NOT a `MatchState`. `transformMatch` returns `null` for cancelled. Status=5 (shootout in progress) collapses to `'live'` in the 3-state model — UI cannot distinguish from regular play.

### 7.4 Event decode (`decode.ts:85-96`)

| iSports type | Meaning | Internal |
|---|---|---|
| `1` | goal | `goal` |
| `2` | red card | `red` |
| `3` | yellow card | `yellow` |
| `4` | unused | `null` |
| `7` | penalty scored | `goal` |
| `8` | own goal | `goal` |
| `9` | second yellow → red | `red` |
| `11` | substitution | `sub` |
| `13` | penalty missed | `null` (dropped) |
| `14` | VAR review | `null` (dropped) |
| `0` / other | unknown | `null` (dropped) |

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

### 7.6 Poller — `BackoffLoop` (`poller.ts:126-178`)

Each poll is a self-scheduling `BackoffLoop` instance. On exception, `failures++` and the next run is scheduled at `baseMs * 2^failures`, capped at `MAX_BACKOFF_MS = 5 * 60 * 1000` (5 min). A single successful run resets `failures = 0` and returns to base cadence.

Three independent loops, each with its own backoff state:

| Loop | Endpoint | Base interval | Purpose |
|---|---|---|---|
| schedule | `GET /schedule?leagueId=1572` | `SCHEDULE_POLL_MS = 12 h` | re-hydrate full bracket; picks up draw resolutions |
| livescores | `GET /livescores/changes` | `LIVESCORES_POLL_MS = 5 s` | patch score/state/minute on existing matches |
| events | `GET /events` | `EVENTS_POLL_MS = 60 s` | append new events to known matches |

Constants in `poller.ts:36-40`. Backoff cap explicitly chosen so that a rate-limit incident does not silently extend gaps beyond 5 minutes — the loop will still attempt recovery every 5 min worst-case.

### 7.7 leagueId filter

- `LEAGUE_ID = '1572'` (`poller.ts:36`) — FIFA World Cup 2026.
- `transformMatch(raw, { leagueId: '1572' })` → returns `null` for any row whose `raw.leagueId` is not `'1572'`. Strict string equality.

### 7.8 Match transform extras

| Field | Rule | Source |
|---|---|---|
| `minute` (event) | overtime takes precedence if non-zero; else baseMinute; else 0 | `transform.ts:136-140` |
| `side` (event) | `homeEvent===true` → `'home'`; `===false` → `'away'`; null → `null` | `transform.ts:129-133` |
| `homeScore`/`awayScore` | scheduled → both `null`; live/ft → `?? 0` | `transform.ts:234-245` |
| `homePenalty`/`awayPenalty` | non-null only if `extraExplain.penHomeScore \|\| penAwayScore` truthy | `transform.ts:234-245` |
| `minute` (Match) | scheduled `null`; live `extraExplain.minute` (or null if 0); ft `null` | `transform.ts:242-246` |
| `kickoffAt` | `new Date(raw.matchTime * 1000).toISOString()` | `transform.ts:248-258` |
| `kickoffOffsetMin` | `Math.round((kickoffMs - Date.now()) / 60000)` | `transform.ts:248-258` |
| `venue` | from `raw.location` if present | `transform.ts:264` |

### 7.9 Sub parser (`transform.ts:115-168`)

**Arrow form** (canonical, per docs id=15):

```
/^\s*(.+?)\s*↑\s*(.+?)\s*↓\s*$/
```

- Group 1 = up-arrow side = `playerIn` (coming ON)
- Group 2 = down-arrow side = `player` (coming OFF)

**Paren fallback** (defensive, anomalous data):

```
/^\s*(.+?)\s*\(Assists?:\s*(.+?)\s*\)\s*$/i
```

If neither matches: raw `playerName` → `player` as-is, `assistPlayerName` (if any) → `playerIn`. Only runs when `safeType === 'sub'` (iSports type=11).

### 7.10 Team mapping (`teamMap.ts`)

Two tables, id-first lookup then name fallback (`transform.ts:79-86`):

- `TEAM_ID_TO_CODE` — 48 numeric iSports team IDs → FIFA-3 code, harvested from `schedule-wc2026.json`.
- `TEAM_NAME_TO_CODE` — 58 codes × multiple variants, normalised by `normaliseTeamName` (trim, collapse whitespace, lowercase; no diacritic strip — known gap).

Full 58-code coverage by confederation:

| Confederation | Count | Codes |
|---|---|---|
| CONCACAF | 6 | USA, MEX, CAN, JAM, CRC, PAN |
| CONMEBOL | 6 | ARG, BRA, URU, COL, ECU, PAR |
| UEFA | 20 | ESP, FRA, ENG, GER, ITA, NED, POR, BEL, CRO, SWI, DEN, POL, AUT, CZE, SRB, NOR, BIH, SCO, SWE, TUR |
| CAF | 12 | MAR, SEN, EGY, NGA, ALG, TUN, CMR, GHA, CIV, CPV, COD, RSA |
| AFC | 10 | JPN, KOR, IRN, KSA, AUS, QAT, UAE, IRQ, JOR, UZB |
| OFC + playoffs | 4 | NZL, BOL, HAI, CUW |

### 7.11 iSports plan dependency

The free trial caps at 200 calls/day. With the 5 s livescores cadence alone that's exhausted in ~17 minutes. Production requires the **$49 WC 2026 promo "Live Data" plan** (per `.env.example:9`). Until subscribed, the server will start, hydrate may fail (BackoffLoop will keep retrying every 5 min worst-case), and the client snapshot will be empty.

### 7.12 ENV vars

| Var | Default | Behaviour |
|---|---|---|
| `ISPORTS_API_KEY` | (none) | Server-side. Read on every call (`client.ts:36-44`). Throws if unset. Lazy read so dotenv loaders that run after module import still work. |
| `PORT` | `3001` | `Number(process.env.PORT ?? 3001)` (`server/index.ts:5`). |
| `VITE_SERVER_URL` | (empty) | **Required for prod `.ehpk`**. Absolute URL of the public Node server (example `https://wc.yulesenmiao.com`). Baked into the bundle at build time. Leave UNSET in dev so the vite proxy in `vite.config.ts:10-17` forwards `/events` to `localhost:3001`. The `.ehpk` runs inside the Even App WebView, whose origin is the sandbox not the server — relative paths would not resolve (`src/state/serverClient.ts:36-47`). |

Server reads `.env` via `tsx watch --env-file-if-exists=.env server/index.ts` (`package.json:10`).

---

## 8. Build & Test & Deploy

### 8.1 Runtime dependencies (`package.json`)

| Package | Purpose |
|---|---|
| `@evenrealities/even_hub_sdk ^0.0.10` | G2 SDK bridge |
| `upng-js ^2.1.0` | PNG encode for glasses images |

No HTTP framework dep — server uses Node built-in `http`.

### 8.2 Dev dependencies (selected)

| Package |
|---|
| `vite` |
| `vitest` |
| `tsx` |
| `typescript` |
| `@evenrealities/evenhub-cli ^0.1.13` |
| `@evenrealities/evenhub-simulator` |
| `concurrently` |
| `happy-dom` |
| `playwright` |
| `flag-icons` |
| `@types/node` |

### 8.3 npm scripts (`package.json:6-15`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | frontend dev server (proxies `/events` to `:3001`) |
| `build` | `tsc && vite build` | typecheck then production bundle |
| `preview` | `vite preview` | serve built dist locally |
| `server` | `tsx watch --env-file-if-exists=.env server/index.ts` | iSports SSE backend on `:3001` with hot reload |
| `dev:all` | `concurrently -n vite,server 'npm:dev' 'npm:server'` | both in one terminal |
| `pack` | `npm run build && evenhub pack app.json dist -o even-hub-worldcup.ehpk` | build + package the `.ehpk` |
| `test` | `vitest run` | one-shot test suite |
| `test:watch` | `vitest` | watch mode |

### 8.4 Vite proxy (`vite.config.ts:10-17`)

Dev-only proxy forwards SSE to the local server:

- `/events` — SSE stream (changeOrigin: true, native SSE passthrough — no buffering)

Production: the bundle uses `import.meta.env.VITE_SERVER_URL` to build the absolute `/events` URL (`src/state/serverClient.ts:45-47`):

```ts
const SERVER_URL = import.meta.env.VITE_SERVER_URL?.replace(/\/$/, '') ?? '';
const EVENTS_PATH = `${SERVER_URL}/events`;
```

Set `VITE_SERVER_URL` only at build time for the `.ehpk` — never in dev.

### 8.5 Test suite

7 files. `vitest.config.ts` matches `test/client-*.test.ts` to happy-dom; everything else runs in Node.

| File | Scope |
|---|---|
| `test/client-store-sse.test.ts` | EventSource shim + client `serverClient`/`store` integration: `snapshot` hydrates, `delta` events update store, reconnect |
| `test/format.test.ts` | `src/g2/format.ts` formatters — `statusVerbose`, `listLeft`, `listRight`, asciiName edge cases, kickoff/penalty text |
| `test/isports-client.test.ts` | Typed HTTP client wrappers — URL building, api_key injection, error shapes |
| `test/isports-decode.test.ts` | Pure decoders: `decodeStatus`, `decodeEventType`, `decodeStage` |
| `test/isports-transform.test.ts` | `transformMatch` / `transformEvent` / `transformEvents` against `server/fixtures/` — null-drop, sub arrows, penalty extraction, kickoff conversion |
| `test/server-http.test.ts` | End-to-end SSE: spin up `createApp()`, connect, assert `snapshot` then live `delta` framing, heartbeat, cleanup |
| `test/store.test.ts` | Client-side `Store` class — `applyDelta` per variant, `getLive/Upcoming/Past`, subscriber notify discipline |

### 8.6 `.ehpk` packaging

`npm run pack` runs `npm run build` then `evenhub pack app.json dist -o even-hub-worldcup.ehpk`. `app.json` manifest: `package_id=com.even.worldcup`, `version=0.1.0`, `min_app_version=2.0.0`, `min_sdk_version=0.0.10`, `entrypoint=index.html`, no permissions declared, EN-only.

For prod builds, set `VITE_SERVER_URL` before `npm run pack` so the absolute SSE URL is baked into the bundle.

### 8.7 Deploy

Full backend SWE handoff procedure (server provisioning, launchd plist, Tailscale exposure, log rotation, iSports plan setup) lives in `DEPLOY.md` alongside this file. The server is a single Node 22 process; deployment is "drop the repo on a host, set `ISPORTS_API_KEY` + `PORT`, run `npm run server` under a supervisor".

### 8.8 Asset pipeline scripts

- `scripts/copy-flags.sh` — copies FIFA→ISO flag pairs out of `node_modules/flag-icons/flags/4x3/` into `public/flags/`. 60 SVGs present today (latest addition `nir.svg` for Northern Ireland).
- `scripts/render-g2-mockups.py` — PIL-based, renders deterministic PNG mockups for the docs.

---

## 9. File Map

```
even-hub-worldcup/
├── app.json                                 # EvenHub manifest (com.even.worldcup, v0.1.0)
├── index.html                               # Vite entrypoint
├── package.json                             # npm scripts, deps
├── vite.config.ts                           # /events proxy to :3001
├── vitest.config.ts                         # happy-dom for client tests, node otherwise
├── tsconfig.json
├── DEPLOY.md                                # backend SWE handoff
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── flags/                               # 60 FIFA-3 SVGs
│   └── fonts/
│       ├── even-pixel-alphabet.svg
│       ├── EvenTimeBigPixel.ttf
│       ├── FKGroteskNeue.ttf
│       ├── EvenRosterGrotesk.otf
│       └── EvenSignature.otf
│
├── src/
│   ├── main.ts                              # entry: mountPhone + SDK bridge + render queue + SSE bootstrap
│   ├── style.css                            # phone + (some) shared styles
│   ├── types.ts                             # client-side type contracts (mirrors server/types.ts)
│   ├── env.d.ts
│   │
│   ├── g2/
│   │   ├── pageView.ts                      # buildListPage + buildDetailPage; PEN always-on; 3-row event log
│   │   ├── format.ts                        # asciiName, scoreText, listLeft/listRight, status strings
│   │   ├── pngImage.ts                      # renderPixelTextPng + renderScorePng + renderVsPng + renderFlagPng
│   │   └── pixelAlphabet.ts                 # SVG glyph atlas parser
│   │
│   ├── mock/
│   │   └── teams.ts                         # TeamCode → {name, flag} lookup (NOT fixtures — production data)
│   │
│   ├── phone/
│   │   ├── mount.ts                         # mountPhone, tabs, renderMatches, renderDetail, nav bridge
│   │   ├── bracketSvg.ts                    # renderBracketSvg, miniTree, 2-row bracketCard, tbdSlotLabel
│   │   ├── settings.ts                      # renderLocationStrip + mountLocationStrip (timezone picker)
│   │   ├── toast.ts                         # single .toast-host, goal variant
│   │   └── dialog.ts                        # confirm/alert helpers (exported, currently unused)
│   │
│   └── state/
│       ├── store.ts                         # client Store: applyDelta switch + subscribe/notify
│       ├── serverClient.ts                  # openServerConnection (EventSource on VITE_SERVER_URL/events)
│       ├── settingsStore.ts                 # localStorage 'wc:settings' (timezone + country)
│       └── regions.ts                       # 126-IANA timezone catalog, grouped by continent
│
├── server/
│   ├── index.ts                             # boot: try hydrate (non-fatal) → start pollers → listen
│   ├── app.ts                               # http.createServer, routes (GET /events, GET /health, OPTIONS)
│   ├── sse.ts                               # SSE frame writer, headers, retry: 2000
│   ├── state.ts                             # MatchStore singleton, mutators, emit() fan-out
│   ├── types.ts                             # server-side mirror of src/types.ts
│   ├── README.md
│   ├── isports-docs.txt                     # cached iSports docs page id=15
│   ├── isports-docs.json
│   │
│   ├── isports/
│   │   ├── client.ts                        # typed HTTP wrappers
│   │   ├── decode.ts                        # decodeStatus / decodeEventType / decodeStage
│   │   ├── transform.ts                     # raw row → Match / MatchEvent; kickoffAt populated
│   │   ├── teamMap.ts                       # TEAM_ID_TO_CODE + TEAM_NAME_TO_CODE
│   │   ├── poller.ts                        # hydrateFromIsports + 3 BackoffLoop instances (cap 5 min)
│   │   └── index.ts                         # barrel re-exports
│   │
│   └── fixtures/
│       ├── schedule-wc2026.json
│       ├── livescores.json
│       ├── livescores-changes.json
│       ├── events.json
│       └── leagues.json
│
├── test/
│   ├── client-store-sse.test.ts
│   ├── format.test.ts
│   ├── isports-client.test.ts
│   ├── isports-decode.test.ts
│   ├── isports-transform.test.ts
│   ├── server-http.test.ts
│   └── store.test.ts
│
├── scripts/
│   ├── copy-flags.sh
│   └── render-g2-mockups.py
│
└── docs/
    └── images/
        ├── g2-layer-1.png
        ├── g2-layer-2-vs.png
        ├── g2-layer-2-live.png
        └── g2-layer-2-ft.png
```

Note: `src/mock/teams.ts` is named "mock" historically but is production data — it's the canonical `TeamCode → {name, flag}` lookup consumed by both phone (`mount.ts`, `bracketSvg.ts`) and tooling. The previous `src/mock/tournament.ts` (8-match seed) and `server/seed.ts` are gone.

---

## 10. Roadmap / Known Gaps

### 10.1 Provider plan

- **iSports plan required.** Production needs the $49 WC 2026 promo "Live Data" plan. The free trial's 200 calls/day budget is exhausted in minutes by the 5 s livescores poll. Until the key is upgraded, hydrate will fail repeatedly (BackoffLoop caps the gap at 5 min) and clients will see an empty `World Cup / Awaiting data` state.

### 10.2 iSports coverage

- **Bracket only repopulates QF / SF / F (and 3rd, R16) once iSports schedule fills in those rounds.** iSports currently stores knockout placeholders (`"73 WIN"`, `"101 loser"`, team IDs in 73–102) until the draw resolves. None exist in `TEAM_ID_TO_CODE` or `NAME_VARIANTS`, so `resolveTeam` returns `null` and `transformMatch` returns `null` for those rows. As soon as iSports replaces placeholders with real team IDs/names, the 12 h schedule poll picks them up — no code change needed.
- **R32 entirely invisible.** `Stage` union has no `R32` slot, so `decodeStage` returns `null` for `1/16Final` rows. Product call needed: extend `Stage`, collapse into R16, or keep hiding.
- **Shootout in progress collapses to `live`.** status=5 → `'live'` in the 3-state model. UI cannot distinguish from regular play (`transform.ts:204-207`).
- **No diacritic stripping** in `normaliseTeamName`. Variants list covers `Türkiye`, `Côte d'Ivoire`, `Cote d'Ivoire`, but it is brittle — first fixture row introducing a new accented form will miss.

### 10.3 Backend robustness

- **No HTTP timeout** on `client.ts`. BackoffLoop guards the interval, but a stuck `fetch` could in principle hold a tick indefinitely (no `AbortController`).
- **iSports app-error `code !== 0` only `console.warn`s** on poll loops. No metric, no alerting hook.
- **SSE `res.write` is fire-and-forget.** No `drain` waits, no per-client buffer cap. Slow clients accumulate in the kernel send buffer.
- **No rate limiting on `/events`** and CORS still `*`.
- **Single-process state.** No clustering, no Redis. Restart re-runs hydrate; in-flight state is fine because the store is fully derivable from iSports.

### 10.4 Client gaps

- **`VITE_SERVER_URL` must be baked into prod builds.** If unset, the `.ehpk` will try to load `/events` relative to its WebView sandbox origin and fail. Build pipeline must enforce.
- **Dead code in client**: `dialog.ts` (`confirm`/`alert`) unused; `preloadFlags` / `getCachedFlag` in `pngImage.ts` exported but never called (G2 flag path is dead); `ScriptedTick` / `LiveTickConfig` in `src/types.ts:104-115` unreferenced.
- **`pageView.ts` `stageLabel` shadow** — local `stageLabel` in `pageView.ts:60-65` duplicates the exported `stageLabel` in `format.ts:64-69` (identical bodies). Duplication risk.

### 10.5 Bracket UI

- Mini-tree only shows QF→SF→F core. R16 and GS live in stage cards below — no tree drawing for them (would explode the 200×130 viewBox).
- 3rd-place omitted from mini-tree (no tree relationship to upstream).
- Bracket connector animations on goal resolutions not implemented (cosmetic).

### 10.6 Tests

- No Playwright E2E hooked up (Playwright is a devDep but no `playwright.config.ts`, no test files).
- No fuzz / soak test against `/events`.

---

## 11. References

### Feishu

- Architecture doc: `https://luckwhale.feishu.cn/docx/EsiLducSSoIJsRx6kN8ccyIlnse`
- Spec doc (this file's canonical home): `[Ops] WorldCup Spec.md` — same `docx/EsiLducSSoIJsRx6kN8ccyIlnse` id
- Regions / timezone catalog source: Feishu wiki node `Rzo3wtKyFigkLkk35BNcBPU9nkA` (consumed by `src/state/regions.ts`)

### iSports

- API docs (login required): `https://www.isportsapi.com/docs/`
- Events docs page id=15 (cached locally at `server/isports-docs.txt`)
- Tier limits: `/livescore` singular, `/lineup`, `/competition`, `/odds` return `code=2 "haven't purchased"` (`server/isports/client.ts:12-13`)
- League id used: `1572` (FIFA World Cup 2026)
- Product id (informational): 219
- Production plan: $49 WC 2026 promo "Live Data"

### Repo / deploy

- GitHub: `https://github.com/LesenmiaoYu/even-hub-worldcup`
- Backend handoff: `DEPLOY.md` (same directory)
- Mac Mini deploy host: `claw` (Tailscale alias for `davidbot@100.92.207.10`)

### Internal memory pointers

- `project_worldcup_evenhub.md` — running project memo
- `reference_g2_display_geometry.md` — 576×288 canvas + bi-display rules
- `reference_lark_mcp.md` — Feishu MCP credentials for the publisher agent
- `feedback_doc_style_no_emojis_link_dont_paste.md` — zero-emoji hard rule (this doc honours it)
- `feedback_feishu_verify_doc_before_write.md` — verify doc title via API before any append/patch
