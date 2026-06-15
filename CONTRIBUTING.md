# Contributing

Thanks for wanting to help. This is a community project — pull requests are welcome.

## Scope — what we accept

| Welcome | Pause and ask first |
|---|---|
| Bug fixes (live minute drift, timezone gaps, stuck states, render glitches) | Brand-new features outside the World Cup remit |
| New language translations (add a locale to `src/i18n/`) | Switching the data provider away from iSports |
| Timezone catalog additions (`src/state/regions.ts`) | Rewriting the SSE protocol |
| Team / venue name dictionary additions (`src/i18n/teams.ts`, `src/i18n/venues.ts`) | Adding a database, login, paid tier |
| Performance / code-quality cleanups in the same shape | Anything that pulls in heavy runtime deps |
| Test coverage | Style-only churn with no behaviour delta |
| Doc clarifications | Renaming app id `com.even.worldcup` |

The aim is to keep the codebase small enough that one person can hold the whole thing in their head. If a change moves us away from that, open an issue first so we can talk about it.

## Local development

You can run the full stack with no API key by using fixture mode:

```bash
git clone https://github.com/LesenmiaoYu/even-hub-worldcup.git
cd even-hub-worldcup
npm install
cp .env.example .env
echo "USE_FIXTURES=true" >> .env
npm run dev:all
```

`USE_FIXTURES=true` boots the server from a captured iSports `/schedule` snapshot at `server/fixtures/schedule-wc2026.json` and skips all polling. You get a fully populated bracket and a live SSE stream — no live updates, but every UI surface renders.

Open `http://localhost:5173` for the phone WebView. For the G2 glasses surface, run the simulator:

```bash
npx evenhub-simulator
```

For testing against the live iSports API:

1. Subscribe to the iSports Football API "Live Data" plan at <https://www.isportsapi.com>.
2. Put the key in `.env` as `ISPORTS_API_KEY=...`.
3. Remove or set `USE_FIXTURES=false`.
4. `npm run dev:all`.

The free tier exhausts the 5-second livescores loop in under 20 minutes — fixture mode is the right answer for almost all development.

## Tests

```bash
npm test           # one-shot
npm run test:watch # vitest watch mode
```

Suite is 106 tests across 7 files (HTTP client, decoders, transforms, store, SSE end-to-end, format helpers, client store + SSE). PRs that change behaviour need either a new test that fails before your change and passes after, or a one-line note in the PR description explaining why a test is impractical.

## Adding a language

The i18n system is set up to make this cheap.

1. Copy `src/i18n/en.ts` to `src/i18n/<locale>.ts` (e.g. `de.ts` for German).
2. Translate every string. Keep the keys identical to `en.ts`.
3. Add the locale to `src/i18n/types.ts` (`LOCALES`, `LOCALE_LABEL`, `Locale` union).
4. Wire it up in `src/i18n/index.ts` (import + `STRINGS[<locale>]`).
5. Add a country-to-locale mapping in `src/i18n/index.ts:localeForCountry()` if there's a sensible default (e.g. `DE → de`).
6. Optional but encouraged: add a translation pass for team names (`src/i18n/teams.ts`) and venues (`src/i18n/venues.ts`). If you skip these, English fallback is used.

There is no translation-completeness CI gate. The `t()` helper falls back to English for any missing key, so partial PRs that translate the phone UI but leave glasses strings in English are fine to ship — just say so in the PR description.

## Adding a timezone

Cities are in `src/state/regions.ts`. Add the IANA name (e.g. `Europe/Berlin`), the display name, the country code, and put it in the right continent group. The catalog is used both for the picker and for country-driven defaults.

## Branch / PR flow

- Fork the repo, branch from `main`.
- Branch naming: `fix/<short-desc>`, `feat/<short-desc>`, `lang/<locale>`, `docs/<short-desc>`.
- One concern per PR. If you find yourself writing "and also fixed X" in the description, split it.
- Run `npm test` and `npm run build` before pushing.
- PR description: what changed, why, how you verified (screenshots / log snippets / which test).
- Be ready for review comments. Some changes may need a discussion before they merge.

## Code style

- No new runtime dependencies without discussion.
- TypeScript strict mode stays on. No `any` unless you've tried and the type can't be expressed.
- Match the existing style — comments only when the *why* is non-obvious.
- No emojis in code, comments, or commit messages.

## Reporting bugs

Open an issue on GitHub with:
- What you saw.
- What you expected.
- How to reproduce — ideally with `USE_FIXTURES=true` so reviewers can run it offline.
- Browser / SDK version / `.ehpk` version (`app.json:version`).

## Code of conduct

Be kind. Keep it about the work. Maintainers can close issues or PRs that don't fit the scope or the spirit of the project.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
