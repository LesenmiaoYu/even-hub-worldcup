# World Cup — Even Hub plugin

Live FIFA World Cup 2026 scores on Even Realities G2 smart glasses and the companion phone app, in 4 languages, fed by [iSports Football API](https://www.isportsapi.com) over Server-Sent Events.

Two surfaces, one bundle:

- **Glasses (G2)**: two-list match view, detail page with score + status + event log
- **Phone (WebView in the Even Realities app)**: matches list (Live / Upcoming / Results), bracket, match detail, settings (timezone + language)

---

## Not affiliated with anyone

This is a **community project, made for the love of the game**.

- **Not affiliated with, endorsed by, or sponsored by FIFA.** "FIFA World Cup" is a trademark of FIFA.
- **Not affiliated with, endorsed by, or sponsored by any national federation, broadcaster, or sponsor of the World Cup.**
- **Not a commercial product of Even Realities.** Even Realities is the platform target (the glasses and the Even Hub SDK we build against), not a sponsor or partner of this project. The app id `com.even.worldcup` is used because the Even Hub package id namespace is `com.even.*` — nothing more.
- **Data via iSports.** Match data is provided by the third-party iSports Football API, which is independent of this project. iSports terms apply to the data; using this software does not grant any rights to that data.
- **MIT-licensed.** Fork it, ship your own version, send it back. See [LICENSE](LICENSE).

If you're FIFA, the IOC, Even Realities, iSports, or any other party with a concern about how this project is described or operates, please open a GitHub issue and we'll talk.

---

## Quick start (no API key — fixture mode)

You can run the full stack against a captured snapshot, no subscription required.

```bash
git clone https://github.com/LesenmiaoYu/even-hub-worldcup.git
cd even-hub-worldcup
npm install
cp .env.example .env
echo "USE_FIXTURES=true" >> .env
npm run dev:all
```

- Phone WebView: <http://localhost:5173>
- Server health: <http://localhost:3001/health>
- Glasses simulator: `npx evenhub-simulator` (separate terminal)

You get a populated 64-match bracket via SSE. No live updates — that's expected in fixture mode.

## Quick start (live data)

1. Subscribe to the iSports "Live Data" plan at <https://www.isportsapi.com> — the free tier exhausts the 5s polling loop in under 20 minutes.
2. Put the key in `.env`:
   ```
   ISPORTS_API_KEY=your_key_here
   ```
3. `npm run dev:all`.

## Building an `.ehpk` to install on real glasses

```bash
cp .env.personal.example .env.personal
# edit .env.personal — set VITE_SERVER_URL=https://your-public-host.example.com
npm run pack:personal
# → wc-personal.ehpk at repo root
```

Upload the `.ehpk` via the Even Hub Developer Portal. Full deployment runbook (server hosting, Cloudflare Tunnel / Tailscale Funnel / nginx, launchd / systemd) is in [DEPLOY.md](DEPLOY.md).

---

## Architecture in 30 seconds

```
iSports REST  ─▶  Node poller (3 BackoffLoops)  ─▶  MatchStore
                  (or fixture file if USE_FIXTURES=true)  │ subscribe
                                                          ▼
                                                    GET /events  (SSE)
                                                          │
                       Even App WebView  ◀────────────────┘
                       (.ehpk: Vite bundle, single render store)
                              │
                              ├─▶ G2 bridge (LVGL render queue)
                              └─▶ Phone DOM
```

The server is the only writer. Phone and glasses subscribe to the same SSE stream and apply deltas into an in-memory store. There's no database, no auth, no per-user state. The full engineering spec is in [spec.md](spec.md).

## Repo layout

```
.
├── README.md            this file
├── CONTRIBUTING.md      how to contribute
├── LICENSE              MIT
├── CHANGELOG.md         release notes
├── DEPLOY.md            production deployment runbook
├── spec.md              full engineering spec
├── app.json             EvenHub manifest (id, version, permissions)
├── package.json         npm scripts + deps
├── server/              Node SSE backend
│   ├── index.ts         entry — boots store, hydrates, listens
│   ├── isports/         iSports REST adapter
│   ├── fixtures/        offline snapshot for USE_FIXTURES mode
│   ├── state.ts         in-memory MatchStore + delta emitter
│   └── sse.ts           SSE writer
├── src/                 client bundle (phone + glasses)
│   ├── phone/           DOM rendering for the Even app WebView
│   ├── g2/              glasses render via Even Hub SDK
│   ├── state/           Store, SSE client, settings, regions
│   └── i18n/            EN / ZH / JA / ES strings + teams + venues
├── scripts/             prepack + build helpers
└── test/                vitest suite (106 tests)
```

## Languages

English, 简体中文, 日本語, Español. The default is picked from your Even Realities account country (CN/TW/HK/MO/SG → ZH, JP → JA, ES + Latin America → ES, else EN); the language picker lets you override it. Team and venue names are also translated. See [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-language) to add yours.

## Contributing

Pull requests are welcome. The scope is narrow on purpose — see [CONTRIBUTING.md](CONTRIBUTING.md) for what we accept, the local dev setup (fixture mode, no API key needed), the language-addition guide, and the PR flow.

## Acknowledgments

- **iSports** — match data provider
- **Even Realities** — the G2 glasses and the [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk) this plugin runs on
- **`flag-icons`** — country flags in the phone UI
- Everyone who reported a bug in the early days. The Live / Upcoming / Past status logic is sharper for it.

---

## License

[MIT](LICENSE). For the love of the game.
