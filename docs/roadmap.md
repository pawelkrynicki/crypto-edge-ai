# Roadmap

## Stage 1: Documentation Alignment With Owner Decisions

Align documentation with the latest owner decisions:

- Crypto Edge AI remains the main module name and direction.
- Work continues in the standalone repo first.
- Later AIKINTEL integration is possible after the module is working.
- Existing AIKINTEL auth/users should be used when integrated.
- Existing AIKINTEL Market News / Crypto should be reused or mapped, not duplicated.

Current artifacts:

- `docs/owner_decisions_2026_06_18.md`.
- `docs/project_brief.md`.
- `docs/product_scope.md`.
- `docs/aikintel_integration_plan.md`.

## Stage 2: Product Modes and Source Selection

Define the two primary product modes:

- Research Review.
- New Token Scanner.

Clarify the shared layer:

- Score.
- Risk.
- Bias.
- Confidence.
- Checklist.
- Decision labels.
- Disclaimer.

Current artifacts:

- `docs/product_modes_research_and_scanner.md`.
- `docs/research_review_scope.md`.
- `docs/new_token_scanner_scope.md`.

## Stage 3: Source Selection and Data Model Refinement

Select credible v1 data sources and refine the data model.

Candidate sources:

- CoinGecko.
- CryptoCompare.
- DefiLlama.
- CoinMarketCap if useful and accessible.
- Dune / public dashboards.
- GDELT.
- Existing AIKINTEL Market News / Crypto.
- Fear & Greed Index.
- Token Unlocks if legal API access exists.
- Public CEX/DEX data without violating terms.

Current artifacts:

- `docs/data_sources_v1.md`.
- `docs/database_schema_design.md`.
- `docs/aikintel_table_mapping.md`.
- `docs/open_questions_for_aikintel_owner.md`.

## Stage 4: Camp BETA Real-Data Pipeline Design

Design the limited real-data flow:

- DexScreener discovery.
- GoPlus/Honeypot security check.
- CoinGecko context.
- Fear & Greed sentiment.
- AIKINTEL Market News / Crypto mapping if accessible.
- Scorecard.
- Final checklist.

Current artifacts:

- `docs/camp_beta_real_data_plan.md`.
- `docs/rug_pull_risk_engine.md`.
- `docs/token_scorecard_model.md`.

Data Source Registry Enforcement v1:

- Registry: `docs/compliance/data_source_registry_v1.json`.
- Runtime policy: `config/data_source_runtime_policy.json`.
- Sources reviewed: 21.
- Priority A: 12.
- Priority B: 9.
- Sources currently cleared for Camp BETA: 2.
- Safe default: `FIXTURE_ONLY` when `CRYPTO_EDGE_DATA_ENV` is missing or invalid.
- Environments: `FIXTURE_ONLY`, `LOCAL_POC`, `INTERNAL_BETA`, `PUBLIC_BETA`, `COMMERCIAL`.
- Actions: `fixture_load`, `live_fetch`, `normalized_storage`, `raw_storage`, `user_display`, `derived_score_display`.
- LOCAL_POC live mode requires `CRYPTO_EDGE_DATA_ENV=LOCAL_POC`.
- PUBLIC_BETA allows Alternative.me Fear & Greed and DefiLlama only.
- PUBLIC_BETA blocks DexScreener, GoPlus Security, and Honeypot.is pending written clarification or permission.
- Runtime policy is intentionally stricter than the research registry; unknown or unconfigured sources fail closed.
- Raw API response storage is disabled in v1.
- No scraping fallback, undocumented endpoints, browser automation for data collection, or invented data.

Approved free source adapter framework:

- `tools/data-poc/src/sources` contains the repeatable adapter pattern.
- Current approved live adapters are `alternative_me_fng` and `defillama_api`.
- Fixture command: `pnpm run sources:approved:fixture`.
- Live command: `CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA pnpm run sources:approved:live`.
- Output file: `tools/data-poc/output/<run_id>/approved_sources_output.json`.
- UI/API bridge: `GET /api/context/latest` reads the latest valid approved-source output and falls back to a local fixture.
- Raw provider responses are not stored; only normalized context records are written.
- Future source additions require registry entry, runtime policy, official docs URL, terms URL, fixture, adapter, normalizer, tests, UI display rule, attribution rule, no raw storage, and no scraping fallback.
- The Market Context Panel consumes `GET /api/context/latest` from `tools/ui-mock`, showing Alternative.me Fear & Greed and DefiLlama context as research-only market context.
- The frontend consumes only the local API bridge. It does not live-fetch approved providers directly, scrape, parse HTML, call undocumented endpoints, add auth, add a database, add OpenAI, add paid sources, or change scanner scoring.

Paid and clarification-dependent sources remain deferred:

- CoinGecko Analyst: first paid market/onchain candidate.
- TokenSniffer: first paid security pilot candidate.
- Tokenomist: unlock/vesting candidate.
- GoPlus: only after written commercial-use clarification.
- Bubblemaps/Arkham: only after sales and pricing clarification.

First code POC:

- `tools/data-poc`.
- DexScreener discovery only.
- Fixture mode.
- Normalization.
- Basic filters.

Second code POC:

- `tools/data-poc`.
- GoPlus Security fixture/live best-effort.
- Honeypot.is fixture/live best-effort.
- Security normalization.
- `SECURITY_PASSED`, `NEEDS_MANUAL_VERIFICATION`, `CRITICAL_RISK`.
- Explicit missing data reporting.

Third code POC:

- `tools/data-poc`.
- Combined Scanner flow.
- DexScreener discovery.
- Basic filters.
- Limited GoPlus/Honeypot security enrichment.
- Final labels: `REJECT`, `WATCHLIST`, `CRITICAL_RISK`, `NEEDS_MANUAL_VERIFICATION`.
- Fixture command: `npm run scanner:fixture`.
- Live command: `npm run scanner:live -- --query SOL --max-candidates 3`.
- `WATCHLIST` means eligible for further review only, not a buy signal.
- Known large assets, stablecoins, wrapped assets, and special contracts may need contextual interpretation; no whitelist or known assets list is implemented at POC stage.

Fourth code POC:

- `tools/data-poc`.
- Persistable Scanner Output flow.
- Convert Combined Scanner output to storage-ready records.
- Write local `scan_run.json`, `candidates.jsonl`, `security_checks.jsonl`, `scorecards.jsonl`, and `full_output.json`.
- Map later to `crypto_token_scan_runs`, `crypto_token_candidates`, `crypto_token_security_checks`, and `crypto_token_scorecards`.
- Scorecard fields remain partial/null at POC stage.
- No database, migrations, auth, UI, or production cron.

Fifth code POC:

- `tools/data-poc`.
- Storage Output Validation flow.
- Validate `scan_run.json`, `candidates.jsonl`, `security_checks.jsonl`, `scorecards.jsonl`, and optional `full_output.json`.
- Check required fields, JSONL parsing, allowed labels, candidate/security/scorecard relationships, and scorecard risk-level alignment.
- Provide `npm run scanner:validate:fixture` and `npm run scanner:validate -- --output-dir tools/data-poc/output/<run_id>`.
- No database import, migrations, auth, UI, or production cron.

Sixth code POC:

- `tools/data-poc`.
- DB Import Dry Run flow.
- Run storage validation first.
- Report future target tables, record counts, logical keys, conflict policies, readiness, and idempotency.
- Provide `npm run scanner:import:dry-run:fixture`, `npm run scanner:import:dry-run -- --output-dir tools/data-poc/output/<run_id>`, and optional live dry-run command.
- No real database connection, MySQL, Drizzle, migrations, auth, UI, or production importer.

## Stage 5: Mock/Seed Crypto Edge AI Module

Prepare safe mock data for Camp v1:

- Projects/tokens.
- Scam alerts.
- Opportunities/narratives.
- Market summaries.
- Setup review mock scenarios.

Current artifact:

- `docs/camp_v1_mock_data_plan.md`.

## Stage 6: Read-Only tRPC Router Design / Skeleton

Design and later create a safe read-only router skeleton:

- `projects`.
- `projectBySymbol`.
- `scamAlerts`.
- `opportunities`.
- `marketSummary`.
- `dashboard`.
- `search`.
- `setupReviewMock`.

Current artifacts:

- `docs/trpc_router_design.md`.
- `prompts/codex/03_schema_and_router_design.md`.
- `prompts/codex/04_new_token_scanner_real_data_plan.md`.

## Stage 7: AIKINTEL-Style UI Mock Aligned With Screenshots

Prepare an AIKINTEL-style UI mock for the `Crypto Edge AI` module.

The mock should align with existing AIKINTEL screenshots or pages and should not become a full UI implementation before integration questions are settled.

## Stage 8: Camp BETA Controlled User Flow

Prepare a controlled flow for real users:

- Limited access.
- Clear disclaimer.
- Mock or approved data only.
- No trading execution.
- No buy/sell signals.
- Safe setup review.

## Stage 9: Integration Decision With Main AIKINTEL Repo

Decide when and how to move from this standalone working repo into the main AIKINTEL repo.

Needed confirmations:

- Main repo access.
- Migration mechanism.
- Market News / Crypto schema.
- OpenAI helper status.
- Approved data sources.
- AI cost and usage limits.

## Stage 10: Real Data Sources and AI Helper Integration

After integration decisions:

- Add approved real data sources.
- Add AIKINTEL-compatible helper integration.
- Add cost controls.
- Add production-grade scripts only if approved.

Still forbidden:

- Auto-trading.
- MT4.
- Exchange execution.
- Telegram/Discord integrations.
- Payments.
- Financial advice.

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

- Local JSON / API bridge service (`scannerDataSource.ts`)
- Static JSON fixture in `public/fixtures/` (drop-in for real `full_output.json`)
- Data source selector in UI header

## Thin Scanner API POC

- Add a thin local scanner API bridge under `tools/ui-mock/server`.
- `GET /api/health` returns local service health.
- `GET /api/scanner/latest` returns `PersistableScannerOutput`.
- Default port is `5177`; `SCANNER_API_PORT` can override it.
- UI can target the API through `VITE_SCANNER_API_URL`.
- Current source remains `tools/ui-mock/public/fixtures/persistableScannerSample.json`.
- No DB, MySQL, Drizzle, auth, OpenAI, live token fetch, auto-trading, or buy/sell signal behavior.
- Next step: read `tools/data-poc/output/<run_id>/full_output.json`.

## Real Scanner Output Bridge POC

- Extend the thin scanner API to read the latest `tools/data-poc/output/<run_id>/full_output.json`.
- Select latest output by `scan_run.finished_at`, then `scan_run.started_at`, then file mtime.
- Fall back to `tools/ui-mock/public/fixtures/persistableScannerSample.json` when no valid real output exists.
- Add `_source_meta` to show `real-output` versus `fixture-fallback`.
- Add `GET /api/scanner/sources` diagnostics.
- Keep the bridge read-only: no DB, auth, OpenAI, live token fetch, scanner logic changes, UI redesign, or trading signals.
- Next step: automate creation of a real `tools/data-poc` output and validate UI API mode against it.
- Props-based data flow: App.tsx → StatCards, ScannerRadar, WatchlistTab, RiskAlerts
