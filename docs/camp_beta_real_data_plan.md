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

Future API bridge readiness:

```text
GET /api/context/latest
```

This endpoint is intentionally not implemented yet. It can later expose only the normalized `approved_sources_output.json` records through the UI/API layer.

Paid or clarification-dependent sources remain explicitly deferred:

- CoinGecko Analyst as first paid market/onchain source candidate.
- TokenSniffer as first paid security pilot candidate.
- Tokenomist as unlock/vesting candidate.
- GoPlus only after written commercial-use clarification.
- Bubblemaps/Arkham only after sales and pricing clarification.

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
