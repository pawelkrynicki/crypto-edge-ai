# Crypto Edge AI — Camp BETA UI Mock

This directory contains the first UI mock / frontend preview for the **Crypto Edge AI Camp BETA**. 

It demonstrates the visual direction, product structure, and trader value proposition (research, risk, scam filtering) before the full backend integration.

## Features
- **Dark, professional UI**: Aligned with the AIKINTEL aesthetic.
- **Scanner Radar**: Product-grade candidate list and detail workspace showing scanner labels, local review status, security labels, market metrics, and read-only scanner reasons.
- **Market Context Panel**: Shows Alternative.me Fear & Greed plus DefiLlama context from the local API bridge.
- **Candidate Detail Panel**: In-depth breakdown of a selected token, including research context/data coverage, a trader checklist, and risk reasons.
- **Local Review Session**: Local analyst workspace for per-candidate review status, analyst note, and last-updated timestamp.
- **Review Backup**: Export/import the review session as JSON for lightweight analyst backup.
- **Review Storage Diagnostics / Reset**: Shows local review storage health and provides a guarded reset for local review status and analyst notes.
- **Review Storage Provider**: Keeps the local API endpoints behind a storage-provider interface. File-backed JSON remains the default provider, with optional SQLite available through env configuration.
- **Analyst Report Export**: Generates a local Markdown plus JSON analyst report from scanner latest output, market context, review session, and review diagnostics.
- **Research Review (Mock)**: A text area to paste news/events and see a mock AI risk categorization.
- **Review Queue & Risk Alerts**: Dedicated tabs for local analyst follow-up, scanner WATCHLIST candidates, and critical risks.
- **Methodology**: Explanation of the staged review process.

## UX1 Professional Dashboard Redesign

UX1 improves the dashboard information architecture and visual hierarchy without changing data behavior. The preview uses a top product header, a compact Market Context block, a short KPI strip, a clearer Scanner Radar workspace, and a wider Candidate Detail working panel.

UX1 itself added no new data sources, API endpoints, backend services, storage model changes, scanner scoring changes, final-label changes, or WATCHLIST meaning changes. Market Context and Local Review Session are easier to find.

UX2 Product-grade Interface Redesign is now continued through 10B.2, but the full UX2 redesign is not complete.

## 10A Product Workflow Polish

10A adds a small Local MVP workflow guide to the dashboard without implementing UX2. The panel shows the local research path:

```text
Scanner latest -> Market context -> Candidate detail -> Local review -> Review queue -> Analyst report -> Local MVP health check
```

The UI now makes these layers more explicit:

- Scanner label comes from scanner latest output.
- Local review status is a local analyst note layer.
- Analyst report export is generated locally from CMD with `scripts\win\generate-analyst-report.cmd`.
- Local MVP health is checked with `scripts\win\check-local-mvp.cmd`.

Scanner source status distinguishes `real-output` from `fixture-fallback`. Market context distinguishes `approved-sources-output` from `fixture-fallback`. Review storage distinguishes local API, file-backed JSON or SQLite metadata when available, and browser `localStorage` fallback.

This polish adds no endpoints, npm dependencies, auth, production backend, production cron, new sources, scraping, OpenAI call, scanner scoring change, `final_label` change, or `WATCHLIST` meaning change. UX2 Product-grade Interface Redesign remains a future required stage.

## 10B.1 UX2 Information Architecture Shell

10B.1 starts UX2 with an information architecture and layout skeleton only. The app now opens into a product-grade workspace shell with this structure:

```text
Overview -> Scanner Radar -> Review Queue -> Research Review -> Risk Alerts -> Methodology
```

Overview contains Market Context, Local MVP workflow status, scanner stat cards, and local health/report command copy. Scanner Radar remains the read-only scanner output and Candidate Detail workspace. Review Queue remains the local analyst status, notes, backup, diagnostics, reset, and report command workspace.

The full UX2 redesign remains in progress. Planned next steps are:

- 10B.2 Scanner / Candidate Detail Redesign
- 10B.3 Review Queue + Report Workspace
- 10B.4 Visual QA / Polish

10B.1 does not change endpoint paths, scanner scoring, `final_label`, `WATCHLIST` meaning, review storage behavior, report generation logic, npm dependencies, auth, production backend, production cron, new sources, scraping, browser automation, undocumented endpoints, or OpenAI calls.

## 10B.2 UX2 Scanner / Candidate Detail Redesign

10B.2 redesigns only the Scanner Radar and Candidate Detail work area. Scanner Radar now uses a clearer candidate-card list beside the selected Candidate Detail panel. Candidate cards keep scanner `final_label`, security label, local review status, market cap, liquidity, 24h volume, age, and the first scanner reason visible without adding investment CTAs.

Candidate Detail now has stronger product-grade sections for Local Review Session, Scanner Label vs Local Review, Quick Snapshot, Security & Manual Verification, Data Coverage & Context, Scanner Label / Reasons, and Reasoning Checklist. Guidance copy clarifies that scanner output is read-only, `WATCHLIST` means eligible for further manual review only, local review is an analyst note layer, missing security/context data requires manual verification, and this is not a buy/sell signal.

10B.2 changes no endpoint paths, data-source policy, review save/clear/import/export behavior, analyst report generation, scanner scoring, `final_label`, or `WATCHLIST` meaning. It adds no npm dependencies, auth, production backend, production cron, new sources, scraping, browser automation, undocumented endpoints, or OpenAI calls.

UX2 remains in progress. Planned next steps are:

- 10B.3 Review Queue + Report Workspace
- 10B.4 Visual QA / Polish

## Important Product Rules
- **No Buy Signals**: Crypto Edge AI is a research tool, not a trading bot.
- **WATCHLIST ≠ Buy**: The `WATCHLIST` label strictly means "eligible for further review". It explicitly states "Further review only, not a buy signal."
- **Local Bridges Only**: This preview uses fixtures or local API bridge endpoints. The frontend does not call Alternative.me, DefiLlama, paid data sources, a database, or OpenAI directly.
- **Context Does Not Change Labels**: Market context appears in the token detail for research framing only. It does not change scanner labels, scoring, or WATCHLIST meaning.
- **Local Review Is Separate**: Analyst review status and notes are saved in local review storage when available, with browser `localStorage` as fallback. They do not change scanner labels, scoring, or WATCHLIST meaning.

## Local Review Session

The scanner detail panel now includes a **Local Review Session** section. It lets the analyst save a local status, short note, and last-updated timestamp for each candidate.

Persistent Review Storage API v1 uses the local API bridge when available:

```text
GET /api/review-session
PUT /api/review-session
GET /api/review-session/diagnostics
```

The file-backed JSON store lives at:

```text
tools/ui-mock/.local/review-session.json
```

SQLite Review Storage Provider v1 is available as an optional local provider. It does not migrate JSON data automatically and does not change endpoint paths or the UI workflow.

Enable SQLite with:

```text
CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite
```

Optional SQLite path override:

```text
CRYPTO_EDGE_REVIEW_SQLITE_PATH=...
```

Default SQLite file:

```text
tools/ui-mock/.local/review-session.sqlite
```

The browser fallback key remains:

```text
crypto-edge-ai.review-session.v1
```

Review statuses:

- Not reviewed
- Needs more research
- Saved for follow-up
- Dismissed after review
- Waiting for more data

The review layer has no production backend, auth, production database, or scanner-output mutation. The only write path is the local development API bridge, and the browser keeps `localStorage` as a fallback/mirror. SQLite is an optional local storage provider behind the same API workflow. It is only for organizing local analyst work. The Scanner Radar candidate cards show a small **Review** badge, and the Scanner Radar includes a **Follow-up** filter based on the local `Saved for follow-up` status.

## Review Storage Diagnostics / Reset

The Review Queue **Review Backup** section now includes local storage diagnostics and a guarded reset tool.

Diagnostics endpoint:

```text
GET /api/review-session/diagnostics
```

The diagnostics response reports only storage metadata:

- `source_kind`
- `storage_file`
- `checked_at`
- `file_exists`
- `file_size_bytes`
- `entries_count`
- `valid`
- optional `warning`

It does not return analyst notes or review entries.

The **Refresh diagnostics** button reloads that endpoint when the local API bridge is available. If the API is unavailable, the UI remains usable through browser `localStorage` fallback.

The **Reset local reviews** tool clears only local review status and analyst notes. It requires typing `RESET`, then applies an empty `ReviewSessionState` to browser storage and attempts to mirror it through the existing `PUT /api/review-session` endpoint. It does not delete scanner output, market data, source files, `tools/data-poc` output, or any approved context output.

This remains a local/developer storage tool only. It adds no auth, production backend, production cron, new data source, scraping, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change. SQLite remains optional local storage behind the existing endpoints. UX2 Product-grade Interface Redesign remains a future required stage.

## Review Export / Import Backup

The Review Queue includes a **Review Backup** section for exporting and importing the current review session as JSON.

Backup scope:

- Includes only local review status and analyst notes from `crypto-edge-ai.review-session.v1`.
- Does not include scanner output.
- Does not include market data.
- Updates browser `localStorage` and attempts to save through `PUT /api/review-session`.
- Adds no production backend, database, SQLite, auth, or new data source.

Import supports:

- **Merge with current**: imported entries overwrite local entries with the same `candidate_id`; all other local entries remain.
- **Replace current**: imported state replaces the current local review session.

Invalid JSON, unsupported backup versions, and invalid review entries are rejected with a visible error while the existing local review session is kept.

## Review Queue / Follow-up Workspace

The former Watchlist tab is now labeled **Review Queue**. It still keeps scanner `WATCHLIST` meaning unchanged and separates that scanner output from local analyst review state.

The workspace has two sections:

- **Scanner Watchlist**: candidates whose scanner `final_label` is `WATCHLIST`.
- **Local Review Queue**: candidates with a local review status other than `Not reviewed`, including `Saved for follow-up`, `Needs more research`, `Waiting for more data`, and `Dismissed after review`.

Local Review Queue uses the local API review storage provider when available and keeps the existing browser `localStorage` model at `crypto-edge-ai.review-session.v1` as fallback. File-backed JSON remains the default provider; SQLite is optional through env configuration. It does not add a production backend, auth, new data source, scanner scoring change, final-label change, or WATCHLIST meaning change. Stored local reviews that no longer match the current scanner output are shown in a small "Stored reviews not in current scan" section so the analyst can see and clear them.

Compliance copy shown in the Review Queue:

```text
Review storage uses the local API when available, with browser localStorage fallback.
Review status does not change scanner labels.
This is not a buy/sell signal.
```

Compliance copy shown in the review panel:

```text
Local review workspace only.
This does not change scanner label.
This is not a buy/sell signal.
```

## Development

This is a Vite + React + TypeScript + Tailwind CSS project.

### Commands

```bash
cd tools/ui-mock
npm install     # or pnpm install
npm run dev     # Start local development server
npm run build   # Build for production
```

### Windows Helper Scripts

Windows CMD helpers for checking the UI mock, starting the API/frontend preview, and freeing local ports are documented in `../../scripts/win/README.md`. The UI mock check uses direct binaries instead of `pnpm` because of the known Windows `node_modules` / `pnpm` `EPERM` issue.

Local MVP runbook and freeze checklist:

```text
../../docs/local_mvp_runbook.md
../../docs/pre_holiday_freeze_checklist.md
```

Full local MVP health check:

```cmd
..\..\scripts\win\check-local-mvp.cmd
```

Stage 9C adds this documentation/DX checkpoint only. It does not change endpoint paths, UI workflow, scanner scoring, `final_label`, or `WATCHLIST` meaning. UX2 Product-grade Interface Redesign remains a future required stage.

Review Storage mode checks:

```cmd
..\..\scripts\win\check-review-storage-file.cmd
..\..\scripts\win\check-review-storage-sqlite.cmd
..\..\scripts\win\check-review-storage-modes.cmd
..\..\scripts\win\check-local-workflow-smoke.cmd
```

SQLite local preview:

```cmd
..\..\scripts\win\dev-ui-sqlite.cmd
```

File-backed JSON remains the default provider. SQLite is optional through `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite`, with `CRYPTO_EDGE_REVIEW_SQLITE_PATH` available for a local `.sqlite` path. The smoke checks use only dedicated files under `.local`: `review-session-smoke.json` and `review-session-smoke.sqlite`. They do not touch the normal `review-session.json` or `review-session.sqlite` files. There is no automatic JSON-to-SQLite migration. Endpoint paths and UI workflow are unchanged.

Local workflow smoke:

```bash
pnpm run workflow:smoke
```

or from the repo root on Windows:

```cmd
scripts\win\check-local-workflow-smoke.cmd
```

This starts the existing local API on a random `127.0.0.1` port and checks scanner latest output, scanner source diagnostics, market context latest output, review session `GET`/`PUT`/diagnostics, invalid review write rejection, review export/import helpers, and server-render smoke coverage for Market Context, Candidate Detail, and Review Queue paths.

It uses only local real-output files or local fixture fallback files. It writes only a dedicated `.local\local-workflow-smoke-review-session.json` file with a cleanup guard. It does not call external networks, mutate scanner output, mutate market data, add data sources, change endpoint paths, change UI workflow, change scoring, change `final_label`, or change `WATCHLIST` meaning. UX2 Product-grade Interface Redesign remains a future stage.

Analyst report export:

```bash
pnpm run report:analyst
pnpm run report:analyst:smoke
```

or from the repo root on Windows:

```cmd
scripts\win\generate-analyst-report.cmd
scripts\win\check-analyst-report.cmd
```

The normal report writes Markdown and JSON files to:

```text
tools\ui-mock\.local\reports
```

The report is a local analyst research workflow export. It summarizes scanner metadata and labels, review statuses and notes, stored reviews not in the current scan, approved market context, and a neutral candidate snapshot. The JSON includes `report_version = 1`, summary counts, review entries, market context summary, and candidate snapshot data.

The generator starts the existing local API on `127.0.0.1`, uses only existing endpoints, and guards report output paths. It does not call external networks, add data sources, mutate scanner output, mutate market data, change scoring, change `final_label`, change `WATCHLIST` meaning, add auth, add npm dependencies, or add a production backend. UX2 Product-grade Interface Redesign remains a future stage.

## Thin Scanner API POC

The local API bridge closes the current loop from persisted scanner-shaped JSON into the UI mock without adding a production backend.

- `GET /api/health` returns `{ "status": "ok", "service": "crypto-edge-ai-scanner-api" }`.
- `GET /api/context/latest` returns normalized approved free source context.
- `GET /api/scanner/latest` returns `PersistableScannerOutput` JSON.
- `GET /api/review-session` returns the current review session plus `_source_meta` from the configured provider.
- `PUT /api/review-session` validates and writes `ReviewSessionState` through the configured provider.
- `GET /api/review-session/diagnostics` returns provider diagnostics without notes or entries.
- Default API port: `5177`.
- Port override: `SCANNER_API_PORT`.
- UI API base URL: `VITE_SCANNER_API_URL=http://localhost:5177`.
- Current API data source: `public/fixtures/persistableScannerSample.json`.

Commands:

```bash
pnpm run api
pnpm run dev:with-api
```

This remains a thin local bridge only. It adds no production database, MySQL, Drizzle, auth, OpenAI, live token fetching, trading automation, or buy/sell signal wording. Optional SQLite is local review storage only. `WATCHLIST` still means eligible for further review only.

## Persistent Review Storage API v1

The local API bridge provides a transitional review store. File-backed JSON remains the default provider:

```text
tools/ui-mock/.local/review-session.json
```

The store writes `ReviewSessionState` as JSON, creates `.local` when needed, writes through a temporary file before rename, and returns an empty review session if the file is missing. If the file is corrupt or invalid, the server returns an empty session with `_source_meta.warning` instead of crashing.

The UI starts immediately from `localStorage`, then tries `GET /api/review-session`. When the API returns a valid state, the app uses it and mirrors it back to `localStorage`. Save, clear, import, and reset update React state and `localStorage` first, then attempt `PUT /api/review-session`; if the API is unavailable, the UI continues through browser fallback.

Storage diagnostics are available at `GET /api/review-session/diagnostics`. The endpoint reports the storage file path, existence, file size, entry count, validity, and warning state without returning full review entries or analyst notes. The Review Queue can refresh this diagnostics view on demand.

This stage keeps file-backed JSON as the default and now supports optional SQLite through `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite`. It does not add auth, a production backend, production cron, new data sources, scraping, OpenAI, scanner scoring changes, final-label changes, or WATCHLIST meaning changes. UX2 Product-grade Interface Redesign remains a future required stage.

## Review Storage Provider Abstraction

The local API bridge now routes review reads, writes, and diagnostics through a `ReviewSessionStorageProvider` interface. The current file-backed JSON store is the default provider implementation and keeps the same endpoint response format for:

```text
GET /api/review-session
PUT /api/review-session
GET /api/review-session/diagnostics
```

This is a technical refactor only. It does not change Review Queue behavior, localStorage fallback, reset behavior, endpoint paths, scanner output, scoring, final labels, or WATCHLIST meaning. File-backed JSON remains the default provider. Optional SQLite is available behind the same API workflow through env configuration. No auth, production backend, production cron, new data source, scraping, or OpenAI call is added. UX2 Product-grade Interface Redesign remains a future required stage.

## SQLite Review Storage Provider v1

SQLite is now available as an optional second `ReviewSessionStorageProvider` implementation. It uses Node's built-in `node:sqlite` module and adds no npm dependency.

Provider selection:

```text
CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite
```

Optional database path:

```text
CRYPTO_EDGE_REVIEW_SQLITE_PATH=...
```

Default database file:

```text
tools/ui-mock/.local/review-session.sqlite
```

File-backed JSON remains the default provider at `tools/ui-mock/.local/review-session.json`. There is no automatic migration from JSON to SQLite. The same endpoints are used:

```text
GET /api/review-session
PUT /api/review-session
GET /api/review-session/diagnostics
```

Diagnostics return provider metadata, file status, file size, entry count, validity, and optional warning only. They do not return full entries or analyst notes. The UI still starts from `localStorage`, tries the local API, mirrors valid API state back to `localStorage`, and keeps browser fallback behavior.

This adds no auth, production backend, production cron, new data source, scraping, HTML parsing, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change. UX2 Product-grade Interface Redesign remains a future required stage.

## Review Storage Mode DX / Smoke Scripts v1

Developer smoke scripts now cover both Review Storage providers without changing product behavior:

- `scripts\win\check-review-storage-file.cmd` verifies the default file-backed JSON provider.
- `scripts\win\check-review-storage-sqlite.cmd` verifies the optional SQLite provider.
- `scripts\win\check-review-storage-modes.cmd` runs both.
- `scripts\win\dev-ui-sqlite.cmd` starts the local preview with SQLite Review Storage.

The smoke runner starts `createScannerApiServer` on a random local port, exercises the existing review endpoints, confirms invalid writes do not overwrite the saved state, and verifies diagnostics do not expose review entries or analyst notes.

This is DX/tooling only. It adds no npm dependency, auth, production backend, production cron, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, endpoint change, UI workflow change, scanner scoring change, final-label change, or WATCHLIST meaning change. UX2 Product-grade Interface Redesign remains a future required stage.

## Local End-to-End Workflow Smoke v1

`scripts\win\check-local-workflow-smoke.cmd` runs `scripts\localWorkflowSmoke.ts` as a local technical checkpoint for the MVP workflow:

```text
scanner output -> UI candidates -> market context -> candidate review -> review session storage -> diagnostics -> export/import review session
```

The runner uses the existing local API and existing service/adapter logic. It accepts either real local output or fixture fallback for scanner and context data, starts no browser, calls no external network, and does not mutate scanner output or market data. It writes only a guarded local review smoke file under `.local`.

This stage adds no npm dependency, auth, production backend, production cron, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, endpoint change, UI workflow change, scanner scoring change, final-label change, or WATCHLIST meaning change. UX2 Product-grade Interface Redesign remains a future required stage.

Next stage: read a real persisted scanner run from `tools/data-poc/output/<run_id>/full_output.json`.

## Approved Source Context API Bridge

`GET /api/context/latest` exposes the latest normalized approved free source context from:

```text
tools/data-poc/output/<run_id>/approved_sources_output.json
```

The endpoint selects the newest valid directory whose name starts with `approved_sources_`, reads `approved_sources_output.json`, validates the lightweight shape, strips any unexpected raw-provider fields, and returns:

```ts
{
  run_id: string;
  generated_at: string;
  environment: string;
  sources: NormalizedSourceOutput[];
  summary: {
    sources_requested: number;
    sources_allowed: number;
    sources_denied: number;
    records_total: number;
    warnings_total: number;
    errors_total: number;
  };
  _source_meta: {
    source_kind: "approved-sources-output" | "fixture-fallback";
    output_file: string | null;
    loaded_at: string;
  };
}
```

If no valid approved-source output exists, it falls back to `public/fixtures/contextLatestFixture.json`.

The Market Context Panel consumes this endpoint from the frontend. It displays:

- Alternative.me Fear & Greed value, classification, and timestamp.
- Up to 5 DefiLlama protocol or chain context rows with TVL and 1d/7d change.
- Source status, environment, summary counts, and warning/error counts.
- Research-only compliance copy.

The token detail panel also receives the already-loaded context state from the app. Its **Data Coverage & Context** section shows available approved free context, scanner/security coverage, API unavailable or fixture fallback state, and missing future categories such as paid market/onchain data, dedicated scam/security sources, unlocks/vesting, wallet clusters, and social sentiment.

This endpoint is read-only. It does not call Alternative.me, DefiLlama, or any external API from the frontend. It does not scrape, parse HTML, use browser automation, read undocumented endpoints, add auth, add a database, add OpenAI, add paid data sources, or change scanner scoring.

Paid sources remain deferred: CoinGecko Analyst, TokenSniffer, Tokenomist, GoPlus after written commercial-use clarification, and Bubblemaps/Arkham after sales and pricing clarification.

## Real Scanner Output Bridge POC

`GET /api/scanner/latest` now checks `tools/data-poc/output/<run_id>/full_output.json` before using the fixture. It selects the newest valid run by preferring `scan_run.finished_at`, then `scan_run.started_at`, then the `full_output.json` file mtime.

If no valid real output is available, the endpoint falls back to `public/fixtures/persistableScannerSample.json`. The response includes `_source_meta` with the selected source, path, reason, selected run id, and load timestamp.

Diagnostics are available at `GET /api/scanner/sources`. This endpoint reports whether the output directory exists, how many runs and `full_output.json` files were found, which file would be selected, fixture availability, and up to 10 recent runs with validation status.

This remains read-only and local. It does not add a database, auth, OpenAI, live token fetching, scanner logic changes, UI redesign, or trading signal behavior. Next stage: automate writing a real `tools/data-poc` run and verify the UI against API mode.

## Next Steps
- Connect this UI to the persistable JSON outputs from `tools/data-poc` or a real backend API.
- Replace mock data with live combined scanner data.
- Integrate real OpenAI calls for the Research Review tab.

## UI Data Adapter

The UI currently operates without a backend or live API. However, it is structurally prepared to consume real data from the `tools/data-poc` pipeline via the UI Data Adapter.

- **Types (`src/types/scannerTypes.ts`)**: Defines `PersistableScannerOutput` matching the exact shape of `full_output.json`. Also defines `UiTokenCandidate`, the flat structure consumed by React components.
- **Adapter (`src/adapters/scannerOutputAdapter.ts`)**: A mapping function `mapPersistableScannerOutputToUiCandidates` that transforms the nested persistable data into flat UI candidates. It handles security check matching, fallback labels, and splitting reasons into filter/critical/warning categories.
- **Fixture (`src/fixtures/persistableScannerSample.ts`)**: A mock dataset in the exact shape of `PersistableScannerOutput`, providing 7 candidates that cover all edge cases (WATCHLIST, REJECT, CRITICAL_RISK, NEEDS_MANUAL_VERIFICATION, missing security data, partial scorecards).
- **Integration (`src/mockData.ts`)**: The UI uses the adapter to generate the `MockCandidate` array from the fixture. 

**Next Step**: To connect real data, replace `PERSISTABLE_SCANNER_SAMPLE` in `mockData.ts` with a `fetch()` call to a local `full_output.json` file or a thin API endpoint.

---

## UI Data Bridge (Local JSON / API)

### New files added

| File | Purpose |
|---|---|
| `src/services/scannerDataSource.ts` | Bridge service — loads `PersistableScannerOutput` from one of three sources and returns `ScannerDataSourceResult` |
| `src/fixtures/persistableScannerSample.json` | Static JSON version of the fixture — can be swapped for real `full_output.json` |
| `public/fixtures/persistableScannerSample.json` | Same file served at `/fixtures/persistableScannerSample.json` for runtime `fetch` |

### Data source selector

The header now shows a **Fixture / Static JSON / API** segment control. Switching source:
1. Calls `loadScannerDataSourceResult(source)` from `scannerDataSource.ts`
2. Runs the result through the existing adapter (`mapPersistableScannerOutputToUiCandidates`)
3. Updates `candidates` state in `App.tsx`
4. All tabs (Scanner Radar, Watchlist, Risk Alerts) re-render with new data

If a source is unavailable (e.g. API not yet implemented), the service falls back to the fixture and shows a yellow notice banner in the UI.

### Connecting real data

**Option A — Static JSON drop-in:**
```bash
cp path/to/real_full_output.json tools/ui-mock/public/fixtures/persistableScannerSample.json
```
Then select "Static JSON" in the UI. No code changes required.

**Option B — API endpoint:**
Implement `GET /api/scanner/latest` returning `PersistableScannerOutput` JSON.
Select "API / latest" in the UI. The bridge will fetch it automatically.

### Architecture

```
[Data Source Selector]
        │
        ▼
scannerDataSource.ts
  ├── "fixture"     → PERSISTABLE_SCANNER_SAMPLE (TS import, always available)
  ├── "static-json" → fetch /fixtures/persistableScannerSample.json
  └── "api"         → fetch /api/scanner/latest  (future)
        │
        ▼ PersistableScannerOutput
scannerOutputAdapter.ts
        │
        ▼ UiTokenCandidate[]
App.tsx (candidates state)
        │
        ├── StatCards (summary counts)
        ├── ScannerRadar (table + detail panel)
        ├── WatchlistTab (Review Queue / WATCHLIST and local review queue)
        └── RiskAlerts (CRITICAL_RISK + NEEDS_MANUAL_VERIFICATION filter)
```
