# Crypto Edge AI — Camp BETA UI Mock

This directory contains the first UI mock / frontend preview for the **Crypto Edge AI Camp BETA**. 

It demonstrates the visual direction, product structure, and trader value proposition (research, risk, scam filtering) before the full backend integration.

## Features
- **Dark, professional UI**: Aligned with the AIKINTEL aesthetic.
- **Scanner Radar**: Main table view showing token candidates with market data, basic filter status, security checks, and final labels.
- **Candidate Detail Panel**: In-depth breakdown of a selected token, including a trader checklist and risk reasons.
- **Research Review (Mock)**: A text area to paste news/events and see a mock AI risk categorization.
- **Watchlist & Risk Alerts**: Dedicated tabs for tracking eligible candidates and critical risks.
- **Methodology**: Explanation of the staged review process.

## Important Product Rules
- **No Buy Signals**: Crypto Edge AI is a research tool, not a trading bot.
- **WATCHLIST ≠ Buy**: The `WATCHLIST` label strictly means "eligible for further review". It explicitly states "Further review only, not a buy signal."
- **Mock Data Only**: This preview uses hardcoded mock data aligned with the `CombinedScanner` output from `tools/data-poc`. It does not make real API calls, connect to a database, or use real OpenAI models yet.

## Development

This is a Vite + React + TypeScript + Tailwind CSS project.

### Commands

```bash
cd tools/ui-mock
npm install     # or pnpm install
npm run dev     # Start local development server
npm run build   # Build for production
```

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
