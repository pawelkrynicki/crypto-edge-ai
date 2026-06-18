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
