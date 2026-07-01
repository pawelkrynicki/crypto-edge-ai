# AI KINTEL tRPC Query Matrix

## Status

- Stage: 11E - tRPC query matrix.
- This is documentation only.
- It does not create SQL runtime query code.
- It does not create tRPC procedures, endpoints, backend code, migrations, auth, UI, CSS, source adapters, provider calls, OpenAI calls, or dependencies.

## Query Matrix

| Procedure | Primary table | Related tables | Main filters | Sorts | Data freshness source | Notes |
|---|---|---|---|---|---|---|
| `marketSummary` | `crypto_market_summaries` | `crypto_source_runs` | `timeframe`, `date_from`, `date_to` | `summary_date`, `created_at`, `updated_at` | Latest relevant successful/warning run in `crypto_source_runs` for market context run types | Reads normalized market context populated by cron. |
| `projects` | `crypto_projects` | `crypto_source_runs` | `symbol`, `chain`, `category`, `scanner_label`, `security_label`, `source` | `updated_at`, `risk_score`, `research_score`, `market_cap_usd` | Latest project/source run in `crypto_source_runs` | Scanner label is read-only; missing data means manual verification. |
| `projectById` | `crypto_projects` | `crypto_scam_alerts`, `crypto_onchain_metrics`, `crypto_source_runs` | `id`, optional `symbol`, `chain`, `contract_address` | Related rows: `published_at`, `metric_date`, `updated_at` | Project row `updated_at` plus related source runs | Detail view can compose project, alert, on-chain, and source status context. |
| `scamAlerts` | `crypto_scam_alerts` | `crypto_source_runs`, optionally `crypto_projects` | `symbol`, `chain`, `contract_address`, `severity`, `source`, `date_from`, `date_to` | `published_at`, `created_at`, `updated_at` | Latest security/source run in `crypto_source_runs` | Risk/security alerts are review context, not trading instructions. |
| `opportunities` | `crypto_opportunities` | `crypto_source_runs`, optionally `crypto_projects` | `symbol`, `category`, `status`, `source`, `timeframe`, `date_from`, `date_to` | `published_at`, `deadline`, `created_at`, `updated_at` | Latest relevant source run in `crypto_source_runs` | Use research-only event language and neutral next-review fields. |
| `onchainMetrics` | `crypto_onchain_metrics` | `crypto_source_runs`, optionally `crypto_projects` | `symbol`, `chain`, `contract_address`, `source`, `date_from`, `date_to` | `metric_date`, `created_at` | Latest on-chain source run in `crypto_source_runs` | Missing on-chain data should return manual verification warning. |
| `sourceRuns` | `crypto_source_runs` | None | `source`, `status`, `run_type`, `date_from`, `date_to` | `started_at`, `finished_at`, `created_at` | The rows themselves | Diagnostics must be sanitized and must not expose secrets or raw payloads. |
| `sourceStatus` | `crypto_source_runs` | Source config/registry metadata, documentation-only until implemented | `source`, `category`, `tier`, `status` | `finished_at`, `source_id` | Latest run per source plus disabled/deferred config metadata | Disabled paid source is normal status, not a failure. |
| `moduleHealth` | `crypto_source_runs` | Aggregate checks over `crypto_projects`, `crypto_market_summaries`, `crypto_scam_alerts`, `crypto_onchain_metrics` | `timeframe`, optional source/category filters | `finished_at`, aggregate severity | `crypto_source_runs` plus table freshness checks | Should report stale/partial/no-data warnings without crashing the page when possible. |
| `analystReviews` | `crypto_analyst_reviews` open decision | `crypto_projects` | `symbol`, `chain`, `contract_address`, `review_status`, reviewer scope | `updated_at`, `created_at` | Review table timestamps if the table is approved | Optional/open decision; any mutation must be role/subscription-aware and must not change scanner labels. |
| `analystReportSummary` | `crypto_market_summaries` or backend export open decision | `crypto_source_runs`, optional review/report metadata | `timeframe`, `date_from`, `date_to`, optional audience/scope | `summary_date`, `created_at`, `updated_at` | Summary timestamps plus relevant source runs | Optional/open decision; backend export may remain internal/admin-only. |

## Query Rules

- Queries should be parameterized.
- Frontend only calls tRPC.
- No external provider call in frontend.
- No external provider call from read query unless separately approved.
- Query results should come from MySQL/MariaDB records populated by cron/source layer.
- Source health and data freshness should be derived from `crypto_source_runs`.
- Disabled/deferred paid sources should surface safe metadata only.
- Missing data means manual verification, not positive context.
- `WATCHLIST` remains manual review only.
- Scanner label, scanner scoring, and `final_label` remain read-only from the scanner output.
