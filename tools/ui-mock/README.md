# Crypto Edge AI — Camp BETA UI Mock

This directory contains the first UI mock / frontend preview for the **Crypto Edge AI Camp BETA**. 

It demonstrates the visual direction, product structure, and trader value proposition (research, risk, scam filtering) before the full backend integration.

## Features
- **Dark, professional UI**: Aligned with the AIKINTEL aesthetic.
- **Scanner Radar**: Main table view showing token candidates with market data, basic filter status, security checks, and final labels.
- **Market Context Panel**: Shows Alternative.me Fear & Greed plus DefiLlama context from the local API bridge.
- **Candidate Detail Panel**: In-depth breakdown of a selected token, including research context/data coverage, a trader checklist, and risk reasons.
- **Research Review (Mock)**: A text area to paste news/events and see a mock AI risk categorization.
- **Watchlist & Risk Alerts**: Dedicated tabs for tracking eligible candidates and critical risks.
- **Methodology**: Explanation of the staged review process.

## Important Product Rules
- **No Buy Signals**: Crypto Edge AI is a research tool, not a trading bot.
- **WATCHLIST ≠ Buy**: The `WATCHLIST` label strictly means "eligible for further review". It explicitly states "Further review only, not a buy signal."
- **Local Bridges Only**: This preview uses fixtures or local API bridge endpoints. The frontend does not call Alternative.me, DefiLlama, paid data sources, a database, or OpenAI directly.
- **Context Does Not Change Labels**: Market context appears in the token detail for research framing only. It does not change scanner labels, scoring, or WATCHLIST meaning.

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

## Thin Scanner API POC

The local API bridge closes the current loop from persisted scanner-shaped JSON into the UI mock without adding a production backend.

- `GET /api/health` returns `{ "status": "ok", "service": "crypto-edge-ai-scanner-api" }`.
- `GET /api/context/latest` returns normalized approved free source context.
- `GET /api/scanner/latest` returns `PersistableScannerOutput` JSON.
- Default API port: `5177`.
- Port override: `SCANNER_API_PORT`.
- UI API base URL: `VITE_SCANNER_API_URL=http://localhost:5177`.
- Current API data source: `public/fixtures/persistableScannerSample.json`.

Commands:

```bash
pnpm run api
pnpm run dev:with-api
```

This remains a thin local bridge only. It adds no database, MySQL, Drizzle, auth, OpenAI, live token fetching, trading automation, or buy/sell signal wording. `WATCHLIST` still means eligible for further review only.

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
        ├── WatchlistTab (WATCHLIST filter)
        └── RiskAlerts (CRITICAL_RISK + NEEDS_MANUAL_VERIFICATION filter)
```
