# AI KINTEL tRPC Router Blueprint

## Status

- Stage: 11E - AI KINTEL tRPC Router Blueprint.
- Stage 11F adds documentation-only frontend port planning that consumes this future router contract.
- Stage 11G adds documentation-only staging/deployment readiness, rollout/rollback, monitoring, and implementation-entry guidance.
- This is a documentation-only blueprint, not an implementation.
- It does not create a router.
- It does not add endpoints.
- It does not change the Local MVP Release Candidate.
- It does not add backend code, auth, migrations, source adapters, provider calls, OpenAI calls, dependencies, UI, or CSS.
- It does not deploy staging, add env values/secrets, activate sources, or create runtime code.

11E tRPC blueprint artifacts:

- `docs/ai_kintel_trpc_router_blueprint.md`
- `docs/ai_kintel_trpc_procedure_contract.md`
- `docs/ai_kintel_trpc_query_matrix.md`
- `docs/ai_kintel_trpc_access_control_blueprint.md`
- `docs/ai_kintel_trpc_error_status_model.md`
- `docs/ai_kintel_trpc_router_pseudocode.md`

11F frontend planning references:

- `docs/ai_kintel_frontend_port_plan.md`
- `docs/ai_kintel_frontend_component_map.md`
- `docs/ai_kintel_frontend_data_contract.md`
- `docs/ai_kintel_frontend_state_model.md`
- `docs/ai_kintel_frontend_compliance_copy_guide.md`
- `docs/ai_kintel_frontend_port_checklist.md`

11G staging/deployment planning references:

- `docs/ai_kintel_staging_deployment_checklist.md`
- `docs/ai_kintel_env_placeholder_matrix.md`
- `docs/ai_kintel_release_readiness_matrix.md`
- `docs/ai_kintel_rollout_rollback_plan.md`
- `docs/ai_kintel_monitoring_observability_plan.md`
- `docs/ai_kintel_implementation_entry_checklist.md`

## Target AI KINTEL Location

Future AI KINTEL target path:

- `aikintel-platform/packages/webapp/server/routers/cryptoMarket.ts`

Future registration point:

- `packages/webapp/server/routers.ts`

Future frontend access pattern:

- `trpc.cryptoMarket.*`

The future `/crypto-market` frontend must not call external providers directly. External data should be collected by backend/cron, normalized into MySQL/MariaDB tables, and read through tRPC.

11F documents the future frontend route/page/component plan only. It does not create `packages/webapp`, `CryptoMarket.tsx`, route `/crypto-market`, sidebar navigation, runtime tRPC procedures, endpoints, backend code, provider calls, or UI/CSS changes.

11G documents staging/deployment readiness only. It does not deploy staging or create the router; real implementation should begin in `aikintel-platform` only after owner/DB/source/compliance review.

## Router Goals

The future `cryptoMarket` router should:

- Expose DB-backed Crypto Market data to `/crypto-market`.
- Read from the MySQL/MariaDB tables proposed in 11B.
- Surface source health/status from `crypto_source_runs`.
- Expose disabled/deferred source metadata safely.
- Expose market summaries, project list, risk/security alerts, on-chain snapshots, and research-only event data.
- Keep analyst review status separate from scanner label.
- Keep `WATCHLIST` as manual review only.
- Avoid investment-advice or automated-decision semantics.
- Keep paid sources disabled/deferred until explicit owner, env, config, policy, and vendor approval.
- Avoid provider calls in request/response reads unless separately approved.

## Proposed tRPC Procedures

These procedures are documentation-only planning targets. They are not implemented in this repo.

| Procedure | Type | Input | Output | Tables | Auth/access | Notes |
|---|---|---|---|---|---|---|
| `marketSummary` | query | `timeframe`, optional `date_from`, `date_to` | Latest or filtered market summary, source status, compliance block, warnings | `crypto_market_summaries`, `crypto_source_runs` | `viewer+` behind AI KINTEL access gate | Reads DB context populated by cron; no provider call in query path. |
| `projects` | query | pagination, `symbol`, `chain`, `category`, `scanner_label`, `security_label`, sort | Project rows, pagination metadata, source status, compliance block, warnings | `crypto_projects`, `crypto_source_runs` | `viewer+` | Scanner label is read-only; missing data means manual verification. |
| `projectById` | query | `id` or stable project identifier; optional source-status include | Project detail with related alerts/on-chain snapshots, compliance block, warnings | `crypto_projects`, `crypto_scam_alerts`, `crypto_onchain_metrics`, `crypto_source_runs` | `viewer+` | Review state stays separate from scanner label. |
| `scamAlerts` | query | pagination, `symbol`, `chain`, `severity`, `source`, `date_from`, `date_to`, sort | Alert rows, pagination metadata, source status, compliance block, warnings | `crypto_scam_alerts`, `crypto_source_runs` | `viewer+` | Alerts are research/security context, not trading instructions. |
| `opportunities` | query | pagination, `symbol`, `category`, `source`, `timeframe`, sort | Research event rows, pagination metadata, source status, compliance block, warnings | `crypto_opportunities`, `crypto_source_runs` | `viewer+` | Use neutral wording such as `research_context` and `next_review_step`. |
| `onchainMetrics` | query | `symbol`, `chain`, `contract_address`, `date_from`, `date_to`, `source`, sort | On-chain snapshots, freshness metadata, source status, compliance block, warnings | `crypto_onchain_metrics`, `crypto_source_runs` | `viewer+` | Missing on-chain data returns a manual verification warning. |
| `sourceRuns` | query | pagination, `source`, `status`, `timeframe`, `date_from`, `date_to` | Source run rows, pagination metadata, sanitized status, warnings | `crypto_source_runs` | `analyst+` or `admin`; open decision | Operational diagnostics; no secrets, env values, or raw provider payloads. |
| `sourceStatus` | query | optional `source` or category filter | Aggregated source status, disabled/deferred metadata, warnings | `crypto_source_runs`; source registry/config metadata | `viewer+` for safe public module status; richer diagnostics open decision | Disabled paid source is not an error and must not imply provider access. |
| `moduleHealth` | query | optional timeframe | Module health summary, stale/partial/no-data warnings, source status | `crypto_source_runs` plus aggregate checks | `analyst+` or `admin`; open decision | Should help operations without exposing secrets or raw payloads. |
| `analystReviews` | query or mutation | Open decision: project id, status, note, pagination | Open decision: review rows or write result with compliance block | `crypto_analyst_reviews` if approved | `analyst+` and subscription gate; open decision | Optional. Any future mutation must not change scanner label or scoring. |
| `analystReportSummary` | query | timeframe, filters, optional format metadata | Research summary metadata or export status | `crypto_market_summaries` or backend export; open decision | `analyst+` or internal/admin; open decision | Optional. Report output remains research-only and may be backend/export-only. |

## MVP Procedure Direction

- Production MVP should start mostly with queries.
- Mutations should be avoided in MVP unless review notes ownership is decided.
- Any future review mutation must be role/subscription-aware.
- Any future review mutation must not change scanner label, scanner scoring, `final_label`, or `WATCHLIST` meaning.
- No procedure should call external providers directly from request/response path unless explicitly approved.
- Query data should come from MySQL/MariaDB tables populated by cron/source layer.
- Paid source metadata can be surfaced as disabled/deferred status, but disabled sources must not be called.

## Compliance Boundary

Every future procedure output should carry or inherit a consistent compliance block:

- `research_only: true`
- `not_investment_advice: true`
- `watchlist_means: "manual_review_only"`
- `missing_data_means: "manual_verification_required"`
- `scanner_label_is_read_only: true`

This boundary should be visible to the frontend without changing scanner labels or local RC behavior.
