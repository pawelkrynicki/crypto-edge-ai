# Roadmap

## Stage 11G: AI KINTEL Staging / Deployment Checklist

Close the documentation package for AI KINTEL production planning before real implementation starts in the AI KINTEL repo.

Current direction:

- 11G is documentation/checklist work only.
- No staging environment, deployment, `packages/webapp`, `packages/cron`, `CryptoMarket.tsx`, route `/crypto-market`, sidebar navigation, runtime tRPC router, endpoint, backend code, frontend code, runtime cron script, PM2 `.cjs` config, production migration, auth implementation, source adapter, provider call, OpenAI call, npm dependency, `.env` file, secret value, scanner scoring change, `final_label` change, or `WATCHLIST` behavior change is added.
- 11G closes the AI KINTEL planning package across DB, cron, tRPC, frontend, env, monitoring, rollout, rollback, and entry criteria.
- Next work after 11G should be real implementation in `aikintel-platform` only after owner/DB/source/compliance review.
- Paid sources remain disabled/deferred.
- Local RC behavior remains unchanged.

Current artifacts:

- `docs/ai_kintel_staging_deployment_checklist.md`.
- `docs/ai_kintel_env_placeholder_matrix.md`.
- `docs/ai_kintel_release_readiness_matrix.md`.
- `docs/ai_kintel_rollout_rollback_plan.md`.
- `docs/ai_kintel_monitoring_observability_plan.md`.
- `docs/ai_kintel_implementation_entry_checklist.md`.

## Stage 11F: AI KINTEL Frontend Port Plan

Prepare documentation-only frontend port planning for the future AI KINTEL Crypto Market module.

Current direction:

- 11F is documentation/port-planning work only.
- No `packages/webapp` directory, `CryptoMarket.tsx`, route `/crypto-market`, sidebar navigation, React component, UI/CSS change, runtime tRPC procedure, endpoint, backend code, auth implementation, source adapter, provider call, OpenAI call, npm dependency, scanner scoring change, `final_label` change, or `WATCHLIST` behavior change is added.
- Future frontend access remains tRPC-only through `trpc.cryptoMarket.*`.
- Future frontend reads DB-backed tRPC responses populated by the cron/source layer.
- Paid sources remain disabled/deferred and must not be called from the browser.
- Future UI should preserve research-only compliance, including `WATCHLIST` as manual review only and missing data as manual verification required.

Current artifacts:

- `docs/ai_kintel_frontend_port_plan.md`.
- `docs/ai_kintel_frontend_component_map.md`.
- `docs/ai_kintel_frontend_data_contract.md`.
- `docs/ai_kintel_frontend_state_model.md`.
- `docs/ai_kintel_frontend_compliance_copy_guide.md`.
- `docs/ai_kintel_frontend_port_checklist.md`.

## Stage 11E: AI KINTEL tRPC Router Blueprint

Prepare documentation-only tRPC router blueprints for the future AI KINTEL Crypto Market production module.

Current direction:

- 11E is documentation/contract work only.
- No `packages/webapp` directory, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedure, endpoint, auth implementation, production backend, production database, migration, dependency, UI/CSS change, source adapter, provider call, OpenAI call, scanner scoring change, `final_label` change, or `WATCHLIST` behavior change is added.
- Future frontend access remains tRPC-only through `trpc.cryptoMarket.*`.
- Future queries read MySQL/MariaDB records populated by cron/source layer.
- Paid sources remain disabled/deferred and must not be called from frontend or read query path.
- Future procedure outputs preserve research-only compliance, including `WATCHLIST` as manual review only and missing data as manual verification required.

Current artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`.
- `docs/ai_kintel_trpc_procedure_contract.md`.
- `docs/ai_kintel_trpc_query_matrix.md`.
- `docs/ai_kintel_trpc_access_control_blueprint.md`.
- `docs/ai_kintel_trpc_error_status_model.md`.
- `docs/ai_kintel_trpc_router_pseudocode.md`.

## Stage 11D: AI KINTEL Cron Fetcher Skeletons

Prepare documentation-only cron fetcher skeletons for the future AI KINTEL Crypto Market production module.

Current direction:

- 11D is documentation/skeleton work only.
- No `packages/cron` directory, runtime cron script, source adapter, provider call, endpoint, auth, production backend, production database, migration, dependency, UI/CSS change, scanner scoring change, `final_label` change, or `WATCHLIST` behavior change is added.
- Future cron fetchers must follow the 11C source config and source adapter contract.
- Paid sources remain disabled/deferred.
- Disabled/deferred paid sources must not call providers and must return disabled metadata where future source-run observability is approved.
- Frontend remains tRPC/backend-only and must not call external providers directly.

Current artifacts:

- `docs/ai_kintel_cron_fetcher_skeletons.md`.
- `docs/ai_kintel_cron_fetcher_types_matrix.md`.
- `docs/ai_kintel_pm2_cron_blueprint.md`.
- `docs/ai_kintel_cron_operational_runbook.md`.
- `docs/ai_kintel_cron_fetcher_test_plan.md`.

## Stage 11C: AI KINTEL Source Config / Adapter Contract

Prepare a documentation-only source configuration and adapter contract for the future AI KINTEL Crypto Market production module.

Current direction:

- 11C is documentation/contract work only.
- No source adapter, provider call, endpoint, cron implementation, auth, production backend, production database, migration, dependency, UI/CSS change, scanner scoring change, `final_label` change, or `WATCHLIST` behavior change is added.
- Paid sources remain disabled/deferred but environment-ready through documented env placeholders, config gates, policy gates, and source-run observability expectations.
- Future adapters must run backend/cron only and report status to `crypto_source_runs`.
- Disabled paid vendors must not call providers and must return disabled metadata.
- Frontend remains tRPC/backend-only and must not call external providers directly.

Current artifacts:

- `docs/ai_kintel_source_config_contract.md`.
- `docs/ai_kintel_source_adapter_contract.md`.
- `docs/ai_kintel_source_status_error_model.md`.
- `docs/ai_kintel_source_registry_blueprint.json`.
- `docs/ai_kintel_source_adapter_test_plan.md`.

## Stage 11B: AI KINTEL Database Migration Blueprint

Prepare a reviewable database migration blueprint for the future AI KINTEL Crypto Market module.

Current direction:

- 11B is documentation/blueprint work only.
- No production migration is executed in this repo.
- The real migration belongs to a future AI KINTEL repo integration stage after owner and DB review.
- Local RC behavior remains unchanged.
- Paid sources remain disabled/deferred and are represented only as readiness/observability concepts.
- No endpoint, source adapter, backend, UI/CSS, auth, dependency, scanner scoring, `final_label`, or `WATCHLIST` behavior is changed.

Current artifacts:

- `docs/ai_kintel_database_migration_blueprint.md`.
- `docs/ai_kintel_crypto_tables_blueprint.sql`.
- `docs/ai_kintel_database_mapping_matrix.md`.

## Stage 11A: AI KINTEL Production MVP Definition

Define what production MVP means for the Crypto Market module inside AI KINTEL.

Current direction:

- Final product is an AI KINTEL module, not a standalone SaaS.
- Access should be controlled by AI KINTEL auth/subscription.
- Local RC remains the porting baseline, not the production implementation.
- Production MVP should use AI KINTEL Express/tRPC, MySQL/MariaDB, cron scripts, PM2, and `/crypto-market`.
- Paid sources remain deferred but environment-ready through env placeholders, disabled config slots, and source policy gates.
- Production MVP remains research-only: no trading execution, no investment recommendation, and `WATCHLIST` remains further manual review only.

Current artifacts:

- `docs/ai_kintel_production_mvp_definition.md`.
- `docs/ai_kintel_integration_decision_matrix.md`.
- `docs/ai_kintel_paid_source_readiness_plan.md`.
- `docs/ai_kintel_integration_blueprint.md`.

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
- Token detail now includes a Data Coverage & Context section showing available approved free context, scanner/security coverage, and missing future data categories.
- Context does not change scanner scoring, final labels, or WATCHLIST meaning.
- The frontend consumes only the local API bridge. It does not live-fetch approved providers directly, scrape, parse HTML, call undocumented endpoints, add auth, add a database, add OpenAI, add paid sources, or change scanner scoring.

Windows helper scripts:

- Developer-only Windows CMD helpers live in `scripts/win/README.md`.
- `scripts\win\post-merge-check.cmd` syncs `main` and runs the data POC and UI mock verification flow after a merge.
- `scripts\win\generate-live-context.cmd` generates approved live context for the local preview.
- `scripts\win\dev-ui.cmd` starts the local API and frontend preview.
- `scripts\win\check-review-storage-file.cmd` checks the default file-backed JSON Review Storage provider.
- `scripts\win\check-review-storage-sqlite.cmd` checks the optional SQLite Review Storage provider.
- `scripts\win\check-review-storage-modes.cmd` checks both Review Storage modes.
- `scripts\win\check-local-workflow-smoke.cmd` checks the local MVP workflow from scanner latest output through UI candidates, context latest output, review storage, diagnostics, and review export/import.
- `scripts\win\generate-analyst-report.cmd` generates a local Markdown plus JSON analyst report under `tools\ui-mock\.local\reports`.
- `scripts\win\check-analyst-report.cmd` runs the analyst report generator in smoke mode with guarded temporary review storage and report files.
- `scripts\win\check-local-mvp.cmd` runs the aggregate local MVP health check for the pre-holiday freeze checkpoint.
- `scripts\win\check-local-rc.cmd` runs the 10C release-candidate checkpoint by confirming required docs/scripts and then running the local MVP health check.
- `scripts\win\dev-ui-sqlite.cmd` starts the local API and frontend preview with SQLite Review Storage enabled.
- 10D manual preview and known-issues notes are documented in `docs/local_mvp_rc_manual_preview_notes.md` and `docs/local_mvp_known_issues.md`.

Local Review Session:

- Stage 7B adds a local analyst review workflow to `tools/ui-mock`.
- The Candidate Detail panel stores local review status, analyst note, and last-updated timestamp.
- Storage key: `crypto-edge-ai.review-session.v1`.
- Statuses are `Not reviewed`, `Needs more research`, `Saved for follow-up`, `Dismissed after review`, and `Waiting for more data`.
- The Scanner Radar candidate list shows a separate Review badge and a Follow-up filter for locally saved follow-up items.
- Stage 8A adds a local development API write path only, backed by JSON at `tools/ui-mock/.local/review-session.json`.
- This does not add a production backend, auth, production cron, OpenAI call, data source, scraping, HTML parsing, browser automation, or undocumented endpoint. Optional SQLite review storage is added later in Stage 8D behind the local API provider interface.
- Review status does not change scanner scoring, final labels, or WATCHLIST meaning.
- Review panel compliance copy: `Local review workspace only. This does not change scanner label. This is not a buy/sell signal.`

Review Queue / Follow-up Workspace:

- Stage 7C extends the Watchlist tab into a local Review Queue workspace while keeping scanner `WATCHLIST` meaning unchanged.
- The view separates `Scanner Watchlist` candidates from `Local Review Queue` items saved in local review storage.
- The queue shows local review status, analyst note preview, last-updated timestamp, scanner label, scanner reason, and a quick path back to Scanner Radar details.
- Filters cover all local review items, follow-up, needs research, waiting data, and dismissed items.
- Stored local reviews whose candidate is absent from the current scanner output are shown separately and can be cleared.
- This uses the local API review storage provider when available and the existing `crypto-edge-ai.review-session.v1` localStorage model as fallback. File-backed JSON remains the default provider; SQLite is optional in Stage 8D. It adds no production backend, auth, new data source, scanner scoring change, final-label change, or WATCHLIST meaning change.
- Review Queue compliance copy: `Review storage uses the local API when available, with browser localStorage fallback. Review status does not change scanner labels. This is not a buy/sell signal.`

Review Export / Import Backup:

- Stage 7D adds JSON export/import for the local review session.
- Backup includes only local review status and analyst notes from `crypto-edge-ai.review-session.v1`.
- Backup does not include scanner output or market data.
- Import supports merge, where imported entries overwrite conflicts by `candidate_id`, and replace, where the imported state substitutes the current local session.
- Invalid JSON, unsupported backup versions, and invalid entries are rejected without clearing the current local review session.
- Import updates `localStorage` and attempts to mirror to `PUT /api/review-session`.
- This adds no production backend, database, SQLite, auth, new data source, scraping, HTML parsing, browser automation, undocumented endpoint, OpenAI call, production cron, scanner scoring change, final-label change, or WATCHLIST meaning change.

Persistent Review Storage API v1:

- Stage 8A adds file-backed JSON review storage through the local UI API bridge.
- Endpoints: `GET /api/review-session` and `PUT /api/review-session`.
- Storage file: `tools/ui-mock/.local/review-session.json`, ignored by git.
- Missing file returns an empty review session.
- Corrupt or invalid storage file returns an empty review session with `_source_meta.warning`.
- Invalid PUT payloads return 400 and do not overwrite the current file.
- UI starts from browser `localStorage`, loads the API state after mount, mirrors valid API state back to `localStorage`, and keeps browser fallback when the API is unavailable.
- File-backed JSON remains the default provider. SQLite is available in Stage 8D as an optional provider through env configuration. UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Review Storage Diagnostics / Reset Tools v1:

- Stage 8B adds `GET /api/review-session/diagnostics` for local Review Storage health checks.
- Diagnostics report `source_kind`, `storage_file`, `checked_at`, `file_exists`, `file_size_bytes`, `entries_count`, `valid`, and optional `warning`.
- Diagnostics do not expose full review entries or analyst notes.
- Review Queue shows diagnostics availability and has a `Refresh diagnostics` action.
- Review Queue adds `Reset local reviews`, guarded by typing `RESET`.
- Reset applies an empty `ReviewSessionState`, updates browser review storage, and attempts to mirror through the existing `PUT /api/review-session`.
- Reset clears only local review status and analyst notes; it does not delete scanner output or market data.
- This adds no auth, production backend, production cron, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change. SQLite diagnostics are added later in Stage 8D behind the same diagnostics endpoint.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Storage Provider Abstraction / SQLite-ready Layer v1:

- Stage 8C adds a `ReviewSessionStorageProvider` interface for review reads, writes, and diagnostics.
- The current file-backed JSON storage remains the default provider implementation.
- `GET /api/review-session`, `PUT /api/review-session`, and `GET /api/review-session/diagnostics` use the provider.
- The existing `reviewSession: { storageFilePath }` server option remains compatible.
- A fake provider is used only in lightweight tests to confirm endpoint behavior is provider-backed.
- SQLite is available in Stage 8D as an optional provider implementation behind the same endpoint workflow.
- This adds no auth, production backend, production cron, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

SQLite Review Storage Provider v1:

- Stage 8D adds optional SQLite storage for `ReviewSessionStorageProvider`.
- File-backed JSON remains the default review storage provider.
- Enable SQLite with `CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite`.
- Override the SQLite file path with `CRYPTO_EDGE_REVIEW_SQLITE_PATH`.
- Default SQLite file: `tools/ui-mock/.local/review-session.sqlite`.
- No automatic migration from JSON to SQLite is performed.
- Existing review endpoints remain unchanged: `GET /api/review-session`, `PUT /api/review-session`, and `GET /api/review-session/diagnostics`.
- UI workflow remains unchanged: browser `localStorage` starts the app, local API sync is attempted, and fallback remains.
- SQLite diagnostics do not expose full entries or analyst notes.
- This adds no new npm dependency, auth, production backend, production cron, new source, scraper, HTML parser, browser automation, undocumented endpoint, OpenAI call, scanner scoring change, final-label change, or WATCHLIST meaning change.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Review Storage Mode DX / Smoke Scripts v1:

- Add a lightweight `tools/ui-mock/scripts/reviewStorageModeSmoke.ts` runner for file-backed JSON and SQLite Review Storage.
- Add Windows helper scripts for file mode, SQLite mode, both modes, and SQLite local preview.
- The smoke runner starts `createScannerApiServer` on a random local port, uses temporary `.local` storage, checks existing review endpoints, rejects invalid writes, and verifies diagnostics omit entries and analyst notes.
- File-backed JSON remains the default provider. SQLite remains optional through env configuration. No JSON-to-SQLite migration is performed.
- This stage does not change endpoint paths, UI workflow, scanner scoring, final labels, or WATCHLIST meaning.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Local End-to-End Workflow Smoke v1:

- Add `tools/ui-mock/scripts/localWorkflowSmoke.ts` and `scripts\win\check-local-workflow-smoke.cmd`.
- Start the existing local API on a random `127.0.0.1` port.
- Check `GET /api/health`, `GET /api/scanner/latest`, `GET /api/scanner/sources`, `GET /api/context/latest`, `GET /api/review-session`, `PUT /api/review-session`, and `GET /api/review-session/diagnostics`.
- Parse scanner latest output through the existing service/adapter path into UI candidates without changing scoring or final labels.
- Parse market context latest output through the existing context service path, accepting real local output or fixture fallback.
- Verify review session storage, diagnostics safety, invalid PUT rejection, export/import helpers, and server-render smoke coverage for Market Context, Candidate Detail, and Review Queue paths.
- Use only local API calls and local fixture/real-output files. Do not call external networks, mutate scanner output, mutate market data, add sources, change endpoint paths, change UI workflow, change scanner scoring, change final labels, or change WATCHLIST meaning.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Analyst Report / Review Export v1:

- Add `tools/ui-mock/src/services/analystReport.ts` for pure report data building and Markdown rendering.
- Add `tools/ui-mock/scripts/generateAnalystReport.ts` and Windows helpers for normal export and smoke verification.
- Generate Markdown and JSON under `tools\ui-mock\.local\reports` for the normal analyst workflow.
- Summarize scanner metadata, scanner labels, security labels, review statuses, analyst notes, stored reviews not in the current scan, approved market context, and a neutral candidate snapshot.
- Keep the report as a local research workflow export only. It is not a recommendation and includes `This is not a buy/sell signal.`
- Use only existing local endpoints and local real-output or fixture fallback files. Do not call external networks, add sources, mutate scanner output, mutate market data, change scanner scoring, change `final_label`, change `WATCHLIST` meaning, add npm dependencies, add auth, add a production backend, or implement UX2.

Local MVP Runbook + Freeze Checklist v1:

- Add `scripts\win\check-local-mvp.cmd` as the aggregate local MVP health check.
- Add `docs/local_mvp_runbook.md` for quick local operations, partial checks, preview commands, storage notes, analyst workflow, report generation, and troubleshooting.
- Add `docs/pre_holiday_freeze_checklist.md` for DONE status, freeze scope, holiday-safe work, avoid list, post-holiday stages, and safe local MVP definition.
- Keep this stage documentation/DX only. It does not change endpoints, UI workflow, scanner scoring, `final_label`, `WATCHLIST` meaning, source registry/compliance rules, npm dependencies, auth, production backend, or data sources.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

Product Workflow Polish v1:

- Stage 10A adds a small Local MVP workflow guide in `tools/ui-mock` without implementing UX2.
- The UI presents the path `Scanner latest -> Market context -> Candidate detail -> Local review -> Review queue -> Analyst report -> Local MVP health check`.
- Candidate Detail clarifies that scanner `final_label` comes from scanner output, local review status is only local analyst organization, and missing security/context data requires manual verification.
- Review Queue clarifies what the queue is for, what to do next, and how to generate the analyst report with `scripts\win\generate-analyst-report.cmd`.
- Local MVP health remains the existing `scripts\win\check-local-mvp.cmd` command.
- Scanner source, market context source, and review storage status copy is more explicit.
- This stage adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, scanner scoring change, `final_label` change, or `WATCHLIST` meaning change.
- UX2 Product-grade Interface Redesign is now complete for the local MVP UI pass through 10B.4.

UX2 Information Architecture Shell v1:

- Stage 10B.1 starts UX2 with product-grade information architecture and a layout skeleton, not a full visual redesign.
- The workspace structure is `Overview -> Scanner Radar -> Review Queue -> Research Review -> Risk Alerts -> Methodology`.
- Overview holds Market Context, Local MVP workflow status, scanner stat cards, health command copy, and analyst report command copy.
- Scanner Radar remains the read-only scanner output and Candidate Detail workspace.
- Review Queue remains the local analyst status, notes, backup, diagnostics, reset, and report command workspace.
- 10B.1 adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, scanner scoring change, `final_label` change, or `WATCHLIST` meaning change.

UX2 Scanner / Candidate Detail Redesign v1:

- Stage 10B.2 continues UX2 only inside Scanner Radar and Candidate Detail.
- Scanner Radar now uses a product-grade candidate-card list with selected state, scanner `final_label`, local review status, security label, chain/DEX, market cap, liquidity, 24h volume, age, and the first scanner reason.
- Candidate Detail now separates Local Review Session, Scanner Label vs Local Review, Quick Snapshot, Security & Manual Verification, Data Coverage & Context, Scanner Label / Reasons, and Reasoning Checklist.
- Guidance copy states that scanner output is read-only, `WATCHLIST` means eligible for further manual review only, local review does not change scanner label, missing security/context data requires manual verification, and this is not a buy/sell signal.
- 10B.2 adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, browser automation, scanner scoring change, `final_label` change, `WATCHLIST` meaning change, review logic change, or report logic change.

UX2 Review Queue + Report Workspace Redesign v1:

- Stage 10B.3 continues UX2 only inside Review Queue and Analyst Report Workspace.
- Review Queue now has product-grade sections for Review Queue Workspace, summary cards, Local Review Queue item cards, Stored Reviews Not In Current Scan, Scanner Watchlist, Storage & Backup, and Analyst Report Workspace.
- Storage and backup copy clarifies that export/import includes only local review status and analyst notes, diagnostics omit notes and entries, and reset clears only local review state.
- Analyst Report Workspace keeps report generation local to CMD with `scripts\win\generate-analyst-report.cmd`, smoke check `scripts\win\check-analyst-report.cmd`, and output path `tools\ui-mock\.local\reports`.
- 10B.3 adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, browser automation, scanner scoring change, `final_label` change, `WATCHLIST` meaning change, review import/export/reset/diagnostics logic change, or report logic change.

UX2 Visual QA / Polish v1:

- Stage 10B.4 closes UX2 at local MVP UI level with layout consistency, spacing, responsive fallback, command/path wrapping, selected candidate state, Review Queue section separation, and Analyst Report Workspace command containment.
- Visual QA checklist: `docs/ux2_visual_qa_checklist.md`.
- 10B.4 adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, browser automation, scanner scoring change, `final_label` change, `WATCHLIST` meaning change, review import/export/reset/diagnostics logic change, or report logic change.
- UX2 Product-grade Interface Redesign is complete for the local MVP UI pass.

Local MVP Release Candidate Stabilization v1:

- Stage 10C stabilizes the local MVP as a release-candidate-ready local build.
- Add `scripts\win\check-local-rc.cmd` as the aggregate RC checkpoint.
- Add `docs/local_mvp_release_candidate.md` with included scope, deferred scope, RC verification, manual preview, local storage, RC definition, and known limitations.
- 10C adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, browser automation, UI flow change, scanner scoring change, `final_label` change, `WATCHLIST` meaning change, review/import/export/reset/diagnostics logic change, or report logic change.
- Final product readiness still requires future decisions for hosting, auth, production backend, data/paid integrations, deployment, and monitoring.

Local MVP RC Manual Preview Notes / Known Issues v1:

- Stage 10D adds `docs/local_mvp_rc_manual_preview_notes.md` for manual click-through status, preview commands, result recording, and resume rules.
- Stage 10D adds `docs/local_mvp_known_issues.md` for accepted local limitations, operational notes, blocker definitions, and future production decisions.
- 10D is documentation/QA only. It adds no endpoints, new sources, npm dependencies, auth, production backend, production cron, OpenAI call, scraping, browser automation, UI/CSS change, scanner scoring change, `final_label` change, `WATCHLIST` meaning change, review/import/export/reset/diagnostics logic change, or report logic change.
- RC-ready local MVP still does not mean production-ready or final product-ready. After 10D, prefer freeze/light mode unless a real blocker appears.

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

UX1 Professional Dashboard Redesign:

- Improves layout, hierarchy, spacing, and readability in `tools/ui-mock`.
- Keeps the work UI-only: no new data sources, no API changes, no backend, no scoring changes, and no final-label changes.
- Keeps `WATCHLIST` meaning unchanged: eligible for further review only.
- Makes Market Context and Local Review Session more visible, with Local Review Session moved higher in Candidate Detail.

UX2 Product-grade Interface Redesign:

- Started in 10B.1 with information architecture and layout skeleton only.
- Scope: simplify, organize, and professionalize the full frontend after the functional prototype stages.
- 10B.2 completes the Scanner Radar / Candidate Detail redesign slice only.
- 10B.3 completes the Review Queue + Report Workspace redesign slice only.
- 10B.4 completes the Visual QA / Polish pass for the local MVP UI.
- UX2 is complete at local MVP level; 10C stabilizes the local release-candidate checkpoint and 10D documents manual preview / known issues without adding feature scope.

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
