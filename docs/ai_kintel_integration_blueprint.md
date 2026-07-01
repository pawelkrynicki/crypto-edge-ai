# AI KINTEL Integration Blueprint

## Status

- Stage: 11A - AI KINTEL integration blueprint.
- Stage 11B adds reviewable database migration blueprint artifacts for future owner/DB review.
- Stage 11C adds documentation-only source config, adapter, status/error, registry blueprint, and test-plan contracts.
- Stage 11D adds documentation-only cron fetcher skeletons, type matrix, PM2 blueprint, runbook, and cron test plan.
- Stage 11E adds documentation-only tRPC router blueprint, procedure contract, query matrix, access-control blueprint, error/status model, and router pseudocode.
- Stage 11F adds documentation-only frontend port plan, component map, data contract, state model, compliance copy guide, and port checklist.
- Stage 11G adds documentation-only staging/deployment checklist, env placeholder matrix, release readiness matrix, rollout/rollback plan, monitoring plan, and implementation entry checklist.
- This is a planning artifact for moving from local RC to AI KINTEL production MVP.
- It does not implement production backend, production database, migrations, auth, UI, source adapters, cron jobs, tRPC procedures, endpoints, dependencies, or paid integrations.
- 11B does not execute a production migration; the real migration belongs to a future AI KINTEL repo integration stage.
- 11C does not implement adapters, activate sources, add provider calls, add cron implementations, add endpoints, or change Local RC behavior.
- 11D does not create `packages/cron`, runtime cron scripts, source adapters, provider calls, endpoints, or change Local RC behavior.
- 11E does not create `packages/webapp`, `packages/webapp/server/routers/cryptoMarket.ts`, runtime tRPC procedures, backend code, endpoints, provider calls, or change Local RC behavior.
- 11F does not create `packages/webapp`, `CryptoMarket.tsx`, route `/crypto-market`, sidebar navigation, React components, Tailwind/shadcn runtime code, backend code, endpoints, runtime tRPC procedures, provider calls, or change Local RC behavior.
- 11G does not deploy staging, create `packages/webapp`, create `packages/cron`, create runtime code, add migrations, add endpoint/backend/tRPC/frontend code, add PM2 `.cjs` config, activate sources, add provider calls, add env values/secrets, or change Local RC behavior.

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

11D cron skeleton artifacts:

- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_cron_fetcher_types_matrix.md`
- `docs/ai_kintel_pm2_cron_blueprint.md`
- `docs/ai_kintel_cron_operational_runbook.md`
- `docs/ai_kintel_cron_fetcher_test_plan.md`

11E tRPC router blueprint artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

11F frontend port planning artifacts:

- `docs/ai_kintel_frontend_port_plan.md`
- `docs/ai_kintel_frontend_component_map.md`
- `docs/ai_kintel_frontend_data_contract.md`
- `docs/ai_kintel_frontend_state_model.md`
- `docs/ai_kintel_frontend_compliance_copy_guide.md`
- `docs/ai_kintel_frontend_port_checklist.md`

11G staging/deployment planning artifacts:

- `docs/ai_kintel_staging_deployment_checklist.md`
- `docs/ai_kintel_env_placeholder_matrix.md`
- `docs/ai_kintel_release_readiness_matrix.md`
- `docs/ai_kintel_rollout_rollback_plan.md`
- `docs/ai_kintel_monitoring_observability_plan.md`
- `docs/ai_kintel_implementation_entry_checklist.md`

## Target Repo Structure

```text
aikintel-platform/
  packages/
    webapp/
    cron/
  docs/
  vault/
```

Primary integration target:

- `aikintel-platform/packages/webapp`
- `aikintel-platform/packages/cron`
- `aikintel-platform/docs`
- `aikintel-platform/vault`

## Files To Create Later In AI KINTEL

- `packages/webapp/server/routers/cryptoMarket.ts`
- `packages/webapp/client/src/pages/CryptoMarket.tsx`
- `packages/webapp/client/src/pages/CryptoMarketComponents/` if the future AI KINTEL frontend convention supports page-local components.
- `packages/cron/scripts/fetch-crypto-*.ts`
- `packages/cron/ecosystem.crypto.config.cjs`
- Migration file for `crypto_*` tables.
- Setup documentation under AI KINTEL docs.
- `.env.example` entries with names only, no values.

## Suggested Phases

- 11B Database Migration Blueprint: review-only artifacts in this repo; no executed migration.
- 11C Source Config / Adapter Contract: review-only contract artifacts in this repo; no adapter implementation.
- 11D Cron Fetcher Skeletons: review-only cron blueprint artifacts in this repo; no `packages/cron` or runtime scripts.
- 11E tRPC Router Blueprint.
- 11F AI KINTEL Frontend Port Plan: review-only frontend mapping artifacts in this repo; no `packages/webapp`, route, sidebar, React components, UI/CSS, or runtime code.
- 11G Staging/Deployment Checklist: review-only staging, env, release, rollout, rollback, monitoring, and implementation-entry artifacts; no staging deploy or runtime code.
- Future real implementation in `aikintel-platform` after owner/DB/source/compliance review.

## Mapping Local RC To AI KINTEL

| Local RC Area | AI KINTEL Production MVP Mapping | Notes |
|---|---|---|
| Local scanner latest | Cron-collected DB records | Use normalized records and stable dedup keys. |
| Local context latest | `crypto_market_summaries` | Alternative.me and DefiLlama are active candidates where policy permits. |
| Review Queue | Production decision needed for user-specific review storage | Keep review status separate from scanner labels. |
| Analyst Report | Backend-generated research summary or admin/internal export | Do not make it an investment recommendation. |
| Local checks | Staging checks, PM2 logs, build verification | Replace local-only helpers with production deployment checks. |
| Local JSON/SQLite | Dev/local only | Production uses AI KINTEL MySQL/MariaDB. |
| Local API bridge | AI KINTEL Express/tRPC | Frontend calls backend only. |

## Integration Rules

- Frontend only uses tRPC/backend.
- All external API calls run only in cron/backend.
- No direct browser external API calls.
- No hardcoded secrets.
- Use existing AI KINTEL DB connection helpers.
- Match existing AI KINTEL page and UI component patterns.
- Do not change `_core`.
- Use MySQL/MariaDB and Drizzle conventions already present in AI KINTEL.
- Deduplicate via stable hash and `ON DUPLICATE KEY UPDATE` where appropriate.
- Validate JSON before insert.
- Store timestamps in UTC.
- Respect rate limits.
- Keep paid sources disabled until explicitly enabled.
- Future adapters must follow the 11C source adapter contract and run in backend/cron only.
- Future cron fetchers must follow the 11C source adapter contract before any provider work.
- Future tRPC queries must read DB records populated by cron/source layer.
- Future frontend access remains tRPC-only through `trpc.cryptoMarket.*`.
- Future frontend UI reads DB-backed tRPC responses and must not call providers in the browser.
- No source should call a provider while disabled or deferred.
- Disabled paid vendors must return disabled metadata and must not call providers.
- Source run health/status should map to `crypto_source_runs`.
- Read queries must not call external providers unless separately approved.

## Route And Module Shape

- Route: `/crypto-market`.
- Router: `cryptoMarket`.
- Frontend page: `packages/webapp/client/src/pages/CryptoMarket.tsx`.
- Backend router: `packages/webapp/server/routers/cryptoMarket.ts`.
- Sidebar navigation should add a Crypto Market entry during the frontend port phase.
- 11F documents the future route/page/sidebar plan only; it does not implement the route, page, or sidebar.

## Production MVP Flow

```text
cron fetcher -> normalized records -> MySQL/MariaDB -> tRPC router -> /crypto-market page
```

The production MVP should preserve the local RC boundary:

- Scanner label remains scanner output.
- Review status remains analyst workflow.
- Market context is research context only.
- `WATCHLIST` means further manual review only.
- Paid vendors stay disabled until the activation checklist is complete.

## Deferred Until Later Phases

- Real production migrations.
- Source adapter implementations.
- Runtime cron scripts under `packages/cron`.
- tRPC procedures.
- Frontend route implementation.
- Subscription/auth gate implementation.
- PM2 deployment config.
- Paid vendor activation.
- AI narrative analysis.
- Staging deployment and production rollout until 11G checklist items are accepted by owners.
