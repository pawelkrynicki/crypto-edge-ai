# AI KINTEL Production MVP Definition

## Status

- Stage: 11A - AI KINTEL Production MVP Definition.
- Stage 11B adds a reviewable database migration blueprint for future owner/DB review.
- Stage 11C adds documentation-only source config, adapter, status/error, registry blueprint, and test-plan contracts.
- Stage 11D adds documentation-only cron fetcher skeletons, PM2 blueprint, runbook, and cron test plan.
- Stage 11E adds documentation-only tRPC router/query/access-control blueprints.
- Stage 11F adds documentation-only frontend port planning.
- Stage 11G adds documentation-only staging/deployment checklist, env placeholder matrix, release readiness matrix, rollout/rollback plan, monitoring plan, and implementation entry checklist.
- Planning date: 2026-06-29.
- The Local MVP Release Candidate is ready as a local RC baseline.
- Production MVP is not the final product.
- Production MVP is the first safe version of the Crypto Market module running inside AI KINTEL.
- This document is a definition and decision artifact only. It does not implement production code, new sources, paid API calls, auth, migrations, or endpoints.
- 11B does not execute a production migration and does not change Local RC behavior.
- 11C does not implement adapters, activate sources, add endpoints, add cron implementations, or change Local RC behavior.
- 11G does not deploy staging, create runtime code, create `packages/webapp`, create `packages/cron`, create migrations, add endpoints/backend/tRPC/frontend code, activate sources, add provider calls, add env values/secrets, or change Local RC behavior.

11B database blueprint artifacts:

- `docs/ai_kintel_database_migration_blueprint.md`
- `docs/ai_kintel_crypto_tables_blueprint.sql`
- `docs/ai_kintel_database_mapping_matrix.md`

11C source contract artifacts:

- `docs/ai_kintel_source_config_contract.md`
- `docs/ai_kintel_source_adapter_contract.md`
- `docs/ai_kintel_source_status_error_model.md`
- `docs/ai_kintel_source_registry_blueprint.json`
- `docs/ai_kintel_source_adapter_test_plan.md`

11G staging/deployment planning artifacts:

- `docs/ai_kintel_staging_deployment_checklist.md`
- `docs/ai_kintel_env_placeholder_matrix.md`
- `docs/ai_kintel_release_readiness_matrix.md`
- `docs/ai_kintel_rollout_rollback_plan.md`
- `docs/ai_kintel_monitoring_observability_plan.md`
- `docs/ai_kintel_implementation_entry_checklist.md`

11C contract implications:

- Future source adapters must run backend/cron only.
- Disabled paid vendors must not call providers.
- Paid sources remain disabled/deferred until explicit env/config/policy activation.
- Frontend remains tRPC/backend-only.
- After 11G, real implementation should start in `aikintel-platform` only after owner/DB/source/compliance review.

## Product Positioning

- Crypto Market is an integral AI KINTEL module, not a standalone SaaS.
- User access should come through AI KINTEL and its subscription model.
- Any local or internal roles are subordinate to AI KINTEL access and subscription control.
- The module is research-only.
- The module does not execute trades.
- The module does not provide investment recommendations.
- `WATCHLIST` means further manual review only.
- Review status and analyst notes are organization workflow, not investment advice and not scanner-label changes.

## Production MVP Includes

- AI KINTEL route: `/crypto-market`.
- tRPC router: `cryptoMarket`.
- MySQL/MariaDB tables and reviewable migrations for `crypto_*` module data.
- Future migration created in the AI KINTEL repo after owner and DB review of the 11B blueprint.
- Cron collection scripts under the AI KINTEL cron package.
- PM2 process definitions for scheduled collection.
- Source registry and source runtime policy adapted to AI KINTEL deployment.
- Free or approved API sources active first, such as Alternative.me and DefiLlama where policy permits.
- Paid source slots present in configuration but disabled until explicitly enabled.
- Review Queue and analyst workflow adapted from the local RC into the AI KINTEL architecture.
- Analyst Report or market summary workflow adapted as a research-only AI KINTEL workflow.
- Compliance copy and research-only boundaries visible in the module.
- Logs and health checks for cron and data collection.

## Production MVP Excludes

- Paid source activation.
- Public standalone SaaS billing.
- Full custom admin panel.
- Auto-trading.
- Investment signals.
- UI report generation if it requires a new production architecture.
- OpenAI or AI analysis as a decision layer.
- Production launch to all users without beta validation.
- New source adapters in this 11A phase.
- Scraping, HTML parsing, browser automation, undocumented endpoints, or direct frontend calls to external APIs.

## Ready For Production MVP

The module is ready for production MVP review when:

- DB migration exists and can be reviewed before execution.
- Cron scripts run without crashing.
- tRPC procedures return module data from AI KINTEL backend services.
- Frontend page builds inside the AI KINTEL webapp.
- Source config handles disabled paid vendors cleanly.
- Missing paid API keys do not break the module.
- Compliance text is visible in the module.
- Frontend makes no direct external API calls.
- Secrets are not hardcoded.
- Rate limits are documented for every enabled source.
- Deduplication works through stable hashes and database conflict handling.
- Data timestamps are stored and displayed in UTC.
- Local RC functionality is mapped to AI KINTEL architecture.
- Paid sources return disabled metadata when disabled rather than throwing user-facing failures.

## Not Final Product Yet

The production MVP is still not the final product because:

- Paid vendors are not active.
- Production monitoring is not final.
- Role and subscription logic may still need an AI KINTEL owner decision.
- UX may need feedback from internal beta users.
- Source coverage is intentionally limited.
- AI narrative summaries, if desired, remain a post-MVP or separately approved layer.
- Export/report generation may remain backend-only or internal until architecture is confirmed.

## Local RC Relationship

The local RC is the product and workflow baseline for porting. It proves the research workflow, scanner output handling, approved context bridge, local review queue, and analyst report export. It is not the production implementation.

Production AI KINTEL must replace local JSON/SQLite-only storage with AI KINTEL MySQL/MariaDB, replace local API bridges with Express/tRPC procedures, and replace local helper execution with AI KINTEL cron plus PM2.
