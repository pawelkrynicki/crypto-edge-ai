# AI KINTEL Staging / Deployment Checklist

## Status

- Stage: 11G - AI KINTEL Staging / Deployment Checklist.
- This is a documentation checklist, not a deployment.
- It does not create a staging environment.
- It does not change the Local MVP Release Candidate.
- It does not create runtime code.
- It does not create `packages/webapp`, `packages/cron`, runtime tRPC routers, endpoints, backend code, frontend code, production migrations, PM2 `.cjs` config, source adapters, provider calls, OpenAI calls, dependencies, `.env` files, or secret values.

11G staging/deployment planning artifacts:

- `docs/ai_kintel_staging_deployment_checklist.md`
- `docs/ai_kintel_env_placeholder_matrix.md`
- `docs/ai_kintel_release_readiness_matrix.md`
- `docs/ai_kintel_rollout_rollback_plan.md`
- `docs/ai_kintel_monitoring_observability_plan.md`
- `docs/ai_kintel_implementation_entry_checklist.md`

## Purpose

- Organize conditions for entering AI KINTEL staging.
- Define go/no-go criteria.
- Collect DB, cron, tRPC, frontend, env, monitoring, and compliance requirements.
- Prepare AI KINTEL owner, DB, source, and compliance review.
- Close the documentation package before real implementation begins in the `aikintel-platform` repo.

## Pre-Staging Prerequisites

- 11A-11G docs merged to `main`.
- AI KINTEL repo access confirmed.
- AI KINTEL staging branch/process confirmed.
- DB owner review completed.
- Source policy review completed.
- Env placeholder review completed with names only and no values.
- Subscription/access gate decision reviewed.
- Paid sources remain disabled/deferred.
- No secrets in repo.
- No direct browser provider calls.
- Rollback owner and process identified.

## DB Checklist

- Migration reviewed.
- Backup strategy confirmed.
- Rollback strategy confirmed.
- Indexes reviewed.
- JSON compatibility reviewed for MySQL/MariaDB target.
- UTC timestamps confirmed.
- No destructive SQL.
- Normalized-storage rule confirmed.
- Raw payload storage policy resolved or deferred.
- `crypto_analyst_reviews` ownership decision resolved or explicitly deferred.

## Backend / tRPC Checklist

- `cryptoMarket` router implementation planned in the AI KINTEL repo.
- Procedures are read-first.
- No provider calls in read query path.
- Outputs include the compliance block.
- Errors are sanitized.
- Source status/freshness included.
- Access/subscription gate behavior reviewed.
- Missing data maps to manual verification, not positive assessment.
- Review mutations remain deferred unless ownership is resolved.

## Cron / PM2 Checklist

- Cron scripts reviewed.
- PM2 names reviewed.
- Disabled/deferred paid sources do not call providers.
- Source runs are logged to `crypto_source_runs`.
- One source failure does not crash the whole batch.
- Logs contain no secrets.
- Env missing for disabled/deferred sources is not an error.
- Rollback works by stopping PM2 or disabling source config.
- PM2 config is implemented later in AI KINTEL, not in this repo.

## Frontend Checklist

- Route `/crypto-market` reviewed.
- Sidebar nav reviewed.
- tRPC-only data access.
- Loading, empty, stale, partial, error, and access denied states reviewed.
- Compliance copy visible.
- Data freshness visible.
- Source status visible.
- No provider URLs or keys in browser.
- No disallowed CTA/function wording.
- No direct external provider calls from browser network activity.

## Source / Compliance Checklist

- No scraping.
- No undocumented endpoints.
- No browser automation.
- No frontend provider calls.
- Paid sources disabled/deferred.
- Env missing for disabled source is not error.
- `WATCHLIST` means manual review only.
- Missing data means manual verification.
- Review status does not change scanner label, scanner scoring, or `final_label`.
- Compliance block appears in tRPC responses and visible frontend copy.

## Manual Staging QA

- Login/access gate.
- `/crypto-market` loads.
- Market summary.
- Projects.
- Project detail.
- Risk alerts.
- On-chain section.
- Sources / Health.
- Methodology / Compliance.
- Mobile/dark theme.
- No provider calls from browser network tab.
- Disabled/deferred paid source state.
- Stale/partial/empty states.
- Access denied state.

## Go / No-Go

GO only if:

- Required checks pass.
- DB review is complete.
- Source policy is clear.
- Env placeholders are reviewed with no values committed.
- Rollback path is available.
- Compliance block and copy are present.
- Browser has no provider calls.
- Paid sources remain disabled/deferred unless separately approved.

NO-GO if:

- DB migration is unreviewed.
- Source policy is unclear.
- Provider call from frontend exists.
- Paid source calls while disabled.
- Compliance block is missing.
- Secrets or env values are visible in repo/logs/UI.
- Rollback is unavailable.
- Access gate fails open.
