# wc-server — authoritative match state over SSE

Tiny Node http server that holds World Cup match state and streams it to
N clients (phone + glasses + future devices). Replaces the in-browser
`src/state/mockServer.ts` tick driver so all surfaces stay in sync.

This is Phase 0+1 of the client/server split. Phase 3 swaps the seed for
iSports.

## Run

```bash
# install once (adds tsx + concurrently to devDependencies)
npm install

# server only
npm run server
# → http://localhost:3001

# server + vite together
npm run dev:all
```

The server binds to `:3001` (vite stays on `:5173`).

## Endpoints

| Method | Path       | Purpose                                  |
|--------|------------|------------------------------------------|
| GET    | `/health`  | `{ ok: true, uptimeSec }`                |
| GET    | `/events`  | SSE stream (snapshot + deltas)           |
| POST   | `/command` | debug actions (see below)                |

### `GET /events`

On connect:

```
event: snapshot
data: {"matches":[ ... 8 matches ... ]}
```

Then one event per state change:

```
event: delta
data: {"type":"minute","matchId":"sf1","minute":42}

event: delta
data: {"type":"event-applied","matchId":"sf1","event":{"minute":67,"type":"goal","side":"home","player":"Álvarez"},"scoreDelta":{"home":1},"match":{ ... full match ... }}

event: delta
data: {"type":"bracket-resolved","matchId":"final","home":"ARG","away":null}

event: delta
data: {"type":"reset","matchId":"sf1","match":{ ... full match ... }}
```

Every `event-applied` and `reset` includes the full post-change match
snapshot so clients reconcile without state divergence.

A `: ping` comment fires every 15s as a keepalive — clients can ignore it.

### `POST /command`

```bash
curl -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"command":"start_live"}'
```

| command        | effect                                                                 |
|----------------|------------------------------------------------------------------------|
| `start_live`   | Reset SF1 to fresh kickoff, clear downstream bracket slots, start tick |
| `mbappe_goal`  | Apply away goal for Mbappé at current minute on SF1                    |
| `sub`          | Apply sub Mbappé → Coman at current minute on SF1                      |
| `ping`         | `{ ok: true, pong: true }`                                             |

Returns `{ ok: true }` or `{ ok: false, error: "..." }`.

## Quick smoke test

```bash
# boot
npm run server > /tmp/wc-server.log 2>&1 &
sleep 2

curl -s http://localhost:3001/health
# {"ok":true,"uptimeSec":2}

# snapshot — bail after 2s
curl -s -N --max-time 2 http://localhost:3001/events | head -2

# kick off the live demo
curl -s -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"command":"start_live"}'

curl -s -X POST http://localhost:3001/command \
  -H 'Content-Type: application/json' \
  -d '{"command":"mbappe_goal"}'

# shutdown
pkill -f "tsx.*server/index.ts"
```

## iSports mode

By default the server boots from the mock seed in `seed.ts`. To run
against real iSports data (FIFA World Cup 2026, leagueId 1572):

```bash
# one-time: copy the template, fill in the key
cp .env.example .env
$EDITOR .env  # set ISPORTS_API_KEY=... and ENABLE_ISPORTS=true

# boot
ENABLE_ISPORTS=true npm run server
```

The `.env` file is gitignored. The npm `server` script auto-loads it
via Node's `--env-file-if-exists` flag, so you can also export the env
vars in your shell instead.

On boot in iSports mode the server:

1. Fetches `/schedule?leagueId=1572` (one round trip, blocks listen).
2. Transforms each row into a `Match` and seeds the store.
3. Starts three polling loops, then begins listening on `:3001`.

| Loop | Interval | Endpoint | Owns |
|---|---|---|---|
| Schedule | 12h | `/schedule?leagueId=1572` | full match list + bracket projection |
| Livescores | 5s | `/livescores/changes` | score · state · minute · pens |
| Events | 60s | `/events` | event timeline (dedup by `eventId`) |

Network failures are logged at `warn` and never crash the process —
the next interval retries. iSports app-level errors (`code !== 0`) are
also logged and ignored on the fast loops. On `SIGTERM` / `SIGINT` the
pollers stop and the server closes cleanly.

First boot in iSports mode takes a few seconds while the schedule
fetch lands. The SSE event shapes (`snapshot` / `delta`) are identical
to mock mode — no client-side changes required.

## Architecture notes

- `seed.ts` is a verbatim port of `src/mock/tournament.ts`. When the
  client switches to consuming SSE, the client copy retires and this
  becomes the source of truth.
- `state.ts` owns the match list, the tick driver, and the broadcast
  fan-out. One `MatchStore` instance per process.
- Tick driver is **only** started by the `start_live` command — boot is
  quiet (the seed has SF1 as FT).
- On FT, the tick is stopped **before** the bracket resolves so a
  trailing `setInterval` callback can't bump minute=95 on a finished
  match.
