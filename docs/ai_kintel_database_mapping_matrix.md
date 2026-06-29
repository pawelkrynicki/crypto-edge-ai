# AI KINTEL Database Mapping Matrix

## Status

- Stage: 11B - Database Mapping Matrix.
- This is documentation only and does not execute a migration.
- Local RC behavior remains unchanged.
- Real production mapping should be implemented later in the AI KINTEL repo after owner and DB review.

## Local RC To Production DB Mapping

| Local RC concept | Production table | Key fields | Notes | Status |
|---|---|---|---|---|
| Scanner candidate | `crypto_projects` | `symbol`, `name`, `chain`, `contract_address`, `source`, `source_id`, `hash` | Stores the current project/candidate view from normalized scanner output. | Proposed |
| WATCHLIST candidate | `crypto_projects.latest_scanner_label` | `latest_scanner_label`, `manual_verification_required`, `research_summary` | `WATCHLIST` remains further manual review only and does not mean approval or investment advice. | Proposed |
| CRITICAL_RISK / security risk | `crypto_scam_alerts` or `crypto_projects` risk fields | `alert_type`, `severity`, `security_label`, `risk_score`, `evidence_urls`, `hash` | Use `crypto_scam_alerts` for explicit alert events; use project risk fields for current summarized state. | Proposed |
| NEEDS_MANUAL_VERIFICATION | `crypto_projects` | `manual_verification_required`, `missing_data`, `security_label`, `latest_scanner_label` | Missing or incomplete data requires manual verification and cannot be interpreted as positive context. | Proposed |
| Market context | `crypto_market_summaries` | `summary_date`, `timeframe`, `market_sentiment`, `fear_greed_index`, `research_summary`, `hash` | Stores normalized daily/weekly context, not browser-side provider calls. | Proposed |
| DefiLlama/Alternative context | `crypto_market_summaries.source_breakdown` | `source_breakdown`, `defi_tvl_usd`, `fear_greed_index`, `market_sentiment` | Source breakdown should record allowed/free context sources and status metadata. | Proposed |
| Review queue | `crypto_analyst_reviews` | `review_status`, `review_note`, `next_review_step`, `analyst_context`, `reviewer_scope` | Optional/open decision: production ownership may be user-specific, shared/internal, or disabled. | Open decision |
| Analyst report | `crypto_market_summaries` or backend export | `research_summary`, `source_breakdown`, `ai_analysis`, export metadata | Decide later whether reports are DB-backed summaries, backend-generated exports, or internal/admin-only artifacts. | Open decision |
| Source adapter run | `crypto_source_runs` | `source_id`, `source_name`, `run_type`, `status`, `started_at`, `finished_at`, record counts | Captures cron/data collection health and import observability. | Proposed |
| Paid source disabled status | `crypto_source_runs` or source config metadata | `source_tier`, `status`, `config_enabled`, `env_configured`, `metadata` | Disabled paid vendors should log disabled/config metadata and should not call providers. | Proposed |

## Open Decisions

- Review notes storage ownership: user-specific, shared/internal, or no production storage.
- Retention for old scanner outputs and stale project snapshots.
- Whether source raw payloads are ever stored, or whether normalized-only storage remains mandatory.
- Whether report generation is a backend job, admin/internal export, or post-MVP feature.
- Final naming of `research_score` versus `opportunity_score`.
- How the AI KINTEL subscription gate exposes the Crypto Market module.
- Whether `crypto_analyst_reviews` belongs in the first production migration or remains deferred.

## Related Artifacts

- `docs/ai_kintel_database_migration_blueprint.md`
- `docs/ai_kintel_crypto_tables_blueprint.sql`
- `docs/ai_kintel_integration_decision_matrix.md`
- `docs/ai_kintel_integration_blueprint.md`
