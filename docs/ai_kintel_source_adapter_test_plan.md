# AI KINTEL Source Adapter Test Plan

## Status

- Stage: 11C - future source adapter test plan.
- Stage 11D adds a documentation-only cron fetcher test plan that extends these source-adapter expectations.
- This is a future test plan, not implementation.
- It does not add source adapters, provider calls, cron jobs, backend endpoints, UI changes, dependencies, or paid source activation.
- 11D does not create `packages/cron`, runtime cron scripts, source adapters, provider calls, endpoints, or Local RC behavior changes.

11D cron skeleton artifacts:

- `docs/ai_kintel_cron_fetcher_skeletons.md`
- `docs/ai_kintel_cron_fetcher_types_matrix.md`
- `docs/ai_kintel_pm2_cron_blueprint.md`
- `docs/ai_kintel_cron_operational_runbook.md`
- `docs/ai_kintel_cron_fetcher_test_plan.md`

## Test Categories

Future source adapter tests should cover:

- Disabled source does not call provider.
- Missing env for disabled source does not error.
- Missing env for enabled source returns `env_missing`.
- Policy blocked source does not call provider.
- Rate limit returns `warning` or `rate_limited`.
- Malformed JSON is rejected safely.
- Duplicate source records are deduped by hash.
- Timestamps are UTC.
- Secrets are not written to logs.
- Frontend never calls external providers directly.
- One source failure does not crash a future cron batch.

## Required Checks Before Enabling A Paid Source

Before any paid source is enabled in a future stage:

- Dry run completed.
- Env key present in deployment environment.
- Runtime policy explicitly enabled.
- Vendor terms reviewed.
- Cost approved.
- Rate limits set.
- Rollback plan documented.
- Attribution requirements documented where applicable.
- Source-run observability confirmed through `crypto_source_runs` or an equivalent table.

## Non-Goals

- No source implementation in 11C.
- No provider calls in 11C.
- No paid source activation in 11C.
- No production backend in 11C.
- No endpoint additions in 11C.
- No UI/CSS changes in 11C.
