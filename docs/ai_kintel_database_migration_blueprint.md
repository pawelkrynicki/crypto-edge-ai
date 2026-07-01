# AI KINTEL Database Migration Blueprint

## Status

- Stage: 11B - Database Migration Blueprint.
- Stage 11C adds documentation-only source config, adapter, status/error, registry blueprint, and test-plan contracts for the future writers of these tables.
- Stage 11D adds documentation-only cron fetcher skeletons for future writers of these tables.
- Stage 11E adds documentation-only tRPC router/query blueprints for future readers of these tables.
- This is a documentation blueprint only, not an executed migration.
- The Local RC remains unchanged.
- No endpoint, tRPC procedure, source adapter, backend, UI, CSS, auth, dependency, or production database implementation is added here.
- The SQL blueprint is review-only: `docs/ai_kintel_crypto_tables_blueprint.sql`.
- 11C does not implement adapters, activate sources, add provider calls, add endpoints, or change Local RC behavior.
- 11D does not create `packages/cron`, runtime cron scripts, source adapters, provider calls, endpoints, or change Local RC behavior.
- 11E does not create `packages/webapp`, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedures, backend code, endpoints, provider calls, or change Local RC behavior.

## Scope

This document proposes a MySQL/MariaDB schema for the future AI KINTEL Crypto Market module. It follows the 11A direction:

- Crypto Market is an AI KINTEL module, not a standalone SaaS.
- Production storage should use AI KINTEL MySQL/MariaDB.
- Production data should be read by the frontend through AI KINTEL backend/tRPC only.
- Data collection belongs in backend/cron jobs, not browser-side provider calls.
- Paid vendors remain disabled/deferred until owner, policy, env, and vendor approvals are complete.
- Future cron fetchers documented in 11D must follow the 11C source adapter contract, normalize records before insert, deduplicate by hash or logical key, and report to `crypto_source_runs`.
- Future tRPC queries documented in 11E should read these DB records through `trpc.cryptoMarket.*`, with no direct frontend provider calls and no provider calls from the read query path unless separately approved.

This blueprint is ready for owner and DB review before any future migration is created in the `aikintel-platform` repo.

## Proposed Tables

| Table | Purpose | Status |
|---|---|---|
| `crypto_projects` | Core project registry/current project view with scanner, security, source, missing-data, and research fields. | Proposed |
| `crypto_scam_alerts` | Risk, security, and manual-verification alerts with evidence references. | Proposed |
| `crypto_opportunities` | Research events/opportunities with neutral context and status fields. | Proposed |
| `crypto_onchain_metrics` | Snapshot/time-series on-chain metrics by symbol/contract/date/source. | Proposed |
| `crypto_market_summaries` | Daily/weekly market context with source breakdown and research summary. | Proposed |
| `crypto_source_runs` | Operational observability for cron/data collection and disabled paid vendors. | Proposed |
| `crypto_analyst_reviews` | Optional production analyst notes/review table. | Open decision, commented out in SQL |

## Design Principles

- Deduplicate normalized records with stable `hash` fields where records can repeat across runs.
- Keep stable `source` and `source_id` fields so future imports remain traceable.
- Store timestamps in UTC from production writers.
- Validate JSON before insert; MariaDB may treat `JSON` as an alias/validated text depending on version.
- Store normalized records by default; raw payload storage remains a separate open decision.
- Disabled paid sources should produce disabled metadata/log rows and should not crash cron or module startup.
- The frontend reads module data through AI KINTEL backend/tRPC only.
- Browsers must not call external providers directly.
- No hardcoded secrets, credentials, or provider keys.
- No investment-advice semantics, trading CTA semantics, or automated decision-layer semantics.

## Compliance Notes

- `WATCHLIST` means further manual review only.
- Review status and analyst notes do not change scanner labels.
- Research/opportunity scores are research-only and are not investment advice.
- Missing security, market, on-chain, or context data means manual verification is required.
- AI narrative fields are optional future research layers only. They are not a decision layer and must not override scanner labels.
- The integration JSON example from AI KINTEL uses wording that should not become a Crypto Market investment field. Use neutral names such as `research_summary`, `review_note`, `next_review_step`, `analyst_context`, or `manual_verification_note`.

## Execution Rule

- `docs/ai_kintel_crypto_tables_blueprint.sql` is review-only.
- Do not run it on production.
- Do not convert it into an executable production migration in this repo.
- The real AI KINTEL migration should be created later in the AI KINTEL repo after owner and DB review.
- This repo remains the Local RC/blueprint workspace for 11B.

## Validation Checklist

- Owner review completed.
- DB review completed.
- Source policy review completed.
- Env placeholders confirmed by name only, with no secret values in repo.
- Disabled paid vendors return disabled metadata and do not crash cron/module startup.
- 11D cron skeleton artifacts reviewed before future `packages/cron` implementation.
- Frontend has no direct external provider calls.
- Indexes reviewed against expected query patterns.
- Retention policy reviewed for scanner outputs, summaries, source runs, and any future analyst notes.
- JSON validation and normalized-storage rules confirmed.
- AI narrative layer remains optional and non-decisional.

## Related Artifacts

- `docs/ai_kintel_crypto_tables_blueprint.sql`
- `docs/ai_kintel_database_mapping_matrix.md`
- `docs/ai_kintel_production_mvp_definition.md`
- `docs/ai_kintel_integration_decision_matrix.md`
- `docs/ai_kintel_paid_source_readiness_plan.md`
- `docs/ai_kintel_integration_blueprint.md`
- `docs/ai_kintel_source_config_contract.md`
- `docs/ai_kintel_source_adapter_contract.md`
- `docs/ai_kintel_source_status_error_model.md`
- `docs/ai_kintel_source_registry_blueprint.json`
- `docs/ai_kintel_source_adapter_test_plan.md`
- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_cron_fetcher_types_matrix.md`
- `docs/ai_kintel_pm2_cron_blueprint.md`
- `docs/ai_kintel_cron_operational_runbook.md`
- `docs/ai_kintel_cron_fetcher_test_plan.md`
- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`
