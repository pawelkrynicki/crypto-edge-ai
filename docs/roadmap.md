# Roadmap

## Stage 1: Repository Documentation Aligned With AIKINTEL Guidelines

Update project documentation so Crypto Edge AI is clearly positioned as the trader-facing layer inside the AIKINTEL Crypto Market Module.

Deliverables:

- Updated scope.
- Updated architecture.
- Updated MVP requirements.
- Updated AI scoring model.
- Updated security boundaries.
- AIKINTEL integration plan.

## Stage 2: Database Schema Mapping for AIKINTEL Crypto Market Module

Define schema mapping for:

- `crypto_projects`.
- `crypto_scam_alerts`.
- `crypto_opportunities`.
- `crypto_onchain_metrics`.
- `crypto_market_summaries`.
- Existing `crypto_news` if present.

Confirm table names, indexes, JSON fields, deduplication hashes, and score fields with the AIKINTEL owner.

Current design artifact:

- `docs/database_schema_design.md`.
- `docs/aikintel_table_mapping.md`.
- `docs/open_questions_for_aikintel_owner.md`.

## Stage 3: tRPC Router Design for `cryptoMarket`

Design the `cryptoMarket` router:

- Projects query.
- Scam alerts query.
- Opportunities query.
- Latest market summary query.
- On-chain metrics query.
- Optional personal insight/status procedures after user data model is confirmed.
- Mock setup review contract for Camp v1.

Current design artifact:

- `docs/trpc_router_design.md`.
- `prompts/codex/03_schema_and_router_design.md`.

## Stage 4: Frontend Page Design Aligned With AIKINTEL UI

Design:

- `/crypto-market` page.
- Overview dashboard.
- Projects tab.
- Opportunities tab.
- Scam alerts tab.
- On-chain tab.
- Crypto Edge decision-support panel if compatible with the existing UI.

## Stage 5: Cron Data Collection Scripts Pattern

Plan PM2-ready scripts:

- `fetch-crypto-projects.ts`.
- `fetch-crypto-scam-alerts.ts`.
- `fetch-crypto-opportunities.ts`.
- `fetch-crypto-onchain.ts`.
- `generate-crypto-summary.ts`.

## Stage 6: AI Analysis Schema and Mock Data

Implement or plan mock AI JSON compatible with:

- `model`.
- `analyzed_at`.
- `summary`.
- `key_points`.
- `sentiment`.
- `confidence`.
- `risk_factors`.
- `recommendation`.
- `raw_prompt_tokens`.
- `raw_completion_tokens`.

Current design artifact:

- `docs/camp_v1_mock_data_plan.md`.

## Stage 7: Camp v1 Controlled Release

Prepare a limited release for camp participants:

- Stable UI.
- Controlled data sources.
- Disclaimers.
- Mock or safe AI output.
- No trading automation.
- Backup/demo plan.

## Stage 8: Integration Into Main AIKINTEL Platform

Integrate into the main AIKINTEL platform:

- Migration.
- Cron processes.
- tRPC router.
- Frontend route.
- Sidebar navigation.
- Production deployment via existing AIKINTEL process.

## Stage 9: Future Crypto Edge AI Decision-Support Layer

Add more trader-facing functionality only after the intelligence module is stable:

- Personal insights.
- Observation statuses.
- Setup review.
- Risk checklist.
- Bias and confidence history.
- User-specific research notes.

This stage must still avoid buy/sell signals and automated trading.
