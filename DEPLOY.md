# Deployment Guide

End-to-end runbook for cloning, running, and shipping `even-hub-worldcup`. Targets the Mac Mini + launchd pattern by default; swap launchd for systemd on Linux. Everything is verbatim from the current tree — no aspirational steps.

---

## Architecture in 30 seconds

A Node HTTP server (`server/`) polls iSports on three independent loops (schedule 12h / livescores 5s / events 60s), holds match state in memory, and broadcasts deltas over Server-Sent Events at `GET /events`. The client `.ehpk` is a Vite-built bundle that subscribes via `EventSource` to a single absolute URL baked in at build time (`VITE_SERVER_URL`), applies snapshot + deltas into an in-memory store, and renders both glasses (G2) and phone surfaces from the same store. No `POST /command`, no mock seed, no demo mode — the server is the single source of truth.

```
iSports REST  ─▶  Node poller (3 BackoffLoops)  ─▶  MatchStore
                                                         │ subscribe
                                                         ▼
                                                   GET /events  (SSE)
                                                         │
                       Even App WebView  ◀───────────────┘
                       (.ehpk: Vite bundle)
                              │
                              ├─▶ G2 bridge (render queue)
                              └─▶ Phone DOM
```

---

## Prerequisites

- **Node 22+**. `package.json` declares `@types/node ^22.10.5` and uses `node:http`. No `engines` field is set, but `tsx watch --env-file-if-exists=.env` requires Node ≥ 20.6; 22 is the tested floor.
- **macOS with launchd** for the recommended auto-restart pattern. On Linux, substitute systemd (template at the bottom of Step 6).
- **iSports Football API key**. Subscribe to the "Live Data" plan ($49 WC 2026 promo) at https://www.isportsapi.com. The free tier caps at 200 calls/day; the 5s livescore loop exhausts it in under 20 minutes — unusable.
- **One public hostname → port 3001** of the deploy machine. Pick one of the three options in Step 4.
- **Even Hub CLI** is installed locally via `npm install` (`@evenrealities/evenhub-cli ^0.1.13`) — no global install needed; `npm run pack` invokes it through the local bin.

---

## Step 1: Clone + install

```bash
git clone https://github.com/LesenmiaoYu/even-hub-worldcup.git
cd even-hub-worldcup
npm install
```

Verify the install landed both halves:

```bash
test -d node_modules/@evenrealities/even_hub_sdk && echo "sdk ok"
test -x node_modules/.bin/evenhub && echo "cli ok"
test -x node_modules/.bin/tsx && echo "tsx ok"
```

---

## Step 2: Configure .env

```bash
cp .env.example .env
# edit .env, fill ISPORTS_API_KEY
```

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ISPORTS_API_KEY` | yes (server) | — | iSports auth, read on every API call by `server/isports/client.ts`. Throws on missing. |
| `PORT` | no | `3001` | Port the Node SSE server listens on. Read in `server/index.ts`. |
| `VITE_SERVER_URL` | yes (prod build only) | unset | Absolute URL of the public Node server, baked into the `.ehpk` bundle at build time. Leave UNSET in dev — the vite proxy in `vite.config.ts` forwards `/events` → `http://localhost:3001`. Example: `https://wc.yulesenmiao.com`. **Lives in `.env.personal` / `.env.company`, not the server `.env`** — see Step 5. |

`.env`, `.env.personal`, `.env.company` are all gitignored. Never commit `ISPORTS_API_KEY` or production URLs that you don't want publicly known.

---

## Step 3: Smoke-test the server locally

```bash
npm run server
```

Expected boot output (first poll cycle):

```
[isports] hydrating from iSports…
[isports] hydrated N matches
[server] listening on :3001
[poll schedule] ok
[poll livescores] ok
[poll events] ok
```

If iSports is unreachable or rate-limited at boot, you'll see a warning instead of a crash — the pollers retry on backoff and fill the store later:

```
[isports] hydrate failed: <reason> — starting empty, pollers will retry
```

Verify the HTTP surface from a second shell:

```bash
curl -i http://localhost:3001/health
# HTTP/1.1 200 OK
# content-type: application/json
# {"ok":true}

curl -N http://localhost:3001/events | head -20
# event: snapshot
# data: {"matches":[...]}
#
# :ping
```

`Ctrl-C` to stop. `curl -N` disables buffering so SSE frames stream live.

---

## Step 4: Expose the server publicly

The `.ehpk` runs inside the Even App WebView, so its origin is the sandbox — the server URL it connects to must be **publicly reachable, HTTPS, and stable**. Pick one:

### Option A — Cloudflare Tunnel (recommended)

Free, automatic TLS, no port forwarding, survives ISP NAT.

```bash
brew install cloudflared
cloudflared tunnel login                          # opens browser, picks zone
cloudflared tunnel create wc-server
cloudflared tunnel route dns wc-server wc.example.com
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: wc-server
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: wc.example.com
    service: http://localhost:3001
  - service: http_status:404
EOF
cloudflared tunnel run wc-server                  # foreground sanity check
```

Verify from any other network:

```bash
curl https://wc.example.com/health
```

For persistence, install as a launchd service: `sudo cloudflared service install`.

### Option B — Tailscale Funnel

Free for personal use. Hostname is fixed to `<machine>.<tailnet>.ts.net`, which leaks your tailnet name but is fine for a beta.

```bash
tailscale funnel --bg 3001
tailscale funnel status        # prints the public URL
```

### Option C — Reverse proxy on a box with a public IP

If you already run nginx / Caddy on a public server with the deploy machine reachable over a private link (Tailscale, WireGuard, VPC), proxy `/events` and `/health` to `http://<deploy-host>:3001`. Caddy is the shortest path:

```
wc.example.com {
  reverse_proxy <deploy-host>:3001
}
```

Make sure the proxy does NOT buffer SSE — for nginx add `proxy_buffering off;` and `proxy_read_timeout 1d;` on the `/events` location.

**Verification (all options):**

```bash
curl https://<your-public-url>/health
curl -N https://<your-public-url>/events | head -5
```

---

## Step 5: Build the .ehpk

The server URL lives in TWO places at pack time and they MUST match:

1. The JS bundle — `EventSource(\`${VITE_SERVER_URL}/events\`)` is hard-baked at `vite build` time
2. `app.json` permissions whitelist — the Even App WebView blocks every domain not in `permissions[name=network].whitelist`

To keep them in sync we ship a small `scripts/prepack.mjs` helper and run packs through profile-scoped scripts that read from `.env.<profile>`:

### Two profiles, two `.ehpk`s

| Profile | `.env` file | Build script | Pack script | Output |
|---|---|---|---|---|
| **Personal** (David's host) | `.env.personal` | `npm run build:personal` | `npm run pack:personal` | `wc-personal.ehpk` |
| **Company** (Even relay) | `.env.company` | `npm run build:company` | `npm run pack:company` | `wc-company.ehpk` |

### Pack flow

1. Copy `.env.personal.example` → `.env.personal` (or `.env.company.example` → `.env.company`) and fill in `VITE_SERVER_URL` with the publicly-reachable HTTPS origin of YOUR server.
2. Run the matching pack script:
   ```bash
   npm run pack:personal
   # or
   npm run pack:company
   ```
3. Output: `wc-personal.ehpk` (or `wc-company.ehpk`) at the repo root.

### Under the hood

```
npm run pack:personal
  ├─ tsc                          (typecheck)
  ├─ vite build --mode personal   (reads .env.personal → bakes VITE_SERVER_URL into JS)
  ├─ node scripts/prepack.mjs --mode personal
  │   ├─ reads .env.personal
  │   ├─ validates VITE_SERVER_URL is https://
  │   ├─ asserts dist/index.html exists
  │   └─ writes app.packed.json (clone of app.json + network whitelist filled in)
  └─ evenhub pack app.packed.json dist -o wc-personal.ehpk
```

`app.json` stays committed with empty `permissions: []` — `app.packed.json` is gitignored, regenerated every pack.

### Manifest defaults

`app.json` declares `package_id: com.even.worldcup`, `version: 0.1.0`, `min_app_version: 2.0.0`, `min_sdk_version: 0.0.10`. Bump `version` for every redistributed build (Dev Portal requires monotonically increasing semver per `package_id`).

### Common pack failures

| Symptom | Cause | Fix |
|---|---|---|
| `prepack: .env.personal not found` | Skipped Step 5.1 | Copy `.env.personal.example` and fill in URL |
| `prepack: VITE_SERVER_URL must be HTTPS` | `http://` or empty | Use the HTTPS origin from Step 4 |
| `prepack: dist/index.html missing` | Vite build failed silently | Re-run `npm run build:personal` and check for errors |
| SSE works in dev, silent on device | Whitelist origin doesn't match `EventSource` URL exactly | Both come from `VITE_SERVER_URL` in `.env.<profile>` — re-pack from a clean state |

---

## Step 6: Persistent run on macOS (launchd)

Create `~/Library/LaunchAgents/com.even.wc-server.plist` (substitute `<you>` and the repo path):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.even.wc-server</string>

  <key>WorkingDirectory</key>
  <string>/Users/<you>/path/to/even-hub-worldcup</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>npm</string>
    <string>run</string>
    <string>server</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/<you>/Library/Logs/wc-server.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<you>/Library/Logs/wc-server.err.log</string>
</dict>
</plist>
```

`ISPORTS_API_KEY` is picked up from the `.env` file inside `WorkingDirectory` by `tsx --env-file-if-exists=.env`. If you'd rather inline it, add it under `EnvironmentVariables`.

Load and verify:

```bash
launchctl load ~/Library/LaunchAgents/com.even.wc-server.plist
launchctl list | grep com.even.wc-server
tail -f ~/Library/Logs/wc-server.out.log
```

Reload after an env change:

```bash
launchctl unload ~/Library/LaunchAgents/com.even.wc-server.plist
launchctl load   ~/Library/LaunchAgents/com.even.wc-server.plist
```

### Linux equivalent (systemd)

`/etc/systemd/system/wc-server.service`:

```ini
[Unit]
Description=Even Hub World Cup SSE server
After=network-online.target

[Service]
WorkingDirectory=/srv/even-hub-worldcup
ExecStart=/usr/bin/env npm run server
Restart=always
RestartSec=5
StandardOutput=append:/var/log/wc-server.out.log
StandardError=append:/var/log/wc-server.err.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now wc-server
journalctl -u wc-server -f
```

---

## Step 7: Smoke-test E2E

1. Sideload `even-hub-worldcup.ehpk` to a G2-paired phone via the Even app dev menu.
2. Open the plugin. Phone L1 should show the upcoming-matches list; glasses L1 should show up to 5 upcoming fixtures soonest-first (filtered to both teams resolved + real `kickoffAt`). Before iSports has hydrated, both surfaces show the `World Cup / Awaiting data` empty header.
3. Tap a match. Phone L2 detail renders score, status, and badge row; glasses L2 renders the 3-row event log + permanent PEN slot (`PEN --` until shootout).
4. `tail -f ~/Library/Logs/wc-server.out.log` and confirm SSE `delta` frames flow when a live match minute ticks (`minute` deltas every poll, `event-applied` on goals/cards/subs).
5. Switch the phone location strip — verify all kickoff timestamps re-render in the chosen IANA zone; the selection persists across reload via `localStorage` key `wc:settings`.

---

## Operations

- **iSports outage / rate-limit**: `BackoffLoop` (in `server/isports/poller.ts`) doubles `baseMs * 2^failures` per failure, capped at 5 min. Recovery resets to base on the first success. Log lines: `[poll <loop>] failed: <reason>; next attempt in <ms>ms`. No action needed.
- **API key rotation**: edit `.env`, then reload:
  ```bash
  launchctl unload ~/Library/LaunchAgents/com.even.wc-server.plist
  launchctl load   ~/Library/LaunchAgents/com.even.wc-server.plist
  ```
- **Schedule changes mid-tournament**: the schedule loop refetches every 12h on its own. To force a refresh sooner, restart the service (`launchctl kickstart -k gui/$(id -u)/com.even.wc-server`).
- **Logs**: `tail -f ~/Library/Logs/wc-server.out.log` (stdout) and `wc-server.err.log` (stderr). Both rotate manually — wire `newsyslog` or just truncate as needed.
- **Updating client bundle**: rebuild with the same `VITE_SERVER_URL` (Step 5), bump `app.json` `version`, redistribute. Server requires no restart for client-only changes.
- **Server-only hotfix**: `git pull && launchctl kickstart -k gui/$(id -u)/com.even.wc-server`. `tsx watch` auto-reloads on file change too, so a `git pull` alone often suffices.

---

## Tests

```bash
npm test           # 7 test files, one-shot, exits in ~500ms
npm run test:watch # iterate on tests
```

| File | Covers |
|---|---|
| `test/client-store-sse.test.ts` | `EventSource` shim + `serverClient`/`Store` integration — snapshot hydrate, delta apply, reconnect. |
| `test/format.test.ts` | Pure formatters in `src/g2/format.ts` — `statusVerbose`, `listLeft/Right`, asciiName edge cases, kickoff/penalty text. |
| `test/isports-client.test.ts` | Typed iSports HTTP wrappers — URL building, `api_key` injection, error shapes. |
| `test/isports-decode.test.ts` | Pure decoders — `decodeStatus`, `decodeEventType`, `decodeStage`. |
| `test/isports-transform.test.ts` | `transformMatch` / `transformEvent` / `transformEvents` against fixtures in `server/fixtures/` — null-drops, sub arrows, penalty extraction, kickoff conversion. |
| `test/server-http.test.ts` | E2E SSE — boot `createApp()`, connect over `http`, assert `snapshot` then live `delta` framing + heartbeat + cleanup. |
| `test/store.test.ts` | Client `Store` — `applyDelta` per variant, `getLive/Upcoming/Past`, subscriber notify discipline. |

---

## Reference URLs

- Repo: https://github.com/LesenmiaoYu/even-hub-worldcup
- iSports docs: https://www.isportsapi.com
- Even Hub SDK: https://www.npmjs.com/package/@evenrealities/even_hub_sdk
- Spec: ./spec.md
