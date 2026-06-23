# Product Scope

## Product Direction

Crypto Edge AI is the main module direction.

It is a crypto trading intelligence module developed in a standalone working repo first, with a path for later integration into AIKINTEL.

The crypto market intelligence layer is the data backing for Crypto Edge AI. It is not a separate product named Crypto Market.

## Core User Value

Crypto Edge AI helps traders review crypto topics before making their own decisions by showing:

- Bias.
- Score.
- Confidence.
- Risk.
- Narratives.
- Scam alerts.
- Market context.
- Setup review.
- Pre-trade checklist.

The main question is not "Should I buy?". The main question is:

- Is this topic/token/news worth further analysis?
- Does this token look like a scam?
- Is there rug pull risk?
- Is liquidity sufficient?
- Are holders reasonably distributed?
- Does volume look natural?
- Does social quality look credible?
- Does the narrative make sense?
- What still needs to be checked before a decision?

## Product Modes

### Research Review

User manually submits:

- News.
- Link.
- Token description.
- Market event.
- Personal observation.
- Narrative.
- Contract address.
- Ticker.

Output:

- Category.
- Score.
- Bias.
- Confidence.
- Summary.
- Reasoning.
- Risk factors.
- Checklist.
- Decision label.
- Disclaimer note.

### New Token Scanner

System helps find and filter new tokens using real data.

Focus:

- Scam elimination.
- Rug pull risk.
- Security check.
- Liquidity.
- Holder distribution.
- Social quality.
- Scorecard.

New Token Scanner is a key module, not the full product.

## Data Backing

The module may use:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_market_summaries`.
- Existing AIKINTEL Market News / Crypto if accessible.
- `crypto_onchain_metrics` later if useful.

Crypto Edge AI should not duplicate the existing AIKINTEL Market News section. It should map to it, summarize it, or use it as context when access is available.

## Camp v1 Scope

Camp v1 should include:

- Crypto Edge AI page/module.
- Controlled user flow for real users.
- Research Review.
- New Token Scanner in a limited real-data pipeline.
- Risk Engine.
- Setup Review.
- Final Checklist.
- Project/token research list.
- Scam/risk alerts.
- Opportunities/narratives.
- Market summary context.
- Setup review mock.
- Score 0-100.
- Bias: bullish, bearish, neutral.
- Confidence 0-100.
- Risk factors.
- Checklist.
- Disclaimer.

## Data Sources to Consider

Prefer credible open-source or public API sources:

- CoinGecko.
- CryptoCompare.
- DefiLlama.
- CoinMarketCap only if useful and accessible.
- Dune / public dashboards if useful.
- GDELT.
- Existing AIKINTEL Market News / Crypto.
- Fear & Greed Index.
- Token Unlocks only with legal API access.
- Public CEX/DEX data without violating terms.

## Data Source Controls

Crypto Edge AI is API-first. Every automated source must pass the registry and runtime policy gate before live use.

- Registry: `docs/compliance/data_source_registry_v1.json`.
- Runtime policy: `config/data_source_runtime_policy.json`.
- Safe default: `FIXTURE_ONLY`.
- Active environment variable: `CRYPTO_EDGE_DATA_ENV`.
- Environments: `FIXTURE_ONLY`, `LOCAL_POC`, `INTERNAL_BETA`, `PUBLIC_BETA`, `COMMERCIAL`.
- Actions: `fixture_load`, `live_fetch`, `normalized_storage`, `raw_storage`, `user_display`, `derived_score_display`.

LOCAL_POC live testing is explicit:

```powershell
$env:CRYPTO_EDGE_DATA_ENV = "LOCAL_POC"
```

Current source boundary:

- Alternative.me Fear & Greed and DefiLlama are the only sources currently cleared by the registry for Camp BETA.
- DexScreener, GoPlus Security, and Honeypot.is are not approved for PUBLIC_BETA and must remain LOCAL_POC only.
- Raw API response storage is disabled in v1.
- No API failure may fall back to scraping.
- Unknown sources fail closed.

## Out of Scope

The following remain out of scope:

- Rebranding to a standalone Crypto Market product.
- Full UI implementation in this documentation stage.
- Production cron scripts in this documentation stage.
- Real API fetchers in this documentation stage.
- New standalone auth/login.
- FastAPI.
- SQLite.
- MT4 integration.
- Exchange execution.
- Telegram integration.
- Discord integration.
- Payments.
- Auto-buy or auto-sell.
- Signal bot.
- Copy trading.
- Hardcoded or committed API keys.

## User Statuses

Future user-specific statuses may include:

- `new`.
- `to_review`.
- `watching`.
- `rejected`.
- `played`.
- `archived`.

These should use existing AIKINTEL users/auth if the module is integrated.

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

## Thin Scanner API POC

The UI mock includes a thin local API bridge for `PersistableScannerOutput`.

- Health endpoint: `GET /api/health`.
- Latest scanner endpoint: `GET /api/scanner/latest`.
- Default port: `5177`.
- UI env var: `VITE_SCANNER_API_URL`.
- Current data source: `tools/ui-mock/public/fixtures/persistableScannerSample.json`.
- No DB, MySQL, Drizzle, auth, OpenAI, live token fetch, trading automation, or buy/sell signal wording.

This exists only to close the local loop from scanner-shaped JSON to the dashboard. The next step is reading `tools/data-poc/output/<run_id>/full_output.json`.

## Real Scanner Output Bridge POC

The local API bridge can read the newest valid persisted scanner output from `tools/data-poc/output/<run_id>/full_output.json`.

- `/api/scanner/latest` prefers real output and falls back to the fixture if none is valid.
- Latest run selection uses `scan_run.finished_at`, then `scan_run.started_at`, then file mtime.
- `_source_meta` documents the selected source and fallback reason.
- `/api/scanner/sources` exposes lightweight source diagnostics without returning large scanner payloads.
- The product boundary remains unchanged: no DB, auth, OpenAI, live token fetch, scanner logic changes, UI redesign, or buy/sell signals.

Next stage: save a real scanner run from `tools/data-poc` and verify the dashboard through API mode.
