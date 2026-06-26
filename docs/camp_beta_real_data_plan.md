# Camp BETA Real Data Plan

## Purpose

Camp BETA should be a working Crypto Edge AI tool on real data in a limited, stable pipeline.

This is still a planning document. It does not implement real fetchers, production cron scripts, migrations, auth, UI, or AI calls.

## Data Source Registry Enforcement v1

The current technical control is the Data Source Registry Enforcement v1 gate.

- Registry location: `docs/compliance/data_source_registry_v1.json`.
- Runtime policy location: `config/data_source_runtime_policy.json`.
- Sources reviewed: 21.
- Priority A: 12.
- Priority B: 9.
- Sources currently cleared for Camp BETA: 2.
- Safe default environment: `FIXTURE_ONLY`.
- Active environment variable: `CRYPTO_EDGE_DATA_ENV`.
- Environments: `FIXTURE_ONLY`, `LOCAL_POC`, `INTERNAL_BETA`, `PUBLIC_BETA`, `COMMERCIAL`.
- Source actions: `fixture_load`, `live_fetch`, `normalized_storage`, `raw_storage`, `user_display`, `derived_score_display`.

If `CRYPTO_EDGE_DATA_ENV` is missing or invalid, runtime authorization falls back to `FIXTURE_ONLY`.

For local testing only, live POC mode must be enabled explicitly:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "LOCAL_POC"
pnpm run scanner:live -- --query SOL --max-candidates 3
```

Current Camp BETA clearance:

- Alternative.me Fear & Greed and DefiLlama are the only sources currently cleared by the registry for Camp BETA.
- The runtime policy is intentionally stricter than the research registry; registry presence does not grant runtime permission.
- DexScreener, GoPlus Security, and Honeypot.is are not approved for PUBLIC_BETA; they remain LOCAL_POC-only POC sources pending written clarification or permission.
- BscScan, AIKINTEL Market News automated access, Etherscan, and all unlisted sources remain blocked until an explicit future runtime-policy update.
- Unknown sources fail closed.
- Raw API response storage is disabled in v1.
- No scraping fallback is allowed. API failure must not fall back to scraping, HTML parsing, browser automation, undocumented endpoints, or invented data.

## Approved Free Source Adapter Framework

Camp BETA now starts with the approved free source adapter framework in `tools/data-poc/src/sources/`.

Current approved free adapters:

- `alternative_me_fng`: Alternative.me Fear & Greed Index from `https://api.alternative.me/fng/`.
- `defillama_api`: DefiLlama protocol context from `https://api.llama.fi/protocols`.

The framework keeps future source integration repeatable:

1. Add or confirm the registry entry.
2. Add runtime policy permissions.
3. Add one source adapter file.
4. Add one fixture.
5. Add one normalizer.
6. Add tests.
7. Optionally expose the normalized result in UI.

Fixture command:

```powershell
cd tools/data-poc
pnpm run sources:approved:fixture
```

Live command:

```powershell
cd tools/data-poc
$env:CRYPTO_EDGE_DATA_ENV = "PUBLIC_BETA"
pnpm run sources:approved:live
```

Both commands write normalized output to:

```text
tools/data-poc/output/<run_id>/approved_sources_output.json
```

The output contains `run_id`, `generated_at`, `environment`, normalized `sources`, and a summary with requested, allowed, denied, record, warning, and error counts.

The normalized source contract includes:

- Source ID and display name.
- Mode: `fixture` or `live`.
- Policy decision.
- Data category: `sentiment`, `defi_context`, or `market_context`.
- Normalized records.
- Warnings and errors.

Raw provider responses are not persisted. API failure must not fall back to scraping.

Approved context API bridge and panel:

```text
GET /api/context/latest
```

This endpoint is now implemented in the local UI mock API bridge. It reads the newest valid `tools/data-poc/output/<run_id>/approved_sources_output.json`, validates the normalized shape, strips unexpected raw-provider fields, and falls back to a local fixture when no valid output exists.

The Market Context Panel in `tools/ui-mock` consumes this endpoint. It shows Alternative.me Fear & Greed sentiment context, up to 5 DefiLlama protocol or chain context rows, source status, environment, summary counts, and warning/error counts.

The token detail panel now includes a compact Data Coverage & Context section. It uses the already-loaded app context state to show whether market sentiment, DeFi context, scanner candidate snapshot, and security check data are available. It also explicitly lists missing/future categories: paid market/onchain data, dedicated scam/security sources, token unlocks/vesting, holder concentration/wallet clusters, and social sentiment.

The frontend consumes only the local API bridge endpoint. It does not live-fetch from Alternative.me or DefiLlama. It does not scrape, parse HTML, use browser automation, use undocumented endpoints, add auth, add a database, add OpenAI, add paid data sources, or change scanner scoring. Context is presented as research-only market context, not as a trading signal.

Context does not change scanner scoring, final labels, or WATCHLIST meaning.

Paid or clarification-dependent sources remain explicitly deferred:

- CoinGecko Analyst as first paid market/onchain source candidate.
- TokenSniffer as first paid security pilot candidate.
- Tokenomist as unlock/vesting candidate.
- GoPlus only after written commercial-use clarification.
- Bubblemaps/Arkham only after sales and pricing clarification.

## Local Review Session UI Layer

Stage 7B adds a local analyst workflow to the `tools/ui-mock` scanner without changing scanner output.

The Candidate Detail panel includes a Local Review Session with:

- Local review status.
- Analyst note.
- Last-updated timestamp.
- Clear wording that the review layer uses local storage only and does not change scanner labels.

The browser fallback state is stored in `localStorage` under:

```text
crypto-edge-ai.review-session.v1
```

Stage 8A adds Persistent Review Storage API v1 as a transitional local API bridge layer. It stores the same `ReviewSessionState` as file-backed JSON at:

```text
tools/ui-mock/.local/review-session.json
```

The local API endpoints are:

```text
GET /api/review-session
PUT /api/review-session
```

Allowed local review statuses:

- Not reviewed
- Needs more research
- Saved for follow-up
- Dismissed after review
- Waiting for more data

This remains a local/developer work organization layer. It does not add a production backend, auth, production cron, OpenAI call, data source, scraping, HTML parsing, browser automation, or undocumented endpoint. The only write path is the local development API bridge. Optional SQLite review storage is added later in Stage 8D behind the local API provider interface. It does not change scanner scoring, final labels, or WATCHLIST meaning.

The Scanner Radar table shows a small Review badge separate from the scanner Label column. The radar also includes a Follow-up filter based only on the local `Saved for follow-up` review status.

Review panel compliance copy:

```text
Local review workspace only.
This does not change scanner label.
This is not a buy/sell signal.
```

## Review Queue / Follow-up Workspace

Stage 7C extends the `tools/ui-mock` Watchlist tab into a local Review Queue / Follow-up Workspace for analysts.

The workspace has two separate sections:

- `Scanner Watchlist`: candidates whose scanner `final_label` remains `WATCHLIST`.
- `Local Review Queue`: candidates with existing local review status other than `not_reviewed`.

The local queue shows saved follow-up, needs-more-research, waiting-data, and dismissed-after-review statuses with note preview, last-updated timestamp, scanner label, reason, and quick access back to Scanner Radar details. Review status remains visually separate from scanner label.

This uses the local API review storage provider when available and keeps the existing `crypto-edge-ai.review-session.v1` localStorage model as fallback. File-backed JSON remains the default provider; SQLite is optional in Stage 8D. It does not add a production backend, auth, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, production cron, scanner scoring change, final-label change, or WATCHLIST meaning change. Stored local reviews whose candidate is not present in the current scanner output are shown separately and can be cleared.

Review Queue compliance copy:

```text
Review storage uses the local API when available, with browser localStorage fallback.
Review status does not change scanner labels.
This is not a buy/sell signal.
```

## Review Export / Import Backup

Stage 7D adds a small backup flow for the local review session in `tools/ui-mock`.

- Export writes the current `crypto-edge-ai.review-session.v1` local review status and analyst notes to a JSON file.
- Import reads a JSON backup in the browser and validates version and entries before applying it.
- Import updates `localStorage` and attempts to mirror the imported state to `PUT /api/review-session`.
- Merge mode keeps existing local entries and lets imported entries overwrite conflicts by `candidate_id`.
- Replace mode substitutes the current local review session with the imported state.
- The backup does not include scanner output or market data.
- The flow adds no production backend, database, SQLite, auth, new data source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, production cron, scanner scoring change, final-label change, or WATCHLIST meaning change.

## Persistent Review Storage API v1

Stage 8A moves the review session from browser-only storage toward durable local file-backed JSON storage. Stage 8D adds optional SQLite later behind the same provider workflow.

- `GET /api/review-session` returns `ReviewSessionState` plus `_source_meta`.
- `PUT /api/review-session` validates `version` and entries before writing.
- Invalid PUT payloads return status 400 and do not overwrite the existing storage file.
- Missing storage file returns an empty review session.
- Corrupt or invalid storage file returns an empty review session plus `_source_meta.warning`.
- Writes use a temporary file followed by rename.
- The UI starts from `localStorage`, then loads the API state if available.
- Save, clear, and import update `localStorage` first and then attempt to persist through the local API.

The storage file is ignored by git:

```text
tools/ui-mock/.local/review-session.json
```

This is not a production backend. It does not add auth, production cron, new data sources, OpenAI, scraping, HTML parsing, browser automation, undocumented endpoints, scanner scoring changes, final-label changes, or WATCHLIST meaning changes. File-backed JSON remains the default provider; Stage 8D adds optional SQLite behind the same UI workflow. UX2 Product-grade Interface Redesign remains a future required stage.

## Review Storage Diagnostics / Reset Tools v1

Stage 8B adds local/developer diagnostics and reset controls for Review Storage without changing scanner output or data sources.

- `GET /api/review-session/diagnostics` returns file-backed review storage metadata.
- Diagnostics include `source_kind`, `storage_file`, `checked_at`, `file_exists`, `file_size_bytes`, `entries_count`, `valid`, and optional `warning`.
- Diagnostics do not return full review entries or analyst notes.
- The Review Queue shows current app storage status, API diagnostics availability, storage file path, file existence, file size, entry count, validity, and warning state.
- `Refresh diagnostics` reloads the diagnostics endpoint when the local API bridge is available and keeps the UI usable when it is unavailable.
- `Reset local reviews` requires typing `RESET`.
- Reset clears only local review status and analyst notes by applying an empty `ReviewSessionState` locally and attempting to mirror it with the existing `PUT /api/review-session`.
- Reset does not delete scanner output, market data, approved context output, source files, or `tools/data-poc` output.

This stage does not add SQLite, a database, auth, a production backend, production cron, new data sources, scraping, HTML parsing, browser automation, undocumented endpoints, OpenAI, scanner scoring changes, final-label changes, or WATCHLIST meaning changes.

## Storage Provider Abstraction / SQLite-ready Layer v1

Stage 8C moves Review Storage access behind a `ReviewSessionStorageProvider` interface.

- The provider supports reading `ReviewSessionState`.
- The provider supports writing validated review session state.
- The provider supports diagnostics for the current review storage implementation.
- The current file-backed JSON store remains the default provider implementation.
- `GET /api/review-session`, `PUT /api/review-session`, and `GET /api/review-session/diagnostics` use the provider instead of calling file-backed storage functions directly.
- The existing `reviewSession: { storageFilePath }` server option remains supported for local tests and development.
- SQLite is available in Stage 8D as an optional provider implementation without rebuilding the UI workflow or endpoint paths.

This is a technical refactor only. No auth, production backend, production cron, new data source, scraping, HTML parsing, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change is added.

## SQLite Review Storage Provider v1

Stage 8D adds SQLite as an optional second `ReviewSessionStorageProvider` implementation for the local UI mock API bridge.

- File-backed JSON remains the default provider.
- SQLite is enabled only by env configuration: `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite`.
- The optional SQLite path override is `CRYPTO_EDGE_REVIEW_SQLITE_PATH`.
- The default SQLite file is `tools/ui-mock/.local/review-session.sqlite`.
- There is no automatic migration from JSON review storage to SQLite review storage.
- The existing endpoints remain unchanged: `GET /api/review-session`, `PUT /api/review-session`, and `GET /api/review-session/diagnostics`.
- The UI workflow remains unchanged: `localStorage` starts the app, the local API is attempted, saves/import/reset mirror through the API when available, and browser fallback remains.
- SQLite diagnostics report storage metadata, file existence, file size, entry count, validity, and optional warning only. They do not return full entries or analyst notes.
- Corrupt SQLite files are reported as invalid diagnostics instead of crashing the server.
- `reviewSessionProvider` passed to `createScannerApiServer` remains the highest-priority provider override.

This stage adds no npm dependency, auth, production backend, production cron, new data source, scraping, HTML parsing, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change.

UX2 Product-grade Interface Redesign remains a future required stage before a final production interface. It should simplify, organize, and professionalize the UI after the current functional prototype stages.

## UX1 Professional Dashboard Redesign

UX1 is a UI-only redesign of `tools/ui-mock`. It improves layout hierarchy, spacing, scanner readability, Market Context visibility, and Candidate Detail readability. Local Review Session is placed higher in Candidate Detail so analyst status and notes are easier to find.

UX1 does not add data sources, scraping, browser automation, undocumented endpoints, OpenAI calls, auth, a database, production cron, API changes, localStorage model changes, scanner scoring changes, final-label changes, or WATCHLIST meaning changes.

### How to Add a New Data Source Safely

- Add or confirm the registry entry.
- Add runtime policy permissions.
- Record the official docs URL.
- Record the terms URL.
- Add a stable fixture.
- Add an adapter.
- Add a normalizer.
- Add tests.
- Add the UI display rule.
- Add the attribution rule.
- Do not store raw provider output.
- Do not add scraping fallback.

## Minimum Viable Real-Data Flow

1. DexScreener discovery.
2. GoPlus/Honeypot security check.
3. CoinGecko context.
4. Fear & Greed market sentiment.
5. AIKINTEL Market News / Crypto mapping if available.
6. Scorecard.
7. Final checklist.
8. AIKINTEL-style UI.

## First Code POC Scope

The first code POC is intentionally smaller than the full Camp BETA flow.

It includes only:

- DexScreener public search endpoint.
- Fixture mode with local sample data.
- Candidate normalization.
- Basic filters.
- Standardized JSON output.

It does not include:

- GoPlus.
- Honeypot.is.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News mapping.
- Database writes.
- UI.
- Production cron.
- AI calls.

## Second Code POC: Security Enrichment

The second code POC extends `tools/data-poc` with controlled security enrichment.

It checks:

- GoPlus Security fixture/live best-effort.
- Honeypot.is fixture/live best-effort.
- Honeypot status.
- Buy/sell tax.
- Contract verification when available.
- Ownership status when available.
- Liquidity lock when available.
- Mint, blacklist, whitelist, sell restriction, proxy risks when available.
- Top wallet and top 10 wallet concentration only when data exists.

It outputs:

- `SECURITY_PASSED`.
- `NEEDS_MANUAL_VERIFICATION`.
- `CRITICAL_RISK`.

Important rule: the POC must not invent missing security data. Missing holder, liquidity lock, ownership, or source data must be represented in `missing_data` and normally lead to `NEEDS_MANUAL_VERIFICATION`.

Still excluded:

- Database writes.
- UI.
- Production cron.
- OpenAI calls.
- CoinGecko.
- Fear & Greed.
- AIKINTEL Market News.

## Third Code POC: Combined Scanner

The third code POC connects the first two controlled POCs into one mini-flow:

1. DexScreener discovery.
2. Candidate normalization.
3. Basic market/liquidity filters.
4. Limited selection of candidates that passed the basic filter.
5. GoPlus/Honeypot security enrichment.
6. Final scanner label.
7. JSON output for Camp BETA review.

Commands:

```bash
npm run scanner:fixture
npm run scanner:live -- --query SOL --max-candidates 3
```

Final labels:

- `REJECT`: failed basic filters.
- `WATCHLIST`: eligible for further review after basic and security checks.
- `CRITICAL_RISK`: critical security risk detected.
- `NEEDS_MANUAL_VERIFICATION`: missing, incomplete, inconsistent, or warning-level security data.

`WATCHLIST` is not a buy signal and not a recommendation. It only means the token/topic may be worth further research by the trader.

Live mode is best-effort and limited to `maxCandidates = 3` by default. It must not become mass scanning, production cron, retry storm, or unbounded parallel security checking.

Known asset caution: the security rules are designed mainly for new tokens and microcaps. Large known assets, stablecoins, wrapped assets, or contracts with special structures may require contextual interpretation. This POC documents that limitation only; it does not add a whitelist or known assets list.

## Fourth Code POC: Persistable Scanner Output

The fourth code POC prepares Combined Scanner output for later database storage without connecting to a database.

It creates a storage-ready structure for future tables:

- `crypto_token_scan_runs`.
- `crypto_token_candidates`.
- `crypto_token_security_checks`.
- `crypto_token_scorecards`.

Commands:

```bash
npm run scanner:persist:fixture
npm run scanner:persist:live -- --query SOL --max-candidates 3
```

Generated local files:

- `scan_run.json`.
- `candidates.jsonl`.
- `security_checks.jsonl`.
- `scorecards.jsonl`.
- `full_output.json`.

Files are written under `tools/data-poc/output/<run_id>/`, and that output directory is ignored by git.

This remains a POC. It does not add MySQL, SQLite, Drizzle, migrations, auth, production cron, or production persistence.

Scorecards are partial in this POC. The individual score fields remain `null`, while `decision_label` mirrors the Combined Scanner final label and `risk_level` is mapped from that label.

## Fifth Code POC: Storage Output Validation

The fifth code POC validates Persistable Scanner Output before any future database import.

It checks:

- `scan_run.json` exists and has required scan run fields.
- `candidates.jsonl` exists and every candidate has required identifiers and labels.
- `security_checks.jsonl` rows reference existing candidates.
- `scorecards.jsonl` rows reference existing candidates.
- Every candidate has exactly one scorecard.
- JSONL lines are parseable.
- Labels and risk levels use allowed values.
- Candidate final labels align with scorecard decision labels and risk levels.

Commands:

```bash
npm run scanner:validate:fixture
npm run scanner:validate -- --output-dir tools/data-poc/output/<run_id>
```

This remains a POC. It does not add MySQL, SQLite, Drizzle, migrations, production importers, auth, or UI. Its purpose is to prevent malformed storage-ready files from becoming bad future table rows.

## Sixth Code POC: DB Import Dry Run

The sixth code POC prepares a dry-run report for future database import, without connecting to a real database.

It answers:

- Which records would be imported.
- Which future tables they would target.
- How many records each table would receive.
- Which logical keys would be used.
- Whether the import is ready and idempotent.
- Which warnings or blockers must be handled before real DB work.

Future target tables:

- `crypto_token_scan_runs`.
- `crypto_token_candidates`.
- `crypto_token_security_checks`.
- `crypto_token_scorecards`.

Logical keys:

- `crypto_token_scan_runs`: `run_id`.
- `crypto_token_candidates`: `candidate_id`.
- `crypto_token_security_checks`: `run_id + candidate_id`.
- `crypto_token_scorecards`: `run_id + candidate_id`.

Commands:

```bash
npm run scanner:import:dry-run:fixture
npm run scanner:import:dry-run -- --output-dir tools/data-poc/output/<run_id>
npm run scanner:import:dry-run:live -- --query SOL --max-candidates 3
```

This is still not a database import. MySQL, Drizzle, migrations, and AIKINTEL integration remain separate future stages.

## Flow Details

## Step 1: DexScreener Discovery

Use DexScreener as primary source for token/pair discovery.

Initial filters:

- Market cap: $300K - $10M.
- Pair age: >7 days minimum; preferred 14-90 days.
- 24h volume: minimum $30K.
- Liquidity: minimum $30K.
- Volume/MC: 3%-80%.
- Sweet spot Volume/MC: 5%-30%.

Reject:

- Volume/MC <1%.
- Volume/MC >100%.

## Step 2: GoPlus/Honeypot Security

Priority security checks:

- GoPlus Security.
- Honeypot.is.

Evaluate:

- Honeypot status.
- Buy/sell tax.
- Contract verification.
- Ownership.
- Mint/blacklist/whitelist/sell restriction risks.
- Critical flags.

## Step 3: CoinGecko Context

Use CoinGecko for:

- Market cap context.
- FDV context.
- Price context.
- Broader token/category context when available.

## Step 4: Fear & Greed

Use Fear & Greed Index for broad market sentiment.

It should influence context and caution level, not create a trading signal.

## Step 5: AIKINTEL Market News Mapping

If accessible, map token/topic to existing AIKINTEL Market News / Crypto.

Use:

- News title.
- Sentiment.
- AI Analysis.
- Related coins/tags.
- Published date.

Do not duplicate the general news feed.

## Step 6: Scorecard

Apply:

- Security: max 30.
- On-Chain: max 25.
- Social: max 25.
- Narrative: max 20.

Decision labels:

- `REJECT`.
- `WATCHLIST`.
- `HIGH_CONVICTION_REVIEW`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

## Step 7: Final Checklist

Show checklist before user decision:

- Security.
- Distribution.
- Liquidity.
- Social.
- Personal risk readiness.

If critical security fails:

- `REJECT`.
- `CRITICAL_RISK`.
- `NOT_ELIGIBLE_FOR_REVIEW`.

## Step 8: UI in AIKINTEL Style

The UI should look and behave like AIKINTEL where possible:

- Dark interface.
- Dense operational layout.
- Scorecards.
- Risk badges.
- Checklist.
- Clear disclaimer.

## Camp BETA Boundaries

Do not implement:

- Trading signals.
- Auto-buy.
- Auto-sell.
- MT4.
- Exchange execution.
- Telegram/Discord integrations.
- Payments.
- Unapproved API fetchers.
- OpenAI calls without helper decision.

## First UI Mock: Crypto Edge AI Camp BETA

The initial frontend preview is located in `tools/ui-mock/`.
- **What it shows:** Scanner Radar, Research Review, Watchlist, Risk Alerts, and Methodology tabs.
- **Mock Data:** Data is mocked but strictly aligned with the `CombinedScanner` and `PersistableScanner` outputs from `tools/data-poc`.
- **UI Direction:** Aligned with AIKINTEL (dark, professional, command center style).
- **Core Principle:** The UI explicitly reinforces that `WATCHLIST` is **not a buy signal**.
- **Next Stage:** Connect this UI mock to the persistable JSON/API.

## UI Data Adapter (Completed)

The `tools/ui-mock` frontend now includes a UI Data Adapter layer (`src/adapters/scannerOutputAdapter.ts`).
- **Types**: `PersistableScannerOutput` matches `full_output.json`.
- **Adapter**: Maps persistable data into flat `UiTokenCandidate` objects.
- **Fixture**: `persistableScannerSample.ts` provides mock data in the exact persistable shape.
- **Status**: UI generates its state dynamically from the adapter. Ready to swap the fixture for a live `fetch()`.

---

## UI Data Bridge — Completed (2026-06-19)

- `scannerDataSource.ts` service with three sources: fixture / static-json / api
- `persistableScannerSample.json` static fixture in `public/fixtures/`
- Header data source selector (Fixture / Static JSON / API / latest)
- Fallback to fixture with yellow banner when source unavailable
- All components now receive `candidates` via props (no global mock imports)

## Thin Scanner API POC

The UI mock now has a thin local API bridge for scanner output.

- `GET /api/health` reports `crypto-edge-ai-scanner-api` health.
- `GET /api/scanner/latest` returns `PersistableScannerOutput` JSON.
- Default port: `5177`.
- Port override: `SCANNER_API_PORT`.
- UI env var: `VITE_SCANNER_API_URL=http://localhost:5177`.
- Current data source remains fixture/static JSON: `tools/ui-mock/public/fixtures/persistableScannerSample.json`.

This is not a production backend. It does not add DB, MySQL, Drizzle, auth, OpenAI, live token fetch, production cron, trading execution, or buy/sell signals.

Next stage: connect the bridge to `tools/data-poc/output/<run_id>/full_output.json` when a real persisted run is available.

## Real Scanner Output Bridge POC

The thin scanner API can now read the latest real persisted scanner output from `tools/data-poc/output/<run_id>/full_output.json`.

- `/api/scanner/latest` selects the newest valid `full_output.json`.
- Selection prefers `scan_run.finished_at`, then `scan_run.started_at`, then file mtime.
- If no valid real output exists, it falls back to `tools/ui-mock/public/fixtures/persistableScannerSample.json`.
- Responses include `_source_meta` describing whether data came from `real-output` or `fixture-fallback`.
- `/api/scanner/sources` reports output directory status, run counts, detected full output files, selected latest file, fixture availability, and up to 10 recent run diagnostics.

This remains a local read-only bridge. It does not add DB, MySQL, Drizzle, auth, OpenAI, live token fetch, scanner logic changes, production cron, or trading signals.

Next stage: automate saving a real `tools/data-poc` run and validate the UI in API mode against that output.
